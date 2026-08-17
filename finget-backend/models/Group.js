const mongoose = require("mongoose");
const { generatePublicToken } = require("../utils/token");

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  /** Short human-shareable code so members never paste raw ObjectIds. */
  // Sparse so legacy groups created before invite codes existed don't all
  // collide on a null value.
  inviteCode: { type: String, unique: true, sparse: true, index: true },
  /**
   * The PUBLIC share link's token — never the invite code.
   *
   * A 6-char code is short enough to enumerate, and a link carrying it hands
   * anyone who sees it the ability to join. This is 22 opaque characters: it
   * opens a preview and nothing else, it is revocable, and revoking it does
   * not kick a single existing member (unlike rotating the invite code).
   */
  previewToken: { type: String, unique: true, sparse: true, index: true },

  emoji: { type: String, default: "👥" },

  /**
   * A trip is a group with a clock. Deliberately a field on Group rather than
   * a parallel entity — splits, settle-up, goals, the activity feed and the
   * whole scope resolver already work on groups, and forking that for trips
   * would mean maintaining two of everything forever.
   */
  kind: { type: String, enum: ["household", "trip"], default: "household" },

  /** Trip only. Inclusive start, inclusive end, both read as IST calendar days. */
  startDate: Date,
  endDate: Date,

  /** What the group agreed to spend on this trip. Integer paise. */
  potPaise: { type: Number, default: 0, min: 0 },

  /**
   * Reserved for trips that happen outside India. Every boundary today is
   * Asia/Kolkata via utils/time.js; this is where a future override lands, and
   * it is stored now so the field exists before there is data to migrate.
   */
  timezone: { type: String, default: "Asia/Kolkata" },

  /** Set once, when the Wrapped recap is generated on endDate + 1. */
  wrappedGeneratedAt: Date,

  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  /**
   * What the Add-expense sheet reaches for first. A group that has agreed to
   * weight by income should not have to re-pick it forty times a trip.
   *
   * This is a default, never a lock: any single expense can still be split
   * equally or custom, and a `weighted` default silently degrades to equal
   * when nobody in the group has opted their income in.
   */
  splitDefaults: {
    mode: { type: String, enum: ["equal", "weighted"], default: "equal" },
  },

  /**
   * Who has consented to income weighting IN THIS GROUP.
   *
   * Consent is per-group and never global: agreeing to weight by income among
   * three flatmates says nothing about wanting it with twelve colleagues. An
   * absent entry means opted out, so the safe state is also the default state
   * and a migration adds nobody.
   *
   * The income itself is NEVER stored here — only the fact of consent. Weights
   * are read live from the User doc at split time so someone who updates their
   * income does not leave a stale copy behind in every group they are in.
   */
  incomeSharing: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      optedInAt: { type: Date, default: Date.now },
    },
  ],

  /**
   * The Silent Collector, per group. An admin can switch off reminders for
   * everyone here; an individual can additionally mute themselves on their own
   * User doc. Either switch being off is enough to stop a send.
   */
  reminders: {
    enabled: { type: Boolean, default: true },
  },
  /** Shared-wallet equivalents of the personal Settings doc. */
  savingsTarget: { type: Number, default: 0 },
  emergencyBuffer: { type: Number, default: 0 },

  /**
   * A Trip Pass belongs to the group, not to whoever paid — one purchase has
   * to upgrade every member, including people who join afterwards.
   * `until` is set to the trip's endDate + 30 days so the Wrapped card, which
   * generates *after* the trip, is still inside the window people paid for.
   */
  entitlement: {
    tripPass: { type: Boolean, default: false },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    until: Date,
  },

  createdAt: { type: Date, default: Date.now },
});

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

groupSchema.statics.generateInviteCode = async function () {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    const clash = await this.exists({ inviteCode: code });
    if (!clash) return code;
  }
  // Vanishingly unlikely; fall back to a timestamp-derived code.
  return `G${Date.now().toString(36).toUpperCase().slice(-5)}`;
};

/**
 * Mint (or re-mint) the public preview token.
 *
 * Re-minting kills every link already shared and does NOT touch membership —
 * that is the whole reason this is separate from `inviteCode`, where rotating
 * used to be the only revocation available.
 */
groupSchema.statics.generatePreviewToken = function () {
  return generatePublicToken();
};

module.exports = mongoose.model("Group", groupSchema);
