const { getClient, isAiConfigured, MODEL } = require("./aiClient");
const { toPaise } = require("../utils/money");
const { fromISTFields, istParts } = require("../utils/time");

const PROMPT = `You are a financial data parser. I will give you text extracted from an Indian bank statement or credit card bill.
Find every actual transaction where money moved in or out.

Return ONLY a JSON array, no prose and no markdown code fences. The response MUST start with '[' and end with ']'.

Format:
[
  {
    "amount": <number, strictly positive rupees, no currency symbol or commas>,
    "merchant": <string, who was paid or who paid you, or null>,
    "date": <"YYYY-MM-DD" or null>,
    "direction": <"expense" or "income">,
    "reference": <string transaction/UTR id, or null>,
    "confidence": <0 to 1, how sure you are overall>
  }
]

Rules:
- Include ONLY actual transactions (money moving in or out).
- Ignore balance summaries, opening balances, closing balances, reward points, and page numbers.
- If a field is not clearly legible or cannot be determined, use null.
- "direction" is "income" only if money was received (credited to the account/CR).
- "direction" is "expense" if money was sent/debited/paid (DR).
- Indian dates are day-first. Convert to YYYY-MM-DD.
- Keep the merchant name clean, strip out unnecessary bank jargon (like "UPI/CR/1234/").`;

function extractJsonArray(text) {
  if (!text) return null;
  const candidate = text.replace(/```(?:json)?\s*([\s\S]*?)```/ig, '$1');
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

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

async function extractFromPdfText(text, now = new Date()) {
  if (!isAiConfigured()) {
    return { ok: false, reason: "AI is not configured. Cannot parse PDF text." };
  }

  const client = getClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: text }
    ],
    temperature: 0,
    max_tokens: 2000,
  });

  const reply = completion.choices?.[0]?.message?.content || "";
  const parsedArray = extractJsonArray(reply);

  if (!Array.isArray(parsedArray)) {
    return {
      ok: false,
      reason: "Could not read transactions from that statement. The model failed to return a list.",
    };
  }

  const drafts = parsedArray.map(parsed => {
    const rupees = Number(parsed.amount);
    const amountPaise = Number.isFinite(rupees) && rupees > 0 ? toPaise(rupees) : null;
    if (amountPaise === null) return null;

    const merchant = typeof parsed.merchant === "string" && parsed.merchant.trim()
      ? parsed.merchant.trim().slice(0, 60)
      : null;

    const modelConfidence = Number(parsed.confidence);

    return {
      amountPaise,
      type: parsed.direction === "income" ? "income" : "expense",
      directionDetected: parsed.direction === "income" || parsed.direction === "expense",
      date: parseDate(parsed.date, now),
      merchant,
      issuer: null,
      issuerLabel: null,
      reference: typeof parsed.reference === "string" && parsed.reference.trim()
        ? parsed.reference.trim().slice(0, 64)
        : null,
      confidence: Number.isFinite(modelConfidence)
        ? Math.max(0, Math.min(1, Math.round(modelConfidence * 100) / 100)) // not-money: confidence
        : 0.5,
      source: "sms", // we treat imported pdf rows like sms so they don't look for an image
      raw: null,
    };
  }).filter(Boolean);

  if (drafts.length === 0) {
    return {
      ok: false,
      reason: "No valid transactions were found in that statement.",
    };
  }

  return {
    ok: true,
    drafts,
  };
}

module.exports = { extractFromPdfText, extractJsonArray, parseDate, PROMPT };
