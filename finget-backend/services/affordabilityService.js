exports.calculateAffordability = (user, transactions, settings) => {
  const expenses = transactions
    .filter(t => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const obligations = expenses + (settings?.savingsTarget || 0);

  const income = user?.monthlyIncome || 0;
  const remaining = income - obligations;
  const safeDaily = remaining / 30;

  let risk = "Safe";
  if (remaining < (settings?.emergencyBuffer || 0)) risk = "Warning";
  if (remaining < 0) risk = "Risky";

  return { safeDaily, remaining, risk, income, expenses };
};
