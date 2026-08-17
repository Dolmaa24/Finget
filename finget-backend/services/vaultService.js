const Deflection = require("../models/Deflection");
const { calculateAffordability } = require("./affordabilityService");
const { toPaise, sumPaise } = require("../utils/money");
const { startOfMonthIST, startOfQuarterIST } = require("../utils/time");
const { isGroupAdmin } = require("../utils/groupAuth");

/**
 * The 48-hour vault.
 *
 * Wanting something is not the problem. Buying it forty seconds after wanting
 * it is. So Finget takes the amount out of safe-to-spend immediately — the
 * dashboard number moves the moment you say "I want this" — and asks again in
 * two days. Whatever you decide, the app credits the decision; it never scores
 * the impulse.
 *
 * Everything here is scope-local. A hold opened in personal mode is invisible
 * to every group and vice versa.
 */

const VAULT_HOURS = 48;

/**
 * How long after `vaultUntil` we wait before deciding for someone. The spec's
 * 72 hours, counted from the prompt rather than from creation — silence is
 * read as "I didn't buy it", which is the honest default and also the one that
 * releases their money.
 */
const GRACE_HOURS = 72;

/**
 * A single member may ring-fence at most this share of the group's headroom.
 *
 * Without it, one person idly vaulting a laptop drops everyone's number for
 * two days and the group's first experience of the feature is "why did our
 * number collapse". Measured against GROSS headroom (before any holds) so the
 * cap does not shrink as holds accumulate, which would make the limit depend
 * on the order people happened to press the button.
 */
const GROUP_HOLD_CAP_FRACTION = 0.25;

const MS_HOUR = 3600000;

class VaultError extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
    this.msg = msg;
  }
}

/* ------------------------------------------------------------------ */
/* Reading holds                                                       */
/* ------------------------------------------------------------------ */

/** Mongo filter isolating one scope's deflections. */
function scopeFilter(scope, userId) {
  return scope.isGroup
    ? { groupId: scope.group._id }
    : { userId, groupId: { $exists: false } };
}

/**
 * Total currently ring-fenced in this scope.
 *
 * Called on every affordability computation, so it is a single indexed sum
 * rather than a document fetch.
 */
async function heldPaiseFor(scope, userId) {
  const rows = await Deflection.find({ ...scopeFilter(scope, userId), state: "considering" })
    .select("amountPaise")
    .lean();
  return sumPaise(rows.map((r) => r.amountPaise));
}

/** What one member is holding inside a group. Drives the 25% cap. */
async function memberHeldPaiseInGroup(groupId, userId) {
  const rows = await Deflection.find({ groupId, userId, state: "considering" })
    .select("amountPaise")
    .lean();
  return sumPaise(rows.map((r) => r.amountPaise));
}

/* ------------------------------------------------------------------ */
/* Opening a hold                                                      */
/* ------------------------------------------------------------------ */

/**
 * @param {object} scope resolved scope — membership already enforced
 * @param {string} userId the person pressing the button
 */
async function openHold(scope, userId, { label, amountPaise, sourceUrl, translationSnapshot }) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new VaultError(400, "amountPaise must be a positive integer");
  }
  if (!label || !String(label).trim()) {
    throw new VaultError(400, "A label is required — the ledger has to say what you walked away from");
  }

  if (scope.isGroup) {
    await assertWithinGroupCap(scope, userId, amountPaise);
  }

  const now = new Date();

  return Deflection.create({
    userId,
    groupId: scope.isGroup ? scope.group._id : undefined,
    label: String(label).trim().slice(0, 120),
    amountPaise,
    sourceUrl,
    translationSnapshot: translationSnapshot || undefined,
    state: "considering",
    vaultUntil: new Date(now.getTime() + VAULT_HOURS * MS_HOUR),
    createdAt: now,
  });
}

async function assertWithinGroupCap(scope, userId, amountPaise) {
  /**
   * No shared income, no cap.
   *
   * From Milestone 5 a group's pooled income counts only members who opted
   * into income sharing, so a group where nobody has opted in has a pooled
   * income of zero — not because it is broke, but because it has told Finget
   * nothing. This cap exists to stop one member ring-fencing a KNOWN shared
   * headroom; with no shared number there is no headroom to protect, and
   * refusing every hold would punish the group for declining to publish their
   * salaries. The per-member vault rules still apply.
   */
  if (scope.incomeContributors === 0) return;

  // Gross headroom: affordability with no holds subtracted.
  const gross = calculateAffordability(scope.owner, scope.transactions, scope.settings);
  const headroomPaise = toPaise(Math.max(0, gross.remaining));

  if (headroomPaise <= 0) {
    throw new VaultError(
      409,
      "This group has no headroom left this month, so there is nothing to hold back."
    );
  }

  const capPaise = Math.floor(headroomPaise * GROUP_HOLD_CAP_FRACTION);
  const alreadyHeldPaise = await memberHeldPaiseInGroup(scope.group._id, userId);

  if (alreadyHeldPaise + amountPaise > capPaise) {
    throw new VaultError(
      409,
      "That would hold back more than a quarter of the group's room for one person. " +
        "Decide on something you're already thinking about first."
    );
  }
}

