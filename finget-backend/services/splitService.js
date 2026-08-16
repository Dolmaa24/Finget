const { idOf } = require("../utils/groupAuth");

/** Round to paise so repeated float math never drifts into ₹0.0000001 debts. */
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Split `amount` across `memberIds` as evenly as possible, pushing the
 * remainder (in paise) onto the leading members so the parts always sum
 * back to exactly `amount`.
 */
function equalSplit(amount, memberIds) {
  const n = memberIds.length;
  if (n === 0) return [];
  const totalPaise = Math.round(amount * 100);
  const base = Math.floor(totalPaise / n);
  let remainder = totalPaise - base * n;

  return memberIds.map((userId) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return { userId, amount: (base + extra) / 100, status: "pending" };
  });
}

/**
 * Net position per member across a group's expenses and settlements.
 *
 * Positive balance = the group owes them (they fronted more than their share).
 * Negative balance = they owe the group.
 */
function computeBalances(transactions, settlements = []) {
  const net = new Map();
  const bump = (id, delta) => {
    if (!id) return;
    const key = idOf(id);
    net.set(key, round2((net.get(key) || 0) + delta));
  };

  transactions.forEach((t) => {
    if (t.type !== "expense") return;
    const splits = Array.isArray(t.splits) ? t.splits : [];
    if (splits.length === 0) return; // unsplit group spend affects no one's debt

    const payer = t.paidBy || t.userId;
    const covered = splits.reduce((s, sp) => s + (sp.amount || 0), 0);

    // The payer fronted what the group consumed…
    bump(payer, covered);
    // …and each member owes their own share back.
    splits.forEach((sp) => bump(sp.userId, -(sp.amount || 0)));
  });

  settlements.forEach((s) => {
    // Paying someone back moves you toward zero and them toward zero.
    bump(s.from, s.amount);
    bump(s.to, -s.amount);
  });

  return net;
}

/**
 * Greedy minimal-transfer suggestion: repeatedly match the largest debtor
 * against the largest creditor. Produces at most (members - 1) transfers.
 */
function suggestSettlements(balances) {
  const creditors = [];
  const debtors = [];

  for (const [userId, amount] of balances.entries()) {
    if (amount > 0.01) creditors.push({ userId, amount });
    else if (amount < -0.01) debtors.push({ userId, amount: -amount });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = round2(Math.min(debtors[i].amount, creditors[j].amount));
    if (pay > 0.01) {
      transfers.push({ from: debtors[i].userId, to: creditors[j].userId, amount: pay });
    }
    debtors[i].amount = round2(debtors[i].amount - pay);
    creditors[j].amount = round2(creditors[j].amount - pay);
    if (debtors[i].amount <= 0.01) i++;
    if (creditors[j].amount <= 0.01) j++;
  }

  return transfers;
}

module.exports = { equalSplit, computeBalances, suggestSettlements, round2 };
