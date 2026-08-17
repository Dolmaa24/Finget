const mongoose = require("mongoose");

/**
 * One sent Silent Collector reminder.
 *
 * IDEMPOTENCY IS THE POINT OF THIS COLLECTION. The sweep is an interval that
 * can run twice after a crash, or concurrently on two instances, and the
 * acceptance bar for Milestone 5 is that neither case can produce a second
 * message about the same debt.
 *
 * That guarantee is a UNIQUE INDEX, not a check-then-write — a check-then-write
 * loses the race by definition. `reminderService.record()` inserts first and
 * treats duplicate-key (E11000) as "already sent", so the database decides who
 * won and the loser sends nothing.
 *
 * The key is (groupId, from, to, stage, debtSince):
 *
 *   - `stage` is what makes escalation possible at all — day 3, 7 and 14 are
 *     three distinct rows, so sending the day-7 note does not require deleting
 *     the day-3 one, and history stays readable.
 *
 *   - `debtSince` is what makes the key correct ACROSS TIME. Without it, a debt
 *     that is settled in March and arises again in June would be silently
 *     un-remindable forever, because the March rows still occupy the key. It is
 *     the IST-midnight origin of the *current* debt episode, computed from the
 *     ledger rather than the clock, so every concurrent run derives the same
 *     value and settling genuinely starts a new episode.
 */
const reminderSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
  /** The debtor — the person being reminded. */
  from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  /** The creditor being paid back. */
  to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  /** 3 | 7 | 14 — the day threshold this reminder crossed. */
  stage: { type: Number, required: true },

  /** IST midnight of the day the current debt episode began. Part of the key. */
  debtSince: { type: Date, required: true },

  /** What was outstanding when it went out. Integer paise, for the record. */
  amountPaise: { type: Number, required: true, min: 0 },

  /** The exact wording sent, kept so a support question can be answered. */
  message: String,

  /**
   * Per-channel outcome. A failed email must not block the in-app copy, and
   * neither failure may cause a resend — the row exists either way.
   */
  channels: {
    inApp: { type: Boolean, default: false },
    email: { type: String, enum: ["sent", "skipped", "failed"], default: "skipped" },
  },

  sentAt: { type: Date, default: Date.now, index: true },
});

reminderSchema.index(
  { groupId: 1, from: 1, to: 1, stage: 1, debtSince: 1 },
  { unique: true, name: "reminder_debt_stage_unique" }
);

/** Powers the 72-hour cap lookup: newest reminder for one debtor→creditor pair. */
reminderSchema.index({ groupId: 1, from: 1, to: 1, sentAt: -1 });

module.exports = mongoose.model("Reminder", reminderSchema);
