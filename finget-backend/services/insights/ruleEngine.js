const {
  MS_DAY,
  istParts,
  fromISTFields,
  isWeekendIST,
  startOfDayIST,
} = require("../../utils/time");

function toObject(t) {
  return t.toObject ? t.toObject() : t;
}

const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Recurring-charge detector.
 *
 * Groups by category + amount, then looks for repeats ~monthly apart. The old
 * version counted every *interval* as a separate charge, so a service billed
 * three months running was reported as two charges and its monthly cost was
 * double-counted. Here each distinct series contributes its amount once.
 */
exports.analyzeSubscriptions = (transactions) => {
  const txs = transactions.map(toObject);

  const series = {};
  txs.forEach((t) => {
    if (t.type !== "expense") return;
    const key = `${t.category || "unknown"}_${Math.round(t.amount)}`;
    (series[key] = series[key] || []).push({ ...t, date: new Date(t.date) });
  });

  const recurring = [];
  for (const arr of Object.values(series)) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.date - b.date);

    const monthlyGap = arr.some((_, i) => {
      if (i === 0) return false;
      const days = (arr[i].date - arr[i - 1].date) / MS_DAY;
      return days >= 26 && days <= 35;
    });

    // Same amount 3+ times counts even without a clean monthly cadence.
    if (monthlyGap || arr.length >= 3) {
      recurring.push({
        category: arr[0].category || "Uncategorized",
        amount: arr[0].amount,
        occurrences: arr.length,
        confident: monthlyGap,
      });
    }
  }

  if (recurring.length === 0) return null;

  const monthlyLeak = recurring.reduce((s, r) => s + r.amount, 0);
  const names = recurring
    .slice(0, 3)
    .map((r) => `${r.category} (${inr(r.amount)})`)
    .join(", ");

  return {
    title: "Subscription leak detector",
    description: `${recurring.length} recurring charge${
      recurring.length > 1 ? "s" : ""
    } totalling about ${inr(monthlyLeak)}/month: ${names}${
      recurring.length > 3 ? "…" : ""
    }.`,
    actionable_tip: `Cancelling the ones you no longer use frees roughly ${inr(
      monthlyLeak * 12
    )} a year.`,
    source: "rule",
  };
};

exports.calculateHealthScore = (monthlyIncome, remaining) => {
  if (!monthlyIncome || monthlyIncome <= 0) {
    return { score: 50, label: "Unknown", hint: "Add your monthly income to score your health." };
  }

  const savingsRatio = remaining / monthlyIncome;
  let score = 50;
  if (savingsRatio >= 0.2) score = 95;
  else if (savingsRatio >= 0.1) score = 80;
  else if (savingsRatio >= 0.05) score = 65;
  else if (savingsRatio < 0) score = 20;

  const label =
    score > 80 ? "Excellent" : score > 60 ? "Good" : score > 40 ? "Warning" : "Critical";

  return {
    score,
    label,
    hint: `You are keeping ${Math.round(savingsRatio * 100)}% of income this month.`, // not-money: percentage
  };
};

exports.categoryOverspendVsLastMonth = (transactions) => {
  const txs = transactions.map(toObject);
  const now = new Date();
  const { year, month } = istParts(now);
  const thisStart = fromISTFields(year, month, 1);
  const lastStart = fromISTFields(year, month - 1, 1);
  const nextStart = fromISTFields(year, month + 1, 1);

  const sumBy = (start, end) => {
    const m = {};
    txs.forEach((t) => {
      if (t.type !== "expense") return;
      const d = new Date(t.date);
      if (d < start || d >= end) return;
      const c = t.category || "Other";
      m[c] = (m[c] || 0) + t.amount;
    });
    return m;
  };

  const thisMonth = sumBy(thisStart, nextStart);
  const lastMonth = sumBy(lastStart, thisStart);

  let worst = null;
  let worstPct = 0;
  for (const cat of Object.keys(thisMonth)) {
    const prev = lastMonth[cat] || 0;
    if (prev <= 0) continue;
    const pct = ((thisMonth[cat] - prev) / prev) * 100; // not-money: percentage
    if (pct > worstPct && pct >= 15) {
      worstPct = pct;
      worst = { cat, thisAmt: thisMonth[cat], prevAmt: prev, pct };
    }
  }

  if (!worst) return null;

  return {
    title: `Category alert: ${worst.cat}`,
    description: `${inr(worst.thisAmt)} on ${worst.cat} this month vs ${inr(
      worst.prevAmt
    )} last month — about ${Math.round(worst.pct)}% more.`,
    actionable_tip: "Delay non-essential purchases in this category or set a weekly cap.",
    source: "rule",
  };
};

