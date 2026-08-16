const crypto = require("crypto");
const ApiToken = require("../models/ApiToken");

/**
 * Minting, verifying and revoking scoped API tokens.
 *
 * The plaintext is returned by `mint` and never stored, logged, or recoverable.
 * If the user loses it they mint a new one and revoke the old.
 */

const DEFAULT_TTL_DAYS = Number(process.env.API_TOKEN_TTL_DAYS || 365);

/** Recognisable in a log or a bug report, and impossible to confuse with a JWT. */
const PREFIX = "fgt_";

/** How stale `lastUsedAt` is allowed to get. See `touch` below. */
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;

const hash = (plaintext) => crypto.createHash("sha256").update(plaintext).digest("hex");

/**
 * @returns {{plaintext: string, doc: object}} the only time plaintext exists
 */
async function mint({ userId, name, scopes = ["translate"], ttlDays = DEFAULT_TTL_DAYS }) {
  // 32 bytes: the token is the entire credential, so it gets full entropy
  // rather than the 16 used for guessable-once share links.
  const secret = crypto.randomBytes(32).toString("base64url");
  const plaintext = `${PREFIX}${secret}`;

  const doc = await ApiToken.create({
    userId,
    name: (name || "Browser extension").slice(0, 60),
    // Deduped so a caller asking for ["translate","translate"] cannot make the
    // list in Settings misrepresent what the token actually reaches.
    scopes: [...new Set(scopes)],
    tokenHash: hash(plaintext),
    prefix: plaintext.slice(0, PREFIX.length + 6),
    expiresAt: new Date(Date.now() + ttlDays * 86400000),
  });

  return { plaintext, doc };
}

/**
 * Resolve a plaintext token to its record, or null.
 *
 * Constant-time comparison is not needed here: the lookup is by hash, so the
 * database index does the matching and no secret is compared byte-by-byte in
 * our code.
 */
async function verify(plaintext, requiredScope) {
  if (typeof plaintext !== "string" || !plaintext.startsWith(PREFIX)) return null;

  const doc = await ApiToken.findOne({ tokenHash: hash(plaintext) });
  if (!doc) return null;
  if (doc.revokedAt) return null;
  if (doc.expiresAt && doc.expiresAt <= new Date()) return null;
  if (requiredScope && !doc.scopes.includes(requiredScope)) return null;

  return doc;
}

/**
 * Record use, coarsely.
 *
 * The extension calls `/translate` on every price it sees, and writing
 * `lastUsedAt` on each one turns a read path into a write path for no user
 * benefit — Settings shows "last used 3 minutes ago", not a millisecond. Only
 * write when the stored value is already stale.
 */
async function touch(doc) {
  const now = Date.now();
  if (doc.lastUsedAt && now - doc.lastUsedAt.getTime() < LAST_USED_RESOLUTION_MS) return;
  await ApiToken.updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date(now) } });
}

/** Never returns `tokenHash` — Settings has no use for it and a leak would. */
async function listForUser(userId) {
  const docs = await ApiToken.find({ userId, revokedAt: null })
    .sort({ createdAt: -1 })
    .select("name scopes prefix lastUsedAt createdAt expiresAt")
    .lean();
  return docs;
}

/** Scoped to the owner, so one user cannot revoke another's token by id. */
async function revoke(id, userId) {
  return ApiToken.findOneAndUpdate(
    { _id: id, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );
}

module.exports = {
  mint,
  verify,
  touch,
  listForUser,
  revoke,
  hash,
  PREFIX,
  DEFAULT_TTL_DAYS,
  LAST_USED_RESOLUTION_MS,
};
