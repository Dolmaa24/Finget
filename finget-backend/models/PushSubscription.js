const mongoose = require("mongoose");

/**
 * One browser's Web Push subscription.
 *
 * A person has as many of these as they have devices, and each one is issued by
 * the browser, not by us — `endpoint` is a URL at Google's or Mozilla's push
 * service, and `keys` are the ECDH public key and auth secret the browser
 * generated so only that browser can decrypt what we send.
 *
 * THESE GO STALE CONSTANTLY. Users clear site data, uninstall the PWA, or let a
 * browser profile expire, and the push service then answers 404 or 410 forever.
 * `pushService` deletes on those two codes rather than retrying: a subscription
 * the browser has disowned is not coming back, and keeping it means every
 * future send pays for a guaranteed failure.
 */
const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

  /**
   * Unique across all users, not just within one. The same endpoint arriving
   * for a second account means the device was re-signed-in, and the row should
   * move rather than duplicate — `upsert` on this key does exactly that.
   */
  endpoint: { type: String, required: true, unique: true },

  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },

  /**
   * What this device wants. Kept per-subscription rather than per-user because
   * "notify my phone but not my laptop" is the normal preference, and a
   * per-user flag cannot express it.
   */
  topics: {
    vaultExpiry: { type: Boolean, default: true },
    tripPace: { type: Boolean, default: true },
    weekendWarning: { type: Boolean, default: true },
  },

  /** Purely diagnostic — which browser to blame when sends start failing. */
  userAgent: String,

  lastSentAt: Date,
  /** Consecutive failures that were NOT 404/410. Three strikes and it goes. */
  failureCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
