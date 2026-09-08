const mongoose = require("mongoose");

/**
 * An individual credit package or balance grant allocated on an AI provider.
 * Supports FIFO burn-down: Grants/promotions expiring soon are prioritized before paid balances.
 */
const aiCreditSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: false, index: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: "AiProvider", required: true, index: true },

  name: { type: String, required: true, trim: true }, // e.g. "OpenAI $100 Grant", "Claude Prepaid $50", "ChatGPT Plus Subscription"
  initialAmount: { type: Number, required: true, min: 0 },
  remainingBalance: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "USD" }, // USD, INR, EUR

  expiryDate: { type: Date },
  creditType: {
    type: String,
    enum: ["grant", "paid", "subscription"],
    default: "paid",
  },

  isExpired: { type: Boolean, default: false },
  purchaseDate: { type: Date, default: Date.now },

  /**
   * If true, generating this credit package automatically created an entry
   * in the user's primary Finget Ledger to keep safe-to-spend accurate.
   */
  autoSyncLedger: { type: Boolean, default: false },
  ledgerTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

aiCreditSchema.index({ providerId: 1, remainingBalance: 1, expiryDate: 1 });
aiCreditSchema.index({ userId: 1, isExpired: 1 });

module.exports = mongoose.model("AiCredit", aiCreditSchema);
