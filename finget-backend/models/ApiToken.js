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
   * Capabilities, not a role. A SET rather than one string because a single
   * client legitimately needs more than one narrow permission — the extension
   * both prices a product and vaults it — and issuing it two credentials to
   * hold in the same storage would add connect-flow complexity for no security
   * gain. Each entry still grants exactly one route.
   *
   *   translate — POST /api/finance/translate. Reads nothing, stores nothing.
   *   deflect   — POST /api/deflections. Opens a 48-hour hold. Cannot resolve
   *               one and cannot read the ledger; the worst a stolen token
   *               does is ring-fence money that releases itself in 72 hours.
   *   ambient   — GET /api/finance/ambient. READ-ONLY, and the narrowest read
   *               in the app: today's number, its risk level, and one line of
   *               context. No transactions, no goals, no group, no history. It
   *               exists so a home-screen widget or lock-screen shim — which
   *               has no browser session to borrow — can poll the number
   *               without holding a credential that could spend anything.
   *
   * Adding to this enum means reviewing what the new entry unlocks.
   */
  scopes: {
    type: [String],
    required: true,
    enum: ["translate", "deflect", "ambient", "roast", "goals"],
    default: ["translate"],
    validate: [(v) => Array.isArray(v) && v.length > 0, "a token needs at least one scope"],
  },

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
