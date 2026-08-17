const Group = require("../models/Group");
const Transaction = require("../models/Transaction");
const Settlement = require("../models/Settlement");
const User = require("../models/User");
const Reminder = require("../models/Reminder");
const Notification = require("../models/Notification");
const { idOf } = require("../utils/groupAuth");
const { toPaise, fromPaise } = require("../utils/money");
const { startOfDayIST, MS_DAY } = require("../utils/time");
const { computeBalancesPaise, suggestSettlementsPaise } = require("./splitService");
const { buildUpiIntent } = require("./upiIntent");
const { sendMail } = require("./mailer");

/**
 * The Silent Collector.
 *
 * Chasing a friend for money is the single most socially expensive thing this
 * app can ask someone to do, and it is why shared ledgers quietly die: the debt
 * is recorded, nobody wants to be the one who mentions it, and eventually the
 * group stops using the app rather than have the conversation. Finget mentions
 * it instead, in a voice that costs the debtor nothing to receive.
 *
 * Three rules hold the tone up, and none of them are decoration:
 *
 *   1. IT GOES QUIET. Three messages per debt, ever — day 3, day 7, day 14 —
 *      and then silence. A collector that never stops is a collector people
 *      mute, and a muted collector collects nothing.
 *   2. IT NEVER SHAMES. No "overdue", no "you still haven't", no exclamation
 *      marks, no counting how many times it has asked. The debtor is a friend
 *      who forgot, because that is who they almost always are.
 *   3. IT MAKES PAYING EASIER THAN IGNORING. Every message that can carry a
 *      one-tap UPI intent carries one. The path of least resistance has to be
 *      settling, not archiving.
 *
 * IDEMPOTENCY (the milestone's acceptance bar) is not enforced in this file's
 * logic — it is enforced by a unique index in `models/Reminder.js`. Everything
 * here inserts first and treats a duplicate key as "someone else already sent
 * it", so repeated or concurrent sweeps converge on exactly one message.
 */

/** Day thresholds, ascending. Crossing one is what makes a reminder due. */
const STAGES = [3, 7, 14];

/**
 * No reminder for pocket change. Being emailed about ₹40 is more annoying than
 * the ₹40 is worth, and it teaches people to ignore the channel before a debt
 * that matters ever arrives.
 */
const MIN_REMINDER_PAISE = 5000;

/**
 * Hard floor between any two messages about the same debt, whatever the stage.
 * The stage thresholds are already 4+ days apart, so this never fires in the
 * normal path — it exists for the abnormal one, where a debt is partly settled
 * and immediately re-opened, restarting the episode clock.
 */
const CAP_HOURS = 72;

/* ------------------------------------------------------------------ */
/* Pure logic — no database, unit-testable                             */
/* ------------------------------------------------------------------ */

/**
 * Every ledger event that moves one member's net position, in date order.
 *
 * Mirrors `splitService.computeBalancesPaise` exactly: the payer fronts what
 * the group consumed, each member owes their own share back, and a settlement
 * moves both parties toward zero. If those two ever disagree, a debt's age and
 * a debt's existence would come from different maths — so this walks the same
 * definition rather than a convenient approximation of it.
 *
 * @returns {{date: Date, deltaPaise: number}[]}
 */
function memberLedgerEvents(transactions, settlements, memberId) {
  const me = idOf(memberId);
  const events = [];

  transactions.forEach((t) => {
    if (t.type !== "expense") return;
    const splits = Array.isArray(t.splits) ? t.splits : [];
    if (splits.length === 0) return; // unsplit group spend creates no debt

    const coveredPaise = splits.reduce((sum, sp) => sum + toPaise(sp.amount || 0), 0);
    const minePaise = splits
      .filter((sp) => idOf(sp.userId) === me)
      .reduce((sum, sp) => sum + toPaise(sp.amount || 0), 0);

    const paidByMe = idOf(t.paidBy || t.userId) === me;
    const deltaPaise = (paidByMe ? coveredPaise : 0) - minePaise;
    if (deltaPaise !== 0) events.push({ date: new Date(t.date), deltaPaise });
  });

  settlements.forEach((s) => {
    const amountPaise = toPaise(s.amount || 0);
    if (idOf(s.from) === me) events.push({ date: new Date(s.date), deltaPaise: amountPaise });
    if (idOf(s.to) === me) events.push({ date: new Date(s.date), deltaPaise: -amountPaise });
  });

  return events.sort((a, b) => a.date - b.date);
}

/**
 * When the member's CURRENT run of being in the red began.
 *
 * Walks the running balance and remembers the event that last pushed it
 * negative without it recovering since. Settling in March and falling behind
 * again in June therefore starts a genuinely new episode, which is what lets
 * the reminder key in `models/Reminder.js` stay unique forever without ever
 * locking someone out of being reminded again.
 *
 * @returns {Date|null} null when the member is square or ahead
 */
