const Deflection = require("../models/Deflection");
const Group = require("../models/Group");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const PushLog = require("../models/PushLog");
const PushSubscription = require("../models/PushSubscription");
const { fromPaise } = require("../utils/money");
const { inr } = require("../utils/format");
const { istParts, startOfDayIST } = require("../utils/time");
const { computeTripStatus, spentPaiseFrom } = require("./tripService");
const { weekendPreWarning } = require("./insights/ruleEngine");
const { resolveScope, affordabilityForScope } = require("./scopeResolver");
const { isPushConfigured, sendToUser } = require("./pushService");

/**
 * What is worth interrupting someone for.
 *
 * Three events, and the bar for each is the same: it must be ACTIONABLE NOW and
 * it must be something the person cannot see because they are not looking at
 * the app. A notification that only restates what the dashboard already shows
 * is a notification that teaches people to swipe them away.
 *
 *   vaultExpiry     "you asked me to ask you again in two days" — they
 *                   literally requested this one.
 *   tripPace        the trip is running hot, while there is still trip left to
 *                   change. Never after it ends.
 *   weekendWarning  Friday morning, when the weekend can still go differently.
 *
 * EVERY TRIGGER CLAIMS BEFORE IT SENDS, through `PushLog`'s unique index. These
 * run on intervals that can fire twice after a crash or concurrently on two
 * instances, and a duplicate push is what makes someone turn them off.
 */

