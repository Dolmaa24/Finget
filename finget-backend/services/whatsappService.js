const crypto = require("crypto");

/**
 * WhatsApp transport.
 *
 * PROVIDER-AGNOSTIC BY CONSTRUCTION. Everything Meta-shaped lives inside the
 * `meta` adapter below, and the controller only ever sees the four functions
 * this module exports plus one normalised message shape:
 *
 *     { providerMessageId, from, text, timestamp }
 *
 * That constraint is not architectural taste. Meta suspends numbers, changes
 * payload shapes between graph versions, and is unavailable in some markets;
 * Twilio and self-hosted bridges are real fallbacks, and the day one is needed
 * is not the day to discover that a controller destructures
 * `entry[0].changes[0].value.messages[0]`. Adding a provider should mean
 * writing an adapter object and nothing else.
 *
 * DEGRADED MODE. With no credentials the `none` adapter is selected: the
 * webhook still parses and still refuses unlinked numbers, `sendText` returns
 * `"skipped"` instead of throwing, and the app says plainly in Settings that
 * WhatsApp is not connected on this server. Nothing else in Finget depends on
 * it — same posture as the AI coach, screenshot import and the mailer.
 */

const GRAPH_VERSION = "v21.0";

/** Long enough for Meta's API on a cold path, short enough not to hold a webhook. */
const TIMEOUT_MS = 10000;

/* ------------------------------------------------------------------ */
/* E.164                                                               */
/* ------------------------------------------------------------------ */

/**
 * Normalise a phone number to bare E.164 digits, no `+`.
 *
 * Meta reports `wa_id` as digits only, users type `+91 98765 43210`, and
 * Settings might send either. One representation is stored so a lookup by
 * number cannot miss by a space — a linked number that fails to match reads to
 * the user as "the bot ignored me".
 *
 * @returns {string|null} digits, or null if it cannot be a phone number
 */
function normalisePhone(input, defaultCountryCode = "91") {
  if (!input) return null;
  let digits = String(input).replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  digits = digits.replace(/\D/g, "");

  // A bare Indian mobile is 10 digits. Anything already carrying a country
  // code is left alone rather than guessed at.
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;

  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** For display: `+919876543210`. Never used as a key. */
const formatPhone = (digits) => (digits ? `+${digits}` : "");

/* ------------------------------------------------------------------ */
/* Adapters                                                            */
/* ------------------------------------------------------------------ */

/**
 * Meta WhatsApp Cloud API.
 *
 * Signature verification is over the RAW request body. Express's JSON parser
 * destroys the bytes it parsed, so the webhook route mounts its own parser
 * with a `verify` hook that stashes `req.rawBody` — re-serialising the parsed
 * object would produce different bytes (key order, whitespace) and every
 * signature would fail.
 */
const metaAdapter = {
  name: "meta",

  isConfigured(env) {
    return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  },

  /**
   * Meta's webhook registration handshake: it GETs the URL with a token it
   * expects echoed back.
   */
  verifyChallenge(query, env) {
    const expected = env.WHATSAPP_VERIFY_TOKEN;
    if (!expected) return null;
    if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === expected) {
      return String(query["hub.challenge"] ?? "");
    }
    return null;
  },

  /**
   * HMAC-SHA256 of the raw body, keyed on the app secret.
   *
   * Returns false when no secret is configured. That is deliberately a
   * REFUSAL, not a pass — an unverified webhook is an open write endpoint for
   * anyone who learns the URL, and "we hadn't set the secret yet" is exactly
   * how that ships. The controller turns this into a 401.
   */
  verifySignature(rawBody, headers, env) {
    const secret = env.WHATSAPP_APP_SECRET;
    if (!secret) return false;

    const header = headers["x-hub-signature-256"];
    if (typeof header !== "string" || !header.startsWith("sha256=")) return false;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody || Buffer.alloc(0))
      .digest("hex");
    const received = header.slice("sha256=".length);

    // Constant-time: a fast reject on the first differing byte leaks the
    // signature one comparison at a time.
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(received, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  },

  /**
   * Meta nests messages four levels deep and batches several per delivery.
   * Statuses (delivered/read receipts) arrive on the same webhook and are not
   * messages — dropping them here keeps that shape out of the controller.
   */
  parseWebhook(body) {
    const out = [];
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        for (const message of change?.value?.messages || []) {
          if (message.type !== "text") {
            // Images, audio, locations: acknowledged as messages so the sender
            // gets a reply, with empty text so the parser says it can't read it.
            out.push({
              providerMessageId: message.id,
              from: normalisePhone(message.from),
              text: "",
              unsupportedType: message.type,
              timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
            });
            continue;
          }
          out.push({
            providerMessageId: message.id,
            from: normalisePhone(message.from),
            text: message.text?.body || "",
            timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
          });
        }
      }
    }
    return out.filter((m) => m.from && m.providerMessageId);
  },

  async sendText(to, body, env) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body, preview_url: false },
          }),
          signal: controller.signal,
        }
      );
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`WhatsApp API ${response.status}: ${detail.slice(0, 200)}`);
      }
      return true;
    } finally {
      clearTimeout(timer);
    }
  },
};

