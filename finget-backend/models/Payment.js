const mongoose = require("mongoose");

/**
 * One attempt to pay Finget.
 *
 * A row is created when an order is opened, long before any money moves, and it
 * is the only place the app records what was ASKED FOR. The entitlement grant
 * later reads `productKey` and `groupId` from here rather than from anything the
 * client sends with the webhook — the client is not in that conversation at all,
 * and Razorpay's webhook carries only its own order id.
 *
 * NOTHING SENSITIVE LIVES HERE. No card number, no last four, no cardholder
 * name, no UPI handle. Razorpay Checkout collects all of that on their own
 * infrastructure and Finget never sees it. What is stored is an order id, a
 * payment id, an amount we set ourselves, and a status.
 */
const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

  /** A key from `services/pricing.js`, never a client-supplied amount. */
  productKey: { type: String, required: true },

  /** Required for a Trip Pass; the group whose members get upgraded. */
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },

  /** Integer paise, copied from the catalogue at order time. */
  amountPaise: { type: Number, required: true, min: 1 },
  currency: { type: String, default: "INR" },

  provider: { type: String, default: "razorpay" },

  /** The provider's order id. Unique — one row per order, always. */
  providerOrderId: { type: String, required: true, unique: true },

  /**
   * The provider's payment id, set when the webhook confirms.
   *
   * UNIQUE AND SPARSE, and this index is the whole idempotency story for
   * granting. Razorpay retries a webhook until it gets a 2xx, and a duplicate
   * `payment.captured` must not grant a second month of Plus. The grant claims
   * this id first; a redelivery loses the write and grants nothing.
   */
  providerPaymentId: { type: String, unique: true, sparse: true },

  status: {
    type: String,
    enum: ["created", "paid", "failed", "refunded"],
    default: "created",
    index: true,
  },

  /**
   * Set when the entitlement was actually applied, which is deliberately a
   * separate fact from `status: "paid"`. A payment that succeeded but whose
   * grant threw is a case worth being able to find and replay.
   */
  grantedAt: Date,

  /** Why it failed, when the provider says. Diagnostic only. */
  failureReason: String,

  createdAt: { type: Date, default: Date.now },
});

/** "Show me this person's receipts, newest first." */
paymentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Payment", paymentSchema);
