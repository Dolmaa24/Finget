const crypto = require("crypto");

/**
 * The payment gateway.
 *
 * PROVIDER-AGNOSTIC, same discipline as `whatsappService` and `visionClient`.
 * Razorpay is the right primary for India — UPI, cards, netbanking, and the
 * lowest friction for an Indian bank account — but everything Razorpay-shaped
 * lives inside the adapter below and controllers only ever see:
 *
 *     createOrder({ amountPaise, receipt, notes }) -> { orderId, amountPaise }
 *     verifyWebhook(rawBody, headers)              -> boolean
 *     parseWebhook(body)                           -> NormalisedEvent | null
 *
 * where a NormalisedEvent is `{ kind, orderId, paymentId, amountPaise, reason }`
 * and `kind` is one of "paid" | "failed" | "refunded" | "ignored".
 *
 * NO CARD DATA EVER REACHES THIS PROCESS. Razorpay Checkout runs in the user's
 * browser, collects the instrument on Razorpay's own infrastructure, and hands
 * us back an order id. Finget is not in the cardholder-data path and has no PCI
 * surface. Do not add an endpoint that accepts a card number "just for testing".
 *
 * DEGRADED MODE. With no keys, `isPaymentConfigured()` is false, order creation
 * returns a clear 503, and the pricing page says payments are not set up on this
 * server. Everything else — including every capability gate — works untouched.
 * A server without keys can still run the whole app; it just cannot sell.
 */

const API_BASE = "https://api.razorpay.com/v1";

/** Razorpay is usually fast; a slow order creation must not hang a request. */
const TIMEOUT_MS = 15000;

/* ------------------------------------------------------------------ */
/* Razorpay                                                            */
/* ------------------------------------------------------------------ */

const razorpayAdapter = {
  name: "razorpay",

  isConfigured(env) {
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  },

  /**
   * The key id is PUBLIC — the browser needs it to open Checkout. The secret
   * never leaves the server, and is used only for Basic auth here and for the
   * webhook HMAC.
   */
  publicKey(env) {
    return env.RAZORPAY_KEY_ID || null;
  },

  /**
   * True when the configured key is a TEST key.
   *
   * Razorpay prefixes test keys `rzp_test_` and live keys `rzp_live_`. Surfaced
   * so the UI can say so out loud: a payment form that looks real but charges
   * nothing needs to admit it, and one that is live needs to not be a surprise.
   */
  isTestMode(env) {
    return String(env.RAZORPAY_KEY_ID || "").startsWith("rzp_test_");
  },

  async createOrder({ amountPaise, receipt, notes }, env) {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString(
      "base64"
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          // Razorpay speaks paise natively, so nothing converts on this path.
          amount: amountPaise,
          currency: "INR",
          receipt,
          notes,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Razorpay ${response.status}: ${detail.slice(0, 300)}`);
      }

      const order = await response.json();
      return { orderId: order.id, amountPaise: order.amount };
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * HMAC-SHA256 of the RAW body, keyed on the webhook secret.
   *
   * Returns false when no secret is set. That is a REFUSAL, not a pass: this
   * endpoint grants paid entitlements, so an unverified webhook is a free
   * subscription for anyone who learns the URL, and "we hadn't set the secret
   * yet" is precisely how that ships.
   */
  verifyWebhook(rawBody, headers, env) {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return false;

    const received = headers["x-razorpay-signature"];
    if (typeof received !== "string" || received.length === 0) return false;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody || Buffer.alloc(0))
      .digest("hex");

    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(received, "hex");
    // Constant-time: a fast reject on the first differing byte leaks the
    // signature one comparison at a time.
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  },

  /**
   * Razorpay nests the payment two levels down and sends many event types on
   * the same endpoint. Anything we do not act on is normalised to "ignored"
   * rather than thrown, so an unrecognised event still gets a 200 and is not
   * retried forever.
   */
  parseWebhook(body) {
    const event = body?.event;
    const payment = body?.payload?.payment?.entity;

    if (!event) return null;

    const base = payment
      ? {
          orderId: payment.order_id || null,
          paymentId: payment.id || null,
          amountPaise: typeof payment.amount === "number" ? payment.amount : null,
        }
      : { orderId: null, paymentId: null, amountPaise: null };

    switch (event) {
      case "payment.captured":
        return { kind: "paid", ...base };
      case "payment.failed":
        return {
          kind: "failed",
          ...base,
          reason: payment?.error_description || payment?.error_reason || "Payment failed",
        };
      case "refund.created":
      case "refund.processed":
        return { kind: "refunded", ...base };
      default:
        // payment.authorized, order.paid, subscription.*, and everything else.
        // Capture is the only event that means money settled.
        return { kind: "ignored", event, ...base };
    }
  },
};

/**
 * No keys configured.
 *
 * Still verifies signatures and still parses, so a server with the webhook
 * exposed but no API keys rejects a forged delivery exactly as loudly as a
 * fully configured one.
 */
const noneAdapter = {
  name: "none",
  isConfigured: () => false,
  publicKey: () => null,
  isTestMode: () => true,
  verifyWebhook: razorpayAdapter.verifyWebhook,
  parseWebhook: razorpayAdapter.parseWebhook,
  async createOrder() {
    const error = new Error("Payments are not configured on this server.");
    error.status = 503;
    throw error;
  },
};

const ADAPTERS = { razorpay: razorpayAdapter, none: noneAdapter };

/* ------------------------------------------------------------------ */
/* Public interface                                                    */
/* ------------------------------------------------------------------ */

/** Read per call, not cached at import, so tests and config changes are seen. */
function adapterFor(env = process.env) {
  const requested = (env.PAYMENT_PROVIDER || "razorpay").toLowerCase();
  const adapter = ADAPTERS[requested] || razorpayAdapter;
  return adapter.isConfigured(env) ? adapter : noneAdapter;
}

const isPaymentConfigured = (env = process.env) => adapterFor(env).name !== "none";

/** Why payments are off, in words a developer can act on. Null when on. */
function paymentDisabledReason(env = process.env) {
  if (isPaymentConfigured(env)) return null;
  const missing = [];
  if (!env.RAZORPAY_KEY_ID) missing.push("RAZORPAY_KEY_ID");
  if (!env.RAZORPAY_KEY_SECRET) missing.push("RAZORPAY_KEY_SECRET");
  if (!env.RAZORPAY_WEBHOOK_SECRET) missing.push("RAZORPAY_WEBHOOK_SECRET");
  return missing.length ? `${missing.join(", ")} not set` : "no provider configured";
}

const publicKey = (env = process.env) => adapterFor(env).publicKey(env);
const isTestMode = (env = process.env) => adapterFor(env).isTestMode(env);
const createOrder = (args, env = process.env) => adapterFor(env).createOrder(args, env);
const verifyWebhook = (rawBody, headers, env = process.env) =>
  adapterFor(env).verifyWebhook(rawBody, headers, env);
const parseWebhook = (body, env = process.env) => adapterFor(env).parseWebhook(body);

module.exports = {
  isPaymentConfigured,
  paymentDisabledReason,
  publicKey,
  isTestMode,
  createOrder,
  verifyWebhook,
  parseWebhook,
  adapterFor,
};
