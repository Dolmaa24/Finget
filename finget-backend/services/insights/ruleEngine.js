const MS_DAY = 86400000;

function toObject(t) {
  return t.toObject ? t.toObject() : t;
}

/** Same merchant + similar amount + ~monthly interval (28–35 days) */
exports.analyzeSubscriptions = (transactions) => {
  const txs = transactions.map(toObject);
  const byMerchant = {};
  txs.forEach((t) => {
    if (t.type !== "expense") return;
    const key = `${t.category || "unknown"}_${Math.round(t.amount)}`;
    if (!byMerchant[key]) byMerchant[key] = [];
    byMerchant[key].push({ ...t, date: new Date(t.date) });
  });

  const recurring = [];
  for (const arr of Object.values(byMerchant)) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.date - b.date);
    for (let i = 1; i < arr.length; i++) {
      const days = (arr[i].date - arr[i - 1].date) / MS_DAY;
      if (days >= 28 && days <= 35) {
        recurring.push(arr[i]);
      }
    }
  }

  if (recurring.length === 0) {
    const map = {};
    txs.forEach((t) => {
      if (t.type !== "expense") return;
      const key = `${t.amount}_${t.category}`;
      if (!map[key]) map[key] = { ...t, count: 0 };
      map[key].count++;
    });
    const subs = Object.values(map).filter((t) => t.count > 1);
    const monthlyLeak = subs.reduce((sum, t) => sum + t.amount, 0);
    if (subs.length > 0) {
      return {
        title: "Subscription leak detector",
        description: `We detected ${subs.length} potential recurring charges (same merchant/category + amount) totaling about ₹${monthlyLeak}/period.`,
        actionable_tip:
          "Review these in your bank statement — cancel duplicates or switch to annual plans if cheaper.",
        source: "rule",
      };
    }
    return null;
  }

  const monthlyLeak = recurring.reduce((s, t) => s + t.amount, 0);
  return {
    title: "Subscription leak detector",
    description: `Detected ${recurring.length} likely monthly charges (~₹${monthlyLeak}/month combined) from recurring similar amounts.`,
    actionable_tip:
      "Cancel unused subscriptions or bundle services. Same merchant + 28–35 day intervals suggests auto-renew.",
    source: "rule",
  };
};

exports.calculateHealthScore = (monthlyIncome, remaining) => {
  if (monthlyIncome <= 0) return { score: 50, label: "Unknown" };
  const savingsRatio = remaining / monthlyIncome;
  let score = 50;
  if (savingsRatio >= 0.2) score = 95;
  else if (savingsRatio >= 0.1) score = 80;
  else if (savingsRatio >= 0.05) score = 65;
  else if (savingsRatio < 0) score = 20;

  return {
    score,
    label: score > 80 ? "Excellent" : score > 60 ? "Good" : score > 40 ? "Warning" : "Critical",
  };
};

exports.categoryOverspendVsLastMonth = (transactions) => {
  const txs = transactions.map(toObject);
  const now = new Date();
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastEnd = thisStart;

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

  const thisMonth = sumBy(thisStart, new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const lastMonth = sumBy(lastStart, lastEnd);

  let worst = null;
  let worstPct = 0;
  for (const cat of Object.keys(thisMonth)) {
    const prev = lastMonth[cat] || 0;
    if (prev <= 0) continue;
    const pct = ((thisMonth[cat] - prev) / prev) * 100;
    if (pct > worstPct && pct >= 15) {
      worstPct = pct;
      worst = { cat, thisAmt: thisMonth[cat], prevAmt: prev, pct };
    }
  }

  if (!worst) return null;

  return {
    title: `Category alert: ${worst.cat}`,
    description: `You spent about ₹${Math.round(worst.thisAmt)} on ${worst.cat} this month vs ₹${Math.round(worst.prevAmt)} last month — roughly ${Math.round(worst.pct)}% more.`,
    actionable_tip: "Delay non-essential purchases in this category or set a weekly cap.",
    source: "rule",
  };
};

exports.predictiveBalanceNote = (transactions, affordability) => {
  const txs = transactions.map(toObject);
  if (txs.length < 3) return null;

  const thirty = new Date(Date.now() - 30 * MS_DAY);
  const recentExp = txs.filter((t) => t.type === "expense" && new Date(t.date) >= thirty);
  const sumExp = recentExp.reduce((s, t) => s + t.amount, 0);
  const dailyAvg = sumExp / 30;

  if (dailyAvg < 50) return null;

  let projected = affordability.remaining;
  if (dailyAvg > 0 && affordability.remaining !== undefined) {
    projected = affordability.remaining - dailyAvg * 15;
  }

  const tip =
    projected < 0
      ? "At current spend, you may go negative before month-end — trim discretionary spend."
      : "If spending stays near your recent average, you should remain within budget.";

  return {
    title: "Predictive balance (30-day trend)",
    description: `Approx. daily spend (30d): ₹${Math.round(dailyAvg)}. Rough outlook for next ~15 days vs remaining: ₹${Math.round(affordability.remaining)} → ₹${Math.round(projected)}.`,
    actionable_tip: tip,
    source: "rule",
  };
};
