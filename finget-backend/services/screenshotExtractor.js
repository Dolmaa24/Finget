const { describeImage, isVisionConfigured, VisionUnavailableError } = require("./visionClient");
const { toPaise } = require("../utils/money");
const { fromISTFields, istParts } = require("../utils/time");

/**
 * A payment screenshot → one transaction draft.
 *
 * The image is passed in as a Buffer and is never written anywhere. It exists
 * in memory for the duration of one request and is dropped when this returns —
 * that is a promise the UI makes to the person, so it is enforced here rather
 * than left to a convention.
 */

const PROMPT = `You are reading a screenshot of an Indian payment confirmation (GPay, PhonePe, Paytm, UPI, or a bank app).

Return ONLY a JSON object, no prose and no code fence:
{
  "amount": <number, rupees, no currency symbol or commas>,
  "merchant": <string, who was paid, or null>,
  "date": <"YYYY-MM-DD" or null>,
  "direction": <"expense" or "income">,
  "reference": <string transaction/UTR id, or null>,
  "confidence": <0 to 1, how sure you are overall>
}

Rules:
- If a field is not clearly legible, use null. Never invent a value.
- "amount" is the transaction amount, not any balance shown on screen.
- "direction" is "income" only if the screen says money was received.
- Indian dates are day-first. Convert to YYYY-MM-DD.`;

/** Models wrap JSON in prose or fences no matter how firmly you ask. */
function extractJson(text) {
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** `YYYY-MM-DD` → IST midnight, rejecting anything implausible. */
function parseDate(value, now = new Date()) {
  if (!value || typeof value !== "string") return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [year, month, day] = [+match[1], +match[2] - 1, +match[3]];
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;

  const { year: nowYear } = istParts(now);
  if (year < nowYear - 5 || year > nowYear + 1) return null;

  return fromISTFields(year, month, day);
}

/**
 * @param {Buffer} image  raw bytes, discarded when this returns
 * @param {string} mimeType
 * @returns {Promise<object>} a draft in the same shape the SMS parser produces
 * @throws {VisionUnavailableError} when no provider is configured
 */
async function extractFromScreenshot(image, mimeType, now = new Date()) {
  if (!isVisionConfigured()) throw new VisionUnavailableError();

  const reply = await describeImage({ prompt: PROMPT, image, mimeType });
  const parsed = extractJson(reply);

  if (!parsed) {
    // A model that returned prose is a failure to read, not a transaction of
    // zero. Say so rather than handing back an empty draft.
    return {
      ok: false,
      reason: "Could not read a payment from that screenshot. Try a clearer crop, or paste the SMS instead.",
    };
  }

  const rupees = Number(parsed.amount);
  const amountPaise = Number.isFinite(rupees) && rupees > 0 ? toPaise(rupees) : null;

  if (amountPaise === null) {
    return {
      ok: false,
      reason: "No amount was legible in that screenshot. Try a clearer crop, or paste the SMS instead.",
    };
  }

  const merchant =
    typeof parsed.merchant === "string" && parsed.merchant.trim()
      ? parsed.merchant.trim().slice(0, 60)
      : null;

  const modelConfidence = Number(parsed.confidence);

  return {
    ok: true,
    draft: {
      amountPaise,
      type: parsed.direction === "income" ? "income" : "expense",
      directionDetected: parsed.direction === "income" || parsed.direction === "expense",
      date: parseDate(parsed.date, now),
      merchant,
      issuer: null,
      issuerLabel: null,
      reference:
        typeof parsed.reference === "string" && parsed.reference.trim()
          ? parsed.reference.trim().slice(0, 64)
          : null,
      /**
       * The model's own confidence, clamped. Trusted only as a hint for which
       * fields the review sheet highlights — never to skip review, which does
       * not happen for any import under any confidence.
       */
      confidence: Number.isFinite(modelConfidence)
        ? Math.max(0, Math.min(1, Math.round(modelConfidence * 100) / 100)) // not-money: confidence
        : 0.5,
      source: "screenshot",
      raw: null,
    },
  };
}

module.exports = { extractFromScreenshot, extractJson, parseDate, PROMPT };
