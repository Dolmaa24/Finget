const { fromPaise } = require("../utils/money");

/**
 * `upi://pay` intent links.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * Finget does not hold, move, touch, or see user money, and this file is the
 * closest the product ever comes to the boundary. What it produces is a URL.
 * Tapping it opens the payer's OWN UPI app — GPay, PhonePe, Paytm, their bank's
 * app — with the payee and amount pre-filled. The payer approves it there,
 * against their own bank, with their own PIN. Finget is not in the path, holds
 * no funds, is not a payment aggregator, and needs no licence to do this.
 *
 * The settlement row is written only when a human confirms the transfer
 * happened. Do NOT add anything that marks a debt settled because a link was
 * *opened* — an opened link is not a payment, and a ledger that believes
 * otherwise is worse than no ledger. If a real payment integration is ever
 * wanted, it belongs behind an explicit product decision and a licensed
 * provider, not behind an edit to this comment.
 */

/**
 * A Virtual Payment Address: `handle@psp`.
 *
 * Deliberately conservative. A malformed VPA yields a link that dead-ends in
 * the payment app with an unhelpful error, so anything that does not clearly
 * look like a VPA is rejected here and the reminder simply arrives without a
 * pay button.
 */
const VPA_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,63})@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

function isValidUpiId(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 5 || trimmed.length > 128) return false;
  return VPA_RE.test(trimmed);
}

/**
 * Payee names travel in a query string that a payment app parses loosely.
 * Strip the characters that could confuse that parse rather than trusting
 * encoding alone, then cap the length — some apps truncate silently and a
 * half-shown name looks like the wrong person.
 */
function sanitiseParam(value, maxLength) {
  return String(value || "")
    .replace(/[&?#=]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Build the intent, or return `null` when it cannot be built honestly.
 *
 * Null is a normal outcome, not a failure: most people will not have added a
 * UPI handle, and the reminder is perfectly useful without one.
 *
 * @param {object} args
 * @param {string} args.upiId  the CREDITOR's VPA — money flows toward them
 * @param {string} args.payeeName
 * @param {number} args.amountPaise
 * @param {string} [args.note]
 * @returns {string|null}
 */
function buildUpiIntent({ upiId, payeeName, amountPaise, note }) {
  if (!isValidUpiId(upiId)) return null;
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) return null;

  const params = new URLSearchParams({
    pa: upiId.trim(),
    pn: sanitiseParam(payeeName, 50) || "Finget contact",
    // UPI apps expect a plain decimal with two places. `fromPaise` is the only
    // paise→rupee conversion in the codebase; `toFixed` is formatting, not maths.
    am: fromPaise(amountPaise).toFixed(2),
    cu: "INR",
  });

  const transactionNote = sanitiseParam(note, 50);
  if (transactionNote) params.set("tn", transactionNote);

  return `upi://pay?${params.toString()}`;
}

module.exports = { buildUpiIntent, isValidUpiId };
