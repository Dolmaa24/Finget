import React, { useCallback, useEffect, useState } from 'react';
import { Trophy, Share2, Copy, Check, Sparkles, ArrowRight } from 'lucide-react';
import { groupApi, type ShareCard, type Wrapped } from '../api';
import { useScope } from '../context/scopeStore';
import { useToast } from '../context/toastStore';
import { usePaywall } from '../context/paywallStore';
import { inr } from '../lib/format';
import { Button, EmptyState, PageHeader, Panel, SkeletonPanel, Stat } from '../components/ui';

/**
 * Trip Wrapped.
 *
 * Every figure and badge here is computed deterministically on the server; the
 * one AI sentence sits on top and changes nothing underneath it. The card each
 * member shares carries their OWN name, because a generic recap does not get
 * posted to a group chat and a personalised one does.
 */
export const WrappedPage: React.FC = () => {
  const { isFriends, group, groupId } = useScope();
  const { toast } = useToast();
  const { showPaywallFor } = usePaywall();

  const [wrapped, setWrapped] = useState<Wrapped | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [card, setCard] = useState<ShareCard | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    groupApi
      .wrapped(groupId)
      .then(setWrapped)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the recap.'))
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(load, [load]);

  const share = async () => {
    if (!groupId) return;
    setSharing(true);
    try {
      setCard(await groupApi.shareWrapped(groupId));
    } catch (err) {
      /**
       * A group-scoped gate, so the sheet leads with the Trip Pass: ₹199 once
       * for the whole trip beats ₹99/month each, and the recap they are looking
       * at is exactly the moment that argument lands. The recap itself stays
       * on screen — only the card was refused.
       */
      if (!showPaywallFor(err, { groupId: groupId || undefined, groupName: group?.name })) {
        toast(err instanceof Error ? err.message : 'Could not create the link.', 'error');
      }
    } finally {
      setSharing(false);
    }
  };

  const copyLink = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Could not copy the link.', 'error');
    }
  };

  if (!isFriends || !groupId) {
    return (
      <div>
        <PageHeader eyebrow="Trip Wrapped" title="Wrapped" />
        <EmptyState
          icon={<Trophy className="w-6 h-6" />}
          title="Switch to a trip first"
          body="Wrapped recaps a trip. Pick a group in Friends mode and set its dates to see one."
        />
      </div>
    );
  }

  const mine = wrapped?.perMember.find((m) => m.memberId === wrapped.viewerId);

  return (
    <div>
      <PageHeader
        eyebrow={`Friends mode · ${group?.name ?? ''}`}
        title={wrapped ? `${wrapped.emoji} ${wrapped.tripName}` : 'Wrapped'}
        subtitle={
          wrapped
            ? `${wrapped.days} days · ${wrapped.memberCount} people · ${inr(wrapped.totalSpent)}`
            : 'How the trip actually went.'
        }
      />

      {loading ? (
        <div className="space-y-6">
          <SkeletonPanel height={160} />
          <SkeletonPanel height={220} />
        </div>
      ) : error || !wrapped ? (
        <EmptyState
          icon={<Trophy className="w-6 h-6" />}
          title="Nothing to wrap up yet"
          body={error || 'Log some expenses on this trip and the recap appears here.'}
        />
      ) : (
        <div className="space-y-6">
          {/* The one AI sentence, clearly a garnish rather than a source. */}
          {wrapped.oneLiner && (
            <Panel>
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center shrink-0">
                  <Sparkles className="w-[18px] h-[18px]" />
                </span>
                <p className="text-[15px] text-ink leading-relaxed italic">"{wrapped.oneLiner}"</p>
              </div>
            </Panel>
          )}

          <Panel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Total" value={<span className="numeric">{inr(wrapped.totalSpent)}</span>} />
              <Stat label="Days" value={wrapped.days} />
              <Stat label="People" value={wrapped.memberCount} />
              {wrapped.topCategory && (
                <Stat label="Most on" value={wrapped.topCategory.name} tone="accent" />
              )}
            </div>

            {wrapped.biggestExpense && (
              <p className="text-[13px] text-ink-2 mt-4">
                Biggest single expense:{' '}
                <strong className="text-ink numeric">{inr(wrapped.biggestExpense.amount)}</strong>{' '}
                on {wrapped.biggestExpense.category.toLowerCase()}.
              </p>
            )}
          </Panel>

          {/* Badges */}
          {wrapped.superlatives.length > 0 && (
            <Panel>
              <h2 className="font-semibold text-ink mb-5">Awards</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {wrapped.superlatives.map((s) => (
                  <div key={s.title} className="glass-well rounded-md p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1.5">
                      {s.title}
                    </p>
                    {s.name && <p className="font-semibold text-ink">{s.name}</p>}
                    <p className="text-[12.5px] text-ink-2">{s.detail}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Paid vs owed */}
          <Panel>
            <h2 className="font-semibold text-ink mb-5">Who paid what</h2>
            <div className="space-y-2">
              {wrapped.perMember.map((m) => (
                <div
                  key={m.memberId}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-white/40 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-ink truncate">
                      {m.name}
                      {m.memberId === wrapped.viewerId && (
                        <span className="text-ink-3 text-[12px]"> · you</span>
                      )}
                    </p>
                    <p className="text-[12px] text-ink-3 numeric">
                      paid {inr(m.paid)} · owed {inr(m.share)}
                    </p>
                  </div>
                  <p
                    className={`text-[13.5px] font-semibold numeric shrink-0 ${
                      m.net > 0 ? 'text-safe' : m.net < 0 ? 'text-risk' : 'text-ink-3'
                    }`}
                  >
                    {m.net > 0 ? '+' : ''}
                    {inr(m.net)}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          {/* Settle up */}
          {wrapped.settleUp.length > 0 && (
            <Panel>
              <h2 className="font-semibold text-ink mb-1.5">To square up</h2>
              <p className="text-[13px] text-ink-2 mb-5">
                The fewest transfers that clear everything.
              </p>
              <div className="space-y-2">
                {wrapped.settleUp.map((t, i) => (
                  <div
                    key={`${t.fromName}-${t.toName}-${i}`}
                    className="glass-well rounded-md px-4 py-3 flex items-center gap-3"
                  >
                    <span className="text-[13.5px] text-ink">{t.fromName}</span>
                    <ArrowRight className="w-4 h-4 text-ink-3 shrink-0" />
                    <span className="text-[13.5px] text-ink">{t.toName}</span>
                    <span className="ml-auto text-[13.5px] font-semibold numeric text-ink">
                      {inr(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* The share, with the viewer's own name on it */}
          <Panel>
            <h2 className="font-semibold text-ink mb-1.5">Share your card</h2>
            <p className="text-[13px] text-ink-2 mb-5">
              {mine
                ? `Yours says "${mine.firstName}'s ${wrapped.tripName}". Everyone gets their own.`
                : 'Everyone in the trip gets their own version.'}
            </p>

            {card ? (
              <div className="glass-well rounded-md p-4">
                {card.imageUrl && (
                  <img
                    src={card.imageUrl}
                    alt=""
                    className="w-full rounded-sm border border-white/70 mb-3"
                    loading="lazy"
                  />
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] text-ink-3 truncate font-mono min-w-0">
                    {card.url}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={copyLink}
                    icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={share} loading={sharing} icon={<Share2 className="w-4 h-4" />}>
                Make my card
              </Button>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
};