function debtEpisodeStart(transactions, settlements, memberId) {
  const events = memberLedgerEvents(transactions, settlements, memberId);

  let runningPaise = 0;
  let start = null;

  for (const event of events) {
    runningPaise += event.deltaPaise;
    if (runningPaise >= 0) start = null;
    else if (start === null) start = event.date;
  }

  return runningPaise < 0 ? start : null;
}

/** Whole days elapsed, measured between IST calendar days so it never drifts. */
function ageInDays(since, now = new Date()) {
  return Math.floor((startOfDayIST(now) - startOfDayIST(since)) / MS_DAY);
}

/**
 * The single stage a debt of this age deserves — the HIGHEST it has crossed,
 * not the next one in sequence.
 *
 * A fourteen-day-old debt discovered on its fourteenth day gets the plain
 * summary, not a gentle day-3 nudge followed by two more messages over the
 * next fortnight. Sending the sequence would mean a group that enabled
 * reminders late gets chased three times about something already stale.
 */
function stageForAge(ageDays) {
  let stage = null;
  for (const threshold of STAGES) {
    if (ageDays >= threshold) stage = threshold;
  }
  return stage;
}

/**
 * The words.
 *
 * Escalation here is a change in FRAMING, not in volume: an assumption of
 * forgetfulness, then an acknowledgement that time has passed, then a flat
 * statement of fact with no adjectives at all. The last one is the firmest
 * thing Finget will ever say about money between friends, and it is still just
 * a sentence describing what is true.
 */
function reminderCopy({ stage, creditorName, groupName, amountPaise, hasPayLink }) {
  const amount = `₹${fromPaise(amountPaise).toLocaleString("en-IN")}`;
  const where = groupName ? ` in ${groupName}` : "";

  const bodies = {
    3: `You and ${creditorName} have ${amount} open${where}. No rush — this is just so it doesn't quietly get forgotten.`,
    7: `${amount} is still open with ${creditorName}${where}. A week is usually when these slip people's minds, so here it is again.`,
    14: `Two weeks on, ${amount} is open between you and ${creditorName}${where}. Clear it whenever suits, or sort out the number together if it looks wrong.`,
  };

  const titles = {
    3: `${amount} open with ${creditorName}`,
    7: `Still open: ${amount} with ${creditorName}`,
    14: `${amount} with ${creditorName}, two weeks on`,
  };

  const body = bodies[stage];
  const tail = hasPayLink ? " Tap to pay in your UPI app — Finget just opens it, it never handles the money." : "";

  return {
    title: titles[stage],
    body: body + tail,
    emailSubject: titles[stage],
    emailText: `${body}${tail}\n\nYou can mute these any time in Finget → Settings.\n\n— Finget`,
  };
}

/**
 * Every debt in one group that is due a message right now.
 *
 * The transfers come from the same greedy netting the Split page shows, so a
 * reminder can never name a payment the app is not also suggesting on screen.
 *
 * @returns {{from: string, to: string, amountPaise: number, stage: number, debtSince: Date}[]}
 */
function dueReminders({ transactions, settlements, now = new Date() }) {
  const balancesPaise = computeBalancesPaise(transactions, settlements);
  const transfers = suggestSettlementsPaise(balancesPaise);

  const startCache = new Map();
  const startFor = (memberId) => {
    if (!startCache.has(memberId)) {
      startCache.set(memberId, debtEpisodeStart(transactions, settlements, memberId));
    }
    return startCache.get(memberId);
  };

  const due = [];

  for (const transfer of transfers) {
    if (transfer.amountPaise < MIN_REMINDER_PAISE) continue;

    const since = startFor(transfer.from);
    if (!since) continue; // netting says they owe, the walk disagrees — say nothing

    const stage = stageForAge(ageInDays(since, now));
    if (!stage) continue;

    due.push({
      from: transfer.from,
      to: transfer.to,
      amountPaise: transfer.amountPaise,
      stage,
      // Normalised to IST midnight so two runs on the same day derive a
      // byte-identical key, whatever time the transaction actually landed.
      debtSince: startOfDayIST(since),
    });
  }

  // Largest first, so the one email a debtor may get in a sweep is about the
  // debt most worth acting on.
  return due.sort((a, b) => b.amountPaise - a.amountPaise);
}

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

/** Both switches: the group's, and the debtor's own. Either off means silence. */
function isMuted(group, debtor) {
  if (group?.reminders?.enabled === false) return true;
  const prefs = debtor?.reminderPrefs;
  if (!prefs) return false;
  if (prefs.mutedAll) return true;
  return (prefs.mutedGroups || []).some((id) => idOf(id) === idOf(group._id));
}

/**
 * Has this pair been messaged inside the cap window?
 *
 * A read-then-write race here is harmless: losing it means a second message
 * that the unique index then refuses on its own key, so the cap is a courtesy
 * check and the index is the guarantee.
 */
