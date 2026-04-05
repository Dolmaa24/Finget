/**
 * Habit-change simulator: reduce spend in a category → projected monthly savings.
 */
exports.simulateHabitChange = (transactions, category, reduceByMonthly) => {
  const thirty = new Date(Date.now() - 30 * 86400000);
  const spent = transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        (t.category || "Other") === category &&
        new Date(t.date) >= thirty
    )
    .reduce((s, t) => s + t.amount, 0);

  const capped = Math.min(reduceByMonthly, spent);
  const yearly = capped * 12;

  return {
    category,
    currentMonthSpendApprox: Math.round(spent),
    reductionApplied: Math.round(capped),
    projectedMonthlySavings: Math.round(capped),
    projectedYearlySavings: Math.round(yearly),
    timelineMonthsToSave100k: capped > 0 ? Math.ceil(100000 / capped) : null,
  };
};
