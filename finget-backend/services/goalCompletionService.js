/**
 * Goal completion — THE SEAM ONLY. Nothing here recommends anything.
 *
 * ============================================================================
 * TODO: BLOCKED ON FINANCIAL REGULATION. DO NOT IMPLEMENT A PROVIDER WITHOUT
 * COMPLETING THE ITEMS BELOW.
 * ============================================================================
 *
 * The idea: when someone's savings goal matures — they hit ₹40,000 for the Goa
 * trip, or the goal's deadline passes with the money still sitting there — Finget
 * could route that balance to a partner recurring deposit or liquid fund and
 * take a referral fee. It is the highest-ARPU idea in the product, because it
 * earns on money the user was already saving rather than charging them for
 * software.
 *
 * IT IS ALSO THE ONE FEATURE THAT COULD GET THIS APP SHUT DOWN. In India,
 * recommending a specific mutual fund or deposit product to a retail investor is
 * a regulated activity. Before a real provider is written, ALL of these must be
 * true:
 *
 *   1. AMFI registration (ARN) if any mutual fund is distributed, or a tie-up
 *      with an entity that holds one and takes on the distribution.
 *   2. A view from a lawyer on whether the flow amounts to "investment advice"
 *      under the SEBI (Investment Advisers) Regulations, 2013. Presenting ONE
 *      product to a user with their amount pre-filled is much closer to advice
 *      than presenting a neutral list, and the line matters.
 *   3. Risk disclosure and disclaimer copy reviewed by that lawyer, not written
 *      by whoever builds the screen.
 *   4. An explicit, per-transaction consent step — never a default, never a
 *      pre-ticked box, never bundled into onboarding.
 *   5. A written answer to "what happens when the market falls and a user says
 *      Finget told them to buy this." If that answer is uncomfortable, the
 *      feature is not ready regardless of the paperwork.
 *
 * UNTIL THEN, the contract of this module is that it returns nothing actionable.
 * `tests/monetization.test.js` asserts exactly that, so a future edit cannot
 * quietly switch it on: any provider that returns a product, a name, a return
 * figure, or a link will fail the suite.
 *
 * The interface exists now so that adding a provider later is one file and a
 * config flag, rather than a refactor of the goals surface — and so that the
 * regulatory dependency is written down where the code is, not in a ticket
 * nobody reads.
 */

/**
 * The shape a real provider would implement.
 *
 * @typedef {object} CompletionProvider
 * @property {string} name
 * @property {(goal: object, user: object) => Promise<CompletionOffer|null>} offerFor
 */

/**
 * @typedef {object} CompletionOffer
 * @property {string} kind        e.g. "recurring_deposit" | "liquid_fund"
 * @property {string} partner     the registered distributor or AMC
 * @property {string} disclosure  lawyer-reviewed risk text, verbatim
 * @property {string} consentUrl  where the user gives explicit consent
 */

/**
 * The only provider that ships.
 *
 * Returns null for every goal, always. Not a stub that "will be filled in" —
 * the correct behaviour for an unregistered entity is to say nothing at all.
 */
const noopProvider = {
  name: "none",
  async offerFor() {
    return null;
  },
};

let provider = noopProvider;

/**
 * Register a real provider.
 *
 * Deliberately not driven by an environment variable. A regulated capability
 * should not be switchable by a typo in a `.env` file on a Friday — enabling
 * this must be a code change that a human reviews, in a commit that says why.
 */
function _registerProvider(next) {
  if (!next || typeof next.offerFor !== "function") {
    throw new TypeError("A completion provider needs an async offerFor(goal, user)");
  }
  provider = next;
}

/** Test seam: put it back. */
function _resetProvider() {
  provider = noopProvider;
}

const isCompletionAvailable = () => provider.name !== "none";

/**
 * Has this goal matured enough to be worth mentioning at all?
 *
 * PURE, and deliberately separate from anything that offers a product. Knowing a
 * goal is complete is useful on its own — the app can congratulate someone and
 * suggest they move the money somewhere it earns, WITHOUT naming where. That
 * sentence is not regulated; naming a fund is.
 */
function isGoalMature(goal, now = new Date()) {
  if (!goal) return false;
  const target = Number(goal.targetAmount) || 0;
  const saved = Number(goal.currentAmount) || 0;
  if (target <= 0) return false;

  if (saved >= target) return true;

  // Deadline passed with something meaningful saved: the goal is over, and the
  // balance is still sitting in a current account earning nothing.
  const deadline = goal.deadline ? new Date(goal.deadline) : null;
  if (deadline && deadline < now && saved >= target * 0.8) return true;

  return false;
}

/**
 * What, if anything, to offer for a matured goal.
 *
 * Returns null with the no-op provider, which is every deployment today.
 */
async function offerForGoal(goal, user, now = new Date()) {
  if (!isCompletionAvailable()) return null;
  if (!isGoalMature(goal, now)) return null;
  return provider.offerFor(goal, user);
}

module.exports = {
  isCompletionAvailable,
  isGoalMature,
  offerForGoal,
  // Underscored: not part of the app's surface, only the tests' and a future
  // reviewed change's.
  _registerProvider,
  _resetProvider,
};
