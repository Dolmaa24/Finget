const { toPaise } = require("../utils/money");
const { computeTranslation } = require("./goalCurrencyService");

/**
 * "What if I buy this right now?"
 *
 * DEPRECATED SHAPE: this returns rupees for backward compatibility with
 * `POST /api/finance/simulate` and the existing ScenarioSimulator UI. All the
 * actual maths now lives in `goalCurrencyService` — this is a thin rupee
 * adapter over it. New callers should use `POST /api/finance/translate`.
 */
exports.simulatePurchase = (affordability, amountRupees, goals = []) => {
  const amountPaise = toPaise(Number(amountRupees) || 0);
  const t = computeTranslation({ affordability, goals, amountPaise });

  const worst = t.goalImpacts[0] || null;

  return {
    amount: t.amount,
    remaining: t.remainingAfter,
    safeDaily: t.safeDailyAfter,
    risk: t.riskAfter,
    impact: t.remainingAfterPaise < 0 ? "Goal delayed" : "Within budget",
    /** Days of delay on the goal this purchase hurts most. */
    savingsDelayedDays: worst ? worst.delayDays : 0,
    goalImpacts: t.goalImpacts.map((g) => ({
      goalId: g.goalId,
      name: g.name,
      outstanding: g.outstanding,
      delayDays: g.delayDays,
      blocked: g.blocked,
    })),
    /** The goal-currency framing, so callers can adopt it without a second call. */
    headline: t.headline,
    headlineKind: t.headlineKind,
    daysOfSafeSpend: t.daysOfSafeSpend,
  };
};
