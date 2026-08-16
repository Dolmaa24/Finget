const Group = require("../models/Group");
const Transaction = require("../models/Transaction");
const Settlement = require("../models/Settlement");
const Goal = require("../models/Goal");
const { isGroupMember, isGroupAdmin, idOf } = require("../utils/groupAuth");
const { computeBalancesPaise, suggestSettlementsPaise } = require("../services/splitService");
const { computeTripStatus, paceMessage, spentPaiseFrom } = require("../services/tripService");
const { groupIdForPreviewToken } = require("../services/tripPreviewService");
const { toPaise, fromPaise } = require("../utils/money");

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
    kind: group.kind || "household",
    startDate: group.startDate || null,
    endDate: group.endDate || null,
    potPaise: group.potPaise || 0,
    pot: fromPaise(group.potPaise || 0),
    timezone: group.timezone || "Asia/Kolkata",
    wrappedGeneratedAt: group.wrappedGeneratedAt || null,
    /** Members only. A stranger gets `previewToken` in a link, never in a payload. */
    previewToken: group.previewToken || null,
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

/**
 * Validates the trip half of a group payload.
 *
 * Throws rather than returning an error shape so create and update share one
 * definition of "a valid trip" — the two used to be the classic place for a
 * rule to exist in one and not the other.
 *
 * @param {object} body
 * @param {object} [existing] the group being updated, for partial edits
 * @returns {object} only the fields actually present in `body`
 */
function readTripFields(body, existing = {}) {
  const out = {};

  if (body.kind !== undefined) {
    if (!["household", "trip"].includes(body.kind)) {
      throw new Error("kind must be 'household' or 'trip'");
    }
    out.kind = body.kind;
  }

  const parseDate = (value, label) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`${label} is not a valid date`);
    return date;
  };

  if (body.startDate !== undefined) {
    out.startDate = body.startDate === null ? undefined : parseDate(body.startDate, "startDate");
  }
  if (body.endDate !== undefined) {
    out.endDate = body.endDate === null ? undefined : parseDate(body.endDate, "endDate");
  }

  // Checked against whichever value will actually be stored, so changing only
  // the end date still catches an inversion.
  const start = out.startDate ?? existing.startDate;
  const end = out.endDate ?? existing.endDate;
  if (start && end && end < start) {
    throw new Error("A trip cannot end before it starts");
  }

  if (body.potPaise !== undefined) {
    if (!Number.isInteger(body.potPaise) || body.potPaise < 0) {
      throw new Error("potPaise must be a non-negative integer number of paise");
    }
    out.potPaise = body.potPaise;
  } else if (body.pot !== undefined) {
    const rupees = Number(body.pot);
    if (!Number.isFinite(rupees) || rupees < 0) throw new Error("pot must be a non-negative number");
    out.potPaise = toPaise(rupees);
  }

  if (body.timezone !== undefined) out.timezone = String(body.timezone).slice(0, 64);

  const kind = out.kind ?? existing.kind ?? "household";
  if (kind === "trip" && (out.startDate || out.endDate)) {
    const hasBoth = (out.startDate ?? existing.startDate) && (out.endDate ?? existing.endDate);
    if (!hasBoth) throw new Error("A trip needs both a start date and an end date");
  }

  return out;
}

