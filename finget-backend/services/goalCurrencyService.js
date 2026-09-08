const { toPaise, fromPaise } = require("../utils/money");
const { inr } = require("../utils/format");
const { goalsForScope, affordabilityForScope } = require("./scopeResolver");

/**
 * Goal currency — Finget's actual product.
 *
 * A purchase is not ₹8,499. A purchase is *six days of your Goa trip*. This
 * service is the single translator from rupees into whichever frame lands
 * hardest for this particular person right now.
 *
 * `headlineKind` names the frame explicitly so callers, copy and tests never
 * have to guess which denominator produced `headline`. The two numeric frames
 * use different denominators on purpose and must never be compared:
 *   - `delayDays`        — months of savings capacity lost, ×30
 *   - `daysOfSafeSpend`  — amount ÷ safe daily allowance
 */

const PRIORITY_RANK = { High: 3, Medium: 2, Low: 1 };

/** Sort key: strongest claim on the headline first. */
function compareGoalClaim(a, b) {
  // A goal the purchase stalls outright outranks any finite delay.
  if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;

  const priorityDelta = (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
  if (priorityDelta !== 0) return priorityDelta;

  // Same priority: whichever deadline lands soonest hurts most.
  if (a.deadline && b.deadline) {
    const deadlineDelta = new Date(a.deadline) - new Date(b.deadline);
    if (deadlineDelta !== 0) return deadlineDelta;
  } else if (a.deadline || b.deadline) {
    return a.deadline ? -1 : 1;
  }

  return (b.delayDays || 0) - (a.delayDays || 0);
}

/**
 * Pure translation. No database access — everything it needs is passed in,
 * which is what makes the headline ladder unit-testable.
 *
 * @param {object}   opts
 * @param {object}   opts.affordability  result of calculateAffordability
 * @param {object[]} opts.goals          goals in scope
 * @param {number}   opts.amountPaise    the purchase under consideration
 */
function computeTranslation({ affordability, goals = [], amountPaise }) {
  if (!Number.isInteger(amountPaise)) {
    throw new TypeError(`amountPaise must be an integer, got ${amountPaise}`);
  }

  const amount = fromPaise(amountPaise);

  const remainingPaise = toPaise(affordability.remaining || 0);
  const safeDailyPaise = toPaise(affordability.safeDaily || 0);
  const bufferPaise = toPaise(affordability.emergencyBuffer || 0);
  const daysLeft = affordability.daysLeftInMonth || 1;

  const remainingAfterPaise = remainingPaise - amountPaise;
  const safeDailyAfterPaise =
    remainingAfterPaise > 0 ? Math.round(remainingAfterPaise / daysLeft) : 0;

  let riskAfter = "Safe";
  
  const incomePaise = toPaise(affordability.income || 0);
  if (incomePaise > 0) {
    const percent = amountPaise / incomePaise;
    if (percent >= 0.50) {
      riskAfter = "Extremely Risky";
    } else if (percent >= 0.30) {
      riskAfter = "Risky";
    } else if (percent >= 0.20) {
      riskAfter = "Warning";
    } else if (percent < 0.10) {
      riskAfter = "Safe";
    }
  } else {
    // Fallback if no income data
    if (remainingAfterPaise < bufferPaise) riskAfter = "Warning";
    if (remainingAfterPaise < 0) riskAfter = "Risky";
  }

  // How many days of ordinary allowance this purchase consumes.
  const daysOfSafeSpend =
    safeDailyPaise > 0 ? Math.round((amountPaise / safeDailyPaise) * 10) / 10 : null;

  // Monthly savings capacity before and after the purchase.
  const capacityBeforePaise = Math.max(0, remainingPaise);
  const capacityAfterPaise = Math.max(0, remainingAfterPaise);

  const goalImpacts = goals
    .map((goal) => {
      const targetPaise = toPaise(goal.targetAmount || 0);
      const savedPaise = toPaise(goal.currentAmount || 0);
      const outstandingPaise = Math.max(0, targetPaise - savedPaise);
      if (outstandingPaise <= 0) return null; // already funded

      const monthsBefore =
        capacityBeforePaise > 0 ? outstandingPaise / capacityBeforePaise : Infinity;
      const monthsAfter =
        capacityAfterPaise > 0 ? outstandingPaise / capacityAfterPaise : Infinity;

      const blocked = !Number.isFinite(monthsAfter);
      const delayDays =
        !blocked && Number.isFinite(monthsBefore)
          ? Math.max(0, Math.round((monthsAfter - monthsBefore) * 30))
          : null;

      return {
        goalId: goal._id ? String(goal._id) : null,
        name: goal.name,
        priority: goal.priority || "Medium",
        deadline: goal.deadline || null,
        outstandingPaise,
        outstanding: fromPaise(outstandingPaise),
        delayDays,
        blocked,
      };
    })
    .filter(Boolean);

  // Only goals the purchase actually moves can claim the headline.
  const claimants = goalImpacts
    .filter((g) => g.blocked || (g.delayDays || 0) > 0)
    .sort(compareGoalClaim);

  let headline;
  let headlineKind;

  if (claimants.length > 0) {
    const top = claimants[0];
    headlineKind = "goal_delay";
    headline = top.blocked
      ? `stalls your ${top.name}`
      : `${top.delayDays} ${top.delayDays === 1 ? "day" : "days"} of your ${top.name}`;
  } else if (daysOfSafeSpend !== null && daysOfSafeSpend >= 1) {
    headlineKind = "safe_days";
    const rounded = Math.round(daysOfSafeSpend);
    headline = `${rounded} ${rounded === 1 ? "day" : "days"} of your safe spend`;
  } else {
    headlineKind = "rupees";
    headline = inr(amount);
  }

  // Presentation order: strongest claim first, then remaining impacts.
  const orderedImpacts = [
    ...claimants,
    ...goalImpacts.filter((g) => !claimants.includes(g)),
  ].slice(0, 4);

  return {
    amountPaise,
    amount,
    currency: "INR",
    daysOfSafeSpend,
    goalImpacts: orderedImpacts,
    headline,
    headlineKind,
    riskAfter,
    remainingAfterPaise,
    remainingAfter: fromPaise(remainingAfterPaise),
    safeDailyAfterPaise,
    safeDailyAfter: fromPaise(safeDailyAfterPaise),
  };
}

/**
 * Scope-aware translation. `scope` is a resolved scope from `scopeResolver`,
 * so membership has already been enforced by the time we get here.
 */
async function translate(scope, amountPaise) {
  const affordability = affordabilityForScope(scope);
  const goals = await goalsForScope(scope);
  return computeTranslation({ affordability, goals, amountPaise });
}

module.exports = { translate, computeTranslation, compareGoalClaim };
