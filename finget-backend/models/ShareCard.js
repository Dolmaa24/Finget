const mongoose = require("mongoose");

/**
 * A pre-rendered, publicly readable card.
 *
 * `payload` is a SNAPSHOT, never a live query. A share link must not become a
 * window onto changing financial data, and it must keep working after the
 * underlying group or goal is deleted.
 *
 * Everything in `payload` has passed `shareCardService.assertRedacted`.
 */
const shareCardSchema = new mongoose.Schema({
  /** Opaque 22-char URL-safe token. Never the group's invite code. */
  token: { type: String, required: true, unique: true, index: true },

  kind: {
    type: String,
    required: true,
    enum: ["translate", "deflection", "wrapped", "trip_invite"],
  },

  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", index: true },

  payload: { type: mongoose.Schema.Types.Mixed, required: true },

  createdAt: { type: Date, default: Date.now },
  /** TTL index — Mongo removes the document once this passes. */
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revoked: { type: Boolean, default: false },
});

module.exports = mongoose.model("ShareCard", shareCardSchema);
