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

module.exports = {
  equalSplit,
  weightedSplit,
  computeBalancesPaise,
  suggestSettlementsPaise,
};
