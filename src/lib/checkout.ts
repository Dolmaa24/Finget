import { paymentApi, type PaymentOrder, type ProductKey } from '../api';

/**
 * Razorpay Checkout.
 *
 * WHAT THIS DOES NOT DO: it never sees a card number, a UPI PIN, or any
 * instrument at all. Razorpay's script opens its own sheet, on its own origin,
 * and collects everything there. Finget hands it an order id and gets back a
 * "the sheet closed happily" callback.
 *
 * THAT CALLBACK GRANTS NOTHING. It is user-controlled and replayable — anyone
 * can call it from a console. The entitlement arrives when Razorpay's servers
 * POST a signed webhook to ours. All the callback does here is stop the
 * spinner and refetch, which is why `openCheckout` resolves with "closed" or
 * "dismissed" rather than "paid": the client genuinely does not know.
 */

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** Long enough for a slow connection, short enough to fail rather than hang. */
const LOAD_TIMEOUT_MS = 15000;

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: Record<string, string>) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

/**
 * Load Checkout lazily, once, and only when someone actually wants to pay.
 *
 * Deliberately not a `<script>` in index.html: it is a third-party script on
 * every page load for a thing most sessions never touch, and Finget's whole
 * posture is that nothing ships user data anywhere it does not have to.
 */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Couldn't reach the payment provider. Check your connection and try again."));
    }, LOAD_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      loading = null;
    };

    script.onload = () => {
      clearTimeout(timer);
      // `loading` stays resolved; window.Razorpay is the real cache.
      resolve();
    };
    script.onerror = () => {
      cleanup();
      script.remove();
      reject(new Error("Couldn't load the payment form. Check your connection and try again."));
    };

    document.head.appendChild(script);
  });

  return loading;
}

export type CheckoutOutcome =
  /** The sheet reported success. The entitlement is NOT yet confirmed. */
  | { outcome: 'closed'; order: PaymentOrder }
  /** The person backed out. Nothing happened. */
  | { outcome: 'dismissed'; order: PaymentOrder }
  | { outcome: 'failed'; order: PaymentOrder; reason: string };

/**
 * Open an order and hand it to Checkout.
 *
 * @param productKey what to buy — the server prices it
 * @param groupId    required for a Trip Pass
 */
export async function openCheckout(
  productKey: ProductKey,
  { groupId, prefill }: { groupId?: string; prefill?: { name?: string; email?: string } } = {}
): Promise<CheckoutOutcome> {
  const order = await paymentApi.order(productKey, groupId);
  await loadCheckout();

  // Captured into a local so the narrowing survives into the closure below.
  const Checkout = window.Razorpay;
  if (!Checkout) {
    throw new Error("The payment form didn't load. Try again in a moment.");
  }

  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const settle = (result: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const instance = new Checkout({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'Finget',
      description: order.label,
      prefill,
      theme: { color: '#5b54d6' },
      // "The sheet closed happily" — nothing more. See the note at the top.
      handler: () => settle({ outcome: 'closed', order }),
      modal: { ondismiss: () => settle({ outcome: 'dismissed', order }) },
    });

    instance.on('payment.failed', (payload) => {
      const reason =
        (payload as { error?: { description?: string } })?.error?.description ||
        'The payment did not go through.';
      settle({ outcome: 'failed', order, reason });
    });

    instance.open();
  });
}
