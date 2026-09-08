const OpenAI = require("openai");

/**
 * AI provider wiring.
 *
 * Groq exposes an OpenAI-compatible REST surface, so the same `openai` SDK
 * drives either one — only the base URL, key and model differ. Groq is
 * preferred when present; OpenAI stays supported as a fallback so an existing
 * deployment keeps working untouched.
 */

const PLACEHOLDERS = [
  "your_key_here",
  "your_openai_key",
  "your_openai_api_key",
  "your_groq_key",
  "your_groq_api_key",
  "sk-xxx",
  "gsk-xxx",
  "changeme",
];

const clean = (v) => (v || "").trim();

const isRealKey = (key) =>
  key.length > 20 && !PLACEHOLDERS.includes(key.toLowerCase());

const GROQ_KEY = clean(process.env.GROQ_API_KEY);
const OPENAI_KEY = clean(process.env.OPENAI_API_KEY);

const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

/** Resolved once at boot: which provider (if any) we can actually call. */
const provider = isRealKey(GROQ_KEY)
  ? {
      name: "groq",
      apiKey: GROQ_KEY,
      baseURL: GROQ_BASE_URL,
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      envVar: "GROQ_API_KEY",
    }
  : isRealKey(OPENAI_KEY)
    ? {
        name: "openai",
        apiKey: OPENAI_KEY,
        baseURL: undefined,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        envVar: "OPENAI_API_KEY",
      }
    : null;

const isAiConfigured = () => provider !== null;

let client = null;
function getClient() {
  if (!provider) return null;
  if (!client) {
    client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL });
  }
  return client;
}

const MODEL = provider?.model || "";
const PROVIDER_NAME = provider?.name || "none";

/** Friendly, actionable copy shown wherever the AI would have answered. */
const AI_DISABLED_MESSAGE =
  "The AI coach is not connected yet. Add a valid `GROQ_API_KEY` to `finget-backend/.env` and restart the server to enable live coaching. Everything else — safe-to-spend, goals, splits and rule-based insights — keeps working without it.";

module.exports = {
  getClient,
  isAiConfigured,
  MODEL,
  PROVIDER_NAME,
  AI_DISABLED_MESSAGE,
};
