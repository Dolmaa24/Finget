const { toPaise, sumPaise } = require("../utils/money");
const { startOfDayIST, MS_DAY } = require("../utils/time");

/**
 * Trip burn: where the money is against where the trip is.
 *
 * The whole value of this is that it is live and comparative. "₹29,400 spent"
 * tells a group nothing on day two of five; "61% spent, day 2 of 5" tells them
 * everything, instantly, without anyone doing arithmetic on a bus.
 *
 * Every function here is pure. The controller loads documents and this decides
 * what they mean, which is what makes the pace rules testable at boundaries
 * that would otherwise need a five-day trip to observe.
 */

/**
 * How far ahead of pace a group may drift before it is worth mentioning.
 *
 * Deliberately asymmetric. Being 10% over on day one of a trip is noise —
 * someone paid for the hotel — while being 10% under means very little. A
 * tighter band would make the strip cry wolf on the first big expense, and a
 * strip that cries wolf gets ignored for the rest of the trip.
 */
const PACE_TOLERANCE = 0.1;

/** IST calendar days from `start` to `end`, inclusive of both. */
function inclusiveDaySpan(start, end) {
  const a = startOfDayIST(new Date(start));
  const b = startOfDayIST(new Date(end));
  return Math.max(1, Math.round((b - a) / MS_DAY) + 1);
}

/**
 * Which day of the trip `now` falls on, 1-indexed and clamped.
 *
 * Before the trip starts this is 0 — "day 0 of 5" is honest, and it stops the
 * pace maths dividing progress by a day that has not happened.
 */
function dayIndexOf(startDate, endDate, now = new Date()) {
  const start = startOfDayIST(new Date(startDate));
  const today = startOfDayIST(now);

  if (today < start) return 0;

  const total = inclusiveDaySpan(startDate, endDate);
  const elapsed = Math.round((today - start) / MS_DAY) + 1;
  return Math.min(elapsed, total);
}

/**
 * @param {object} opts
 * @param {Date}   opts.startDate
 * @param {Date}   opts.endDate
 * @param {number} opts.potPaise    what the group agreed to spend, 0 if unset
 * @param {number} opts.spentPaise  expenses booked to the trip so far
 * @param {Date}   [opts.now]
 */
function computeTripStatus({ startDate, endDate, potPaise = 0, spentPaise = 0, now = new Date() }) {
  const totalDays = inclusiveDaySpan(startDate, endDate);
  const dayIndex = dayIndexOf(startDate, endDate, now);

  const started = dayIndex > 0;
  const finished = startOfDayIST(now) > startOfDayIST(new Date(endDate));

  const daysRemaining = Math.max(0, totalDays - dayIndex);

  /** Share of the trip elapsed. Days, not hours — a trip is lived in days. */
  const timeProgress = started ? dayIndex / totalDays : 0;

  /** Share of the pot spent. Null when no pot was set: there is nothing to be over. */
  const percentSpent = potPaise > 0 ? (spentPaise / potPaise) * 100 : null; // not-money: percentage

  /**
   * Pace compares the two progresses, never the raw figures. A group that has
   * spent 61% on day 2 of 5 (40% elapsed) is running hot; the same 61% on day
   * 4 is fine.
   */
  let paceStatus = "on";
  if (potPaise > 0 && started) {
    const spendProgress = spentPaise / potPaise;
    if (spendProgress > timeProgress + PACE_TOLERANCE) paceStatus = "over";
    else if (spendProgress < timeProgress - PACE_TOLERANCE) paceStatus = "under";
  }

  /** What is left, per remaining day, if they want to land on the pot exactly. */
  const remainingPaise = Math.max(0, potPaise - spentPaise);
  const dailyAllowancePaise =
    potPaise > 0 && daysRemaining > 0 ? Math.round(remainingPaise / daysRemaining) : 0;

  /**
   * Where this lands if the current daily rate holds. Only meaningful once the
   * trip has actually started — extrapolating from zero elapsed days produces
   * infinity, and from one day produces nonsense.
   */
  const projectedFinalPaise =
    started && dayIndex > 0 ? Math.round((spentPaise / dayIndex) * totalDays) : spentPaise;

  return {
    kind: "trip",
    dayIndex,
    totalDays,
    daysRemaining,
    started,
    finished,
    spentPaise,
    potPaise,
    percentSpent: percentSpent === null ? null : Math.round(percentSpent),
    paceStatus,
    dailyAllowancePaise,
    projectedFinalPaise,
    /** Only meaningful with a pot; negative means projected to come in under. */
    projectedOverspendPaise: potPaise > 0 ? projectedFinalPaise - potPaise : null,
  };
}

/**
 * The strip's sentence.
 *
 * "You're running hot" is an observation about the pot, not a verdict about
 * the group. Nothing here says anyone overspent, because on day two nobody has
 * — they have simply spent early, which is what trips do.
 */
function paceMessage(status) {
  if (!status.started) return "Not started yet.";
  if (status.potPaise <= 0) return `Day ${status.dayIndex} of ${status.totalDays}.`;

  const head = `Day ${status.dayIndex} of ${status.totalDays} · ${status.percentSpent}% spent`;

  if (status.finished) return `${head} · that's a wrap.`;

  switch (status.paceStatus) {
    case "over":
      return `${head} · you're running hot.`;
    case "under":
      return `${head} · comfortably ahead.`;
    default:
      return `${head} · right on pace.`;
  }
}

/** Trip expenses only — settlements move money between members, not out of the pot. */
function spentPaiseFrom(transactions) {
  return sumPaise(
    transactions.filter((t) => t.type === "expense").map((t) => toPaise(t.amount || 0))
  );
}

module.exports = {
  computeTripStatus,
  paceMessage,
  dayIndexOf,
  inclusiveDaySpan,
  spentPaiseFrom,
  PACE_TOLERANCE,
};
