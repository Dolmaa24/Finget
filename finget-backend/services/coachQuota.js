const User = require("../models/User");
const { monthKeyIST } = require("../utils/time");
const { can, CAPABILITIES, FREE_LIMITS, explain } = require("./entitlements");

/**
 * The AI coach's free-tier meter.
 *
 * This is the only genuinely metered cost in Finget — every other capability is
 * a yes/no. Each coach message is an outbound model call somebody pays for, so
 * the free tier gets a small monthly allowance and Plus removes it.
 *
 * WHAT IS AND ISN'T METERED. Only messages that will actually reach a model.
 * The rule-based insights are unlimited and always free; a question asked while
 * no API key is configured costs nothing and burns nothing; and the daily number
 * is never touched by any of this.
 */

/**
 * Claim one message.
 *
 * INCREMENTS FIRST, then decides. Two reasons:
 *
 *   1. It is atomic. A check-then-increment lets two concurrent requests both
 *      read "4 used" and both proceed, which is how a 5-message limit quietly
 *      becomes a 7-message one.
 *   2. Counting refused attempts is the more honest number. Someone hitting the
 *      wall eleven times in a month is a stronger signal than someone hitting it
 *      once, and this is the metric that says whether the allowance is right.
 *
 * Plus subscribers skip the counter entirely — there is nothing to meter, and
 * writing to their document on every message would be pure churn.
 *
 * @param {string} userId
 * @returns {Promise<{allowed: boolean, used: number, limit: number|null, message?: string}>}
 */
async function consumeCoachMessage(userId) {
  const user = await User.findById(userId).select("entitlements coachUsage").lean();
  if (!user) return { allowed: false, used: 0, limit: null, message: "Account not found." };

  if (can(user, CAPABILITIES.UNLIMITED_COACH)) {
    return { allowed: true, used: 0, limit: null };
  }

  const limit = FREE_LIMITS.coachMessagesPerMonth;
  const key = monthKeyIST();

  /**
   * ONE atomic document update, via an aggregation pipeline.
   *
   * This started as two writes — an `$inc` filtered on the current month, and a
   * `$set` fallback for a stale or absent counter — and that version was
   * racy in exactly the case that matters. On a user with no counter yet, every
   * concurrent request missed the `$inc` filter and every one of them then ran
   * the fallback, each setting `count` to 1. Eleven simultaneous messages got
   * eight through a limit of five.
   *
   * A pipeline update does the rollover decision and the increment inside a
   * single write that Mongo applies atomically per document, so concurrent
   * callers serialise and each sees a distinct count.
   */
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    [
      {
        $set: {
          coachUsage: {
            monthKey: key,
            count: {
              $cond: [
                { $eq: ["$coachUsage.monthKey", key] },
                { $add: [{ $ifNull: ["$coachUsage.count", 0] }, 1] },
                // Different month, or no counter at all: this is message one.
                1,
              ],
            },
          },
        },
      },
    ],
    { new: true, projection: { coachUsage: 1 } }
  ).lean();

  const used = updated?.coachUsage?.count ?? 1;

  if (used > limit) {
    return {
      allowed: false,
      used,
      limit,
      message: `You've used your ${limit} free coach messages this month. ${explain(
        CAPABILITIES.UNLIMITED_COACH
      )}\n\nEverything else keeps working — your daily number, insights, splits and goals are all still here, and the rule-based insights on the Insights page are unlimited.`,
    };
  }

  return { allowed: true, used, limit };
}

/** Read the meter without touching it, for Settings and the paywall sheet. */
async function coachUsageFor(userId) {
  const user = await User.findById(userId).select("entitlements coachUsage").lean();
  if (!user) return { used: 0, limit: null, unlimited: false };

  if (can(user, CAPABILITIES.UNLIMITED_COACH)) {
    return { used: 0, limit: null, unlimited: true };
  }

  const key = monthKeyIST();
  // A stale month reads as zero rather than being reset here — a read must not
  // write, or two tabs opening Settings would race on the same document.
  const used = user.coachUsage?.monthKey === key ? user.coachUsage.count || 0 : 0;

  return { used, limit: FREE_LIMITS.coachMessagesPerMonth, unlimited: false };
}

module.exports = { consumeCoachMessage, coachUsageFor };
