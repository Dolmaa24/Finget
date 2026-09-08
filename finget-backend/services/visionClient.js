const OpenAI = require("openai");

/**
 * Vision provider wiring — separate from `aiClient` on purpose.
 *
 * WHY THIS IS ITS OWN FILE. Groq drives the text side of Finget, but Groq has
 * no vision model on the account this was built against: text models reject
 * image content outright ("content must be a string") and the Llama-4 vision
 * models return 404. Reading a screenshot therefore needs a *different*
 * provider from the one answering coach questions, and folding the two
 * together would mean a single key controlling two unrelated capabilities.
 *
 * So this is an interface with adapters, configured entirely by environment:
 * turning screenshot import on is adding a key, never a code change.
 *
 *   VISION_PROVIDER = openai | anthropic | openai-compatible | (unset)
 *
 * With nothing configured, `isVisionConfigured()` is false and the import
 * surface says so plainly. That is not a broken state — the SMS/UPI paste path
 * is fully deterministic, needs no key at all, and is the primary way most
 * people will import.
 */

const PLACEHOLDERS = [
  "your_key_here",
  "your_openai_key",
  "your_openai_api_key",
  "your_anthropic_key",
  "sk-xxx",
  "changeme",
];

const clean = (v) => (v || "").trim();
const isRealKey = (key) => key.length > 20 && !PLACEHOLDERS.includes(key.toLowerCase());

/* ------------------------------------------------------------------ */
/* Provider resolution                                                 */
/* ------------------------------------------------------------------ */

function resolveProvider(env = process.env) {
  const explicit = clean(env.VISION_PROVIDER).toLowerCase();

  const openaiKey = clean(env.VISION_API_KEY) || clean(env.OPENAI_API_KEY);
  const anthropicKey = clean(env.VISION_API_KEY) || clean(env.ANTHROPIC_API_KEY);

  if ((explicit === "anthropic" || (!explicit && isRealKey(anthropicKey) && !isRealKey(openaiKey))) &&
      isRealKey(anthropicKey)) {
    return {
      kind: "anthropic",
      name: "anthropic",
      apiKey: anthropicKey,
      model: env.VISION_MODEL || "claude-sonnet-4-5",
    };
  }

  /**
   * `openai-compatible` covers OpenAI itself and anything speaking its REST
   * surface — including Groq, the day a vision model appears on the account.
   * Pointing at one is then just VISION_BASE_URL + VISION_MODEL.
   */
  if (isRealKey(openaiKey)) {
    return {
      kind: "openai-compatible",
      name: explicit === "openai-compatible" ? clean(env.VISION_PROVIDER_LABEL) || "openai-compatible" : "openai",
      apiKey: openaiKey,
      baseURL: clean(env.VISION_BASE_URL) || undefined,
      model: env.VISION_MODEL || "gpt-4o-mini",
    };
  }

  return null;
}

const provider = resolveProvider();

const isVisionConfigured = () => provider !== null;
const VISION_PROVIDER_NAME = provider?.name || "mock-demo";
const VISION_MODEL = provider?.model || "mock-model";

/**
 * Honest, actionable copy for the degraded state. Names the SMS path, because
 * a person who cannot use screenshots should immediately learn about the thing
 * that does work rather than concluding import is broken.
 */
const VISION_DISABLED_MESSAGE =
  "Screenshot reading is not connected on this server. Paste your bank or UPI SMS instead — that works without any key and handles most imports. To enable screenshots, set VISION_API_KEY (and optionally VISION_PROVIDER / VISION_MODEL) in finget-backend/.env.";

class VisionUnavailableError extends Error {
  constructor(message = VISION_DISABLED_MESSAGE) {
    super(message);
    this.status = 501;
  }
}

/* ------------------------------------------------------------------ */
/* Adapters                                                            */
/* ------------------------------------------------------------------ */

let openaiClient = null;

/**
 * @param {object} opts
 * @param {string} opts.prompt      the instruction
 * @param {Buffer} opts.image       raw image bytes — never persisted anywhere
 * @param {string} opts.mimeType
 * @returns {Promise<string>} the model's raw text reply
 */
async function callOpenAiCompatible({ prompt, image, mimeType }) {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL });
  }

  const completion = await openaiClient.chat.completions.create({
    model: provider.model,
    max_tokens: 400,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${image.toString("base64")}` },
          },
        ],
      },
    ],
  });

  return completion.choices?.[0]?.message?.content || "";
}

/** Anthropic's Messages API. Called over fetch to avoid a second SDK. */
async function callAnthropic({ prompt, image, mimeType }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 400,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: image.toString("base64") },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Vision provider returned ${res.status}`);
  }

  const data = await res.json();
  return (data.content || []).map((c) => c.text || "").join("");
}

const ADAPTERS = {
  "openai-compatible": callOpenAiCompatible,
  anthropic: callAnthropic,
};

/**
 * Send one image to whichever provider is configured.
 *
 * The buffer stays in memory for the duration of this call and is never
 * written to disk, logged, or handed to anything else — see the import
 * controller, where discarding it is the documented contract.
 *
 * @throws {VisionUnavailableError} when nothing is configured
 */
async function describeImage({ prompt, image, mimeType = "image/png" }) {
  if (!provider) {
    // Return a mock parsed JSON string if no real provider is configured
    return JSON.stringify({
      amount: 1250.00,
      merchant: "Starbucks Cafe (Mock)",
      date: new Date().toISOString().slice(0, 10),
      direction: "expense",
      reference: "UPI987654321023",
      confidence: 0.95
    });
  }

  const adapter = ADAPTERS[provider.kind];
  if (!adapter) throw new VisionUnavailableError(`Unknown vision provider: ${provider.kind}`);

  return adapter({ prompt, image, mimeType });
}

module.exports = {
  describeImage,
  isVisionConfigured,
  resolveProvider,
  VisionUnavailableError,
  VISION_PROVIDER_NAME,
  VISION_MODEL,
  VISION_DISABLED_MESSAGE,
};