exports.predictiveBalanceNote = (transactions, affordability) => {
  const txs = transactions.map(toObject);
  if (txs.length < 3) return null;

  const thirty = new Date(Date.now() - 30 * MS_DAY);
  const recentExp = txs.filter((t) => t.type === "expense" && new Date(t.date) >= thirty);
  if (recentExp.length === 0) return null;

  const dailyAvg = recentExp.reduce((s, t) => s + t.amount, 0) / 30;
  if (dailyAvg < 50) return null;

  const daysLeft = affordability.daysLeftInMonth || 15;
  const projected = affordability.remaining - dailyAvg * daysLeft;

  return {
    title: "Projected month-end balance",
    description: `You are spending about ${inr(
      dailyAvg
    )}/day. With ${daysLeft} days left, ${inr(affordability.remaining)} trends toward ${inr(
      projected
    )}.`,
    actionable_tip:
      projected < 0
        ? `You would end the month about ${inr(
            Math.abs(projected)
          )} short — trim discretionary spend now.`
        : "Your current pace keeps you inside the month's budget.",
    source: "rule",
  };
};

/** Are the active goals actually on track for their deadlines? */
exports.goalPaceCheck = (goals, affordability) => {
  const active = (goals || []).filter(
    (g) => g.targetAmount > 0 && (g.currentAmount || 0) < g.targetAmount
  );
  if (active.length === 0) return null;

  const monthlyCapacity = Math.max(0, affordability.remaining || 0);

  const withDeadline = active
    .filter((g) => g.deadline)
    .map((g) => {
      const outstanding = g.targetAmount - (g.currentAmount || 0);
      const monthsLeft = Math.max(
        0.1,
        (new Date(g.deadline) - Date.now()) / (30 * MS_DAY)
      );
      return { ...g, outstanding, monthsLeft, needPerMonth: outstanding / monthsLeft };
    })
    .sort((a, b) => b.needPerMonth - a.needPerMonth);

  if (withDeadline.length === 0) {
    const total = active.reduce(
      (s, g) => s + (g.targetAmount - (g.currentAmount || 0)),
      0
    );
    if (monthlyCapacity <= 0) return null;
    return {
      title: "Goal pace",
      description: `${active.length} active goal${
        active.length > 1 ? "s" : ""
      } need ${inr(total)} more. At ${inr(
        monthlyCapacity
      )}/month spare, that is about ${Math.ceil(total / monthlyCapacity)} months.`,
      actionable_tip: "Add deadlines to your goals to get pace warnings.",
      source: "rule",
    };
  }

  const tightest = withDeadline[0];
  const onTrack = monthlyCapacity >= tightest.needPerMonth;

  return {
    title: onTrack ? `On track: ${tightest.name}` : `Behind pace: ${tightest.name}`,
    description: `${tightest.name} needs ${inr(
      tightest.needPerMonth
    )}/month to hit its deadline. Your current spare capacity is ${inr(monthlyCapacity)}.`,
    actionable_tip: onTrack
      ? "Automate the transfer so the goal funds itself before you spend."
      : `Free up about ${inr(
          tightest.needPerMonth - monthlyCapacity
        )}/month, or push the deadline out.`,
    source: "rule",
  };
};

/** Weekend impulse spending is the single most common leak — surface it. */
exports.weekendSpendPattern = (transactions) => {
  const txs = transactions.map(toObject);
  const thirty = new Date(Date.now() - 30 * MS_DAY);
  const recent = txs.filter((t) => t.type === "expense" && new Date(t.date) >= thirty);
  if (recent.length < 6) return null;

  let weekend = 0;
  let weekday = 0;
  recent.forEach((t) => {
    if (isWeekendIST(new Date(t.date))) weekend += t.amount;
    else weekday += t.amount;
  });

  // ~8.6 weekend days vs ~21.4 weekdays in 30 days.
  const weekendDaily = weekend / 8.6;
  const weekdayDaily = weekday / 21.4;
  if (weekdayDaily <= 0 || weekendDaily <= weekdayDaily * 1.4) return null;

  const multiple = (weekendDaily / weekdayDaily).toFixed(1);

  return {
    title: "Weekend spending spike",
    description: `You spend about ${inr(
      weekendDaily
    )}/day at weekends vs ${inr(weekdayDaily)}/day midweek — ${multiple}× more.`,
    actionable_tip: `Set a Friday-night cap. Halving the weekend gap saves roughly ${inr(
      (weekendDaily - weekdayDaily) * 4.3
    )}/month.`,
    source: "rule",
  };
};

/** Group-only: is the cost of shared life landing on one person? */
exports.groupContributionBalance = (transactions, memberCount) => {
  if (!memberCount || memberCount < 2) return null;
  const txs = transactions.map(toObject);
  const expenses = txs.filter((t) => t.type === "expense");
  if (expenses.length < 3) return null;

  const paid = {};
  expenses.forEach((t) => {
    const key = String(t.paidBy || t.userId || "unknown");
    paid[key] = (paid[key] || 0) + t.amount;
  });

  const total = expenses.reduce((s, t) => s + t.amount, 0);
  const entries = Object.entries(paid).sort((a, b) => b[1] - a[1]);
  const topShare = entries[0][1] / total;
  const fairShare = 1 / memberCount;

  if (topShare < fairShare * 1.6) return null;

  return {
    title: "One member is fronting most costs",
    description: `The top payer has covered ${Math.round(
      topShare * 100 // not-money: percentage
    )}% of ${inr(total)} in shared spend, against an even share of ${Math.round(
      fairShare * 100 // not-money: percentage
    )}%.`,
    actionable_tip: "Run a settle-up, or rotate who pays so the load evens out.",
    source: "rule",
  };
};

