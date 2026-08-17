const { idOf } = require("../utils/groupAuth");
const { toPaise, fromPaise, splitPaise, allocatePaise } = require("../utils/money");

/**
 * Split and settle-up maths.
 *
 * Everything here computes in integer paise. Balances used to be floating
 * rupees guarded by a `round2` helper and `> 0.01` epsilon comparisons; those
 * are gone deliberately. In paise the comparisons are exact, so a debt is
 * settled when it is `0`, not when it is "close enough to zero".
 *
 * Transactions still *store* rupees, so `toPaise`/`fromPaise` are applied at
 * the boundary of this module and nowhere inside it.
 */

/**
 * Split `amountRupees` evenly across `memberIds`.
 * Returns split rows in rupees, ready to store on a Transaction.
 */
function equalSplit(amountRupees, memberIds) {
  if (memberIds.length === 0) return [];
  const shares = splitPaise(toPaise(amountRupees), memberIds.length);
  return memberIds.map((userId, i) => ({
    userId,
    amount: fromPaise(shares[i]),
    status: "pending",
  }));
}

/**
 * Split `amountRupees` across members in proportion to `weights`
 * (Milestone 5 — income-weighted splits). Parts sum to exactly the total.
 */
function weightedSplit(amountRupees, memberIds, weights) {
  if (memberIds.length === 0) return [];
  const shares = allocatePaise(toPaise(amountRupees), weights);
  return memberIds.map((userId, i) => ({
    userId,
    amount: fromPaise(shares[i]),
    status: "pending",
  }));
}

/**
 * Turn per-member incomes and per-group consent into split weights.
 *
 * The rule from the milestone is "anyone opted out falls back to equal weight",
 * which needs a number: weights are incomes, and "equal" has no income. An
 * opted-out member is therefore given the MEAN income of the members who did
 * opt in — the weight of a perfectly average person in this group. Three
 * consequences, all intended:
 *
 *   - Opting out is neutral. You pay what a plain equal split would have asked
 *     of an average earner, so it is neither a discount nor a penalty, and
 *     nobody can read your income out of your share.
 *   - With nobody opted in, every weight is the same and the result is exactly
 *     an equal split. A group can set `weighted` as its default before a single
 *     member has consented and nothing surprising happens.
 *   - A member who opted in but has not entered an income is treated as opted
 *     out. Consent without a figure carries no information, and weighting them
 *     at zero would hand them a free dinner.
 *
 * @param {string[]} participantIds
 * @param {Map<string, number>} incomeByUserId monthly income in rupees
 * @param {Set<string>} optedInIds consent, per group
 * @returns {{weights: number[], consentingCount: number}}
 */
function resolveIncomeWeights(participantIds, incomeByUserId, optedInIds) {
  const hasSignal = (id) => optedInIds.has(id) && Number(incomeByUserId.get(id)) > 0;

  const consenting = participantIds.filter(hasSignal);
  if (consenting.length === 0) {
    return { weights: participantIds.map(() => 1), consentingCount: 0 };
  }

  const total = consenting.reduce((sum, id) => sum + Number(incomeByUserId.get(id)), 0);
  const mean = total / consenting.length;

  return {
    weights: participantIds.map((id) => (hasSignal(id) ? Number(incomeByUserId.get(id)) : mean)),
    consentingCount: consenting.length,
  };
}

/**
 * How one share compares to what an equal split would have charged.
 *
 * This is the ONLY comparative information a weighted split is allowed to
 * surface, and it is computed per viewer about their own share. "You're paying
 * a larger share" is a fact about the reader; "Priya earns more than you" is a
 * fact about Priya, and Finget never says it.
 *
 * The one-paisa deadband keeps a rounding remainder from reading as a verdict:
 * on a ₹100 three-way split someone has to absorb the extra paisa, and that is
 * not "paying more".
 */
function relativeShareLabel(sharePaise, equalSharePaise) {
  const deltaPaise = sharePaise - equalSharePaise;
  if (Math.abs(deltaPaise) <= 1) return "even";
  return deltaPaise > 0 ? "larger" : "smaller";
}

/**
 * Net position per member, in paise.
 *
 * Positive = the group owes them (they fronted more than their share).
 * Negative = they owe the group.
 *
 * @returns {Map<string, number>} userId → paise
 */
function computeBalancesPaise(transactions, settlements = []) {
  const netPaise = new Map();
  const bump = (id, deltaPaise) => {
    if (!id) return;
    const key = idOf(id);
    netPaise.set(key, (netPaise.get(key) || 0) + deltaPaise);
  };

  transactions.forEach((t) => {
    if (t.type !== "expense") return;
    const splits = Array.isArray(t.splits) ? t.splits : [];
    if (splits.length === 0) return; // unsplit group spend creates no debt

    const payer = t.paidBy || t.userId;
    const coveredPaise = splits.reduce((sum, sp) => sum + toPaise(sp.amount || 0), 0);

    // The payer fronted what the group consumed…
    bump(payer, coveredPaise);
    // …and each member owes their own share back.
    splits.forEach((sp) => bump(sp.userId, -toPaise(sp.amount || 0)));
  });

  settlements.forEach((s) => {
    // Paying someone back moves both parties toward zero.
    const amountPaise = toPaise(s.amount || 0);
    bump(s.from, amountPaise);
    bump(s.to, -amountPaise);
  });

  return netPaise;
}

/**
 * Greedy minimal-transfer settle-up: repeatedly match the largest debtor
 * against the largest creditor. Produces at most (members − 1) transfers.
 *
 * @param {Map<string, number>} balancesPaise
 * @returns {{from: string, to: string, amountPaise: number}[]}
 */
function suggestSettlementsPaise(balancesPaise) {
  const creditors = [];
  const debtors = [];

  for (const [userId, amountPaise] of balancesPaise.entries()) {
    if (amountPaise > 0) creditors.push({ userId, amountPaise });
    else if (amountPaise < 0) debtors.push({ userId, amountPaise: -amountPaise });
  }

  creditors.sort((a, b) => b.amountPaise - a.amountPaise || (a.userId < b.userId ? -1 : 1));
  debtors.sort((a, b) => b.amountPaise - a.amountPaise || (a.userId < b.userId ? -1 : 1));

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const payPaise = Math.min(debtors[i].amountPaise, creditors[j].amountPaise);
    if (payPaise > 0) {
      transfers.push({ from: debtors[i].userId, to: creditors[j].userId, amountPaise: payPaise });
    }
    debtors[i].amountPaise -= payPaise;
    creditors[j].amountPaise -= payPaise;
    if (debtors[i].amountPaise === 0) i++;
    if (creditors[j].amountPaise === 0) j++;
  }

  return transfers;
}

/**
 * Weights for one group's participants, read live from its populated members.
 *
 * Lives here rather than in a controller because three callers now need it —
 * the split preview, the transaction write, and the WhatsApp handler — and a
 * service reaching into a controller to get it would have been backwards.
 *
 * @param {object} group populated with `members` carrying `monthlyIncome`
 * @param {string[]} participantIds
 */
function groupIncomeWeights(group, participantIds) {
  const optedIn = new Set((group.incomeSharing || []).map((entry) => idOf(entry.userId)));
  const incomeByUserId = new Map(
    (group.members || []).map((m) => [idOf(m), Number(m.monthlyIncome) || 0])
  );
  return resolveIncomeWeights(participantIds, incomeByUserId, optedIn);
}

module.exports = {
  equalSplit,
  weightedSplit,
  resolveIncomeWeights,
  groupIncomeWeights,
  relativeShareLabel,
  computeBalancesPaise,
  suggestSettlementsPaise,
};
