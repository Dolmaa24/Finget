const mongoose = require("mongoose");

/**
 * An external AI platform / provider account (e.g. OpenAI, Anthropic, OpenRouter, Groq, DeepSeek, Custom).
 */
const aiProviderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: false, index: true },

  name: { type: String, required: true, trim: true },
  providerKey: {
    type: String,
    enum: ["openai", "anthropic", "openrouter", "groq", "deepseek", "gemini", "mistral", "custom"],
    required: true,
    default: "openai",
  },

  /** Encrypted or masked API key representation */
  authCredentialsEncrypted: { type: String, default: "" },

  status: {
    type: String,
    enum: ["active", "inactive", "low_balance", "rate_limited", "expired"],
    default: "active",
  },

  syncType: {
    type: String,
    enum: ["api", "manual", "local_proxy"],
    default: "manual",
  },

  settings: {
    lowBalanceThreshold: { type: Number, default: 10 }, // $10 or equivalent
    currency: { type: String, default: "USD" },
    autoSyncLedger: { type: Boolean, default: true },
    alertOnExpiryDays: { type: Number, default: 7 },
  },

  lastSyncedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

aiProviderSchema.index({ userId: 1, providerKey: 1 });

module.exports = mongoose.model("AiProvider", aiProviderSchema);
