/**
 * Auto-budget: allocate remaining monthly cash across categories by historical share.
 */
exports.generateAutoBudget = (transactions, monthlyIncome, settings = {}) => {
  const savingsTarget = settings.savingsTarget || 0;
  const emergency = settings.emergencyBuffer || 0;
  const pool = Math.max(0, monthlyIncome - savingsTarget - emergency);

  const thirty = new Date(Date.now() - 30 * 86400000);
  const expenses = transactions.filter(
    (t) => t.type === "expense" && new Date(t.date) >= thirty
  );
  const total = expenses.reduce((s, t) => s + t.amount, 0) || 1;

  const byCat = {};
  expenses.forEach((t) => {
    const c = t.category || "Other";
    byCat[c] = (byCat[c] || 0) + t.amount;
  });

  const categories = {};
  Object.keys(byCat).forEach((c) => {
    const share = byCat[c] / total;
    categories[c] = Math.round(pool * share);
  });

  return {
    month: new Date().toISOString().slice(0, 7),
    totalPool: Math.round(pool),
    categories,
    note: "Based on last 30 days of spending mix. Tweak and save as your active budget.",
  };
};
