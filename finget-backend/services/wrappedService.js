const { toPaise, fromPaise, sumPaise } = require("../utils/money");
const { startOfDayIST, MS_DAY } = require("../utils/time");
const { computeBalancesPaise, suggestSettlementsPaise } = require("./splitService");
const { firstNameOf } = require("./shareCardService");
const { inr } = require("./shareCardCopy");
const { inclusiveDaySpan } = require("./tripService");

/**
 * Trip Wrapped — the recap every member wants to send to the group chat.
 *
 * Every figure and every superlative is DETERMINISTIC. The AI, when a key is
 * configured, writes one optional sentence on top and can change nothing
 * underneath it. That ordering is the same rules-first/AI-second pattern as
 * insights, and it matters more here: a recap is a public artefact about
 * named people, and "Biggest Spender" has to be a fact about the ledger, not
 * a model's opinion.
 *
 * TONE. Superlatives are affectionate, never accusatory. "Biggest Spender" is
 * a badge; "Wasted The Most" would be an accusation, and no one shares a card
 * that insults their friend.
 */

/** Deterministic tie-breaks so the same trip always produces the same card. */
const byAmountThenName = (a, b) => b.amountPaise - a.amountPaise || a.name.localeCompare(b.name);

function memberIndex(members) {
  const map = new Map();
  for (const m of members) {
    map.set(String(m._id || m), { name: m.name || "Member", id: String(m._id || m) });
  }
  return map;
}

/** IST calendar day key, so "cheapest day" means a day people actually lived. */
const dayKey = (date) => startOfDayIST(new Date(date)).getTime();

/**
 * @param {object} opts
 * @param {object} opts.group          the trip, with members populated
 * @param {object[]} opts.transactions expenses booked to this group
 * @param {object[]} opts.settlements  payments already made between members
 */
