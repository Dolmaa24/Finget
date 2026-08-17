const User = require("../models/User");
const Group = require("../models/Group");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const { productFor } = require("./pricing");
const { fromPaise } = require("../utils/money");
const { inr } = require("../utils/format");

/**
 * Turning a settled payment into an entitlement.
 *
 * THIS IS THE ONLY PLACE THAT GRANTS ANYTHING, and it is reachable only from a
 * signature-verified webhook. Not from a client callback, not from a query
 * param, not from a success redirect. Razorpay's browser callback is a UI hint
 * that says "the sheet closed happily" — it is user-controlled, it can be
 * replayed, and a competent person can fire it without paying. The webhook comes
 * from Razorpay's servers, is HMAC-signed with a secret only we hold, and is
 * retried until acknowledged. One of those is evidence; the other is a rumour.
 *
 * IDEMPOTENT BY CONSTRUCTION. Razorpay retries until it gets a 2xx, so a
 * `payment.captured` will arrive more than once. The claim is a unique index on
 * `Payment.providerPaymentId`: whoever writes the id grants, everyone else
 * returns "already granted" and does nothing. Fourth use of this shape in the
 * codebase, after Reminder, BotAction and PushLog.
 */

const MS_DAY = 86400000;

/**
 * How long a Trip Pass lasts.
 *
 * Not a fixed number of days. The pass buys "Plus for this trip", and Trip
 * Wrapped is generated AFTER the trip ends — so a window that closed on the
 * end date would sell someone a recap they could not export. Thirty days past
 * the end covers the recap, the share cards, and the settling-up that always
 * drags on for a fortnight.
 *
 * A group with no end date yet (a trip still being planned) gets 90 days from
 * purchase, which is re-derived if dates are set later.
 */
function tripPassWindow(group, now = new Date()) {
  const end = group?.endDate ? new Date(group.endDate) : null;
  if (end && !Number.isNaN(end.getTime())) {
    return new Date(end.getTime() + 30 * MS_DAY);
  }
  return new Date(now.getTime() + 90 * MS_DAY);
}

/**
 * Extend personal Plus.
 *
 * Extends from the LATER of now and any existing expiry, so someone who renews
 * early is not punished by losing the remainder of what they already paid for.
 */
function plusUntil(user, days, now = new Date()) {
  const current = user?.entitlements?.planUntil ? new Date(user.entitlements.planUntil) : null;
  const from = current && current > now ? current : now;
  return new Date(from.getTime() + days * MS_DAY);
}

/* ------------------------------------------------------------------ */
/* The grant                                                          */
/* ------------------------------------------------------------------ */

/**
 * Apply a settled payment.
 *
 * @param {{orderId: string, paymentId: string, amountPaise: number|null}} event
 * @returns {Promise<{granted: boolean, reason?: string, kind?: string}>}
 */
