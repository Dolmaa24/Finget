import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Check, Sparkles, ShieldCheck, Receipt } from 'lucide-react';
import { paymentApi, type PaymentConfig, type ProductKey, type Receipt as ReceiptRow } from '../api';
import { openCheckout } from '../lib/checkout';
import { useAuth } from '../context/authStore';
import { useToast } from '../context/toastStore';
import { inr, relativeDate } from '../lib/format';
import { Badge, Panel, SkeletonPanel } from './ui';

/**
 * Your plan, what it costs, and what you have paid.
 *
 * The pricing page is deliberately the QUIET surface. The Trip Pass — the
 * purchase that actually converts — lives inside Trip Mode where an organiser
 * is standing; this is where someone comes to check what they are on, upgrade
 * deliberately, or find a receipt.
 */

const STATUS_TONE: Record<ReceiptRow['status'], 'safe' | 'warn' | 'risk' | 'neutral'> = {
  paid: 'safe',
  created: 'neutral',
  failed: 'risk',
  refunded: 'warn',
};

export const PlanSettings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [busy, setBusy] = useState<ProductKey | null>(null);

  const load = useCallback(async () => {
    try {
      const [next, history] = await Promise.all([
        paymentApi.config(),
        paymentApi.history().catch(() => []),
      ]);
      setConfig(next);
      setReceipts(history);
    } catch {
      setConfig((prev) => prev);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const buy = async (productKey: ProductKey) => {
    setBusy(productKey);
    try {
      const result = await openCheckout(productKey, {
        prefill: { name: user?.name, email: user?.email },
      });
      if (result.outcome === 'dismissed') return;
      if (result.outcome === 'failed') {
        toast(result.reason, 'error');
        return;
      }
      // The grant lands on a webhook, a beat after the sheet closes.
      toast('Payment received — confirming it now. This usually takes a moment.', 'success');
      await refreshUser();
      setTimeout(() => void load(), 4000);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not start the payment.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <div className="flex items-center gap-2.5 mb-1.5">
      <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
        <CreditCard className="w-[18px] h-[18px]" />
      </span>
      <h2 className="font-semibold text-ink">Your plan</h2>
      {config?.plan.plan === 'plus' && (
        <Badge tone="safe" icon={<Check className="w-3 h-3" />}>Plus</Badge>
      )}
      {config?.testMode && <Badge tone="warn">Test mode</Badge>}
    </div>
  );

  if (!config) {
    return (
      <Panel>
        {header}
        <SkeletonPanel height={110} />
      </Panel>
    );
  }

  const isPlus = config.plan.plan === 'plus';
  const plusProducts = config.products.filter((p) => p.kind === 'plus');

  return (
    <Panel>
      {header}

      {/* ---------- Where you are ---------- */}
      {isPlus ? (
        <div className="glass-well rounded-md p-4 mb-5">
          <p className="text-[13px] text-ink">
            You're on <strong>Finget Plus</strong>
            {config.plan.until && (
              <>
                {' '}until{' '}
                <strong className="numeric">
                  {new Date(config.plan.until).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </strong>
              </>
            )}
            .
          </p>
          <p className="text-[12px] text-ink-2 mt-1 leading-relaxed">
            Renewing early adds to what's left rather than replacing it.
          </p>
        </div>
      ) : (
        <div className="mb-5">
          <p className="text-[13px] text-ink-2 leading-relaxed mb-3">
            You're on the free plan, which stays genuinely useful forever: your daily number,
            manual entry, goals, the what-if simulator and the rule-based insights are never
            gated.
          </p>
          {/* The meter, before anyone hits it. */}
          {!config.coach.unlimited && config.coach.limit != null && (
            <p className="text-[12.5px] text-ink-2">
              AI coach this month:{' '}
              <strong className="text-ink numeric">
                {Math.min(config.coach.used, config.coach.limit)} of {config.coach.limit}
              </strong>{' '}
              used.
            </p>
          )}
        </div>
      )}

      {/* ---------- What's for sale ---------- */}
      {!config.available ? (
        <p className="text-[12.5px] text-ink-2 leading-relaxed">
          Payments aren't set up on this server, so there's nothing to buy.
          {config.unavailableReason && (
            <span className="block text-ink-3 mt-1.5">
              For whoever runs it: {config.unavailableReason}.
            </span>
          )}
        </p>
      ) : (
        !isPlus && (
          <div className="space-y-2.5">
            {plusProducts.map((product) => (
              <button
                key={product.key}
                type="button"
                disabled={busy !== null}
                onClick={() => void buy(product.key)}
                className="w-full text-left glass-well rounded-md p-4 hover:bg-white/60
                           transition-colors disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13.5px] font-semibold text-ink">{product.label}</span>
                  <span className="text-[14px] font-semibold numeric text-accent">
                    {inr(product.amountPaise / 100)}
                  </span>
                </div>
                <p className="text-[12px] text-ink-2 mt-1 leading-relaxed">{product.blurb}</p>
              </button>
            ))}

            <p className="text-[11.5px] text-ink-3 leading-relaxed flex items-start gap-2 pt-1">
              <Sparkles className="w-3.5 h-3.5 shrink-0 mt-px text-accent" />
              Organising a trip? A <strong>Trip Pass</strong> is a one-off ₹199 that covers
              everyone in that trip — find it on the group itself, under Groups.
            </p>
          </div>
        )
      )}

      {/* ---------- Trust line ---------- */}
      {config.available && (
        <p className="text-[11.5px] text-ink-3 mt-4 leading-relaxed flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px text-safe" />
          Card details are collected by Razorpay and never reach Finget.
          {config.testMode && ' This server is on test keys, so no real money moves.'}
        </p>
      )}

      {/* ---------- Receipts ---------- */}
      {receipts.length > 0 && (
        <div className="mt-5 pt-4 border-t border-white/50">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="w-4 h-4 text-ink-3" />
            <p className="text-[13px] font-semibold text-ink">Receipts</p>
          </div>
          <ul className="space-y-2">
            {receipts.slice(0, 6).map((r) => (
              <li key={r._id} className="flex items-center gap-3 text-[12.5px]">
                <span className="text-ink flex-1 min-w-0 truncate">
                  {r.label}
                  {r.group && <span className="text-ink-3"> · {r.group.name}</span>}
                </span>
                <span className="numeric text-ink-2">{inr(r.amountPaise / 100)}</span>
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                <span className="text-ink-3 hidden sm:inline">{relativeDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
};
