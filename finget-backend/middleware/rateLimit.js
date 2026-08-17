const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

/**
 * Shared limiters.
 *
 * NOTE: express-rate-limit's default store is in-process memory. That is fine
 * for a single instance; the moment Finget runs more than one, these counters
 * diverge per instance and the effective limit multiplies by the instance
 * count. Swap in a Redis store before scaling horizontally.
 *
 * `validate: true` is set explicitly because the library disables its own
 * config validation under NODE_ENV=test — which is exactly where a broken
 * limiter would otherwise sail through the suite and only fail on boot.
 */

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: true,
  message: { msg: "Too many requests. Please slow down and try again shortly." },
};

/**
 * Key authenticated traffic per user so one noisy client cannot punish an
 * office NAT. Falls back to the IP, normalised through `ipKeyGenerator` —
 * raw IPv6 addresses are per-device within a /64, so limiting on them
 * unnormalised lets a single user cycle addresses to bypass the cap.
 */
const byUser = (req) => (req.user ? `u:${String(req.user)}` : ipKeyGenerator(req.ip));

/** Creating share cards writes rows and (from M1) renders images. */
const shareCreateLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: byUser,
});

/** Public card reads — unauthenticated, so keyed by IP. */
const sharePublicLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 300,
});

/**
 * Invite-code redemption, per account.
 *
 * The 6-char code is 32^6 ≈ 1 billion, which is plenty against a stranger and
 * not plenty against a script. Since redemption requires a logged-in user,
 * this caps attempts per ACCOUNT rather than per IP — an attacker would have
 * to create a new account every twenty guesses, which makes enumeration
 * pointless rather than merely slow.
 */
const inviteCodeLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: byUser,
  message: {
    msg: "Too many invite codes tried. Wait an hour, or ask for the group's share link instead.",
  },
});

/** Anything that costs an AI call. */
const aiLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: byUser,
});

/** The goal translator — cheap, but the extension calls it per price. */
const translateLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: byUser,
});

/**
 * Import. Looser than the AI limiter because SMS parsing costs nothing but
 * CPU and a person genuinely might paste several months in a sitting — but
 * still capped, since each call scans recent transactions for duplicates.
 */
const importLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 120,
  keyGenerator: byUser,
});

/**
 * Minting API tokens. Deliberately tight: a legitimate user connects the
 * extension once, maybe twice. A burst means either a loop in the connect page
 * or someone with a stolen JWT stocking up on credentials that survive a
 * password change.
 */
const tokenMintLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: byUser,
});

/**
 * Sending a WhatsApp linking code.
 *
 * Tight, because each call sends a real message to a number the caller typed.
 * Without a cap, an account is a free way to make Finget's business number
 * repeatedly message a stranger — the cost lands on the recipient and on the
 * sender's reputation with Meta, neither of which the caller pays.
 */
const phoneLinkLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: byUser,
  message: {
    msg: "Too many linking codes requested. Wait an hour, or check the number you entered.",
  },
});

/**
 * Opening a payment order.
 *
 * Each call is a real request to Razorpay and a real row in our database. A
 * legitimate person opens a handful while deciding; a burst means either a loop
 * in the checkout page or someone filling the orders table for free.
 */
const paymentOrderLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: byUser,
  message: { msg: "Too many payment attempts. Wait a few minutes and try again." },
});

module.exports = {
  paymentOrderLimiter,
  phoneLinkLimiter,
  shareCreateLimiter,
  sharePublicLimiter,
  inviteCodeLimiter,
  importLimiter,
  aiLimiter,
  translateLimiter,
  tokenMintLimiter,
  byUser,
};
