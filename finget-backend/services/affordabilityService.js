const { startOfMonthIST, daysLeftInMonthIST } = require("../utils/time");
const { fromPaise } = require("../utils/money");

/**
 * Decision-first affordability.
 *
 * Only *this month's* transactions count toward the monthly burn — previously
 * every transaction ever recorded was subtracted from a single month's income,
 * so the number drifted further from reality the longer an account was used.
 *
 * Month and day boundaries are Asia/Kolkata (see utils/time.js), not
 * server-local. On a UTC host the old local-time version rolled the month over
 * at 05:30 IST, which made the number jump mid-morning on the 1st.
 *
 * @param {{monthlyIncome?: number}} owner  user, or a group with pooled income
 * @param {object[]} transactions
 * @param {{savingsTarget?: number, emergencyBuffer?: number}} settings
 * @param {{now?: Date, heldPaise?: number}} [opts]
 *   `heldPaise` is money ring-fenced by live 48-hour vault holds. It is
 *   subtracted here, inside the one function every surface calls, rather than
 *   at any call site — the dashboard, the translator, the simulator and the
 *   coach must all see the same number or the feature is a lie. Resolved by
 *   `scopeResolver`, so no caller has to remember to pass it.
 */
exports.calculateAffordability = (owner, transactions, settings, opts = {}) => {
  const { now = new Date(), heldPaise = 0 } = opts;
  const monthStart = startOfMonthIST(now);
  const inMonth = transactions.filter((t) => new Date(t.date) >= monthStart);

  const expenses = inMonth
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  // Extra income logged during the month (freelance, refunds) lifts the ceiling.
  const extraIncome = inMonth
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const baseIncome = owner?.monthlyIncome || 0;
  const income = baseIncome + extraIncome;

  const savingsTarget = settings?.savingsTarget || 0;
  const emergencyBuffer = settings?.emergencyBuffer || 0;

  /**
   * Held money is an obligation, not an expense. It has not been spent and may
   * never be — it is simply not available to spend on anything else for the
   * next 48 hours. Keeping it out of `expenses` is what lets the ledger credit
   * it back without ever having recorded a purchase that did not happen.
   */
  const held = fromPaise(heldPaise);

  const obligations = expenses + savingsTarget + held;
  const remaining = income - obligations;

  const daysLeft = daysLeftInMonthIST(now);
  const safeDaily = remaining > 0 ? remaining / daysLeft : 0;

  let risk = "Safe";
  if (remaining < emergencyBuffer) risk = "Warning";
  if (remaining < 0) risk = "Risky";

  return {
    safeDaily,
    remaining,
    risk,
    income,
    baseIncome,
    extraIncome,
    expenses,
    savingsTarget,
    emergencyBuffer,
    /** Surfaced so the UI can say *why* the number is lower than the maths implies. */
    held,
    heldPaise,
    daysLeftInMonth: daysLeft,
    monthlyBurnRate: expenses,
  };
};
