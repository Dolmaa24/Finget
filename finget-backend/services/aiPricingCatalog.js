/**
 * Standard AI Model Pricing Catalog (Prices in USD per 1 Million tokens).
 */
const MODEL_PRICING = {
  // OpenAI
  "gpt-4o": { provider: "openai", name: "GPT-4o", inputPerM: 216, outputPerM: 865 }, // 2.5 * 86.5 = 216.25 -> 216
  "gpt-4o-mini": { provider: "openai", name: "GPT-4o mini", inputPerM: 13, outputPerM: 52 }, // 0.15 * 86.5 = 13
  "gpt-4-turbo": { provider: "openai", name: "GPT-4 Turbo", inputPerM: 865, outputPerM: 2595 },
  "o1": { provider: "openai", name: "o1", inputPerM: 1297, outputPerM: 5190 },
  "o3-mini": { provider: "openai", name: "o3-mini", inputPerM: 95, outputPerM: 380 },

  // Anthropic
  "claude-3-5-sonnet-20241022": { provider: "anthropic", name: "Claude 3.5 Sonnet", inputPerM: 259, outputPerM: 1297 },
  "claude-3-5-haiku-20241022": { provider: "anthropic", name: "Claude 3.5 Haiku", inputPerM: 69, outputPerM: 346 },
  "claude-3-opus-20240229": { provider: "anthropic", name: "Claude 3 Opus", inputPerM: 1297, outputPerM: 6487 },

  // Groq
  "llama-3.3-70b-versatile": { provider: "groq", name: "Llama 3.3 70B", inputPerM: 51, outputPerM: 68 }, // 0.59 * 86.5
  "llama-3.1-8b-instant": { provider: "groq", name: "Llama 3.1 8B", inputPerM: 4, outputPerM: 7 },
  "mixtral-8x7b-32768": { provider: "groq", name: "Mixtral 8x7B", inputPerM: 21, outputPerM: 21 },
  "llama-3.1-405b-reasoning": { provider: "groq", name: "Llama 3.1 405B", inputPerM: 259, outputPerM: 259 }, // ~3 * 86.5

  // DeepSeek
  "deepseek-chat": { provider: "deepseek", name: "DeepSeek V3", inputPerM: 12, outputPerM: 24 },
  "deepseek-reasoner": { provider: "deepseek", name: "DeepSeek R1", inputPerM: 47, outputPerM: 189 },

  // Google Gemini
  "gemini-1.5-pro": { provider: "gemini", name: "Gemini 1.5 Pro", inputPerM: 108, outputPerM: 432 },
  "gemini-1.5-flash": { provider: "gemini", name: "Gemini 1.5 Flash", inputPerM: 6, outputPerM: 26 },
  "gemini-2.0-flash": { provider: "gemini", name: "Gemini 2.0 Flash", inputPerM: 8, outputPerM: 34 },

  // Cohere
  "command-r-plus": { provider: "cohere", name: "Command R+", inputPerM: 259, outputPerM: 1297 }, // 3.0 / 15.0 USD
  "command-r": { provider: "cohere", name: "Command R", inputPerM: 43, outputPerM: 129 }, // 0.5 / 1.5 USD

  // Perplexity
  "sonar-pro": { provider: "perplexity", name: "Sonar Pro", inputPerM: 259, outputPerM: 1297 }, // 3 / 15

  // Mistral
  "mistral-large-latest": { provider: "mistral", name: "Mistral Large", inputPerM: 173, outputPerM: 519 }, // 2 / 6
  "mistral-small-latest": { provider: "mistral", name: "Mistral Small", inputPerM: 17, outputPerM: 52 }, // 0.2 / 0.6

  // OpenRouter / Others
  "openrouter/auto": { provider: "openrouter", name: "OpenRouter Auto", inputPerM: 173, outputPerM: 692 },
};

/**
 * Calculates dollar cost for input and output token counts.
 */
function calculateTokenCost(modelKey, inputTokens = 0, outputTokens = 0) {
  const cleanKey = (modelKey || "").trim();
  const pricing = MODEL_PRICING[cleanKey] ||
    Object.entries(MODEL_PRICING).find(([k]) => cleanKey.toLowerCase().includes(k.toLowerCase()))?.[1] ||
    { inputPerM: 1.0, outputPerM: 3.0 }; // Default fallback estimate

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerM;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerM;
  const totalCost = Number((inputCost + outputCost).toFixed(6));

  return {
    inputCost,
    outputCost,
    totalCost,
    pricing,
  };
}

function listSupportedModels() {
  return Object.entries(MODEL_PRICING).map(([key, data]) => ({
    key,
    ...data,
  }));
}

module.exports = {
  MODEL_PRICING,
  calculateTokenCost,
  listSupportedModels,
};
