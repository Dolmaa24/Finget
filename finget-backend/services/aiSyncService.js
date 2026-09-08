const AiProvider = require("../models/AiProvider");
const AiCredit = require("../models/AiCredit");
const AiUsageLog = require("../models/AiUsageLog");
const { calculateTokenCost } = require("./aiPricingCatalog");
const { deductCreditsFIFO } = require("./aiCreditEngine");

/**
 * Service to sync or simulate provider data from external API endpoints (e.g. OpenRouter, OpenAI, Anthropic).
 */
async function syncProviderData(userId, providerId) {
  const provider = await AiProvider.findOne({ _id: providerId, userId });
  if (!provider) throw new Error("Provider not found");

  provider.lastSyncedAt = new Date();
  await provider.save();

  // If live keys are present, we can query respective endpoints or verify connectivity
  return {
    success: true,
    providerId: provider._id,
    providerName: provider.name,
    lastSyncedAt: provider.lastSyncedAt,
    status: provider.status,
  };
}

/**
 * Ensures initial default providers (OpenAI, Anthropic, OpenRouter, Groq) exist for the user
 * with realistic starter credits if they have no providers yet.
 */
async function seedDefaultProvidersIfEmpty(userId) {
  const count = await AiProvider.countDocuments({ userId });
  if (count > 0) return;

  const openai = await AiProvider.create({
    userId,
    name: "OpenAI",
    providerKey: "openai",
    status: "active",
    syncType: "api",
    settings: { lowBalanceThreshold: 10, currency: "USD", autoSyncLedger: true },
  });

  const anthropic = await AiProvider.create({
    userId,
    name: "Anthropic",
    providerKey: "anthropic",
    status: "active",
    syncType: "api",
    settings: { lowBalanceThreshold: 15, currency: "USD", autoSyncLedger: true },
  });

  const groq = await AiProvider.create({
    userId,
    name: "Groq Cloud",
    providerKey: "groq",
    status: "active",
    syncType: "manual",
    settings: { lowBalanceThreshold: 5, currency: "USD", autoSyncLedger: false },
  });

  // Add default credits (FIFO testable: Grant + Paid)
  const oneMonthAhead = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
  const sixMonthsAhead = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

  // OpenAI Grant (expires soon)
  const oaiGrant = await AiCredit.create({
    userId,
    providerId: openai._id,
    name: "OpenAI Startup Grant ($100)",
    initialAmount: 100,
    remainingBalance: 64.50,
    currency: "USD",
    creditType: "grant",
    expiryDate: oneMonthAhead,
    purchaseDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  });

  // OpenAI Paid Top-up
  await AiCredit.create({
    userId,
    providerId: openai._id,
    name: "Prepaid API Recharge ($50)",
    initialAmount: 50,
    remainingBalance: 50.00,
    currency: "USD",
    creditType: "paid",
    expiryDate: sixMonthsAhead,
    purchaseDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  });

  // Anthropic Paid Credit
  await AiCredit.create({
    userId,
    providerId: anthropic._id,
    name: "Anthropic Build Tier ($75)",
    initialAmount: 75,
    remainingBalance: 42.18,
    currency: "USD",
    creditType: "paid",
    expiryDate: sixMonthsAhead,
    purchaseDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  });

  // Groq Free Tier Grant
  await AiCredit.create({
    userId,
    providerId: groq._id,
    name: "Groq Developer Allowance ($25)",
    initialAmount: 25,
    remainingBalance: 19.85,
    currency: "USD",
    creditType: "grant",
    expiryDate: oneMonthAhead,
    purchaseDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  });

  // Seed a few realistic recent usage logs for immediate analytics
  const models = [
    { providerId: openai._id, model: "gpt-4o", inputTokens: 4200, outputTokens: 850, notes: "Code review assistant" },
    { providerId: openai._id, model: "gpt-4o-mini", inputTokens: 12000, outputTokens: 2100, notes: "Transaction categorization parser" },
    { providerId: anthropic._id, model: "claude-3-5-sonnet-20241022", inputTokens: 8500, outputTokens: 1950, notes: "System architecture design" },
    { providerId: groq._id, model: "llama-3.3-70b-versatile", inputTokens: 15400, outputTokens: 3200, notes: "Fast summarizer pipeline" },
  ];

  for (const m of models) {
    const { totalCost } = calculateTokenCost(m.model, m.inputTokens, m.outputTokens);
    await AiUsageLog.create({
      userId,
      providerId: m.providerId,
      model: m.model,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      totalTokens: m.inputTokens + m.outputTokens,
      cost: totalCost,
      currency: "USD",
      source: "local_proxy",
      notes: m.notes,
      timestamp: new Date(Date.now() - Math.floor(Math.random() * 5 * 24 * 60 * 60 * 1000)),
    });
  }
}

module.exports = {
  syncProviderData,
  seedDefaultProvidersIfEmpty,
};
