const Goal = require("../models/Goal");
const Group = require("../models/Group");
const { isGroupMember } = require("../utils/groupAuth");

exports.createGoal = async (req, res) => {
  try {
    const { name, targetAmount, deadline, priority, context, groupId } = req.body;
    
    if (context === "group" && groupId) {
      const group = await Group.findById(groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
    }

    const goal = await Goal.create({
      userId: req.user,
      groupId: context === "group" ? groupId : undefined,
      name,
      targetAmount,
      currentAmount: 0,
      deadline,
      priority: priority || "Medium",
      sortOrder: Date.now(),
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

    let query = {};
    if (context === "group" && groupId) {
      const group = await Group.findById(groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
      query = { groupId };
    } else {
      query = { userId: req.user, groupId: { $exists: false } };
    }

    const goals = await Goal.find(query).sort({ sortOrder: 1, deadline: 1 });
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

    // Ensure authorization
    if (goal.groupId) {
      const group = await Group.findById(goal.groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized to update this group goal" });
      }
    } else if (goal.userId.toString() !== req.user) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    if (currentAmount !== undefined) goal.currentAmount = currentAmount;
    if (priority) goal.priority = priority;
    if (targetAmount) goal.targetAmount = targetAmount;
    if (name) goal.name = name;
    if (deadline !== undefined) goal.deadline = deadline;
    if (sortOrder !== undefined) goal.sortOrder = sortOrder;

    await goal.save();
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteGoal = async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ msg: "Goal not found" });

    if (goal.groupId) {
      const group = await Group.findById(goal.groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized to delete this group goal" });
      }
    } else if (goal.userId.toString() !== req.user) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    await goal.deleteOne();
    res.json({ msg: "Goal deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
