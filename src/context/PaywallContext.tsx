import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { paymentApi, type PaymentConfig, type ProductKey } from '../api';
import { openCheckout } from '../lib/checkout';
import { useAuth } from './authStore';
import { useToast } from './toastStore';
import { PaywallSheet } from '../components/ui';
import { PaywallContext, GROUP_GRANTABLE, isPaywallError } from './paywallStore';

/**
 * One paywall sheet for the whole app.
 *
 * Every gate lives on the server and every refusal comes back as a 403 carrying
 * a `capability`. Rather than teaching forty call sites what each capability
 * means, they hand the error here and this decides what to offer:
 *
 *   - a group-scoped capability inside a group → offer the Trip Pass FIRST,
 *     because ₹199 once for the whole table is the better answer for a trip
 *     than ₹99/month each, and it is the purchase the organiser actually wants.
 *   - anything else → personal Plus.
 *
 * After a sheet closes on a completed payment it refreshes the user, so the
 * entitlement appears the moment the webhook has landed. If it has not landed
 * yet the UI simply says so rather than pretending.
 */
export const PaywallProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{
    reason: string;
    capability?: string;
    groupId?: string;
    groupName?: string;
    usage?: { current: number; limit: number } | null;
  } | null>(null);

  /** Loaded once and cached — the price list does not change mid-session. */
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      paymentApi.config().then(setConfig).catch(() => setConfig(null));
    }, 0);
    return () => clearTimeout(timer);
  }, [user]);

  const showPaywall = useCallback(
    (args: {
      reason: string;
      capability?: string;
      groupId?: string;
      groupName?: string;
      usage?: { current: number; limit: number } | null;
    }) => setSheet(args),
    []
  );

  const showPaywallFor = useCallback(
    (error: unknown, context?: { groupId?: string; groupName?: string }) => {
      if (!isPaywallError(error)) return false;

      setSheet({
        reason: error.message,
        capability: error.capability,
        groupId: context?.groupId,
        groupName: context?.groupName,
        usage:
          typeof error.limit === 'number' && typeof error.current === 'number'
            ? { current: error.current, limit: error.limit }
            : null,
      });
      return true;
    },
    []
  );

  const buy = useCallback(
    async (productKey: ProductKey, groupId?: string) => {
      setBusy(true);
      try {
        const result = await openCheckout(productKey, {
          groupId,
          prefill: { name: user?.name, email: user?.email },
        });

        if (result.outcome === 'dismissed') return;
        if (result.outcome === 'failed') {
          toast(result.reason, 'error');
          return;
        }

        /**
         * The sheet closed happily — which is NOT the same as the entitlement
         * existing. That arrives on a signed webhook from Razorpay's servers,
         * and can land a second or two later. So: refresh, and say plainly
         * that it is being confirmed rather than claiming it is done.
         */
        setSheet(null);
        toast('Payment received — confirming it now. This usually takes a moment.', 'success');
        await refreshUser();
        setTimeout(() => void refreshUser(), 4000);
        paymentApi.config().then(setConfig).catch(() => undefined);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not start the payment.', 'error');
      } finally {
        setBusy(false);
      }
    },
    [user, toast, refreshUser]
  );

  const value = useMemo(() => ({ showPaywall, showPaywallFor }), [showPaywall, showPaywallFor]);

  const productFor = (key: ProductKey) => config?.products.find((p) => p.key === key) || null;
  const tripPassProduct = productFor('trip_pass');
  const plusProduct = productFor('plus_monthly');

  /** A Trip Pass only helps if the blocked capability is one it can grant. */
  const tripPassApplies =
    Boolean(sheet?.groupId) &&
    Boolean(sheet?.capability && GROUP_GRANTABLE.has(sheet.capability)) &&
    Boolean(tripPassProduct);

  return (
    <PaywallContext.Provider value={value}>
      {children}

      <PaywallSheet
        open={Boolean(sheet)}
        onClose={() => setSheet(null)}
        reason={sheet?.reason || ''}
        usage={sheet?.usage}
        busy={busy}
        unavailableReason={config && !config.available ? config.unavailableReason : null}
        tripPass={
          tripPassApplies && tripPassProduct
            ? {
                groupName: sheet?.groupName || 'this trip',
                amountPaise: tripPassProduct.amountPaise,
                onBuy: () => void buy('trip_pass', sheet?.groupId),
              }
            : null
        }
        plus={
          config?.available && plusProduct
            ? { amountPaise: plusProduct.amountPaise, onBuy: () => void buy('plus_monthly') }
            : null
        }
      />
    </PaywallContext.Provider>
  );
};
