const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  /** Short human-shareable code so members never paste raw ObjectIds. */
  // Sparse so legacy groups created before invite codes existed don't all
  // collide on a null value.
  inviteCode: { type: String, unique: true, sparse: true, index: true },
  emoji: { type: String, default: "👥" },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
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

module.exports = mongoose.model("Group", groupSchema);
