const Goal = require("../models/Goal");
const Deflection = require("../models/Deflection");
const { fromPaise, sumPaise } = require("../utils/money");
const { MS_DAY, startOfMonthIST, istParts, fromISTFields } = require("../utils/time");

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
 * @param {string} opts.userId  required for personal scope goal lookup
 * @param {string} [opts.groupId] when set, goals are read from the shared group
 * @param {import('mongoose').Document[]} opts.transactions
 */
async function buildCoachContext({ userId, groupId, transactions }) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_DAY);
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_DAY);

  const tx = transactions.map((t) => (t.toObject ? t.toObject() : t));

  const recent = tx.filter((t) => new Date(t.date) >= thirtyDaysAgo);
  const thisWeek = tx.filter((t) => new Date(t.date) >= sevenDaysAgo);

  const monthlyByCat = summarizeByCategory(tx, startOfMonthIST(now));
  const weeklyExpenses = thisWeek
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const { year, month } = istParts(now);
  const prevMonthStart = fromISTFields(year, month - 1, 1);
  const prevMonthEnd = startOfMonthIST(now);
  const prevMonthExpenses = tx
    .filter(
      (t) =>
        t.type === "expense" &&
        new Date(t.date) >= prevMonthStart &&
        new Date(t.date) < prevMonthEnd
    )
    .reduce((s, t) => s + t.amount, 0);

  const goalsQuery = groupId
    ? { groupId }
    : { userId, groupId: { $exists: false } };
  const goals = await Goal.find(goalsQuery).lean();

  const goalsSummary = goals.map((g) => ({
    name: g.name,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount || 0,
    deadline: g.deadline,
    priority: g.priority,
    pct:
      g.targetAmount > 0
        ? Math.round(((g.currentAmount || 0) / g.targetAmount) * 100) // not-money: percentage
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

  /**
   * What this person walked away from.
   *
   * The coach is the one surface that can say "you didn't buy the headphones,
   * and that is why Goa moved closer" — and it can only say it if it knows.
   * Deliberately excludes anything they *did* buy after considering it: the
   * coach has the transaction ledger for spending, and giving it a list of
   * "things you caved on" would turn the calmest surface in the app into the
   * one that keeps score.
   */
  const scopeFilter = groupId ? { groupId } : { userId, groupId: { $exists: false } };

  const [deflected, holds] = await Promise.all([
    Deflection.find({ ...scopeFilter, state: "deflected", decidedAt: { $gte: thirtyDaysAgo } })
      .select("label amountPaise decidedAt translationSnapshot")
      .sort({ decidedAt: -1 })
      .limit(10)
      .lean(),
    Deflection.find({ ...scopeFilter, state: "considering" })
      .select("label amountPaise vaultUntil")
      .lean(),
  ]);

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
    deflections: {
      last30DaysTotal: fromPaise(sumPaise(deflected.map((d) => d.amountPaise))),
      count: deflected.length,
      examples: deflected.slice(0, 5).map((d) => ({
        label: d.label,
        amount: fromPaise(d.amountPaise),
        wasWorth: d.translationSnapshot?.headline,
      })),
      // Currently held back, awaiting a decision — money the coach should treat
      // as unavailable rather than as spare.
      currentlyOnHold: fromPaise(sumPaise(holds.map((d) => d.amountPaise))),
      holdCount: holds.length,
    },
  };
}

module.exports = { buildCoachContext };
