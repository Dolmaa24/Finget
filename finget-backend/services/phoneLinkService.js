const crypto = require("crypto");
const User = require("../models/User");
const { normalisePhone, formatPhone, sendText } = require("./whatsappService");

/**
 * Linking a WhatsApp number to an account.
 *
 * The number becomes a CREDENTIAL: once linked, any message from it writes to
 * this person's ledger with no password, no session and no second factor. That
 * is the whole point of the channel — logging without app-switching — and it
 * is also why this flow is the security boundary for all of Milestone 6.
 *
 * Proof of control runs in the direction that actually proves something: the
 * code is sent TO the number over WhatsApp, and must be replied FROM it. A code
 * typed back into the web app would only prove the person still had the web
 * session they already had.
 */

/** Six digits — long enough against guessing given the attempt cap below. */
const CODE_LENGTH = 6;

/** Short. A linking code that outlives the sitting is a credential lying around. */
const CODE_TTL_MINUTES = 15;

/**
 * Wrong codes before the attempt is burned. With 10^6 codes and five tries,
 * guessing is hopeless; with unlimited tries it is a weekend's work.
 */
const MAX_ATTEMPTS = 5;

const hashCode = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");

/** Uniform over 000000–999999, from a CSPRNG rather than Math.random. */
function generateCode() {
  const max = 10 ** CODE_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(CODE_LENGTH, "0");
}

class LinkError extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
    this.msg = msg;
  }
}

/**
 * Begin linking: store a hashed code and send it to the number.
 *
 * @returns {Promise<{phone: string, expiresAt: Date, delivery: string}>}
 */
async function startLink(userId, rawPhone) {
  const phone = normalisePhone(rawPhone);
  if (!phone) throw new LinkError(400, "That doesn't look like a phone number.");

  // One account per number — see the note on `User.phone`. Checked before the
  // send so we never message a number about an account it cannot link to.
  const taken = await User.findOne({ phone }).select("_id").lean();
  if (taken && String(taken._id) !== String(userId)) {
    throw new LinkError(409, "That number is already linked to another Finget account.");
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await User.findByIdAndUpdate(userId, {
    $set: {
      "phoneLink.pendingPhone": phone,
      "phoneLink.codeHash": hashCode(code),
      "phoneLink.expiresAt": expiresAt,
      "phoneLink.attempts": 0,
      "phoneLink.requestedAt": new Date(),
    },
  });

  const delivery = await sendText(
    phone,
    `Your Finget code is ${code}.\n\nReply with just this code to link ${formatPhone(phone)} to your account. It expires in ${CODE_TTL_MINUTES} minutes.\n\nIf you didn't ask for this, ignore it — nothing has been linked.`
  );

  return { phone, expiresAt, delivery };
}

/**
 * Finish linking: a code arrived from `phone`.
 *
 * Looks the candidate up BY THE PENDING NUMBER, not by the code, so a code can
 * only ever complete the link it was issued for. Returns null when nothing
 * matches — the caller must not distinguish "wrong code" from "no request" in
 * anything it says back, or the channel becomes an oracle for which numbers
 * have Finget accounts.
 *
 * @returns {Promise<object|null>} the linked user
 */
async function completeLink(phone, code) {
  const normalised = normalisePhone(phone);
  if (!normalised || !code) return null;

  const candidate = await User.findOne({ "phoneLink.pendingPhone": normalised });
  if (!candidate) return null;

  const link = candidate.phoneLink || {};
  if (!link.codeHash || !link.expiresAt || link.expiresAt < new Date()) return null;
  if ((link.attempts || 0) >= MAX_ATTEMPTS) return null;

  const supplied = hashCode(code);
  const expected = link.codeHash;

  const a = Buffer.from(supplied, "hex");
  const b = Buffer.from(expected, "hex");
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    // Burn an attempt. Recorded even on failure, which is the only thing
    // stopping a number from being walked one code at a time.
    await User.updateOne({ _id: candidate._id }, { $inc: { "phoneLink.attempts": 1 } });
    return null;
  }

  // Someone else may have linked this number between `startLink` and now.
  const taken = await User.findOne({ phone: normalised }).select("_id").lean();
  if (taken && String(taken._id) !== String(candidate._id)) return null;

  candidate.phone = normalised;
  candidate.phoneVerifiedAt = new Date();
  candidate.phoneLink = undefined;
  await candidate.save();

  return candidate;
}

/**
 * Unlink. Clears both the verified number and any pending request, so a
 * half-finished link cannot quietly complete after someone has disconnected.
 */
async function unlink(userId) {
  await User.findByIdAndUpdate(userId, {
    $unset: { phone: "", phoneVerifiedAt: "", phoneLink: "" },
  });
}

/** What Settings renders. Never includes the code or its hash. */
function linkStatus(user) {
  const pending = user?.phoneLink?.pendingPhone;
  const expiresAt = user?.phoneLink?.expiresAt;
  const stillValid = pending && expiresAt && new Date(expiresAt) > new Date();

  return {
    linked: Boolean(user?.phone),
    phone: user?.phone ? formatPhone(user.phone) : null,
    verifiedAt: user?.phoneVerifiedAt || null,
    pendingPhone: stillValid ? formatPhone(pending) : null,
    pendingExpiresAt: stillValid ? expiresAt : null,
    attemptsLeft: stillValid ? Math.max(0, MAX_ATTEMPTS - (user.phoneLink.attempts || 0)) : null,
  };
}

module.exports = {
  startLink,
  completeLink,
  unlink,
  linkStatus,
  LinkError,
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
};
