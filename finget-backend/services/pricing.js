/**
 * What Finget sells, and for how much.
 *
 * THE SERVER IS THE ONLY PLACE A PRICE EXISTS. Order creation takes a product
 * KEY from the client — `plus_monthly`, never `amount: 99`. A client that can
 * name its own amount can name ₹1, and the webhook that later grants the
 * entitlement has no way to know the order was wrong. This file is what makes
 * that class of bug unrepresentable.
 *
 * Amounts are in PAISE, which is also what Razorpay's API expects, so there is
 * no conversion anywhere in the payment path. `utils/money` still owns the two
 * rupee/paise conversions; these are constants, not arithmetic.
 */

const PRODUCTS = {
  /* ---------------- Personal Plus ---------------- */
  plus_monthly: {
    key: "plus_monthly",
    kind: "plus",
    label: "Finget Plus, monthly",
    amountPaise: 9900,
    /** Days of Plus this grants. Renewal is a fresh purchase, not a mandate. */
    days: 31,
    blurb: "Unlimited groups and coach, import, extension, widgets, weighted splits.",
  },

  plus_yearly: {
    key: "plus_yearly",
    kind: "plus",
    label: "Finget Plus, yearly",
    amountPaise: 89900,
    days: 366,
    blurb: "Everything in Plus, for about nine months' price.",
  },

  /* ---------------- Trip Pass ---------------- */
  /**
   * The important one. Students do not subscribe; trip organisers pay ₹199 once
   * to make the money part of a trip painless, and that single purchase upgrades
   * every member of the group — four to six people who then meet the personal
   * paywall later, on their own.
   *
   * It needs a `groupId` at order time, and `days` is deliberately absent: the
   * window is derived from the trip's own end date so the Wrapped card, which is
   * generated AFTER the trip, is still inside what was paid for. See
   * `entitlementService.tripPassWindow`.
   */
  trip_pass: {
    key: "trip_pass",
    kind: "trip_pass",
    label: "Trip Pass",
    amountPaise: 19900,
    requiresGroup: true,
    blurb: "Plus features for this whole trip, for everyone in it. One payment.",
  },
};

/** @returns {object|null} the product, or null for anything not in the catalogue. */
const productFor = (key) => PRODUCTS[key] || null;

/** What the pricing page renders. Safe to expose — it is a price list. */
const catalogue = () =>
  Object.values(PRODUCTS).map((p) => ({
    key: p.key,
    kind: p.kind,
    label: p.label,
    amountPaise: p.amountPaise,
    requiresGroup: Boolean(p.requiresGroup),
    blurb: p.blurb,
  }));

module.exports = { PRODUCTS, productFor, catalogue };
