const MS_DAY = 86400000;

function startOfMonth(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysLeftInMonth(now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(1, Math.ceil((end - now) / MS_DAY));
}

/**
 * Decision-first affordability.
 *
 * Only *this month's* transactions count toward the monthly burn — previously
 * every transaction ever recorded was subtracted from a single month's income,
 * so the number drifted further from reality the longer an account was used.
 *
 * @param {{monthlyIncome?: number}} owner  user, or a group with pooled income
 * @param {object[]} transactions
 * @param {{savingsTarget?: number, emergencyBuffer?: number}} settings
 */
exports.calculateAffordability = (owner, transactions, settings, now = new Date()) => {
  const monthStart = startOfMonth(now);
  const inMonth = transactions.filter((t) => new Date(t.date) >= monthStart);

  const expenses = inMonth
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  // Extra income logged during the month (freelance, refunds) lifts the ceiling.
  const extraIncome = inMonth
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const baseIncome = owner?.monthlyIncome || 0;
  const income = baseIncome + extraIncome;

  const savingsTarget = settings?.savingsTarget || 0;
  const emergencyBuffer = settings?.emergencyBuffer || 0;

  const obligations = expenses + savingsTarget;
  const remaining = income - obligations;

  const daysLeft = daysLeftInMonth(now);
  const safeDaily = remaining > 0 ? remaining / daysLeft : 0;

  let risk = "Safe";
  if (remaining < emergencyBuffer) risk = "Warning";
  if (remaining < 0) risk = "Risky";

  return {
    safeDaily,
    remaining,
    risk,
    income,
    baseIncome,
    extraIncome,
    expenses,
    savingsTarget,
    emergencyBuffer,
    daysLeftInMonth: daysLeft,
    monthlyBurnRate: expenses,
  };
};

exports.daysLeftInMonth = daysLeftInMonth;
exports.startOfMonth = startOfMonth;
