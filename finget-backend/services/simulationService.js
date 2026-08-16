/**
 * "What if I buy this right now?"
 *
 * Beyond the new remaining balance, this answers the question the README
 * promised but the old version never computed: how far this purchase pushes
 * out the goal you are actively saving for.
 */
exports.simulatePurchase = (data, amount, goals = []) => {
  const spend = Number(amount) || 0;
  const newRemaining = data.remaining - spend;
  const daysLeft = data.daysLeftInMonth || 30;
  const newSafeDaily = newRemaining > 0 ? newRemaining / daysLeft : 0;

  let risk = "Safe";
  if (newRemaining < (data.emergencyBuffer || 0)) risk = "Warning";
  if (newRemaining < 0) risk = "Risky";

  // Monthly savings capacity is what is left after the purchase, spread over
  // the month. If that is zero, the goal simply does not advance.
  const monthlySavingCapacity = Math.max(0, newRemaining);
  const priorCapacity = Math.max(0, data.remaining);

  const goalImpacts = goals
    .map((g) => {
      const outstanding = Math.max(0, (g.targetAmount || 0) - (g.currentAmount || 0));
      if (outstanding <= 0) return null;

      const monthsBefore = priorCapacity > 0 ? outstanding / priorCapacity : Infinity;
      const monthsAfter =
        monthlySavingCapacity > 0 ? outstanding / monthlySavingCapacity : Infinity;

      if (!Number.isFinite(monthsAfter)) {
        return {
          name: g.name,
          outstanding,
          delayDays: null,
          blocked: true,
        };
      }

      const delayDays = Number.isFinite(monthsBefore)
        ? Math.max(0, Math.round((monthsAfter - monthsBefore) * 30))
        : null;

      return { name: g.name, outstanding, delayDays, blocked: false };
    })
    .filter(Boolean)
    .sort((a, b) => (b.delayDays || 0) - (a.delayDays || 0));

  const worst = goalImpacts[0] || null;

  return {
    amount: spend,
    remaining: newRemaining,
    safeDaily: newSafeDaily,
    risk,
    impact: newRemaining < 0 ? "Goal delayed" : "Within budget",
    /** Days of delay on the goal this purchase hurts most. */
    savingsDelayedDays: worst ? worst.delayDays : 0,
    goalImpacts: goalImpacts.slice(0, 4),
  };
};
