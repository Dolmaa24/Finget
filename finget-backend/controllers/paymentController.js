const Payment = require("../models/Payment");
const User = require("../models/User");
const Group = require("../models/Group");
const { isGroupMember } = require("../utils/groupAuth");
const { productFor, catalogue } = require("../services/pricing");
const {
  isPaymentConfigured,
  paymentDisabledReason,
  publicKey,
  isTestMode,
  createOrder,
  verifyWebhook,
  parseWebhook,
} = require("../services/paymentProvider");
const {
  grantForPayment,
  recordFailure,
  recordRefund,
} = require("../services/entitlementService");
const { isPaywallEnabled } = require("../services/entitlements");
const { coachUsageFor } = require("../services/coachQuota");

/**
 * Buying things.
 *
 * Two rules govern this whole file:
 *
 *   1. THE CLIENT NEVER NAMES A PRICE. Order creation takes a product key and
 *      looks the amount up in `services/pricing.js`. A client that can send
 *      `amount: 1` and have it honoured is a client that buys a year for ₹1.
 *
 *   2. NOTHING IS GRANTED OUTSIDE THE WEBHOOK. There is deliberately no
 *      "confirm my payment" endpoint taking a client-supplied signature. The
 *      browser callback closes the sheet and refreshes the UI; the entitlement
 *      arrives when Razorpay's servers tell ours it did.
 */

/**
 * `GET /api/payments/config` — the pricing page, and whether we can sell.
 *
 * The key id is public by design; Checkout needs it in the browser. The secret
 * and the webhook secret never appear in any response.
 */
exports.getConfig = async (req, res) => {
  try {
    const [user, usage] = await Promise.all([
      User.findById(req.user).select("entitlements").lean(),
      coachUsageFor(req.user),
    ]);

    res.json({
      available: isPaymentConfigured(),
      unavailableReason: paymentDisabledReason(),
      publicKey: publicKey(),
      /**
       * Surfaced so the UI can say it out loud. A payment form that looks real
       * and charges nothing has to admit it, and one that is live must not be a
       * surprise.
       */
      testMode: isTestMode(),
      /** Gates are open until this is on; the UI explains rather than blocks. */
      paywallEnabled: isPaywallEnabled(),
      products: catalogue(),
      plan: {
        plan: user?.entitlements?.plan || "free",
        until: user?.entitlements?.planUntil || null,
      },
      coach: usage,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/payments/order` — open an order for a catalogue product.
 *
 * Creates the `Payment` row BEFORE calling the provider, so an order that
 * succeeds at Razorpay and then fails to reach us still has a local record.
 * The reverse order would leak paid orders the webhook could not resolve.
 */
exports.createPaymentOrder = async (req, res) => {
  try {
    if (!isPaymentConfigured()) {
      return res.status(503).json({
        msg: "Payments aren't set up on this server yet.",
        reason: paymentDisabledReason(),
      });
    }

    const product = productFor(req.body.productKey);
    if (!product) {
      return res.status(400).json({ msg: "Unknown product." });
    }

    let group = null;
    if (product.requiresGroup) {
      if (!req.body.groupId) {
        return res.status(400).json({ msg: "A Trip Pass needs a group." });
      }
      group = await Group.findById(req.body.groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
      if (group.entitlement?.tripPass && (!group.entitlement.until || new Date(group.entitlement.until) > new Date())) {
        // Stops someone paying twice for a trip that is already covered.
        return res.status(409).json({ msg: `${group.name} already has an active Trip Pass.` });
      }
    }

    const order = await createOrder({
      amountPaise: product.amountPaise,
      receipt: `fgt_${Date.now()}`,
      notes: {
        productKey: product.key,
        userId: String(req.user),
        ...(group ? { groupId: String(group._id) } : {}),
      },
    });

    await Payment.create({
      userId: req.user,
      productKey: product.key,
      groupId: group ? group._id : undefined,
      amountPaise: product.amountPaise,
      providerOrderId: order.orderId,
    });

    res.status(201).json({
      orderId: order.orderId,
      amountPaise: product.amountPaise,
      currency: "INR",
      productKey: product.key,
      label: product.label,
      /** Checkout needs both of these in the browser. */
      keyId: publicKey(),
      testMode: isTestMode(),
    });
  } catch (err) {
    if (err.status === 503) return res.status(503).json({ msg: err.message });
    console.error("Order creation failed:", err.message);
    res.status(502).json({ msg: "Could not start the payment. Please try again." });
  }
};

/**
 * `POST /api/payments/webhook` — the only thing that grants an entitlement.
 *
 * SIGNATURE FIRST. This endpoint hands out paid features, so an unsigned or
 * unverifiable delivery is refused before the payload is even parsed. With no
 * webhook secret configured, verification fails closed.
 *
 * Always 200 for anything that passed verification, even an event we ignore or
 * a grant that could not be applied — Razorpay retries non-2xx until it gives
 * up, and a permanent condition like "unknown product" will never resolve by
 * being retried a hundred times. The failure is logged and recorded on the
 * Payment row instead, where it can be found.
 */
exports.receiveWebhook = async (req, res) => {
  if (!verifyWebhook(req.rawBody, req.headers)) {
    return res.sendStatus(401);
  }

  let event;
  try {
    event = parseWebhook(req.body);
  } catch (err) {
    console.error("Payment webhook parse failed:", err.message);
    return res.sendStatus(200);
  }

  if (!event) return res.sendStatus(200);

  try {
    if (event.kind === "paid") {
      const result = await grantForPayment(event);
      if (!result.granted && result.reason !== "already_granted") {
        console.error(`Payment ${event.paymentId} not granted: ${result.reason}`);
      }
    } else if (event.kind === "failed") {
      await recordFailure(event);
    } else if (event.kind === "refunded") {
      await recordRefund(event);
    }
  } catch (err) {
    // Logged, not retried into: see the note above.
    console.error(`Payment webhook handling failed: ${err.message}`);
  }

  res.sendStatus(200);
};

/**
 * `GET /api/payments/history` — this person's own receipts.
 *
 * Scoped to `req.user` with no id parameter anywhere, so there is no shape of
 * request that reads somebody else's payments.
 */
exports.getHistory = async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("groupId", "name emoji")
      .lean();

    res.json(
      payments.map((p) => ({
        _id: p._id,
        productKey: p.productKey,
        label: productFor(p.productKey)?.label || p.productKey,
        amountPaise: p.amountPaise,
        status: p.status,
        group: p.groupId ? { name: p.groupId.name, emoji: p.groupId.emoji } : null,
        grantedAt: p.grantedAt || null,
        createdAt: p.createdAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