/* ------------------------------------------------------------------ */
/* Resolving                                                           */
/* ------------------------------------------------------------------ */

/**
 * Who may close a hold.
 *
 * A group hold is the creator's decision to make; a group admin can also close
 * it so a member who has gone quiet cannot freeze the number indefinitely.
 * Everyone else — including other members — is refused.
 */
function canResolve(deflection, scope, userId) {
  if (String(deflection.userId) === String(userId)) return true;
  if (deflection.groupId && scope.isGroup && isGroupAdmin(scope.group, userId)) return true;
  return false;
}

/**
 * @param {'deflected'|'bought'} decision
 */
async function resolveHold(scope, userId, deflectionId, decision) {
  if (!["deflected", "bought"].includes(decision)) {
    throw new VaultError(400, "decision must be 'deflected' or 'bought'");
  }

  const deflection = await Deflection.findOne({
    _id: deflectionId,
    ...scopeFilter(scope, userId),
  });

  if (!deflection) throw new VaultError(404, "Not found");
  if (deflection.state !== "considering") {
    throw new VaultError(409, "That one is already decided.");
  }
  if (!canResolve(deflection, scope, userId)) {
    throw new VaultError(403, "Only the person who put this on hold, or a group admin, can decide it.");
  }

  deflection.state = decision;
  deflection.decidedAt = new Date();
  deflection.autoResolved = false;
  await deflection.save();

  return deflection;
}

/* ------------------------------------------------------------------ */
/* The sweep                                                           */
/* ------------------------------------------------------------------ */

/**
 * Auto-resolve everything nobody answered.
 *
 * IDEMPOTENT BY CONSTRUCTION. The filter includes `state: "considering"` and
 * the write is a single `updateMany`, so Mongo's per-document atomicity means
 * a second run — or two runs racing on different instances — matches nothing
 * the first already changed. Nothing here reads-then-writes, because that is
 * the shape that double-counts a ledger.
 *
 * @returns {Promise<number>} how many were resolved by this call
 */
async function sweepExpired(now = new Date()) {
  const cutoff = new Date(now.getTime() - GRACE_HOURS * MS_HOUR);

  const result = await Deflection.updateMany(
    { state: "considering", vaultUntil: { $lte: cutoff } },
    { $set: { state: "deflected", decidedAt: now, autoResolved: true } }
  );

  return result.modifiedCount || 0;
}

/** Holds whose 48 hours are up but whose grace period has not expired. */
async function awaitingDecision(scope, userId, now = new Date()) {
  return Deflection.find({
    ...scopeFilter(scope, userId),
    state: "considering",
    vaultUntil: { $lte: now },
  })
    .sort({ vaultUntil: 1 })
    .lean();
}

/* ------------------------------------------------------------------ */
/* The ledger                                                          */
/* ------------------------------------------------------------------ */

/**
 * Money kept, by period.
 *
 * Only `deflected` is counted. There is no "bought" total and no ratio — the
 * moment this surface can be read as a scorecard, it stops being the one part
 * of a money app that is on your side.
 */
async function ledgerFor(scope, userId, now = new Date()) {
  const [deflected, live] = await Promise.all([
    Deflection.find({ ...scopeFilter(scope, userId), state: "deflected" })
      .select("amountPaise decidedAt label translationSnapshot autoResolved userId")
      .sort({ decidedAt: -1 })
      .lean(),
    Deflection.find({ ...scopeFilter(scope, userId), state: "considering" })
      .sort({ vaultUntil: 1 })
      .lean(),
  ]);

  const monthStart = startOfMonthIST(now);
  const quarterStart = startOfQuarterIST(now);

  const since = (start) =>
    sumPaise(
      deflected.filter((d) => d.decidedAt && new Date(d.decidedAt) >= start).map((d) => d.amountPaise)
    );

  return {
    monthPaise: since(monthStart),
    quarterPaise: since(quarterStart),
    allTimePaise: sumPaise(deflected.map((d) => d.amountPaise)),
    count: {
      month: deflected.filter((d) => d.decidedAt && new Date(d.decidedAt) >= monthStart).length,
      quarter: deflected.filter((d) => d.decidedAt && new Date(d.decidedAt) >= quarterStart).length,
      allTime: deflected.length,
    },
    deflections: deflected.slice(0, 50),
    holds: live,
    heldPaise: sumPaise(live.map((d) => d.amountPaise)),
  };
}

module.exports = {
  openHold,
  resolveHold,
  sweepExpired,
  awaitingDecision,
  heldPaiseFor,
  memberHeldPaiseInGroup,
  ledgerFor,
  canResolve,
  VaultError,
  VAULT_HOURS,
  GRACE_HOURS,
  GROUP_HOLD_CAP_FRACTION,
};
