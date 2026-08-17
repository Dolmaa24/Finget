const Settings = require("../models/Settings");
const Group = require("../models/Group");
const { isGroupAdmin } = require("../utils/groupAuth");
const {
  resolveScope,
  goalsForScope,
  affordabilityForScope,
  handleScopeError,
} = require("../services/scopeResolver");
const { simulatePurchase } = require("../services/simulationService");
const { translate } = require("../services/goalCurrencyService");
const { toPaise } = require("../utils/money");
const { inr } = require("../utils/format");
const { generateAutoBudget } = require("../services/budgetService");
const { simulateHabitChange } = require("../services/futureImpactService");

exports.getAffordability = async (req, res) => {
  try {
    const scope = await resolveScope({
      userId: req.user,
      context: req.query.context,
      groupId: req.query.groupId,
    });

    const result = affordabilityForScope(scope);

    res.json({
      ...result,
      scope: scope.isGroup ? "group" : "user",
      memberCount: scope.isGroup ? scope.group.members.length : 1,
      /**
       * How many members' incomes the pooled figure actually covers. The UI
       * has to say this: a total labelled as the whole group's, when it is
       * really one person's, is worse than showing nothing.
       */
      incomeContributors: scope.isGroup ? scope.incomeContributors : 1,
    });
  } catch (err) {
    handleScopeError(err, res);
  }
};

/**
 * `GET /api/finance/ambient` — the number, and nothing else.
 *
 * This is the payload a home-screen widget, a watch face, or a lock-screen
 * shim polls, and it is built to be POLLED: one scope resolve, no goal
 * queries, no insight sweep, no AI, no share cards. `/affordability` returns a
 * dozen fields because a dashboard uses all of them; a widget renders one
 * number and one line, and making it pay for the dozen is how a battery gets
 * eaten by a number nobody reads.
 *
 * `asOf` is not decoration. Every consumer of this endpoint is somewhere it
 * might be shown offline — a cached widget, an installed PWA with no signal —
 * and the one unforgivable failure mode is displaying yesterday's number as
 * though it were today's. Anything rendering this MUST show `asOf` when the
 * fetch did not just succeed.
 */