function computeWrapped({ group, transactions, settlements = [] }) {
  const members = group.members || [];
  const index = memberIndex(members);

  const expenses = transactions.filter((t) => t.type === "expense");

  const totalSpentPaise = sumPaise(expenses.map((t) => toPaise(t.amount || 0)));

  /* --- Who paid what -------------------------------------------------- */

  const paidByMember = members.map((m) => {
    const id = String(m._id || m);
    const amountPaise = sumPaise(
      expenses
        .filter((t) => String(t.paidBy || t.userId) === id)
        .map((t) => toPaise(t.amount || 0))
    );
    return { id, name: index.get(id)?.name || "Member", amountPaise, count: 0 };
  });

  for (const row of paidByMember) {
    row.count = expenses.filter((t) => String(t.paidBy || t.userId) === row.id).length;
  }

  /* --- What each member actually owed --------------------------------- */

  const balancesPaise = computeBalancesPaise(transactions, settlements);

  const owedByMember = members.map((m) => {
    const id = String(m._id || m);
    // Their share of everything, regardless of who fronted it.
    const sharePaise = sumPaise(
      expenses.map((t) => {
        const split = (t.splits || []).find((s) => String(s.userId) === id);
        if (split) return toPaise(split.amount || 0);
        // No split recorded: the payer carries it alone.
        return String(t.paidBy || t.userId) === id ? toPaise(t.amount || 0) : 0;
      })
    );
    return { id, name: index.get(id)?.name || "Member", sharePaise };
  });

  /* --- Headline facts -------------------------------------------------- */

  const biggest = expenses.reduce(
    (best, t) => (!best || toPaise(t.amount || 0) > toPaise(best.amount || 0) ? t : best),
    null
  );

  const byCategory = new Map();
  for (const t of expenses) {
    const key = t.category || "Uncategorized";
    byCategory.set(key, (byCategory.get(key) || 0) + toPaise(t.amount || 0));
  }
  const topCategory = [...byCategory.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )[0];

  /* --- Days ------------------------------------------------------------ */

  const byDay = new Map();
  for (const t of expenses) {
    const key = dayKey(t.date);
    byDay.set(key, (byDay.get(key) || 0) + toPaise(t.amount || 0));
  }

  const days =
    group.startDate && group.endDate ? inclusiveDaySpan(group.startDate, group.endDate) : byDay.size;

  const spentDays = [...byDay.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const cheapestDay = spentDays[0] || null;
  const priciestDay = spentDays[spentDays.length - 1] || null;

  /* --- Superlatives ---------------------------------------------------- */

  const superlatives = [];

  const topSpender = [...paidByMember].sort(byAmountThenName)[0];
  if (topSpender && topSpender.amountPaise > 0) {
    superlatives.push({
      title: "Biggest Spender",
      name: firstNameOf(topSpender.name),
      detail: `fronted ${inr(fromPaise(topSpender.amountPaise))}`,
      memberId: topSpender.id,
    });
  }

  // Most individual payments, not the largest total — the person who kept
  // reaching for their card even when it was small.
  const alwaysPaid = [...paidByMember]
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
  if (alwaysPaid && alwaysPaid.id !== topSpender?.id && alwaysPaid.count > 1) {
    superlatives.push({
      title: "The One Who Always Paid",
      name: firstNameOf(alwaysPaid.name),
      detail: `picked up ${alwaysPaid.count} bills`,
      memberId: alwaysPaid.id,
    });
  }

  /**
   * "Cheapest Day" only means something against another day. On a trip where
   * everything was logged at once it reported the entire total as the cheapest
   * day, which reads as broken on a card someone is about to share.
   */
  if (cheapestDay && spentDays.length >= 2) {
    superlatives.push({
      title: "Cheapest Day",
      name: null,
      detail: `${inr(fromPaise(cheapestDay[1]))} on one day`,
      memberId: null,
    });
  }

  /* --- Settling up ----------------------------------------------------- */

  const transfers = suggestSettlementsPaise(balancesPaise).map((t) => ({
    fromName: firstNameOf(index.get(t.from)?.name),
    toName: firstNameOf(index.get(t.to)?.name),
    amountPaise: t.amountPaise,
    amount: fromPaise(t.amountPaise),
  }));

  return {
    tripName: group.name,
    emoji: group.emoji || "🧳",
    days,
    memberCount: members.length,
    totalSpentPaise,
    totalSpent: fromPaise(totalSpentPaise),
    perMember: members.map((m) => {
      const id = String(m._id || m);
      const paid = paidByMember.find((p) => p.id === id);
      const owed = owedByMember.find((o) => o.id === id);
      return {
        memberId: id,
        name: index.get(id)?.name || "Member",
        firstName: firstNameOf(index.get(id)?.name),
        paidPaise: paid?.amountPaise || 0,
        paid: fromPaise(paid?.amountPaise || 0),
        sharePaise: owed?.sharePaise || 0,
        share: fromPaise(owed?.sharePaise || 0),
        netPaise: balancesPaise.get(id) || 0,
        net: fromPaise(balancesPaise.get(id) || 0),
      };
    }),
    biggestExpense: biggest
      ? {
          label: biggest.note || biggest.category || "One big one",
          category: biggest.category || "Uncategorized",
          amountPaise: toPaise(biggest.amount || 0),
          amount: biggest.amount || 0,
        }
      : null,
    topCategory: topCategory ? { name: topCategory[0], amount: fromPaise(topCategory[1]) } : null,
    cheapestDayAmount: cheapestDay ? fromPaise(cheapestDay[1]) : null,
    priciestDayAmount: priciestDay ? fromPaise(priciestDay[1]) : null,
    superlatives,
    settleUp: transfers,
  };
}

/**
 * Build the redacted payload for one member's shareable card.
 *
 * Personalised on purpose: a card with your own name on it gets sent to the
 * group; a generic one does not. `highlightName` is a FIRST name — the
 * redaction serialiser rejects anything else on a public card.
 */
function wrappedCardPayload(wrapped, memberId) {
  const me = wrapped.perMember.find((m) => m.memberId === String(memberId));

  const payload = {
    tripName: wrapped.tripName,
    emoji: wrapped.emoji,
    totalSpent: Math.round(wrapped.totalSpent),
    days: wrapped.days,
    memberCount: wrapped.memberCount,
    // First names only. A public card names friends, not full identities.
    members: wrapped.perMember.map((m) => m.firstName),
    superlatives: wrapped.superlatives.map((s) => ({
      title: s.title,
      name: s.name || undefined,
      detail: s.detail,
    })),
  };

  if (me) payload.highlightName = me.firstName;
  if (wrapped.topCategory) payload.topCategory = wrapped.topCategory.name;
  if (wrapped.biggestExpense) {
    // The amount, not the note — a note can say anything and is not ours to publish.
    payload.biggestExpense = Math.round(wrapped.biggestExpense.amount);
  }

  return payload;
}

module.exports = { computeWrapped, wrappedCardPayload };
