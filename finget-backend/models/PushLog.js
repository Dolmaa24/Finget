const mongoose = require("mongoose");

/**
 * One push already sent, so it is never sent twice.
 *
 * Third time this codebase reaches for the same construction — `Reminder` for
 * the Silent Collector, `BotAction` for WhatsApp, this for push — and for the
 * same reason each time: the senders are interval jobs that can run twice after
 * a crash or concurrently on two instances, and a duplicate notification is not
 * a cosmetic bug. It is the thing that makes someone turn notifications off.
 *
 * The rule is always the same: CLAIM FIRST, SEND SECOND. A unique index decides
 * the race; a check-then-write loses it by definition.
 *
 * `dedupeKey` is whatever makes the event unique, chosen per topic:
 *
 *   vaultExpiry     the deflection's id — one nudge per hold, ever
 *   tripPace        groupId + IST day   — one pace warning per trip per day
 *   weekendWarning  IST day             — one per person per day
 *
 * Rows expire after 60 days. They are a lock, not history.
 */
const pushLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  topic: {
    type: String,
    required: true,
    enum: ["vaultExpiry", "tripPace", "weekendWarning"],
  },
  dedupeKey: { type: String, required: true },

  /** Reporting only — the row's existence is the guarantee, this is the outcome. */
  delivered: { type: Number, default: 0 },
  removed: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
});

pushLogSchema.index(
  { userId: 1, topic: 1, dedupeKey: 1 },
  { unique: true, name: "push_once_per_event" }
);

pushLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

module.exports = mongoose.model("PushLog", pushLogSchema);