/**
 * No credentials configured.
 *
 * Deliberately still parses and still verifies — a server with the webhook
 * exposed but no send token should reject forged deliveries exactly as
 * loudly as a fully configured one.
 */
const noneAdapter = {
  name: "none",
  isConfigured: () => false,
  verifyChallenge: metaAdapter.verifyChallenge,
  verifySignature: metaAdapter.verifySignature,
  parseWebhook: metaAdapter.parseWebhook,
  async sendText() {
    return false;
  },
};

const ADAPTERS = { meta: metaAdapter, none: noneAdapter };

/* ------------------------------------------------------------------ */
/* Public interface                                                    */
/* ------------------------------------------------------------------ */

/**
 * Which adapter is live. Read per call rather than cached at import so tests
 * (and a running server after a config change) see the current environment.
 */
function adapterFor(env = process.env) {
  const requested = (env.WHATSAPP_PROVIDER || "meta").toLowerCase();
  const adapter = ADAPTERS[requested] || metaAdapter;
  return adapter.isConfigured(env) ? adapter : noneAdapter;
}

const isWhatsAppConfigured = (env = process.env) => adapterFor(env).name !== "none";

/** Why it is off, in words a developer can act on. Null when it is on. */
function whatsAppDisabledReason(env = process.env) {
  if (isWhatsAppConfigured(env)) return null;
  const missing = [];
  if (!env.WHATSAPP_TOKEN) missing.push("WHATSAPP_TOKEN");
  if (!env.WHATSAPP_PHONE_NUMBER_ID) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!env.WHATSAPP_APP_SECRET) missing.push("WHATSAPP_APP_SECRET");
  return missing.length ? `${missing.join(", ")} not set` : "no provider configured";
}

const verifyChallenge = (query, env = process.env) => adapterFor(env).verifyChallenge(query, env);

const verifySignature = (rawBody, headers, env = process.env) =>
  adapterFor(env).verifySignature(rawBody, headers, env);

const parseWebhook = (body, env = process.env) => adapterFor(env).parseWebhook(body);

/**
 * Send one message.
 *
 * NEVER THROWS. Callers are webhook handlers and background linking flows; a
 * provider outage must not turn into a 500 that makes Meta retry the delivery
 * and re-run the write it already performed.
 *
 * @returns {Promise<"sent"|"skipped"|"failed">}
 */
async function sendText(to, body, env = process.env) {
  const adapter = adapterFor(env);
  if (adapter.name === "none") return "skipped";
  if (!to || !body) return "skipped";

  try {
    await adapter.sendText(to, body, env);
    return "sent";
  } catch (err) {
    console.error(`WhatsApp send to ${to} failed: ${err.message}`);
    return "failed";
  }
}

module.exports = {
  normalisePhone,
  formatPhone,
  isWhatsAppConfigured,
  whatsAppDisabledReason,
  verifyChallenge,
  verifySignature,
  parseWebhook,
  sendText,
  adapterFor,
  GRAPH_VERSION,
};
