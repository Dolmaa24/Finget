const Transaction = require("../models/Transaction");
const Group = require("../models/Group");
const User = require("../models/User");
const { isGroupMember, isGroupAdmin, idOf } = require("../utils/groupAuth");
const { evaluateSpendNudge } = require("../services/nudgeService");
const { can, explain, CAPABILITIES } = require("../services/entitlements");
const { equalSplit, weightedSplit } = require("../services/splitService");
const { broadcastTripStatus, weightsForGroup } = require("./groupController");

const CATEGORIES = [
  "Food", "Groceries", "Rent", "Transport", "Shopping", "Bills",
  "Entertainment", "Health", "Travel", "Subscriptions", "Education", "Other",
];

exports.getCategories = (req, res) => res.json(CATEGORIES);

exports.addTransaction = async (req, res) => {
  try {
    const {
      amount, category, type, context, groupId,
      note, date, paidBy, splitMode, splits, splitWith,
    } = req.body;

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ msg: "amount must be a positive number" });
    }
    if (type && !["expense", "income"].includes(type)) {
      return res.status(400).json({ msg: "type must be 'expense' or 'income'" });
    }

    const isGroup = context === "group" && groupId;
    let group = null;

    if (isGroup) {
      group = await Group.findById(groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
    }

    // Who fronted the cash. Must be a member; defaults to the recorder.
    let payer = req.user;
    if (isGroup && paidBy) {
      if (!isGroupMember(group, paidBy)) {
        return res.status(400).json({ msg: "paidBy must be a member of this group" });
      }
      payer = paidBy;
    }

    let finalSplits = [];
    let finalSplitMode = "none";

    if (isGroup && type !== "income") {
      const memberIds = group.members.map((m) => idOf(m));

      if (splitMode === "custom" && Array.isArray(splits) && splits.length) {
        const invalid = splits.find((s) => !memberIds.includes(idOf(s.userId)));
        if (invalid) {
          return res.status(400).json({ msg: "custom split includes a non-member" });
        }
        const sum = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
        if (Math.abs(sum - value) > 0.5) {
          return res
            .status(400)
            .json({ msg: `custom splits must sum to ${value} (got ${sum})` });
        }
        finalSplits = splits.map((s) => ({
          userId: s.userId,
          amount: Number(s.amount),
          status: "pending",
        }));
        finalSplitMode = "custom";
      } else if (splitMode === "equal" || splitMode === "weighted") {
        // Optionally restrict to a subset of members.
        const participants =
          Array.isArray(splitWith) && splitWith.length
            ? splitWith.map(idOf).filter((id) => memberIds.includes(id))
            : memberIds;
        if (participants.length === 0) {
          return res.status(400).json({ msg: "no valid members to split between" });
        }

        if (splitMode === "weighted") {
          // Same gate the preview enforces. Checked on the write too, because
          // the preview is a convenience and this is the thing that persists.
          const actor = await User.findById(req.user).select("entitlements").lean();
          if (!can(actor, CAPABILITIES.WEIGHTED_SPLITS, { group })) {
            return res.status(403).json({
              msg: explain(CAPABILITIES.WEIGHTED_SPLITS),
              capability: CAPABILITIES.WEIGHTED_SPLITS,
            });
          }

          // The group doc arrived unpopulated, and weights are read live from
          // each member's User doc rather than cached anywhere — see the note
          // on `Group.incomeSharing`.
          await group.populate("members", "monthlyIncome");
          const { weights, consentingCount } = weightsForGroup(group, participants);
          finalSplits = weightedSplit(value, participants, weights);
          // A weighted split with nobody consenting IS an equal split, and the
          // stored mode has to say what actually happened — otherwise the
          // ledger claims a weighting that never took place.
          finalSplitMode = consentingCount > 0 ? "weighted" : "equal";
        } else {
          finalSplits = equalSplit(value, participants);
          finalSplitMode = "equal";
        }
      }
    }

    const transaction = await Transaction.create({
      userId: req.user,
      groupId: isGroup ? groupId : undefined,
      paidBy: isGroup ? payer : req.user,
      amount: value,
      category: category || "Other",
      note: note || undefined,
      type: type || "expense",
      date: date ? new Date(date) : new Date(),
      splitMode: finalSplitMode,
      splits: finalSplits,
    });

    let nudge = null;
    if (transaction.type === "expense" && !isGroup) {
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
    if (io && isGroup) {
      io.to(`group:${groupId}`).emit("transaction:created", {
        transactionId: transaction._id,
        groupId: String(groupId),
        amount: transaction.amount,
        category: transaction.category,
      });
    }

    // The trip burn strip has to move the moment someone pays for lunch.
    // Fire-and-forget: it swallows its own errors and must not delay the write.
    if (isGroup) broadcastTripStatus(req, groupId);

    res.json({ transaction, nudge });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { context, groupId } = req.query;

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

    // Populating the payer lets the group ledger show *who* spent, which the
    // old shared view could never display.
    const transactions = await Transaction.find(query)
      .populate("paidBy", "name email")
      .populate("splits.userId", "name email")
      .sort({ date: -1 });

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
      // Anyone could previously wipe another member's entry from a shared
      // ledger. Restrict to the person who logged it, the payer, or an admin.
      const mine =
        idOf(tx.userId) === idOf(req.user) || idOf(tx.paidBy) === idOf(req.user);
      if (!mine && !isGroupAdmin(group, req.user)) {
        return res
          .status(403)
          .json({ msg: "Only the member who logged this expense, or a group admin, can delete it" });
      }
    } else if (idOf(tx.userId) !== idOf(req.user)) {
      return res.status(403).json({ msg: "Not authorized" });
    }

    const groupId = tx.groupId ? String(tx.groupId) : null;
    await Transaction.findByIdAndDelete(req.params.id);

    const io = req.app.get("io");
    if (io && groupId) {
      io.to(`group:${groupId}`).emit("transaction:created", { groupId });
    }
    if (groupId) broadcastTripStatus(req, groupId);

    res.json({ msg: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
