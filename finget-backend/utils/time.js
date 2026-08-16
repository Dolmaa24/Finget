/**
 * Asia/Kolkata calendar boundaries.
 *
 * Every month and day boundary in Finget is IST, never UTC and never
 * server-local. This matters: `new Date().setHours(0,0,0,0)` on a UTC host
 * rolls the month over at 05:30 IST, so safe-to-spend would visibly jump
 * mid-morning on the 1st for every Indian user. A dev machine set to IST hides
 * the bug completely, which is why it survived this long.
 *
 * IST is a fixed UTC+05:30 with no daylight saving, so a constant offset is
 * exact — no timezone database needed.
 */

const MS_MINUTE = 60000;
const MS_DAY = 86400000;

/** Asia/Kolkata is UTC+05:30 year-round. */
const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * MS_MINUTE;

/**
 * Shift an instant so that its *UTC* getters read as IST wall-clock fields.
 * Internal helper — the returned Date is a calculation vehicle, not an instant.
 */
function shiftToIST(date) {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/** IST wall-clock fields for an instant. */
function istParts(date = new Date()) {
  const shifted = shiftToIST(date);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(), // 0-indexed
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(), // 0 = Sunday
  };
}

/** Build the instant for a given IST wall-clock moment. */
function fromISTFields(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month, day, hour, minute, 0, 0) - IST_OFFSET_MS);
}

/** First instant of the IST calendar month containing `now`. */
function startOfMonthIST(now = new Date()) {
  const { year, month } = istParts(now);
  return fromISTFields(year, month, 1);
}

/** First instant of the *next* IST calendar month (exclusive month end). */
function startOfNextMonthIST(now = new Date()) {
  const { year, month } = istParts(now);
  return fromISTFields(year, month + 1, 1);
}

/** First instant of the IST day containing `now`. */
function startOfDayIST(now = new Date()) {
  const { year, month, day } = istParts(now);
  return fromISTFields(year, month, day);
}

/**
 * Whole IST days remaining in the month, including today. Never below 1, so
 * safe-daily maths can always divide by it.
 */
function daysLeftInMonthIST(now = new Date()) {
  const monthEnd = startOfNextMonthIST(now);
  const todayStart = startOfDayIST(now);
  return Math.max(1, Math.round((monthEnd - todayStart) / MS_DAY));
}

/** Total days in the IST calendar month containing `now`. */
function daysInMonthIST(now = new Date()) {
  const start = startOfMonthIST(now);
  const end = startOfNextMonthIST(now);
  return Math.round((end - start) / MS_DAY);
}

/**
 * First instant of the IST calendar quarter containing `now`.
 *
 * Calendar quarters (Jan/Apr/Jul/Oct), not the Indian financial year, which
 * starts in April. The deflection ledger is a personal running total, not a
 * tax document, and "this quarter" reading as Jan–Mar in February is what a
 * person expects.
 */
function startOfQuarterIST(now = new Date()) {
  const { year, month } = istParts(now);
  return fromISTFields(year, Math.floor(month / 3) * 3, 1);
}

/** `YYYY-MM` for the IST month — used as a budget period key. */
function monthKeyIST(now = new Date()) {
  const { year, month } = istParts(now);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** True when the instant falls on an IST Saturday or Sunday. */
function isWeekendIST(date) {
  const { weekday } = istParts(date);
  return weekday === 0 || weekday === 6;
}

module.exports = {
  MS_DAY,
  IST_OFFSET_MINUTES,
  istParts,
  fromISTFields,
  startOfMonthIST,
  startOfNextMonthIST,
  startOfDayIST,
  startOfQuarterIST,
  daysLeftInMonthIST,
  daysInMonthIST,
  monthKeyIST,
  isWeekendIST,
};
