const Group = require("../models/Group");
const Transaction = require("../models/Transaction");
const Settlement = require("../models/Settlement");
const Goal = require("../models/Goal");
const { isGroupMember, isGroupAdmin, idOf } = require("../utils/groupAuth");
const { computeBalances, suggestSettlements, round2 } = require("../services/splitService");

/** Shared shape for every group payload the client receives. */
function serializeGroup(group, userId) {
  return {
    _id: group._id,
    name: group.name,
    emoji: group.emoji,
    inviteCode: group.inviteCode,
    createdAt: group.createdAt,
    savingsTarget: group.savingsTarget || 0,
    emergencyBuffer: group.emergencyBuffer || 0,
    isAdmin: isGroupAdmin(group, userId),
    members: (group.members || []).map((m) => ({
      _id: idOf(m),
      name: m.name || "Member",
      email: m.email,
      monthlyIncome: m.monthlyIncome || 0,
      isAdmin: isGroupAdmin(group, m),
    })),
  };
}

async function loadGroupForMember(groupId, userId) {
  const group = await Group.findById(groupId).populate("members", "name email monthlyIncome");
  if (!group || !isGroupMember(group, userId)) return null;
  return group;
}

exports.createGroup = async (req, res) => {
  try {
    const { name, emoji } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ msg: "Group name is required" });
    }

    const inviteCode = await Group.generateInviteCode();

    const group = await Group.create({
      name: name.trim(),
      emoji: emoji || "👥",
      inviteCode,
      members: [req.user],
      admins: [req.user],
      createdBy: req.user,
    });

    await group.populate("members", "name email monthlyIncome");
    res.json(serializeGroup(group, req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Join by short invite code. The old flow accepted a raw group ObjectId, which
 * meant anyone who saw an id in a URL could add themselves to a shared wallet.
 */
exports.joinByCode = async (req, res) => {
  try {
    const code = String(req.body.inviteCode || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ msg: "inviteCode is required" });

    const group = await Group.findOne({ inviteCode: code });
    if (!group) return res.status(404).json({ msg: "No group found for that code" });

    if (isGroupMember(group, req.user)) {
      await group.populate("members", "name email monthlyIncome");
      return res.json(serializeGroup(group, req.user));
    }

    group.members.push(req.user);
    await group.save();
    await group.populate("members", "name email monthlyIncome");

    const io = req.app.get("io");
    if (io) io.to(`group:${group._id}`).emit("group:updated", { groupId: String(group._id) });

    res.json(serializeGroup(group, req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getGroups = async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user })
      .populate("members", "name email monthlyIncome")
      .sort({ createdAt: -1 });
    res.json(groups.map((g) => serializeGroup(g, req.user)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getGroup = async (req, res) => {
  try {
    const group = await loadGroupForMember(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });
    res.json(serializeGroup(group, req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const group = await loadGroupForMember(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });
    if (!isGroupAdmin(group, req.user)) {
      return res.status(403).json({ msg: "Only group admins can edit the group" });
    }

    const { name, emoji } = req.body;
    if (name && name.trim()) group.name = name.trim();
    if (emoji) group.emoji = emoji;
    await group.save();

    res.json(serializeGroup(group, req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Rotate the invite code — the way to revoke access after sharing it too widely. */
exports.rotateInviteCode = async (req, res) => {
  try {
    const group = await loadGroupForMember(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });
    if (!isGroupAdmin(group, req.user)) {
      return res.status(403).json({ msg: "Only group admins can rotate the invite code" });
    }

    group.inviteCode = await Group.generateInviteCode();
    await group.save();
    res.json({ inviteCode: group.inviteCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.leaveGroup = async (req, res) => {
  try {
    const group = await loadGroupForMember(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });

    // Leaving with an open balance would strand the debt, so block it.
    const [transactions, settlements] = await Promise.all([
      Transaction.find({ groupId: group._id }).lean(),
      Settlement.find({ groupId: group._id }).lean(),
    ]);
    const balances = computeBalances(transactions, settlements);
    const mine = balances.get(idOf(req.user)) || 0;
    if (Math.abs(mine) > 1) {
      return res.status(400).json({
        msg:
          mine < 0
            ? `Settle up first — you still owe ₹${Math.abs(round2(mine))} to the group.`
            : `Settle up first — the group still owes you ₹${round2(mine)}.`,
      });
    }

    const remaining = group.members.filter((m) => idOf(m) !== idOf(req.user));
    if (remaining.length === 0) {
      await Goal.deleteMany({ groupId: group._id });
      await Transaction.deleteMany({ groupId: group._id });
      await Settlement.deleteMany({ groupId: group._id });
      await group.deleteOne();
      return res.json({ msg: "You left and the empty group was removed", deleted: true });
    }

    group.members = remaining.map((m) => idOf(m));
    group.admins = (group.admins || []).filter((a) => idOf(a) !== idOf(req.user));
    // Never leave a group without an admin.
    if (group.admins.length === 0) group.admins = [group.members[0]];
    await group.save();

    const io = req.app.get("io");
    if (io) io.to(`group:${group._id}`).emit("group:updated", { groupId: String(group._id) });

    res.json({ msg: "Left group", deleted: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Who owes whom. Returns each member's net position plus a minimal set of
 * transfers that clears every debt.
 */
exports.getBalances = async (req, res) => {
  try {
    const group = await loadGroupForMember(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });

    const [transactions, settlements] = await Promise.all([
      Transaction.find({ groupId: group._id }).lean(),
      Settlement.find({ groupId: group._id }).lean(),
    ]);

    const balances = computeBalances(transactions, settlements);
    const byId = new Map(group.members.map((m) => [idOf(m), m]));
    const nameFor = (id) => byId.get(id)?.name || "Member";

    const memberBalances = group.members.map((m) => {
      const id = idOf(m);
      return {
        userId: id,
        name: m.name || "Member",
        balance: round2(balances.get(id) || 0),
      };
    });

    const transfers = suggestSettlements(balances).map((t) => ({
      ...t,
      fromName: nameFor(t.from),
      toName: nameFor(t.to),
    }));

    const totalGroupSpend = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + (t.amount || 0), 0);

    const paidByMember = group.members.map((m) => {
      const id = idOf(m);
      const paid = transactions
        .filter((t) => t.type === "expense" && idOf(t.paidBy || t.userId) === id)
        .reduce((s, t) => s + (t.amount || 0), 0);
      return { userId: id, name: m.name || "Member", paid: round2(paid) };
    });

    res.json({
      balances: memberBalances,
      transfers,
      totalGroupSpend: round2(totalGroupSpend),
      paidByMember,
      settlements: settlements.map((s) => ({
        _id: s._id,
        from: idOf(s.from),
        to: idOf(s.to),
        fromName: nameFor(idOf(s.from)),
        toName: nameFor(idOf(s.to)),
        amount: s.amount,
        date: s.date,
        note: s.note,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.recordSettlement = async (req, res) => {
  try {
    const group = await loadGroupForMember(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });

    const { from, to, amount, note } = req.body;
    const value = Number(amount);

    if (!from || !to) return res.status(400).json({ msg: "from and to are required" });
    if (idOf(from) === idOf(to)) {
      return res.status(400).json({ msg: "from and to must be different members" });
    }
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ msg: "amount must be a positive number" });
    }
    if (!isGroupMember(group, from) || !isGroupMember(group, to)) {
      return res.status(400).json({ msg: "both parties must be members of this group" });
    }

    const settlement = await Settlement.create({
      groupId: group._id,
      from,
      to,
      amount: value,
      note,
      recordedBy: req.user,
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`group:${group._id}`).emit("settlement:created", {
        groupId: String(group._id),
        settlementId: String(settlement._id),
      });
    }

    res.json(settlement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Merged, newest-first feed of expenses, settlements and goal activity. */
exports.getActivity = async (req, res) => {
  try {
    const group = await loadGroupForMember(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });

    const byId = new Map(group.members.map((m) => [idOf(m), m.name || "Member"]));
    const nameFor = (id) => byId.get(idOf(id)) || "Member";

    const [transactions, settlements, goals] = await Promise.all([
      Transaction.find({ groupId: group._id }).sort({ date: -1 }).limit(40).lean(),
      Settlement.find({ groupId: group._id }).sort({ date: -1 }).limit(40).lean(),
      Goal.find({ groupId: group._id }).sort({ _id: -1 }).limit(20).lean(),
    ]);

    const feed = [
      ...transactions.map((t) => ({
        kind: t.type === "income" ? "income" : "expense",
        id: String(t._id),
        actor: nameFor(t.paidBy || t.userId),
        amount: t.amount,
        category: t.category,
        note: t.note,
        splitCount: (t.splits || []).length,
        date: t.date,
      })),
      ...settlements.map((s) => ({
        kind: "settlement",
        id: String(s._id),
        actor: nameFor(s.from),
        counterparty: nameFor(s.to),
        amount: s.amount,
        date: s.date,
      })),
      ...goals.map((g) => ({
        kind: "goal",
        id: String(g._id),
        actor: nameFor(g.userId),
        name: g.name,
        amount: g.targetAmount,
        saved: g.currentAmount || 0,
        date: g._id.getTimestamp(),
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(feed.slice(0, 50));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
