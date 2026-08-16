const Goal = require("../models/Goal");
const Group = require("../models/Group");
const { isGroupMember, idOf } = require("../utils/groupAuth");

/** Membership/ownership gate shared by update, delete and contribute. */
async function authorizeGoal(goal, userId) {
  if (goal.groupId) {
    const group = await Group.findById(goal.groupId);
    if (!group || !isGroupMember(group, userId)) return false;
    return true;
  }
  return idOf(goal.userId) === idOf(userId);
}

exports.createGoal = async (req, res) => {
  try {
    const { name, targetAmount, deadline, priority, context, groupId } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ msg: "Goal name is required" });
    }
    const target = Number(targetAmount);
    if (!Number.isFinite(target) || target <= 0) {
      return res.status(400).json({ msg: "targetAmount must be a positive number" });
    }

    if (context === "group") {
      if (!groupId) return res.status(400).json({ msg: "groupId required when context=group" });
      const group = await Group.findById(groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
    }

    const goal = await Goal.create({
      userId: req.user,
      groupId: context === "group" ? groupId : undefined,
      name: String(name).trim(),
      targetAmount: target,
      currentAmount: 0,
      deadline: deadline || undefined,
      priority: priority || "Medium",
      sortOrder: Date.now(),
      contributions: [],
    });

    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getGoals = async (req, res) => {
  try {
    const { context, groupId } = req.query;

    if (context === "group" && !groupId) {
      return res.status(400).json({ msg: "groupId required when context=group" });
    }

    let query;
    if (context === "group" && groupId) {
      const group = await Group.findById(groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
      query = { groupId };
    } else {
      query = { userId: req.user, groupId: { $exists: false } };
    }

    const goals = await Goal.find(query)
      .populate("contributions.userId", "name")
      .sort({ sortOrder: 1, deadline: 1 });

    res.json(goals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateGoal = async (req, res) => {
  try {
    const { currentAmount, priority, targetAmount, name, deadline, sortOrder } = req.body;

    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ msg: "Goal not found" });
    if (!(await authorizeGoal(goal, req.user))) {
      return res.status(403).json({ msg: "Not authorized to update this goal" });
    }

    if (currentAmount !== undefined) goal.currentAmount = Math.max(0, Number(currentAmount) || 0);
    if (priority) goal.priority = priority;
    if (targetAmount !== undefined) {
      const t = Number(targetAmount);
      if (!Number.isFinite(t) || t <= 0) {
        return res.status(400).json({ msg: "targetAmount must be a positive number" });
      }
      goal.targetAmount = t;
    }
    if (name && String(name).trim()) goal.name = String(name).trim();
    if (deadline !== undefined) goal.deadline = deadline || undefined;
    if (sortOrder !== undefined) goal.sortOrder = sortOrder;

    await goal.save();
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Add money to a goal and record who added it. Shared goals can then show a
 * per-member contribution breakdown instead of one anonymous total.
 */
exports.contributeToGoal = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ msg: "amount must be a positive number" });
    }

    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ msg: "Goal not found" });
    if (!(await authorizeGoal(goal, req.user))) {
      return res.status(403).json({ msg: "Not authorized to contribute to this goal" });
    }

    goal.currentAmount = Math.max(0, (goal.currentAmount || 0) + amount);
    goal.contributions.push({ userId: req.user, amount, date: new Date() });
    await goal.save();
    await goal.populate("contributions.userId", "name");

    const io = req.app.get("io");
    if (io && goal.groupId) {
      io.to(`group:${goal.groupId}`).emit("goal:updated", { goalId: String(goal._id) });
    }

    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteGoal = async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ msg: "Goal not found" });
    if (!(await authorizeGoal(goal, req.user))) {
      return res.status(403).json({ msg: "Not authorized to delete this goal" });
    }

    await goal.deleteOne();
    res.json({ msg: "Goal deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
