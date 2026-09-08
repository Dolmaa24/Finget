const AiCredit = require("../models/AiCredit");
const AiProvider = require("../models/AiProvider");
const AiUsageLog = require("../models/AiUsageLog");
const Notification = require("../models/Notification");

/**
 * FIFO Credit Burn-down Engine:
 * Deducts daily usage against credits using First-In-First-Out logic:
 * 1. Grants / Promotional credits nearing expiration are burned first.
 * 2. Paid credits are burned subsequently by nearest expiration, then oldest purchase date.
 */
async function deductCreditsFIFO({ userId, providerId, cost, currency = "USD" }) {
  if (cost <= 0) return { success: true, deducted: 0, allocations: [] };

  // Find non-expired credits with remaining balance > 0
  const now = new Date();
  const credits = await AiCredit.find({
    userId,
    providerId,
    remainingBalance: { $gt: 0 },
    $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gt: now } }],
  }).exec();

  // Sort by priority:
  // 1. Grants come before Paid
  // 2. Earliest expiryDate comes first
  // 3. Earliest purchaseDate comes first
  credits.sort((a, b) => {
    if (a.creditType === "grant" && b.creditType !== "grant") return -1;
    if (b.creditType === "grant" && a.creditType !== "grant") return 1;

    if (a.expiryDate && b.expiryDate) {
      return new Date(a.expiryDate) - new Date(b.expiryDate);
    }
    if (a.expiryDate && !b.expiryDate) return -1;
    if (!a.expiryDate && b.expiryDate) return 1;

    return new Date(a.purchaseDate) - new Date(b.purchaseDate);
  });

  let remainingCostToDeduct = cost;
  const allocations = [];

  for (const credit of credits) {
    if (remainingCostToDeduct <= 0) break;

    const available = credit.remainingBalance;
    const deduction = Math.min(available, remainingCostToDeduct);

    credit.remainingBalance = Number((credit.remainingBalance - deduction).toFixed(6));
    if (credit.remainingBalance <= 0) {
      credit.remainingBalance = 0;
    }
    credit.updatedAt = now;
    await credit.save();

    remainingCostToDeduct = Number((remainingCostToDeduct - deduction).toFixed(6));
    allocations.push({
      creditId: credit._id,
      creditName: credit.name,
      creditType: credit.creditType,
      deductedAmount: deduction,
      newRemainingBalance: credit.remainingBalance,
    });
  }

  // Update provider status if balance is exhausted or low
  const totalRemaining = await getTotalProviderBalance(userId, providerId);
  const provider = await AiProvider.findOne({ _id: providerId, userId });
  if (provider) {
    const threshold = provider.settings?.lowBalanceThreshold || 10;
    if (totalRemaining <= 0) {
      provider.status = "low_balance";
    } else if (totalRemaining < threshold) {
      provider.status = "low_balance";
    } else {
      provider.status = "active";
    }
    await provider.save();
  }

  return {
    success: true,
    totalDeducted: Number((cost - remainingCostToDeduct).toFixed(6)),
    uncoveredCost: remainingCostToDeduct,
    allocations,
    primaryCreditId: allocations[0]?.creditId || null,
  };
}

/**
 * Computes total active balance for a provider.
 */
async function getTotalProviderBalance(userId, providerId) {
  const now = new Date();
  const activeCredits = await AiCredit.find({
    userId,
    providerId,
    remainingBalance: { $gt: 0 },
    $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gt: now } }],
  }).lean();

  return activeCredits.reduce((sum, c) => sum + (c.remainingBalance || 0), 0);
}

/**
 * Calculates daily burn rate velocity and runway projections.
 */
async function calculateProviderVelocity(userId, providerId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [usage30d, usage7d, totalBalance] = await Promise.all([
    AiUsageLog.aggregate([
      { $match: { userId, providerId, timestamp: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, totalCost: { $sum: "$cost" }, totalTokens: { $sum: "$totalTokens" }, count: { $sum: 1 } } },
    ]),
    AiUsageLog.aggregate([
      { $match: { userId, providerId, timestamp: { $gte: sevenDaysAgo } } },
      { $group: { _id: null, totalCost: { $sum: "$cost" } } },
    ]),
    getTotalProviderBalance(userId, providerId),
  ]);

  const cost30d = usage30d[0]?.totalCost || 0;
  const cost7d = usage7d[0]?.totalCost || 0;
  const dailyBurn7d = Number((cost7d / 7).toFixed(4));
  const dailyBurn30d = Number((cost30d / 30).toFixed(4));
  const effectiveDailyBurn = dailyBurn7d > 0 ? dailyBurn7d : dailyBurn30d;

  const runwayDays = effectiveDailyBurn > 0 ? Math.round(totalBalance / effectiveDailyBurn) : totalBalance > 0 ? 999 : 0;

  return {
    totalBalance: Number(totalBalance.toFixed(2)),
    cost30d: Number(cost30d.toFixed(4)),
    cost7d: Number(cost7d.toFixed(4)),
    dailyBurn: effectiveDailyBurn,
    runwayDays,
    totalTokens30d: usage30d[0]?.totalTokens || 0,
    requestCount30d: usage30d[0]?.count || 0,
  };
}

/**
 * Runs sweeps for low balances and credits expiring soon, pushing in-app notifications.
 */
async function sweepLowBalancesAndExpirations(userId) {
  const now = new Date();
  const sevenDaysAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const alerts = [];

  // Check expiring credits
  const expiringCredits = await AiCredit.find({
    userId,
    remainingBalance: { $gt: 0 },
    expiryDate: { $gte: now, $lte: sevenDaysAhead },
  }).populate("providerId", "name");

  for (const cred of expiringCredits) {
    const daysLeft = Math.max(1, Math.ceil((new Date(cred.expiryDate) - now) / (1000 * 60 * 60 * 24)));
    alerts.push({
      type: "expiring_soon",
      title: `AI Credit Expiring in ${daysLeft} day${daysLeft > 1 ? "s" : ""}`,
      body: `${cred.providerId?.name || "AI"} package "${cred.name}" has $${cred.remainingBalance.toFixed(2)} remaining expiring on ${new Date(cred.expiryDate).toLocaleDateString()}.`,
      providerName: cred.providerId?.name,
      creditId: cred._id,
    });
  }

  // Check low provider balances
  const providers = await AiProvider.find({ userId, status: { $ne: "inactive" } });
  for (const prov of providers) {
    const balance = await getTotalProviderBalance(userId, prov._id);
    const threshold = prov.settings?.lowBalanceThreshold || 10;
    if (balance < threshold) {
      alerts.push({
        type: "low_balance",
        title: `Low AI Balance: ${prov.name}`,
        body: `Available balance is $${balance.toFixed(2)} (below $${threshold} threshold). Top up to prevent API interruptions.`,
        providerName: prov.name,
        providerId: prov._id,
      });
    }
  }

  return alerts;
}

module.exports = {
  deductCreditsFIFO,
  getTotalProviderBalance,
  calculateProviderVelocity,
  sweepLowBalancesAndExpirations,
};
