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

module.exports = { shareCreateLimiter, sharePublicLimiter, aiLimiter, translateLimiter, byUser };
