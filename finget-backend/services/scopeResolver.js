const Transaction = require("../models/Transaction");
const Settings = require("../models/Settings");
const User = require("../models/User");
const Group = require("../models/Group");
const Goal = require("../models/Goal");
const { isGroupMember, idOf } = require("../utils/groupAuth");

class ScopeError extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
    this.msg = msg;
  }
}

/**
 * Single source of truth for `?context=user | group&groupId=…`.
 *
 * Returns the owner whose `monthlyIncome` drives affordability (the user, or
 * the group with member incomes pooled), the transactions in scope, and the
 * settings that apply — group settings live on the Group document so one
 * member's personal savings target no longer silently governs a shared wallet.
 *
 * @throws {ScopeError} 400/403 for a missing or unauthorized group
 */
async function resolveScope({ userId, context, groupId }) {
  const scope = await resolveScopeWithoutHolds({ userId, context, groupId });

  /**
   * Live 48-hour vault holds, resolved once here so every surface downstream
   * gets the same figure without having to remember to ask for it. Required
   * lazily to keep the module graph acyclic — vaultService needs
   * affordabilityService, which must not need this file.
   */
  const { heldPaiseFor } = require("./vaultService");
  scope.heldPaise = await heldPaiseFor(scope, userId);

  return scope;
}

async function resolveScopeWithoutHolds({ userId, context, groupId }) {
  const isGroup = context === "group";

  if (isGroup && !groupId) {
    throw new ScopeError(400, "groupId required when context=group");
  }

  if (isGroup) {
    const group = await Group.findById(groupId).populate("members", "name email monthlyIncome");
    if (!group || !isGroupMember(group, userId)) {
      throw new ScopeError(403, "Not authorized for this group");
    }

    /**
     * Pooled income, from CONSENTING MEMBERS ONLY.
     *
     * This used to sum every member's salary unconditionally, and the group
     * dashboard printed the total as "₹2,40,000 pooled". In a two-person group
     * that is one subtraction away from the other person's exact income — you
     * know your own figure, so the total tells you theirs. Milestone 5 says an
     * income must never be exposed to another member, and a total that
     * arithmetic reverses is an exposure.
     *
     * So pooling is gated on the same per-group consent that drives weighted
     * splits: contributing your income to a shared number IS sharing your
     * income, and the two cannot honestly have different switches. Members who
     * have not opted in contribute nothing, and the payload says how many
     * people the figure actually covers so the UI can never imply otherwise.
     */
    const optedIn = new Set((group.incomeSharing || []).map((entry) => idOf(entry.userId)));
    const contributors = group.members.filter((m) => optedIn.has(idOf(m)));
    const pooledIncome = contributors.reduce((sum, m) => sum + (m.monthlyIncome || 0), 0);

    const transactions = await Transaction.find({ groupId }).sort({ date: -1 });

    return {
      isGroup: true,
      group,
      owner: { monthlyIncome: pooledIncome, name: group.name },
      /** How many of `memberCount` actually contributed to the pooled figure. */
      incomeContributors: contributors.length,
      memberCount: group.members.length,
      transactions,
      settings: {
        savingsTarget: group.savingsTarget || 0,
        emergencyBuffer: group.emergencyBuffer || 0,
      },
      goalQuery: { groupId },
    };
  }

  const user = await User.findById(userId);
  if (!user) throw new ScopeError(404, "User not found");

  const transactions = await Transaction.find({
    userId,
    groupId: { $exists: false },
  }).sort({ date: -1 });

  const settings = await Settings.findOne({ userId });

  return {
    isGroup: false,
    group: null,
    owner: user,
    transactions,
    settings: settings || { savingsTarget: 0, emergencyBuffer: 0 },
    goalQuery: { userId, groupId: { $exists: false } },
  };
}

/** Goals for the resolved scope, newest priority order first. */
async function goalsForScope(scope) {
  return Goal.find(scope.goalQuery).sort({ sortOrder: 1, deadline: 1 }).lean();
}

/** Turns a ScopeError into a response; rethrows anything unexpected. */
function handleScopeError(err, res) {
  console.error("[ScopeError Handler]:", err);
  if (err instanceof ScopeError) {
    return res.status(err.status).json({ msg: err.msg });
  }
  return res.status(500).json({ error: err.message });
}

/**
 * Affordability for a resolved scope, with that scope's vault holds already
 * subtracted. Every caller should use this rather than reaching for
 * `calculateAffordability` directly — forgetting `heldPaise` is the one way to
 * make the dashboard and the translator disagree.
 */
function affordabilityForScope(scope, now = new Date()) {
  const { calculateAffordability } = require("./affordabilityService");
  return calculateAffordability(scope.owner, scope.transactions, scope.settings, {
    now,
    heldPaise: scope.heldPaise || 0,
  });
}

module.exports = {
  resolveScope,
  resolveScopeWithoutHolds,
  affordabilityForScope,
  goalsForScope,
  ScopeError,
  handleScopeError,
};
