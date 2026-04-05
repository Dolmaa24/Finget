const Transaction = require("../models/Transaction");
const Group = require("../models/Group");
const User = require("../models/User");
const { isGroupMember } = require("../utils/groupAuth");
const { evaluateSpendNudge } = require("../services/nudgeService");

exports.addTransaction = async (req, res) => {
  try {
    const { amount, category, type, context, groupId, splits } = req.body;

    if (context === "group" && groupId) {
      const group = await Group.findById(groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
    }

    const transaction = await Transaction.create({
      userId: req.user,
      groupId: context === "group" ? groupId : undefined,
      amount,
      category,
      type,
      splits: Array.isArray(splits) ? splits : [],
    });

    let nudge = null;
    if (type === "expense" && (!context || context === "user")) {
      const user = await User.findById(req.user);
      const all = await Transaction.find({
        userId: req.user,
        groupId: { $exists: false },
      });
      nudge = evaluateSpendNudge({
        newTx: transaction,
        allTransactions: all.map((t) => t.toObject()),
        monthlyIncome: user?.monthlyIncome || 0,
      });
    }

    const io = req.app.get("io");
    if (io && groupId && context === "group") {
      io.to(`group:${groupId}`).emit("transaction:created", {
        transactionId: transaction._id,
        groupId: String(groupId),
      });
    }

    res.json({ transaction, nudge });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { context, groupId } = req.query;

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

    const transactions = await Transaction.find(query).sort({ date: -1 });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ msg: "Not found" });

    if (tx.groupId) {
      const group = await Group.findById(tx.groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized" });
      }
    } else if (tx.userId.toString() !== req.user.toString()) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ msg: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
