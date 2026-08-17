const mongoose = require("mongoose");

/**
 * One thing the bot did in response to one inbound message.
 *
 * This collection does two jobs, and both are load-bearing.
 *
 * 1. REPLAY DEFENCE. Meta redelivers a webhook whenever it does not get a
 *    prompt 200 — on a timeout, on a 500, on a deploy mid-request. Without a
 *    record keyed on the provider's own message id, one "450 dinner" becomes
 *    three transactions and the user's ledger is wrong in a way they will
 *    blame on themselves. `providerMessageId` is UNIQUE, and the handler
 *    inserts before it acts, so a redelivery loses the insert and does nothing.
 *    Same construction as the Silent Collector's reminder key.
 *
 * 2. UNDO. Every write says "reply UNDO within 10 minutes", and this is what
 *    UNDO reads: the most recent reversible action for that user, inside the
 *    window, not already undone.
 *
 * Rows expire after 30 days. They are an operational ledger, not history —
 * the transactions they created live in `transactions` and are not touched.
 */
const botActionSchema = new mongoose.Schema({
  /**
   * The provider's message id. Unique across every provider because ids are
   * opaque strings and a collision between Meta and Twilio would mean silently
   * dropping a real message.
   */
  providerMessageId: { type: String, required: true, unique: true },

  /** Bare E.164 digits. Present even when no account matched — see `userId`. */
  phone: { type: String, required: true, index: true },

  /**
   * Absent for messages from unlinked numbers. Those are recorded anyway: the
   * dedupe key has to exist before we know who sent it, and "how many unknown
   * numbers is this webhook receiving" is a question worth being able to ask.
   */
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

  intent: { type: String, required: true },

  /** What was created, if anything. Exactly one of these is set on a write. */
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
  settlementId: { type: mongoose.Schema.Types.ObjectId, ref: "Settlement" },

  /** True when this action can still be reversed by an UNDO. */
  reversible: { type: Boolean, default: false },
  undoneAt: Date,
  /** The action that reversed this one, so an undo cannot be undone twice. */
  undoneBy: { type: mongoose.Schema.Types.ObjectId, ref: "BotAction" },

  /** What the bot said back. Kept so a support question has an answer. */
  reply: String,

  createdAt: { type: Date, default: Date.now },
});

/** The UNDO lookup: newest reversible action for one person. */
botActionSchema.index({ userId: 1, createdAt: -1 });

/**
 * Thirty days, then gone. Long enough to answer "what did the bot do last
 * month", short enough that a log of people's messages is not kept forever.
 */
botActionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model("BotAction", botActionSchema);
