import React, { useCallback, useEffect, useState } from 'react';
import { Clock, PiggyBank, ShieldCheck, Share2, Copy, Check } from 'lucide-react';
import {
  deflectionApi,
  shareApi,
  type Deflection,
  type Ledger,
  type ShareCard,
} from '../api';
import { useScope } from '../context/scopeStore';
import { useToast } from '../context/toastStore';
import { inr, paiseToRupees } from '../lib/format';
import {
  Button,
  EmptyState,
  PageHeader,
  Panel,
  SkeletonPanel,
  Stat,
} from '../components/ui';

/**
 * The Deflection Ledger.
 *
 * The one screen in a money app that only counts what went right. There is no
 * "spent anyway" figure here, no ratio, and no streak to break — the server
 * does not even send those numbers. A person who vaults ten things and buys
 * nine of them should still leave this page feeling like the tenth counted,
 * because it did.
 */

/** "in 6 hours" / "2 days ago" — relative, because the exact clock time is noise. */
function relative(iso?: string): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  const hours = Math.round(Math.abs(ms) / 3600000);
  const future = ms > 0;

  if (hours < 1) return future ? 'in under an hour' : 'just now';
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;

  const days = Math.round(hours / 24);
  return future ? `in ${days} day${days === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'} ago`;
}

const isReady = (hold: Deflection) => Boolean(hold.vaultUntil && new Date(hold.vaultUntil) <= new Date());

export const LedgerPage: React.FC = () => {
  const { scope, isFriends, group, context, groupId, bumpRevision } = useScope();
  const { toast } = useToast();

  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);

  const [card, setCard] = useState<ShareCard | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    deflectionApi
      .ledger(scope)
      .then(setLedger)
      .catch(() => setLedger(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, groupId]);

  useEffect(load, [load]);

  const decide = async (hold: Deflection, decision: 'deflected' | 'bought') => {
    setDeciding(hold._id);
    try {
      await deflectionApi.resolve(scope, hold._id, decision);
      // Safe-to-spend changed, so anything showing it has to refetch.
      bumpRevision();
      load();
      toast(
        decision === 'deflected'
          ? `${inr(paiseToRupees(hold.amountPaise))} back in your budget.`
          : 'Noted — log it as an expense when you get a chance.',
        'success'
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save that.', 'error');
    } finally {
      setDeciding(null);
    }
  };

  const share = async () => {
    setSharing(true);
    try {
      setCard(await shareApi.createDeflection(scope));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create the link.', 'error');
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

  const ready = (ledger?.holds || []).filter(isReady);
  const waiting = (ledger?.holds || []).filter((h) => !isReady(h));

  return (
    <div>
      <PageHeader
        eyebrow={isFriends ? `Friends mode · ${group?.name ?? ''}` : 'Personal mode'}
        title="Money you kept"
        subtitle={
          isFriends
            ? 'Everything this group considered buying and decided against.'
            : 'Everything you considered buying and decided against.'
        }
      />

      {loading ? (
        <div className="space-y-6">
          <SkeletonPanel height={140} />
          <SkeletonPanel height={200} />
        </div>
      ) : !ledger ? (
        <EmptyState
          icon={<PiggyBank className="w-6 h-6" />}
          title="Could not load the ledger"
          body="Check that the Finget server is running, then try again."
        />
      ) : (
        <div className="space-y-6">
          {/* The credit */}
          <Panel>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <Stat
                label="This month"
                value={<span className="numeric">{inr(ledger.month)}</span>}
                sub={`${ledger.count.month} decision${ledger.count.month === 1 ? '' : 's'}`}
                tone="safe"
              />
              <Stat
                label="This quarter"
                value={<span className="numeric">{inr(ledger.quarter)}</span>}
                sub={`${ledger.count.quarter} decision${ledger.count.quarter === 1 ? '' : 's'}`}
                tone="safe"
              />
              <Stat
                label="All time"
                value={<span className="numeric">{inr(ledger.allTime)}</span>}
                sub={`${ledger.count.allTime} decision${ledger.count.allTime === 1 ? '' : 's'}`}
              />
            </div>

            {/* The headline is the point: rupees are a number, a trip is a reason. */}
            {ledger.headline ? (
              <div className="glass-well rounded-md p-4 flex items-start gap-3">
                <span className="w-9 h-9 rounded-md bg-[var(--safe-wash)] text-safe flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink-2 leading-relaxed">
                    {inr(ledger.quarter)} kept this quarter — that's{' '}
                    <strong className="text-ink">{ledger.headline.text}</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">
                Nothing here yet. The next time you nearly buy something, put it in the
                vault instead and it will show up here.
              </p>
            )}

            {ledger.quarter > 0 && (
              <div className="mt-4">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={share}
                    loading={sharing}
                    icon={<Share2 className="w-4 h-4" />}
                  >
                    Share this
                  </Button>
                )}
              </div>
            )}
          </Panel>

          {/* Decisions that are due */}
          {ready.length > 0 && (
            <Panel>
              <h2 className="font-semibold text-ink mb-1.5">Ready to decide</h2>
              <p className="text-[13px] text-ink-2 mb-5">
                Two days are up. Either answer is fine — if you don't, the money comes back
                on its own.
              </p>
              <div className="space-y-3">
                {ready.map((hold) => (
                  <div key={hold._id} className="glass-well rounded-md p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink text-sm">{hold.label}</p>
                        <p className="text-[12.5px] text-ink-3 numeric">
                          {inr(paiseToRupees(hold.amountPaise))}
                          {hold.translationSnapshot?.headline
                            ? ` · was ${hold.translationSnapshot.headline}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={deciding === hold._id}
                          onClick={() => decide(hold, 'bought')}
                        >
                          I bought it
                        </Button>
                        <Button
                          size="sm"
                          loading={deciding === hold._id}
                          onClick={() => decide(hold, 'deflected')}
                        >
                          I skipped it
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Still counting down */}
          {waiting.length > 0 && (
            <Panel>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
                  <Clock className="w-[18px] h-[18px]" />
                </span>
                <h2 className="font-semibold text-ink">In the vault</h2>
              </div>
              <p className="text-[13px] text-ink-2 mb-5">
                <strong className="text-ink numeric">{inr(ledger.held)}</strong> held back
                from {isFriends ? "the group's" : 'your'} safe-to-spend while you think.
              </p>
              <div className="space-y-3">
                {waiting.map((hold) => (
                  <div
                    key={hold._id}
                    className="glass-well rounded-md px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-ink truncate">{hold.label}</p>
                      <p className="text-[12px] text-ink-3 numeric">
                        {inr(paiseToRupees(hold.amountPaise))}
                      </p>
                    </div>
                    <span className="text-[12.5px] text-ink-3 shrink-0">
                      ask {relative(hold.vaultUntil)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* The history */}
          {ledger.deflections.length > 0 && (
            <Panel>
              <h2 className="font-semibold text-ink mb-5">Walked away from</h2>
              <div className="space-y-2">
                {ledger.deflections.map((d) => (
                  <div
                    key={d._id}
                    className="flex items-center justify-between gap-3 py-2.5 border-b border-white/40 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-[13.5px] text-ink truncate">{d.label}</p>
                      {d.translationSnapshot?.headline && (
                        <p className="text-[12px] text-ink-3">
                          was {d.translationSnapshot.headline}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13.5px] font-semibold text-safe numeric">
                        +{inr(paiseToRupees(d.amountPaise))}
                      </p>
                      <p className="text-[11.5px] text-ink-3">{relative(d.decidedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
};
