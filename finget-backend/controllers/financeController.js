const Transaction = require("../models/Transaction");
const Settings = require("../models/Settings");
const User = require("../models/User");
const Group = require("../models/Group");
const { isGroupMember } = require("../utils/groupAuth");
const { calculateAffordability } = require("../services/affordabilityService");
const { simulatePurchase } = require("../services/simulationService");
const { generateAutoBudget } = require("../services/budgetService");
const { simulateHabitChange } = require("../services/futureImpactService");

exports.getAffordability = async (req, res) => {
  const { context, groupId } = req.query;

  let transactions = [];
  let userOrGroup = null;

  if (context === "group" && groupId) {
    userOrGroup = await Group.findById(groupId).populate("members");
    if (!userOrGroup || !isGroupMember(userOrGroup, req.user)) {
      return res.status(403).json({ msg: "Not authorized for this group" });
    }
    transactions = await Transaction.find({ groupId });
    userOrGroup.monthlyIncome = userOrGroup.members.reduce((sum, member) => sum + (member.monthlyIncome || 0), 0);
  } else {
    userOrGroup = await User.findById(req.user);
    transactions = await Transaction.find({ userId: req.user, groupId: { $exists: false } });
  }

  const settings = await Settings.findOne({ userId: req.user });

  const result = calculateAffordability(userOrGroup, transactions, settings);

  res.json(result);
};

exports.simulate = async (req, res) => {
  const { amount, context, groupId } = req.body;

  let transactions = [];
  let userOrGroup = null;

  if (context === "group" && groupId) {
    userOrGroup = await Group.findById(groupId).populate("members");
    if (!userOrGroup || !isGroupMember(userOrGroup, req.user)) {
      return res.status(403).json({ msg: "Not authorized for this group" });
    }
    transactions = await Transaction.find({ groupId });
    userOrGroup.monthlyIncome = userOrGroup.members.reduce((sum, member) => sum + (member.monthlyIncome || 0), 0);
  } else {
    userOrGroup = await User.findById(req.user);
    transactions = await Transaction.find({ userId: req.user, groupId: { $exists: false } });
  }

  const settings = await Settings.findOne({ userId: req.user });

  const current = calculateAffordability(userOrGroup, transactions, settings);

  const result = simulatePurchase(current, amount);

  res.json(result);
};

exports.getAutoBudget = async (req, res) => {
  try {
    const { context, groupId } = req.query;
    let transactions = [];
    let monthlyIncome = 0;

    if (context === "group" && groupId) {
      const g = await Group.findById(groupId).populate("members");
      if (!g || !isGroupMember(g, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
      transactions = await Transaction.find({ groupId });
      monthlyIncome = g.members.reduce((s, m) => s + (m.monthlyIncome || 0), 0);
    } else {
      const user = await User.findById(req.user);
      transactions = await Transaction.find({
        userId: req.user,
        groupId: { $exists: false },
      });
      monthlyIncome = user?.monthlyIncome || 0;
    }

    const settings = await Settings.findOne({ userId: req.user });
    const suggestion = generateAutoBudget(transactions, monthlyIncome, settings || {});

    res.json({
      suggestion,
      activeBudget: settings?.activeBudget || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    let transactions = [];
    if (context === "group" && groupId) {
      const g = await Group.findById(groupId);
      if (!g || !isGroupMember(g, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
      transactions = await Transaction.find({ groupId });
    } else {
      transactions = await Transaction.find({
        userId: req.user,
        groupId: { $exists: false },
      });
    }

    const out = simulateHabitChange(
      transactions.map((t) => t.toObject()),
      category,
      Number(reduceByMonthly)
    );
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