async function grantForPayment(event, now = new Date()) {
  const { orderId, paymentId, amountPaise } = event;
  if (!orderId || !paymentId) return { granted: false, reason: "missing_ids" };

  const payment = await Payment.findOne({ providerOrderId: orderId });
  if (!payment) {
    // An order we never created. Could be another integration on the same
    // Razorpay account, or a forgery that somehow passed the signature.
    return { granted: false, reason: "unknown_order" };
  }

  /**
   * AMOUNT CHECK. The order was created server-side from the catalogue, so this
   * should always match — and if it ever does not, something is wrong enough
   * that granting would be the wrong response. Refusing here is what stops a
   * tampered order from buying a year of Plus for ₹1.
   */
  if (typeof amountPaise === "number" && amountPaise !== payment.amountPaise) {
    payment.status = "failed";
    payment.failureReason = `amount mismatch: charged ${amountPaise}, expected ${payment.amountPaise}`;
    await payment.save();
    return { granted: false, reason: "amount_mismatch" };
  }

  // The claim. Whoever writes the payment id does the work.
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, providerPaymentId: { $exists: false } },
    { $set: { providerPaymentId: paymentId, status: "paid" } },
    { new: true }
  );

  if (!claimed) {
    // A redelivery, or a concurrent worker. Either way it is already handled.
    return { granted: false, reason: "already_granted" };
  }

  const product = productFor(claimed.productKey);
  if (!product) {
    claimed.failureReason = `unknown product ${claimed.productKey}`;
    await claimed.save();
    return { granted: false, reason: "unknown_product" };
  }

  if (product.kind === "plus") {
    const user = await User.findById(claimed.userId).select("entitlements name").lean();
    if (!user) return { granted: false, reason: "unknown_user" };

    await User.findByIdAndUpdate(claimed.userId, {
      $set: {
        "entitlements.plan": "plus",
        "entitlements.planUntil": plusUntil(user, product.days, now),
      },
    });

    await notify(claimed.userId, {
      title: "Finget Plus is active",
      body: `${product.label} — ${inr(fromPaise(claimed.amountPaise))}. Unlimited groups and coach, import, the extension and widgets are all open now.`,
      href: "/settings",
    });
  } else if (product.kind === "trip_pass") {
    if (!claimed.groupId) return { granted: false, reason: "trip_pass_without_group" };

    const group = await Group.findById(claimed.groupId);
    if (!group) return { granted: false, reason: "unknown_group" };

    group.entitlement = {
      tripPass: true,
      grantedBy: claimed.userId,
      until: tripPassWindow(group, now),
    };
    await group.save();

    /**
     * Everyone in the trip is told, not just the buyer. The Trip Pass upgrading
     * the whole group is the entire point of it, and a member who never learns
     * they got Plus features cannot use them — which is also how the organiser's
     * ₹199 stops feeling like it bought anything.
     */
    for (const memberId of group.members || []) {
      const isBuyer = String(memberId) === String(claimed.userId);
      await notify(memberId, {
        title: isBuyer ? `Trip Pass active for ${group.name}` : `${group.name} just got a Trip Pass`,
        body: isBuyer
          ? "Everyone in this trip now has import, weighted splits and the Wrapped card — including anyone who joins later."
          : "Someone in the group paid for it. Import, weighted splits and the Wrapped card are open for this trip.",
        href: "/dashboard",
        groupId: group._id,
      });
    }
  }

  claimed.grantedAt = now;
  await claimed.save();

  return { granted: true, kind: product.kind };
}

/** Record a failed payment. Never throws — the webhook must still 200. */
async function recordFailure(event) {
  const { orderId, paymentId, reason } = event;
  if (!orderId) return { recorded: false };

  await Payment.findOneAndUpdate(
    { providerOrderId: orderId, status: "created" },
    {
      $set: {
        status: "failed",
        failureReason: String(reason || "Payment failed").slice(0, 300),
        ...(paymentId ? { providerPaymentId: paymentId } : {}),
      },
    }
  ).catch(() => undefined);

  return { recorded: true };
}

/**
 * A refund revokes what the payment granted.
 *
 * Deliberately reverses the entitlement rather than leaving it: a refunded Trip
 * Pass that still works is a free Trip Pass, and the honest thing after
 * returning someone's money is to return the product too.
 */
async function recordRefund(event) {
  const { orderId } = event;
  if (!orderId) return { revoked: false };

  const payment = await Payment.findOne({ providerOrderId: orderId });
  if (!payment || payment.status === "refunded") return { revoked: false };

  payment.status = "refunded";
  await payment.save();

  const product = productFor(payment.productKey);
  if (!product) return { revoked: false };

  if (product.kind === "plus") {
    /**
     * Ends the plan now rather than subtracting the days it bought. Working out
     * which of several overlapping purchases a refund belongs to is guesswork,
     * and guessing about somebody's paid access is worse than being plainly
     * conservative about it.
     */
    await User.findByIdAndUpdate(payment.userId, {
      $set: { "entitlements.plan": "free" },
      $unset: { "entitlements.planUntil": "" },
    });
  } else if (product.kind === "trip_pass" && payment.groupId) {
    await Group.findByIdAndUpdate(payment.groupId, {
      $set: { "entitlement.tripPass": false },
      $unset: { "entitlement.until": "", "entitlement.grantedBy": "" },
    });
  }

  return { revoked: true };
}

/** In-app notification. Best-effort: a failed notify must not fail a grant. */
async function notify(userId, { title, body, href, groupId }) {
  try {
    await Notification.create({
      userId,
      kind: "system",
      title,
      body,
      href,
      ...(groupId ? { groupId } : {}),
    });
  } catch (err) {
    console.error("Entitlement notification failed:", err.message);
  }
}

module.exports = { grantForPayment, recordFailure, recordRefund, tripPassWindow, plusUntil };
