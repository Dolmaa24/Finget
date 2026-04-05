const MS_DAY = 86400000;

/**
 * After a new expense, checks category spend vs a simple weekly budget derived from monthly income.
 * @returns {object|null} nudge payload
 */
exports.evaluateSpendNudge = ({
  newTx,
  allTransactions,
  monthlyIncome,
  categoryWeeklyBudgetFraction = 0.12,
}) => {
  if (newTx.type !== "expense" || !monthlyIncome || monthlyIncome <= 0) return null;

  const cat = newTx.category || "Other";
  const weeklyBudget = (monthlyIncome * categoryWeeklyBudgetFraction) / 4.3;

  const weekAgo = new Date(Date.now() - 7 * MS_DAY);
  const weekSpend = allTransactions
    .filter(
      (t) =>
        t.type === "expense" &&
        (t.category || "Other") === cat &&
        new Date(t.date) >= weekAgo
    )
    .reduce((s, t) => s + t.amount, 0);

  if (weekSpend > weeklyBudget * 1.05) {
    return {
      type: "budget_breach",
      severity: weekSpend > weeklyBudget * 1.25 ? "high" : "medium",
      message: `You've spent about ₹${Math.round(weekSpend)} on ${cat} this week — above a rough weekly guide of ₹${Math.round(weeklyBudget)} for this category.`,
      category: cat,
    };
  }

  return null;
};
