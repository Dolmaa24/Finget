/**
 * Entitlements.
 *
 * Every gate is wired now and every gate is OPEN until `PAYWALL_ENABLED=true`
 * (Milestone 8). Retrofitting capability checks after eight features exist is
 * miserable; adding them while the surfaces are being built costs nothing.
 *
 * Two grant sources, checked in this order:
 *   1. The GROUP's Trip Pass — one purchase by the organiser upgrades every
 *      member, for group-scoped capabilities only.
 *   2. The USER's own Plus plan — covers everything, both scopes.
 *
 * The Trip Pass deliberately never unlocks personal mode. The funnel is that a
 * group tastes Plus together, then meets the wall alone later; if ₹199 unlocked
 * everything it would cannibalise five subscriptions.
 */

const CAPABILITIES = {
  UNLIMITED_GROUPS: "unlimited_groups",
  UNLIMITED_COACH: "unlimited_coach",
  IMPORT_SCREENSHOT: "import_screenshot",
  IMPORT_SMS: "import_sms",
  BROWSER_EXTENSION: "browser_extension",
  WIDGETS: "widgets",
  WRAPPED_EXPORT: "wrapped_export",
  WEIGHTED_SPLITS: "weighted_splits",
};

/** Capabilities a group's Trip Pass can grant to every member of that group. */
const GROUP_GRANTABLE = new Set([
  CAPABILITIES.UNLIMITED_COACH,
  CAPABILITIES.IMPORT_SCREENSHOT,
  CAPABILITIES.IMPORT_SMS,
  CAPABILITIES.WRAPPED_EXPORT,
  CAPABILITIES.WEIGHTED_SPLITS,
]);

/** Free-tier ceilings, enforced by callers that count things. */
const FREE_LIMITS = {
  groups: 1,
  coachMessagesPerMonth: 5,
};

const isPaywallEnabled = () =>
  String(process.env.PAYWALL_ENABLED || "false").toLowerCase() === "true";

const notExpired = (until) => !until || new Date(until) > new Date();

function hasActivePlus(user) {
  return user?.entitlements?.plan === "plus" && notExpired(user.entitlements.planUntil);
}

function hasActiveTripPass(group) {
  return Boolean(group?.entitlement?.tripPass) && notExpired(group.entitlement.until);
}

/**
 * @param {object} user     the acting user document
 * @param {string} capability  one of CAPABILITIES
 * @param {{group?: object}} [ctx]  the group in scope, when the action is group-scoped
 * @returns {boolean}
 */
function can(user, capability, ctx = {}) {
  if (!Object.values(CAPABILITIES).includes(capability)) {
    throw new Error(`Unknown capability: ${capability}`);
  }

  // Milestone 0–7: every gate wired, every gate open.
  if (!isPaywallEnabled()) return true;

  if (ctx.group && GROUP_GRANTABLE.has(capability) && hasActiveTripPass(ctx.group)) {
    return true;
  }

  return hasActivePlus(user);
}

/** Why a gate closed — used for paywall copy that names the specific benefit. */
function explain(capability) {
  const reasons = {
    [CAPABILITIES.UNLIMITED_GROUPS]: "Plus lets you run more than one group at a time.",
    [CAPABILITIES.UNLIMITED_COACH]: "Plus removes the monthly cap on coach messages.",
    [CAPABILITIES.IMPORT_SCREENSHOT]: "Plus reads a payment screenshot and fills the entry in.",
    [CAPABILITIES.IMPORT_SMS]: "Plus turns a block of bank SMS into transactions.",
    [CAPABILITIES.BROWSER_EXTENSION]: "Plus prices the web in your own goals.",
    [CAPABILITIES.WIDGETS]: "Plus puts your number on your home screen.",
    [CAPABILITIES.WRAPPED_EXPORT]: "Plus exports the trip recap as a shareable card.",
    [CAPABILITIES.WEIGHTED_SPLITS]: "Plus splits by income instead of down the middle.",
  };
  return reasons[capability] || "This is a Plus feature.";
}

module.exports = {
  CAPABILITIES,
  GROUP_GRANTABLE,
  FREE_LIMITS,
  can,
  explain,
  isPaywallEnabled,
  hasActivePlus,
  hasActiveTripPass,
};
