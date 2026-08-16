const mongoose = require("mongoose");

/**
 * Something you wanted, and what you decided.
 *
 * This is the only ledger in Finget that counts money you did NOT spend, and
 * it exists because every other money app only ever tells you what you got
 * wrong. A deflection is a credit. There is deliberately no field here that
 * could be totalled into a "you wasted this much" figure.
 *
 * SCOPE IS LOCAL. A hold created in personal mode never touches a group's
 * number and vice versa — `groupId` is set once at creation and is what every
 * query filters on. Without that, one member browsing a laptop would quietly
 * drop the whole trip's safe-to-spend.
 */
const deflectionSchema = new mongoose.Schema({
  /** Always the person who opened it, even for a group hold — used for attribution. */
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

  /** Absent for a personal hold. Presence is what makes the hold group-scoped. */
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", index: true },

  label: { type: String, required: true, maxlength: 120 },

  amountPaise: { type: Number, required: true, min: 1 },

  /** Where it came from, when the browser extension opened it. */
  sourceUrl: String,

  /**
   * What the purchase meant AT THE TIME, from goalCurrencyService. Frozen, not
   * recomputed: the ledger should say "that was 6 days of Goa when you walked
   * away", which stays true even after the goal is met or deleted.
   */
  translationSnapshot: {
    headline: String,
    headlineKind: { type: String, enum: ["goal_delay", "safe_days", "rupees"] },
    goalName: String,
    daysOfSafeSpend: Number,
    riskAfter: { type: String, enum: ["Safe", "Warning", "Risky"] },
  },

  state: {
    type: String,
    required: true,
    enum: ["considering", "deflected", "bought"],
    default: "considering",
  },

  /** When the 48 hours are up and we ask once. Only meaningful while considering. */
  vaultUntil: { type: Date, index: true },

  /** Set when it leaves `considering`. Null while the hold is live. */
  decidedAt: Date,

  /**
   * True when the sweep resolved it rather than the person. Kept so the ledger
   * can be honest about which credits were choices and which were silence.
   */
  autoResolved: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
});

/** The hot path: every affordability call sums live holds for one scope. */
deflectionSchema.index({ userId: 1, groupId: 1, state: 1 });

/** The sweep: find everything overdue, across all users. */
deflectionSchema.index({ state: 1, vaultUntil: 1 });

module.exports = mongoose.model("Deflection", deflectionSchema);