exports.getAmbient = async (req, res) => {
  try {
    const scope = await resolveScope({
      userId: req.user,
      context: req.query.context,
      groupId: req.query.groupId,
    });

    const a = affordabilityForScope(scope);

    /**
     * One line, chosen deterministically. No model call — a widget cannot wait
     * for one, and a number that sometimes arrives with a sentence and
     * sometimes without reads as broken.
     */
    let context;
    if (a.remaining < 0) {
      context = `Over by ${inr(Math.abs(a.remaining))} this month.`;
    } else if (a.risk === "Warning") {
      context = `${inr(a.remaining)} left, below your buffer.`;
    } else if (a.held > 0) {
      context = `${inr(a.remaining)} left · ${inr(a.held)} on hold.`;
    } else {
      context = `${inr(a.remaining)} left, ${a.daysLeftInMonth} ${
        a.daysLeftInMonth === 1 ? "day" : "days"
      } to go.`;
    }

    res.json({
      /**
       * Three forms of the same figure, and each earns its place:
       *
       *   safeDailyPaise  the exact contract, an integer, for anything doing maths
       *   safeDaily       rupees, matching `/affordability` exactly so the two
       *                   endpoints can never be seen to disagree — which means
       *                   it is an unrounded float (₹2866.666…)
       *   safeDailyLabel  ready to draw. A widget that printed `safeDaily`
       *                   directly would render "₹2866.6666666666665", so the
       *                   formatting is done once here rather than wrongly in
       *                   every consumer.
       */
      safeDaily: a.safeDaily,
      safeDailyPaise: toPaise(a.safeDaily),
      safeDailyLabel: inr(a.safeDaily),
      risk: a.risk,
      context,
      scope: scope.isGroup ? "group" : "user",
      label: scope.isGroup ? scope.group.name : null,
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    handleScopeError(err, res);
  }
};

exports.simulate = async (req, res) => {
  try {
    const { amount, context, groupId } = req.body;
    const scope = await resolveScope({ userId: req.user, context, groupId });

    const current = affordabilityForScope(scope);
    const goals = await goalsForScope(scope);

    res.json(simulatePurchase(current, amount, goals));
  } catch (err) {
    handleScopeError(err, res);
  }
};

/**
 * Goal currency: what does this purchase actually cost, in the terms this
 * person cares about? Takes integer paise explicitly — `/simulate` is the
 * rupee-denominated legacy mouth on the same maths.
 */
exports.translatePrice = async (req, res) => {
  try {
    const { amountPaise, amount, context, groupId } = req.body;

    // Accept rupees as a convenience, but paise is the contract.
    let paise;
    if (amountPaise !== undefined) {
      if (!Number.isInteger(amountPaise)) {
        return res.status(400).json({ msg: "amountPaise must be an integer number of paise" });
      }
      paise = amountPaise;
    } else if (amount !== undefined) {
      const rupees = Number(amount);
      if (!Number.isFinite(rupees)) {
        return res.status(400).json({ msg: "amount must be a number" });
      }
      paise = toPaise(rupees);
    } else {
      return res.status(400).json({ msg: "amountPaise is required" });
    }

    if (paise <= 0) {
      return res.status(400).json({ msg: "amountPaise must be greater than zero" });
    }

    const scope = await resolveScope({ userId: req.user, context, groupId });
    res.json(await translate(scope, paise));
  } catch (err) {
    handleScopeError(err, res);
  }
};

exports.getAutoBudget = async (req, res) => {
  try {
    const scope = await resolveScope({
      userId: req.user,
      context: req.query.context,
      groupId: req.query.groupId,
    });

    const suggestion = generateAutoBudget(
      scope.transactions,
      scope.owner.monthlyIncome || 0,
      scope.settings
    );

    const settings = scope.isGroup ? null : await Settings.findOne({ userId: req.user });

    res.json({
      suggestion,
      activeBudget: settings?.activeBudget || null,
    });
  } catch (err) {
    handleScopeError(err, res);
  }
};

exports.saveActiveBudget = async (req, res) => {
  try {
    const { activeBudget } = req.body;
    const settings = await Settings.findOneAndUpdate(
      { userId: req.user },
      { $set: { activeBudget, userId: req.user } },
      { new: true, upsert: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.futureImpactHabit = async (req, res) => {
  try {
    const { category, reduceByMonthly, context, groupId } = req.body;
    if (!category || reduceByMonthly == null) {
      return res.status(400).json({ msg: "category and reduceByMonthly required" });
    }

    const scope = await resolveScope({ userId: req.user, context, groupId });

    const out = simulateHabitChange(
      scope.transactions.map((t) => (t.toObject ? t.toObject() : t)),
      category,
      Number(reduceByMonthly)
    );
    res.json(out);
  } catch (err) {
    handleScopeError(err, res);
  }
};

/**
 * Savings target + emergency buffer. These drive the risk levels in
 * `calculateAffordability` but previously had no endpoint at all, so they were
 * permanently stuck at 0 and "Warning" could never trigger.
 */
exports.getBudgetSettings = async (req, res) => {
  try {
    const scope = await resolveScope({
      userId: req.user,
      context: req.query.context,
      groupId: req.query.groupId,
    });

    res.json({
      scope: scope.isGroup ? "group" : "user",
      savingsTarget: scope.settings.savingsTarget || 0,
      emergencyBuffer: scope.settings.emergencyBuffer || 0,
      monthlyIncome: scope.owner.monthlyIncome || 0,
      editable: scope.isGroup ? isGroupAdmin(scope.group, req.user) : true,
    });
  } catch (err) {
    handleScopeError(err, res);
  }
};

exports.updateBudgetSettings = async (req, res) => {
  try {
    const { savingsTarget, emergencyBuffer, context, groupId } = req.body;
    const scope = await resolveScope({ userId: req.user, context, groupId });

    const clean = (v) => (v == null ? undefined : Math.max(0, Number(v) || 0));
    const nextSavings = clean(savingsTarget);
    const nextBuffer = clean(emergencyBuffer);

    if (scope.isGroup) {
      if (!isGroupAdmin(scope.group, req.user)) {
        return res.status(403).json({ msg: "Only group admins can change shared budget settings" });
      }
      const update = {};
      if (nextSavings !== undefined) update.savingsTarget = nextSavings;
      if (nextBuffer !== undefined) update.emergencyBuffer = nextBuffer;
      const group = await Group.findByIdAndUpdate(scope.group._id, { $set: update }, { new: true });
      return res.json({
        scope: "group",
        savingsTarget: group.savingsTarget,
        emergencyBuffer: group.emergencyBuffer,
      });
    }

    const update = { userId: req.user };
    if (nextSavings !== undefined) update.savingsTarget = nextSavings;
    if (nextBuffer !== undefined) update.emergencyBuffer = nextBuffer;

    const settings = await Settings.findOneAndUpdate(
      { userId: req.user },
      { $set: update },
      { new: true, upsert: true }
    );

    res.json({
      scope: "user",
      savingsTarget: settings.savingsTarget || 0,
      emergencyBuffer: settings.emergencyBuffer || 0,
    });
  } catch (err) {
    handleScopeError(err, res);
  }
};
