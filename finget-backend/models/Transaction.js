const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  /** Who recorded the row. */
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: false, index: true },
  /** Who actually paid — defaults to userId, but a member can log for someone else. */
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  amount: Number,
  category: String,
  note: String,
  type: { type: String, enum: ["expense", "income"], default: "expense" },
  date: { type: Date, default: Date.now },
  /** "equal" | "custom" | "none" — how `splits` was derived. */
  splitMode: { type: String, default: "none" },

  /**
   * Import provenance. Absent on anything typed in by hand.
   *
   * `importReference` is the bank's own transaction id when the source carried
   * one, and it is the strongest possible duplicate key — an exact match is
   * proof, where amount and date are only evidence. Sparse-indexed because
   * most rows will never have one.
   */
  importSource: { type: String, enum: ["sms", "screenshot"], required: false },
  importReference: { type: String, required: false, sparse: true, index: true },
  /** The merchant as read at import, kept apart from the editable note. */
  merchant: { type: String, required: false },
  splits: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      amount: Number,
      status: { type: String, enum: ["pending", "settled"], default: "pending" },
    },
  ],
});

transactionSchema.index({ groupId: 1, date: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