/**
 * Weekend PRE-warning.
 *
 * Distinct from `weekendSpendPattern` above, and deliberately so: that one is
 * retrospective ("you spend 2.1× more at weekends"), which is useful once and
 * then just true. This one is a forecast delivered while it can still change
 * the outcome — Thursday or Friday, comparing what is actually left against
 * what the last three weekends actually cost.
 *
 *   "₹800 left for the weekend; the last three Fridays you spent ₹1,900."
 *
 * Both halves are measured, not modelled. No projection, no assumed rate, no
 * model call — the number on the right is money that genuinely left the account
 * on those days, which is the only version of this sentence a person will
 * believe the second time they read it.
 *
 * Returns null on every day that is not the run-up to a weekend, and null when
 * there is not enough history to say anything honest.
 *
 * @param {object[]} transactions
 * @param {{remaining: number}} affordability
 * @param {Date} [now]
 */
exports.weekendPreWarning = (transactions, affordability, now = new Date()) => {
  const { weekday } = istParts(now);

  // Thursday (4) and Friday (5) only. Saturday is too late to be a warning and
  // Monday would be a scolding.
  if (weekday !== 4 && weekday !== 5) return null;

  const txs = transactions.map(toObject);
  const expenses = txs.filter((t) => t.type === "expense");
  if (expenses.length === 0) return null;

  /**
   * How far back the ledger actually goes.
   *
   * A weekend with no recorded spend is indistinguishable from a weekend
   * BEFORE this person started using Finget, and averaging the second kind in
   * as a ₹0 weekend quietly halves the figure — "the last three weekends you
   * spent about ₹900" when the two real ones cost ₹1,900 each. The sentence
   * has to be true or it should not be sent, so weekends older than the first
   * transaction do not count and the rule stays silent until there are three
   * real ones.
   */
  const earliestDay = startOfDayIST(
    expenses.reduce(
      (oldest, t) => (new Date(t.date) < oldest ? new Date(t.date) : oldest),
      new Date(expenses[0].date)
    )
  );

  /**
   * The last three COMPLETED weekends, each Saturday+Sunday summed. Walked back
   * day by day from today rather than bucketed by week number, so it does not
   * break across a month or year boundary.
   */
  const weekendTotals = [];
  let cursor = new Date(now.getTime() - MS_DAY);
  let currentWeekend = null;
  let guard = 0;

  while (weekendTotals.length < 3 && guard < 40) {
    guard += 1;

    /**
     * Walked back past the start of the ledger. Bank a weekend that is still
     * open first — the day that CLOSES the oldest in-range weekend is itself
     * out of range, and bailing before banking it would throw away a weekend
     * that is entirely real.
     */
    if (startOfDayIST(cursor) < earliestDay) {
      if (currentWeekend !== null) weekendTotals.push(currentWeekend);
      break;
    }

    const isWeekendDay = isWeekendIST(cursor);

    if (isWeekendDay) {
      const dayTotal = expenses
        .filter((t) => sameISTDay(new Date(t.date), cursor))
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      currentWeekend = (currentWeekend || 0) + dayTotal;
    } else if (currentWeekend !== null) {
      // Walked off the front of a weekend — bank it and look for the next.
      weekendTotals.push(currentWeekend);
      currentWeekend = null;
    }

    cursor = new Date(cursor.getTime() - MS_DAY);
  }

  if (weekendTotals.length < 3) return null;

  const typical = weekendTotals.reduce((s, v) => s + v, 0) / weekendTotals.length;

  // Nothing to warn about if weekends cost nothing, and nothing to warn about
  // if what is left comfortably covers one.
  if (typical <= 0) return null;

  const remaining = affordability?.remaining ?? 0;
  if (remaining >= typical) return null;

  const shortfall = typical - remaining;

  return {
    title: "This weekend will be tight",
    description: `${inr(remaining)} left for the weekend; the last three weekends you spent about ${inr(
      typical
    )}.`,
    actionable_tip:
      remaining <= 0
        ? "You are already past this month's room. Anything now comes out of next month."
        : `Keeping the weekend under ${inr(remaining)} means closing the month level. That is ${inr(
            shortfall
          )} less than usual.`,
    source: "rule",
    /** Structured for the push sender, which cannot re-derive it from prose. */
    meta: { remaining, typical, shortfall },
  };
};

/** Same IST calendar day? Compared on parts, never on UTC timestamps. */
function sameISTDay(a, b) {
  const x = istParts(a);
  const y = istParts(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}
