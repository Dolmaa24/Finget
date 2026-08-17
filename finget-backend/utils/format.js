/**
 * Rupees, as a reader sees them.
 *
 * There is exactly one of these. It used to be six near-copies — ruleEngine,
 * goalCurrencyService, whatsappHandler, shareCardCopy, pushTriggers and
 * financeController each carried their own — and they disagreed: four rounded,
 * two did not. So ₹1,250.50 was "₹1,251" on the dashboard and "₹1,250.5" in
 * the WhatsApp reply about the very same transaction, which reads as a bug in
 * the ledger rather than a difference between two formatters.
 *
 * IT ROUNDS, for three reasons:
 *
 *   1. A display formatter has no business showing paise. Every figure here is
 *      derived — a safe-daily allowance is `remaining / daysLeft`, so the
 *      honest unrounded rendering is "₹2866.6666666666665".
 *      `tests/ambient.test.js` pins this directly: `safeDailyLabel` must match
 *      /^₹[\d,]+$/, no decimal point allowed.
 *   2. Nothing was relying on the non-rounding. Share card payloads are
 *      validated to whole rupees before they ever reach copy (a fractional
 *      `amountPaise` is a 400), so the two non-rounding copies could not
 *      produce a decimal in the one place that looked like it wanted them.
 *   3. Paise are not lost here, only unshown. `utils/money` holds the money;
 *      this holds a string. Never parse the output of this function.
 *
 * Non-finite input renders "₹0" rather than "₹NaN". Cards legitimately ask for
 * fields their payload does not carry — a `deflection` card with no
 * `totalDeflected` is a real, rendered case — and a card that says ₹NaN is
 * worse than one that says ₹0.
 */
function inr(rupees) {
  const value = Number(rupees);
  const safe = Number.isFinite(value) ? value : 0;
  return `₹${Math.round(safe).toLocaleString("en-IN")}`;
}

module.exports = { inr };
