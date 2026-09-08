const mongoose = require("mongoose");

/**
 * Programmatic or itemized AI spend / token consumption event.
 */
const aiUsageLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: false, index: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: "AiProvider", required: true, index: true },

  model: { type: String, required: true, trim: true }, // e.g. "gpt-4o", "claude-3-5-sonnet-20241022", "llama-3.3-70b-versatile"
  inputTokens: { type: Number, default: 0, min: 0 },
  outputTokens: { type: Number, default: 0, min: 0 },
  totalTokens: { type: Number, default: 0, min: 0 },

  cost: { type: Number, required: true, min: 0 }, // In currency unit (e.g. $0.0035)
  currency: { type: String, default: "USD" },

  source: {
    type: String,
    enum: ["local_proxy", "api_sync", "manual_entry", "playground", "webhook"],
    default: "manual_entry",
  },

  deductedCreditId: { type: mongoose.Schema.Types.ObjectId, ref: "AiCredit" },
  notes: { type: String, trim: true },

  timestamp: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now },
});

aiUsageLogSchema.index({ providerId: 1, timestamp: -1 });
aiUsageLogSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model("AiUsageLog", aiUsageLogSchema);