exports.createGroup = async (req, res) => {
  try {
    const { name, emoji } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ msg: "Group name is required" });
    }

    let trip;
    try {
      trip = readTripFields(req.body);
    } catch (err) {
      return res.status(400).json({ msg: err.message });
    }

    const inviteCode = await Group.generateInviteCode();

    const group = await Group.create({
      name: name.trim(),
      emoji: emoji || (trip.kind === "trip" ? "🧳" : "👥"),
      inviteCode,
      // Minted at creation so a share link exists before anyone asks for one.
      previewToken: Group.generatePreviewToken(),
      members: [req.user],
      admins: [req.user],
      createdBy: req.user,
      ...trip,
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

    try {
      Object.assign(group, readTripFields(req.body, group));
    } catch (err) {
      return res.status(400).json({ msg: err.message });
    }

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
    const balancesPaise = computeBalancesPaise(transactions, settlements);
    const minePaise = balancesPaise.get(idOf(req.user)) || 0;
    // Tolerate up to a rupee of legacy float dust from pre-paise rows.
    if (Math.abs(minePaise) > 100) {
      return res.status(400).json({
        msg:
          minePaise < 0
            ? `Settle up first — you still owe ₹${fromPaise(Math.abs(minePaise))} to the group.`
            : `Settle up first — the group still owes you ₹${fromPaise(minePaise)}.`,
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

    // Compute in paise; convert to rupees only in the response below.
    const balancesPaise = computeBalancesPaise(transactions, settlements);
    const byId = new Map(group.members.map((m) => [idOf(m), m]));
    const nameFor = (id) => byId.get(id)?.name || "Member";

    const memberBalances = group.members.map((m) => {
      const id = idOf(m);
      return {
        userId: id,
        name: m.name || "Member",
        balance: fromPaise(balancesPaise.get(id) || 0),
      };
    });

    const transfers = suggestSettlementsPaise(balancesPaise).map((t) => ({
      from: t.from,
      to: t.to,
      amount: fromPaise(t.amountPaise),
      fromName: nameFor(t.from),
      toName: nameFor(t.to),
    }));

    const totalGroupSpendPaise = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + toPaise(t.amount || 0), 0);

    const paidByMember = group.members.map((m) => {
      const id = idOf(m);
      const paidPaise = transactions
        .filter((t) => t.type === "expense" && idOf(t.paidBy || t.userId) === id)
        .reduce((s, t) => s + toPaise(t.amount || 0), 0);
      return { userId: id, name: m.name || "Member", paid: fromPaise(paidPaise) };
    });

    res.json({
      balances: memberBalances,
      transfers,
      totalGroupSpend: fromPaise(totalGroupSpendPaise),
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

/* ------------------------------------------------------------------ */
/* Trip mode                                                           */
/* ------------------------------------------------------------------ */

/**
 * `GET /api/groups/:id/trip-status` — where the money is against where the
 * trip is.
 *
 * The strip this feeds is the retention surface for a trip: a group checks it
 * several times a day, and it is the reason they open Finget rather than
 * arguing in the chat.
 */
exports.getTripStatus = async (req, res) => {
  try {
    const group = await loadGroupForMember(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });

    if (group.kind !== "trip" || !group.startDate || !group.endDate) {
      // Not an error — a household group simply has no clock to run against.
      return res.json({ kind: group.kind || "household", isTrip: false });
    }

    const transactions = await Transaction.find({ groupId: group._id }).lean();

    const status = computeTripStatus({
      startDate: group.startDate,
      endDate: group.endDate,
      potPaise: group.potPaise || 0,
      spentPaise: spentPaiseFrom(transactions),
    });

    res.json(serializeTripStatus(status, group));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Rupee mirrors alongside the paise, same convention as every other payload. */
function serializeTripStatus(status, group) {
  return {
    ...status,
    isTrip: true,
    name: group.name,
    emoji: group.emoji,
    startDate: group.startDate,
    endDate: group.endDate,
    spent: fromPaise(status.spentPaise),
    pot: fromPaise(status.potPaise),
    dailyAllowance: fromPaise(status.dailyAllowancePaise),
    projectedFinal: fromPaise(status.projectedFinalPaise),
    projectedOverspend:
      status.projectedOverspendPaise === null ? null : fromPaise(status.projectedOverspendPaise),
    message: paceMessage(status),
  };
}

/**
 * Push the recomputed strip to everyone in the room.
 *
 * Exported so the transaction controller can call it after booking a group
 * expense — the number has to move on every member's screen the moment
 * someone pays for lunch, which is the whole point of it being live. Reuses
 * the existing group room rather than opening a second channel.
 */
async function broadcastTripStatus(req, groupId) {
  try {
    const io = req.app.get("io");
    if (!io) return;

    const group = await Group.findById(groupId).lean();
    if (!group || group.kind !== "trip" || !group.startDate || !group.endDate) return;

    const transactions = await Transaction.find({ groupId }).lean();
    const status = computeTripStatus({
      startDate: group.startDate,
      endDate: group.endDate,
      potPaise: group.potPaise || 0,
      spentPaise: spentPaiseFrom(transactions),
    });

    io.to(`group:${groupId}`).emit("trip:status", serializeTripStatus(status, group));
  } catch (err) {
    // A failed broadcast must never fail the write that triggered it. The
    // client refetches on focus anyway.
    console.error("trip:status broadcast failed:", err.message);
  }
}

exports.broadcastTripStatus = broadcastTripStatus;

/**
 * `POST /api/groups/:id/rotate-preview` — kill every share link already sent.
 *
 * Distinct from rotating the invite code: this revokes the ability to *see*
 * the trip, and touches nobody's membership. Rotating the code, by contrast,
 * is about who can still join.
 */
exports.rotatePreviewToken = async (req, res) => {
  try {
    const group = await loadGroupForMember(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });
    if (!isGroupAdmin(group, req.user)) {
      return res.status(403).json({ msg: "Only group admins can reset the share link" });
    }

    group.previewToken = Group.generatePreviewToken();
    await group.save();
    res.json({ previewToken: group.previewToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/groups/join-by-token` — finish the flow the public preview began.
 *
 * The preview is unauthenticated; joining is not. Holding the link is what
 * gets you the preview, and signing in is what gets you into the group.
 */
exports.joinByPreviewToken = async (req, res) => {
  try {
    const token = String(req.body.previewToken || "").trim();
    if (!token) return res.status(400).json({ msg: "previewToken is required" });

    const groupId = await groupIdForPreviewToken(token);
    if (!groupId) {
      return res.status(404).json({ msg: "This invite has expired or been turned off." });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ msg: "This invite has expired or been turned off." });

    if (!isGroupMember(group, req.user)) {
      group.members.push(req.user);
      await group.save();

      const io = req.app.get("io");
      if (io) io.to(`group:${group._id}`).emit("group:updated", { groupId: String(group._id) });
    }

    await group.populate("members", "name email monthlyIncome");
    res.json(serializeGroup(group, req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
