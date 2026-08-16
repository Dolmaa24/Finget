const mongoose = require("mongoose");

/**
 * A narrow, revocable credential for something that is not the web app.
 *
 * The browser extension gets one of these instead of the main JWT. That
 * matters for three reasons: the extension runs inside pages Finget does not
 * control, its credential can be revoked without signing the user out
 * everywhere, and a `translate` token cannot read transactions or move money
 * even if the whole extension is compromised.
 *
 * `tokenHash` is a SHA-256 of the secret; the plaintext exists exactly once,
 * in the response that mints it. A database dump therefore yields nothing
 * usable. SHA-256 rather than bcrypt is deliberate — these are 32 bytes of
 * CSPRNG output, not a human-chosen password, so there is no dictionary to
 * slow down and the check sits on a per-request path.
 */
const apiTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

  /** What the user sees in Settings. */
  name: { type: String, default: "Browser extension", maxlength: 60 },

  /**
   * Capability, not a role. Every new scope is a deliberate decision, so the
   * enum stays short and adding to it means reviewing what it unlocks.
   */
  scope: { type: String, required: true, enum: ["translate"], default: "translate" },

  tokenHash: { type: String, required: true, unique: true, index: true },

  /** First few chars of the plaintext, so Settings can say which token is which. */
  prefix: { type: String, required: true },

  /** Approximate — see apiTokenService for why this is not written every call. */
  lastUsedAt: Date,

  createdAt: { type: Date, default: Date.now },
  /** TTL index. A forgotten extension token should not live forever. */
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: Date,
});

module.exports = mongoose.model("ApiToken", apiTokenSchema);
