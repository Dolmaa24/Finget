import React, { useEffect, useState } from 'react';
import { Sparkles, Check, Users, ShieldCheck } from 'lucide-react';
import { paymentApi, type Group, type PaymentConfig } from '../api';
import { openCheckout } from '../lib/checkout';
import { useAuth } from '../context/authStore';
import { useToast } from '../context/toastStore';
import { Badge, Button } from './ui';

/**
 * The Trip Pass, offered where a trip organiser actually is.
 *
 * THIS IS THE COMMERCIALLY IMPORTANT SURFACE, and it is deliberately not a line
 * on a pricing page. Students do not subscribe; trip organisers pay once to
 * make the money part of a trip painless. One ₹199 purchase upgrades four to
 * six people, and those people meet the personal paywall later, on their own.
 * Burying that in Settings would be selling the wrong thing in the wrong place.
 *
 * The copy sells the group outcome, not a feature list: "everyone in this trip",
 * "including whoever joins later". What the organiser is buying is not
 * software — it is not having to be the person who chases everyone.
 */
export const TripPassCard: React.FC<{ group: Group; onChange: () => void }> = ({
  group,
  onChange,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      paymentApi.config().then(setConfig).catch(() => setConfig(null));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const product = config?.products.find((p) => p.key === 'trip_pass');
  const active = Boolean(group.entitlement?.tripPass);

  const buy = async () => {
    setBusy(true);
    try {
      const result = await openCheckout('trip_pass', {
        groupId: group._id,
        prefill: { name: user?.name, email: user?.email },
      });

      if (result.outcome === 'dismissed') return;
      if (result.outcome === 'failed') {
        toast(result.reason, 'error');
        return;
      }

      // The webhook is what actually grants it, and it lands a beat later.
      toast('Payment received — confirming it now. This usually takes a moment.', 'success');
      setTimeout(() => onChange(), 3500);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not start the payment.', 'error');
    } finally {
      setBusy(false);
    }
  };

  /* Already bought — say so and stop selling. */
  if (active) {
    return (
      <div className="glass-well rounded-md p-4 mb-5 ring-1 ring-[var(--safe-wash)]">
        <div className="flex items-center gap-2 mb-1.5">
          <Check className="w-4 h-4 text-safe" />
          <p className="text-[13px] font-semibold text-ink">Trip Pass active</p>
          <Badge tone="safe">Everyone</Badge>
        </div>
        <p className="text-[12px] text-ink-2 leading-relaxed">
          Import, weighted splits and the Wrapped card are open for {group.name} — for every
          member, including anyone who joins from here.
          {group.entitlement?.until && (
            <span className="block text-ink-3 mt-1">
              Covered until {new Date(group.entitlement.until).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              })}
              , which is a month past the trip so the Wrapped card still works.
            </span>
          )}
        </p>
      </div>
    );
  }

  // Nothing to sell on a server without payment keys — say nothing rather than
  // showing a button that 503s.
  if (!config?.available || !product) return null;

  return (
    <div className="glass-well rounded-md p-4 mb-5 ring-1 ring-[var(--accent-wash)]">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <p className="text-[13px] font-semibold text-ink">Trip Pass</p>
        {config.testMode && <Badge tone="warn">Test mode</Badge>}
      </div>

      <p className="text-[12.5px] text-ink-2 leading-relaxed mb-3">
        Screenshot and SMS import, splitting by income, and the Wrapped card at the end —
        unlocked for <strong className="text-ink">everyone in {group.name}</strong>, including
        whoever joins later. One payment, once, by whoever's organising.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" loading={busy} onClick={buy} icon={<Users className="w-4 h-4" />}>
          Get the pass · ₹{Math.round(product.amountPaise / 100).toLocaleString('en-IN')}
        </Button>
        <span className="text-[11.5px] text-ink-3">
          {group.members.length} {group.members.length === 1 ? 'member' : 'members'} covered
        </span>
      </div>

      {config.testMode && (
        <p className="text-[11px] text-ink-3 mt-2.5 flex items-start gap-1.5 leading-relaxed">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
          This server is on Razorpay test keys — no real money moves, and no card details ever
          reach Finget.
        </p>
      )}
    </div>
  );
};
