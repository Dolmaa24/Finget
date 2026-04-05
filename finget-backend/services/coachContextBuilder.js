const Goal = require("../models/Goal");

const MS_DAY = 86400000;

function startOfMonth(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function summarizeByCategory(transactions, since) {
  const map = {};
  transactions.forEach((t) => {
    if (new Date(t.date) < since) return;
    if (t.type !== "expense") return;
    const c = t.category || "Uncategorized";
    map[c] = (map[c] || 0) + t.amount;
  });
  return map;
}

/**
 * Builds structured context for the AI coach from live data.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} [opts.groupId]
 * @param {import('mongoose').Document[]} opts.transactions
 */
async function buildCoachContext({ groupId, transactions }) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_DAY);
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_DAY);

  const tx = transactions.map((t) => (t.toObject ? t.toObject() : t));

  const recent = tx.filter((t) => new Date(t.date) >= thirtyDaysAgo);
  const thisWeek = tx.filter((t) => new Date(t.date) >= sevenDaysAgo);

  const monthlyByCat = summarizeByCategory(tx, startOfMonth(now));
  const weeklyExpenses = thisWeek
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const prevMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  const prevMonthEnd = startOfMonth(now);
  const prevMonthExpenses = tx
    .filter(
      (t) =>
        t.type === "expense" &&
        new Date(t.date) >= prevMonthStart &&
        new Date(t.date) < prevMonthEnd
    )
    .reduce((s, t) => s + t.amount, 0);

  let goalsQuery = groupId ? { groupId } : { userId, groupId: { $exists: false } };
  const goals = await Goal.find(goalsQuery).lean();

  const goalsSummary = goals.map((g) => ({
    name: g.name,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount || 0,
    deadline: g.deadline,
    priority: g.priority,
    pct:
      g.targetAmount > 0
        ? Math.round(((g.currentAmount || 0) / g.targetAmount) * 100)
        : 0,
  }));

  const topCategories = Object.entries(monthlyByCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, amount]) => ({ category, amount }));

  const last10 = tx
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .map((t) => ({
      amount: t.amount,
      category: t.category,
      type: t.type,
      date: t.date,
    }));

  return {
    period: {
      label: "last_30_days_expenses",
      total: recent.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      weeklySpendApprox: weeklyExpenses,
      previousMonthExpenses: prevMonthExpenses,
    },
    categoryTotalsThisMonth: topCategories,
    goals: goalsSummary,
    recentTransactionsSample: last10,
  };
}

module.exports = { buildCoachContext };
