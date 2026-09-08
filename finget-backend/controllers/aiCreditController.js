const AiProvider = require("../models/AiProvider");
const AiCredit = require("../models/AiCredit");
const AiUsageLog = require("../models/AiUsageLog");
const Transaction = require("../models/Transaction");
const { deductCreditsFIFO, calculateProviderVelocity, sweepLowBalancesAndExpirations } = require("../services/aiCreditEngine");
const { calculateTokenCost, listSupportedModels } = require("../services/aiPricingCatalog");
const { syncProviderData, seedDefaultProvidersIfEmpty } = require("../services/aiSyncService");

/**
 * `GET /api/ai-credits/dashboard` — Aggregated AI credits overview.
 */
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user;
    await seedDefaultProvidersIfEmpty(userId);

    const providers = await AiProvider.find({ userId }).sort({ createdAt: 1 }).lean();
    const now = new Date();

    let totalBalanceINR = 0;
    let totalSpend30dINR = 0;
    let totalDailyBurnINR = 0;

    const providerCards = [];
    for (const prov of providers) {
      const velocity = await calculateProviderVelocity(userId, prov._id);
      const credits = await AiCredit.find({
        userId,
        providerId: prov._id,
        $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gt: now } }],
      }).sort({ expiryDate: 1 }).lean();

      const grantBalance = credits.filter(c => c.creditType === "grant").reduce((s, c) => s + (c.remainingBalance || 0), 0);
      const paidBalance = credits.filter(c => c.creditType !== "grant").reduce((s, c) => s + (c.remainingBalance || 0), 0);

      totalBalanceINR += velocity.totalBalance;
      totalSpend30dINR += velocity.cost30d;
      totalDailyBurnINR += velocity.dailyBurn;

      providerCards.push({
        ...prov,
        velocity,
        credits,
        grantBalance: Number(grantBalance.toFixed(2)),
        paidBalance: Number(paidBalance.toFixed(2)),
      });
    }

    // Model distribution (past 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const modelBreakdown = await AiUsageLog.aggregate([
      { $match: { userId, timestamp: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: "$model",
          totalCost: { $sum: "$cost" },
          totalTokens: { $sum: "$totalTokens" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalCost: -1 } },
    ]);

    // Recent usage
    const recentUsage = await AiUsageLog.find({ userId })
      .sort({ timestamp: -1 })
      .limit(10)
      .populate("providerId", "name providerKey")
      .populate("deductedCreditId", "name creditType")
      .lean();

    // Alerts
    const alerts = await sweepLowBalancesAndExpirations(userId);

    const effectiveRunwayDays = totalDailyBurnINR > 0
      ? Math.round(totalBalanceINR / totalDailyBurnINR)
      : totalBalanceINR > 0 ? 999 : 0;

    res.json({
      summary: {
        totalBalanceUSD: Number(totalBalanceINR.toFixed(2)), // frontend uses this property name, so we keep the key but it contains INR
        totalBalanceINR: Math.round(totalBalanceINR),
        totalSpend30dUSD: Number(totalSpend30dINR.toFixed(2)), // same here
        totalSpend30dINR: Math.round(totalSpend30dINR),
        totalDailyBurnUSD: Number(totalDailyBurnINR.toFixed(3)),
        runwayDays: effectiveRunwayDays,
        providerCount: providers.length,
      },
      providers: providerCards,
      modelBreakdown: modelBreakdown.map((m) => ({
        model: m._id,
        cost: Number(m.totalCost.toFixed(4)),
        tokens: m.totalTokens,
        count: m.count,
        percentage: totalSpend30dINR > 0 ? Math.round((m.totalCost / totalSpend30dINR) * 100) : 0,
      })),
      recentUsage,
      alerts,
    });
  } catch (err) {
    console.error("AI credits dashboard error:", err);
    res.status(500).json({ error: err.message || "Failed to load AI credit dashboard" });
  }
};

/**
 * `GET /api/ai-credits/providers`
 */