/** The IST calendar day, as a stable string for dedupe keys. */
function istDayKey(now = new Date()) {
  const { year, month, day } = istParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Claim the right to send exactly one push for one event.
 *
 * The insert IS the lock. Returns false when someone else already has it.
 */
async function claim(userId, topic, dedupeKey) {
  try {
    await PushLog.create({ userId, topic, dedupeKey });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

/** Only bother querying for people who could actually receive something. */
async function subscribedUserIds(topic) {
  const ids = await PushSubscription.distinct("userId", { [`topics.${topic}`]: { $ne: false } });
  return ids;
}

/* ------------------------------------------------------------------ */
/* 1. Vault expiry                                                     */
/* ------------------------------------------------------------------ */

/**
 * The 48 hours are up on a hold.
 *
 * The least intrusive notification in the app, because the person explicitly
 * asked for it when they pressed "think about it". Sent once per hold, ever —
 * the dedupe key is the deflection's own id, so even a hold that lingers for
 * days through the 72-hour grace window is only ever mentioned once.
 */
async function runVaultExpiry(now = new Date()) {
  const due = await Deflection.find({
    state: "considering",
    vaultUntil: { $lte: now },
  })
    .select("_id userId label amountPaise translationSnapshot")
    .lean();

  let sent = 0;
  for (const hold of due) {
    if (!(await claim(hold.userId, "vaultExpiry", String(hold._id)))) continue;

    const worth = hold.translationSnapshot?.headline;
    const result = await sendToUser(hold.userId, "vaultExpiry", {
      title: `Still want the ${hold.label}?`,
      body: worth
        ? `${inr(fromPaise(hold.amountPaise))} — that's ${worth}. Decide and the money moves either way.`
        : `${inr(fromPaise(hold.amountPaise))} is still held back. Bought it, or walked away?`,
      href: "/ledger",
      tag: `vault-${hold._id}`,
    });
    sent += result.sent;
  }
  return sent;
}

/* ------------------------------------------------------------------ */
/* 2. Trip pace                                                        */
/* ------------------------------------------------------------------ */

/**
 * A trip is spending faster than its clock.
 *
 * Only while the trip is RUNNING — a pace warning on day one has nothing to
 * measure, and one after the trip ends is just a review nobody asked for. Once
 * per trip per day, so a group that spends all afternoon does not get an
 * afternoon of buzzing.
 */
async function runTripPace(now = new Date()) {
  const trips = await Group.find({
    kind: "trip",
    startDate: { $lte: now },
    endDate: { $gte: startOfDayIST(now) },
    potPaise: { $gt: 0 },
  })
    .select("_id name emoji startDate endDate potPaise members")
    .lean();

  const dayKey = istDayKey(now);
  let sent = 0;

  for (const trip of trips) {
    const transactions = await Transaction.find({ groupId: trip._id }).lean();
    const status = computeTripStatus({
      startDate: trip.startDate,
      endDate: trip.endDate,
      potPaise: trip.potPaise,
      spentPaise: spentPaiseFrom(transactions),
      now,
    });

    if (status.paceStatus !== "over" || !status.started || status.finished) continue;

    const overspend = status.projectedOverspendPaise;
    const body =
      overspend && overspend > 0
        ? `Day ${status.dayIndex} of ${status.totalDays}, ${status.percentSpent}% spent. On this pace you'll finish about ${inr(fromPaise(overspend))} over.`
        : `Day ${status.dayIndex} of ${status.totalDays}, ${status.percentSpent}% of the pot spent.`;

    for (const memberId of trip.members || []) {
      if (!(await claim(memberId, "tripPace", `${trip._id}:${dayKey}`))) continue;

      const result = await sendToUser(memberId, "tripPace", {
        title: `${trip.emoji || "🧳"} ${trip.name} is running hot`,
        body,
        href: "/dashboard",
        tag: `trip-${trip._id}`,
      });
      sent += result.sent;
    }
  }
  return sent;
}

/* ------------------------------------------------------------------ */
/* 3. Weekend pre-warning                                              */
/* ------------------------------------------------------------------ */

/**
 * Friday, while the weekend can still go differently.
 *
 * The sentence is computed by `weekendPreWarning` in `services/insights/` —
 * deterministically, from money that actually left the account on the last
 * three weekends. No projection and no model call, because a person only
 * believes this sentence the second time if it was true the first time.
 */
async function runWeekendWarning(now = new Date()) {
  const { weekday } = istParts(now);
  if (weekday !== 5) return 0; // Friday only for the push; the insight list also shows Thursday

  const userIds = await subscribedUserIds("weekendWarning");
  const dayKey = istDayKey(now);
  let sent = 0;

  for (const userId of userIds) {
    let insight;
    try {
      const scope = await resolveScope({ userId, context: "user" });
      insight = weekendPreWarning(scope.transactions, affordabilityForScope(scope), now);
    } catch {
      continue; // a user we cannot resolve is not worth failing the sweep over
    }
    if (!insight) continue;

    if (!(await claim(userId, "weekendWarning", dayKey))) continue;

    const result = await sendToUser(userId, "weekendWarning", {
      title: "This weekend will be tight",
      body: insight.description,
      href: "/insights",
      tag: "weekend",
    });
    sent += result.sent;
  }
  return sent;
}

/* ------------------------------------------------------------------ */
/* All three                                                           */
/* ------------------------------------------------------------------ */

/**
 * @returns {Promise<{vaultExpiry: number, tripPace: number, weekendWarning: number}>}
 */
async function runAllTriggers(now = new Date()) {
  if (!isPushConfigured()) return { vaultExpiry: 0, tripPace: 0, weekendWarning: 0, skipped: true };

  const results = { vaultExpiry: 0, tripPace: 0, weekendWarning: 0 };

  // Independently guarded: one failing trigger must not stop the other two.
  for (const [name, run] of [
    ["vaultExpiry", runVaultExpiry],
    ["tripPace", runTripPace],
    ["weekendWarning", runWeekendWarning],
  ]) {
    try {
      results[name] = await run(now);
    } catch (err) {
      console.error(`Push trigger ${name} failed: ${err.message}`);
    }
  }

  return results;
}

module.exports = {
  runAllTriggers,
  runVaultExpiry,
  runTripPace,
  runWeekendWarning,
  istDayKey,
};