async function withinCapWindow(groupId, from, to, now) {
  const cutoff = new Date(now.getTime() - CAP_HOURS * 60 * 60 * 1000);
  const recent = await Reminder.findOne({
    groupId,
    from,
    to,
    sentAt: { $gt: cutoff },
  })
    .select("_id")
    .lean();
  return Boolean(recent);
}

/**
 * Claim the right to send exactly one message about one debt at one stage.
 *
 * The insert IS the lock. Whoever writes the row sends; everyone else gets
 * E11000 and goes home. This is why the sweep can run on a timer, on two
 * instances, and twice after a crash, without anyone being chased twice.
 *
 * @returns {Promise<object|null>} the claimed row, or null if already claimed
 */
async function claim({ groupId, from, to, stage, debtSince, amountPaise, now }) {
  try {
    return await Reminder.create({
      groupId,
      from,
      to,
      stage,
      debtSince,
      amountPaise,
      sentAt: now,
    });
  } catch (err) {
    if (err?.code === 11000) return null;
    throw err;
  }
}

/**
 * Run the collector over one group.
 *
 * @returns {Promise<number>} how many reminders were actually sent
 */
async function sweepGroup(group, { now = new Date(), emailBudgetPerDebtor = 1 } = {}) {
  if (group?.reminders?.enabled === false) return 0;

  const [transactions, settlements] = await Promise.all([
    Transaction.find({ groupId: group._id }).lean(),
    Settlement.find({ groupId: group._id }).lean(),
  ]);

  const due = dueReminders({ transactions, settlements, now });
  if (due.length === 0) return 0;

  const memberIds = [...new Set(due.flatMap((d) => [d.from, d.to]))];
  const users = await User.find({ _id: { $in: memberIds } })
    .select("name email upiId reminderPrefs")
    .lean();
  const userById = new Map(users.map((u) => [idOf(u._id), u]));

  // One email per debtor per sweep, however many people they owe. The in-app
  // notification still lands for every debt — it costs nothing to receive and
  // sits in a list. Three emails in one minute is what an inbox reads as spam.
  const emailsUsed = new Map();
  let sent = 0;

  for (const debt of due) {
    const debtor = userById.get(debt.from);
    const creditor = userById.get(debt.to);
    if (!debtor || !creditor) continue;
    if (isMuted(group, debtor)) continue;

    if (await withinCapWindow(group._id, debt.from, debt.to, now)) continue;

    const claimed = await claim({
      groupId: group._id,
      from: debt.from,
      to: debt.to,
      stage: debt.stage,
      debtSince: debt.debtSince,
      amountPaise: debt.amountPaise,
      now,
    });
    if (!claimed) continue; // another run already owns this one

    const payIntent = buildUpiIntent({
      upiId: creditor.upiId,
      payeeName: creditor.name,
      amountPaise: debt.amountPaise,
      note: `${group.name} settle-up`,
    });

    const copy = reminderCopy({
      stage: debt.stage,
      creditorName: creditor.name || "your group",
      groupName: group.name,
      amountPaise: debt.amountPaise,
      hasPayLink: Boolean(payIntent),
    });

    await Notification.create({
      userId: debt.from,
      kind: "reminder",
      title: copy.title,
      body: copy.body,
      href: "/split",
      groupId: group._id,
      amountPaise: debt.amountPaise,
      payIntent: payIntent || undefined,
    });

    const used = emailsUsed.get(debt.from) || 0;
    let emailResult = "skipped";
    if (used < emailBudgetPerDebtor && debtor.email) {
      emailResult = await sendMail({
        to: debtor.email,
        subject: copy.emailSubject,
        text: copy.emailText,
      });
      emailsUsed.set(debt.from, used + 1);
    }

    // Recorded after the fact: the row's existence is the send guarantee, and
    // the channel outcome is reporting. A failed email must never look like an
    // unsent reminder, or the next sweep would send it all over again.
    claimed.channels = { inApp: true, email: emailResult };
    claimed.message = copy.body;
    await claimed.save();

    sent += 1;
  }

  return sent;
}

/**
 * Run the collector everywhere.
 *
 * Groups are processed one at a time on purpose. This is a background job with
 * no deadline, and a burst of parallel finds against every group in the
 * database is a good way to make the app slow for the people actually using it.
 */
async function sweepReminders({ now = new Date() } = {}) {
  const groups = await Group.find({ "reminders.enabled": { $ne: false } })
    .select("_id name reminders")
    .lean();

  let sent = 0;
  for (const group of groups) {
    try {
      sent += await sweepGroup(group, { now });
    } catch (err) {
      // One malformed group must not stop the other ninety-nine.
      console.error(`Reminder sweep failed for group ${group._id}: ${err.message}`);
    }
  }
  return sent;
}

module.exports = {
  STAGES,
  MIN_REMINDER_PAISE,
  CAP_HOURS,
  memberLedgerEvents,
  debtEpisodeStart,
  ageInDays,
  stageForAge,
  reminderCopy,
  dueReminders,
  isMuted,
  sweepGroup,
  sweepReminders,
};