exports.getProviders = async (req, res) => {
  try {
    const userId = req.user;
    const providers = await AiProvider.find({ userId }).sort({ createdAt: 1 }).lean();
    res.json({ providers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/ai-credits/providers`
 */
exports.createProvider = async (req, res) => {
  try {
    const { name, providerKey, authCredentials, lowBalanceThreshold, syncType } = req.body;
    if (!name) return res.status(400).json({ error: "Provider name is required" });

    const provider = await AiProvider.create({
      userId: req.user,
      name: name.trim(),
      providerKey: providerKey || "custom",
      authCredentialsEncrypted: authCredentials ? `***${authCredentials.slice(-4)}` : "",
      syncType: syncType || "manual",
      settings: {
        lowBalanceThreshold: Number(lowBalanceThreshold) || 10,
        currency: "USD",
        autoSyncLedger: true,
      },
    });

    res.status(201).json({ provider });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `PUT /api/ai-credits/providers/:id`
 */
exports.updateProvider = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status, lowBalanceThreshold, syncType, authCredentials } = req.body;

    const provider = await AiProvider.findOne({ _id: id, userId: req.user });
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    if (name) provider.name = name.trim();
    if (status) provider.status = status;
    if (syncType) provider.syncType = syncType;
    if (authCredentials) provider.authCredentialsEncrypted = `***${authCredentials.slice(-4)}`;
    if (lowBalanceThreshold !== undefined) {
      provider.settings.lowBalanceThreshold = Number(lowBalanceThreshold);
    }
    provider.updatedAt = new Date();
    await provider.save();

    res.json({ provider });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `DELETE /api/ai-credits/providers/:id`
 */
exports.deleteProvider = async (req, res) => {
  try {
    const { id } = req.params;
    await AiProvider.deleteOne({ _id: id, userId: req.user });
    await AiCredit.deleteMany({ providerId: id, userId: req.user });
    await AiUsageLog.deleteMany({ providerId: id, userId: req.user });
    res.json({ msg: "Provider and related data removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/ai-credits/credits` — Add a new Grant or Paid credit package.
 */
exports.createCredit = async (req, res) => {
  try {
    const { providerId, name, amount, creditType, expiryDate, autoSyncLedger } = req.body;
    const numAmount = Number(amount);

    if (!providerId || !name || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: "Valid providerId, name, and positive amount are required" });
    }

    const provider = await AiProvider.findOne({ _id: providerId, userId: req.user });
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    let ledgerTxId = null;

    // Optional Auto-Sync to Main Finget Ledger if paid package
    if (autoSyncLedger && creditType !== "grant") {
      const inrAmount = Math.round(numAmount);
      const tx = await Transaction.create({
        userId: req.user,
        amount: inrAmount,
        category: "Subscriptions",
        note: `AI Credit Top-up: ${provider.name} (₹${numAmount})`,
        type: "expense",
        date: new Date(),
      });
      ledgerTxId = tx._id;
    }

    const credit = await AiCredit.create({
      userId: req.user,
      providerId,
      name: name.trim(),
      initialAmount: numAmount,
      remainingBalance: numAmount,
      currency: "USD",
      creditType: creditType || "paid",
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      autoSyncLedger: Boolean(autoSyncLedger),
      ledgerTransactionId: ledgerTxId,
      purchaseDate: new Date(),
    });

    // Recheck provider status
    if (provider.status === "low_balance") {
      provider.status = "active";
      await provider.save();
    }

    res.status(201).json({ credit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `DELETE /api/ai-credits/credits/:id`
 */
exports.deleteCredit = async (req, res) => {
  try {
    const { id } = req.params;
    await AiCredit.deleteOne({ _id: id, userId: req.user });
    res.json({ msg: "Credit package removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `GET /api/ai-credits/usage` — List itemized usage logs.
 */
exports.getUsageLogs = async (req, res) => {
  try {
    const { providerId, model, limit = 50, page = 1 } = req.query;
    const query = { userId: req.user };
    if (providerId) query.providerId = providerId;
    if (model) query.model = model;

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AiUsageLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("providerId", "name providerKey")
        .populate("deductedCreditId", "name creditType")
        .lean(),
      AiUsageLog.countDocuments(query),
    ]);

    res.json({ logs, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/ai-credits/usage/log` — Ingest token consumption and run FIFO burn-down.
 */
exports.logUsage = async (req, res) => {
  try {
    const { providerId, model, inputTokens = 0, outputTokens = 0, cost, source, notes } = req.body;
    if (!providerId || !model) {
      return res.status(400).json({ error: "providerId and model are required" });
    }

    let calculatedCost = Number(cost);
    if (isNaN(calculatedCost) || calculatedCost <= 0) {
      const pricing = calculateTokenCost(model, Number(inputTokens), Number(outputTokens));
      calculatedCost = pricing.totalCost;
    }

    // Run FIFO Burn-down
    const fifoResult = await deductCreditsFIFO({
      userId: req.user,
      providerId,
      cost: calculatedCost,
    });

    const usageLog = await AiUsageLog.create({
      userId: req.user,
      providerId,
      model: model.trim(),
      inputTokens: Number(inputTokens) || 0,
      outputTokens: Number(outputTokens) || 0,
      totalTokens: (Number(inputTokens) || 0) + (Number(outputTokens) || 0),
      cost: calculatedCost,
      currency: "USD",
      source: source || "manual_entry",
      deductedCreditId: fifoResult.primaryCreditId,
      notes: notes || "",
      timestamp: new Date(),
    });

    res.status(201).json({
      usageLog,
      fifoResult,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/ai-credits/sync/:providerId` — Trigger provider sync.
 */
exports.syncProvider = async (req, res) => {
  try {
    const { providerId } = req.params;
    const result = await syncProviderData(req.user, providerId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/ai-credits/estimate-cost` — Real-time prompt/token cost estimator.
 */
exports.estimateCost = async (req, res) => {
  try {
    const { model, inputTokens = 0, outputTokens = 0, promptText = "" } = req.body;

    let computedInput = Number(inputTokens) || 0;
    if (promptText && computedInput === 0) {
      // Rough token estimation: ~4 chars per token
      computedInput = Math.ceil(promptText.length / 4);
    }

    const computedOutput = Number(outputTokens) || 0;
    const estimate = calculateTokenCost(model, computedInput, computedOutput);

    res.json({
      model,
      inputTokens: computedInput,
      outputTokens: computedOutput,
      ...estimate,
      costINR: Number(estimate.totalCost.toFixed(2)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `GET /api/ai-credits/models` — Supported model catalog and pricing.
 */
exports.getModelCatalog = (req, res) => {
  res.json({ models: listSupportedModels() });
};
