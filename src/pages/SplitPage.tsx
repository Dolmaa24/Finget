import { cn } from '../lib/cn';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Scale,
  ArrowRight,
  HandCoins,
  CheckCircle2,
  Users,
  History,
  Sparkles,
  Receipt,
} from 'lucide-react';
import { groupApi } from '../api';
import { useScope } from '../context/scopeStore';
import { useAuth } from '../context/authStore';
import { useToast } from '../context/toastStore';
import { useBalances, useActivity, useGroupLiveSync } from '../hooks/useFinget';
import { inr, relativeDate } from '../lib/format';
import { Avatar, Badge, Button, EmptyState, Field, Modal, MoneyInput, PageHeader, Panel, Progress, SkeletonPanel, Stat } from '../components/ui';

const ACTIVITY_ICON = {
  expense: <Receipt className="w-4 h-4" />,
  income: <HandCoins className="w-4 h-4" />,
  settlement: <CheckCircle2 className="w-4 h-4" />,
  goal: <Sparkles className="w-4 h-4" />,
};

export const SplitPage: React.FC = () => {
  const { isFriends, group, groupId, bumpRevision } = useScope();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: sheet, loading, reload } = useBalances();
  const { data: activity } = useActivity();

  const [settleFor, setSettleFor] = useState<{
    from: string;
    to: string;
    fromName: string;
    toName: string;
    amount: number;
  } | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useGroupLiveSync();

  const myBalance = useMemo(
    () => sheet.balances.find((b) => b.userId === user?._id)?.balance ?? 0,
    [sheet.balances, user?._id]
  );

  const myTransfers = useMemo(
    () => sheet.transfers.filter((t) => t.from === user?._id || t.to === user?._id),
    [sheet.transfers, user?._id]
  );

  const maxPaid = useMemo(
    () => Math.max(1, ...sheet.paidByMember.map((p) => p.paid)),
    [sheet.paidByMember]
  );

  if (!isFriends || !groupId) {
    return (
      <div>
        <PageHeader title="Split & settle" subtitle="Available in Friends mode." />
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="Switch to a group first"
          body="Split & settle works on a shared wallet. Create or join a group, then flip the mode switch to Friends."
          action={<Button onClick={() => navigate('/friends')}>Go to Groups</Button>}
        />
      </div>
    );
  }

  const openSettle = (t: (typeof sheet.transfers)[number]) => {
    setSettleFor(t);
    setSettleAmount(String(t.amount));
  };

  const confirmSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleFor || !groupId) return;
    const amount = Number(settleAmount);
    if (!(amount > 0)) return;

    setSaving(true);
    try {
      await groupApi.settle(groupId, {
        from: settleFor.from,
        to: settleFor.to,
        amount,
      });
      toast(`Recorded ${inr(amount)} from ${settleFor.fromName} to ${settleFor.toName}.`, 'success');
      setSettleFor(null);
      bumpRevision();
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not record settlement.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={`Friends mode · ${group?.name ?? ''}`}
        title="Split & settle"
        subtitle="Who fronted what, who owes whom, and the fewest transfers that clear it."
      />

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonPanel height={260} className="lg:col-span-2" />
          <SkeletonPanel height={260} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Headline */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger">
            <Stat
              label="Your position"
              value={inr(Math.abs(myBalance))}
              sub={
                myBalance > 0.01
                  ? 'You are owed this'
                  : myBalance < -0.01
                    ? 'You owe this'
                    : 'All settled'
              }
              tone={myBalance > 0.01 ? 'safe' : myBalance < -0.01 ? 'risk' : 'neutral'}
              icon={<Scale className="w-3.5 h-3.5" />}
            />
            <Stat
              label="Group spend"
              value={inr(sheet.totalGroupSpend)}
              sub="All shared expenses"
              icon={<Receipt className="w-3.5 h-3.5" />}
            />
            <Stat
              label="Open transfers"
              value={sheet.transfers.length}
              sub={sheet.transfers.length === 0 ? 'Nothing outstanding' : 'To fully settle up'}
              tone={sheet.transfers.length === 0 ? 'safe' : 'warn'}
              icon={<ArrowRight className="w-3.5 h-3.5" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              {/* Settle-up plan */}
              <Panel>
                <div className="flex items-center gap-2.5 mb-5">
                  <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
                    <HandCoins className="w-[18px] h-[18px]" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-ink">Settle up</h3>
                    <p className="text-[12px] text-ink-3">
                      The minimum set of payments that clears every debt.
                    </p>
                  </div>
                </div>

                {sheet.transfers.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-6 h-6" />}
                    title="Everyone is square"
                    body="No outstanding balances in this group."
                    className="!py-10"
                  />
                ) : (
                  <div className="space-y-3">
                    {sheet.transfers.map((t, i) => {
                      const involvesMe = t.from === user?._id || t.to === user?._id;
                      return (
                        <div
                          key={`${t.from}-${t.to}-${i}`}
                          className={cn(
                            'glass-well rounded-md p-4 flex items-center gap-3 flex-wrap',
                            involvesMe && 'ring-1 ring-[var(--accent-wash)]'
                          )}
                        >
                          <Avatar name={t.fromName} size={36} />
                          <div className="flex items-center gap-2 text-[13.5px] min-w-0 flex-1">
                            <span className="font-medium text-ink truncate">
                              {t.from === user?._id ? 'You' : t.fromName}
                            </span>
                            <ArrowRight className="w-4 h-4 text-ink-4 shrink-0" />
                            <span className="font-medium text-ink truncate">
                              {t.to === user?._id ? 'you' : t.toName}
                            </span>
                          </div>
                          <Avatar name={t.toName} size={36} />
                          <span className="text-[15px] font-semibold numeric text-ink ml-auto">
                            {inr(t.amount)}
                          </span>
                          <Button size="sm" variant="glass" onClick={() => openSettle(t)}>
                            Mark paid
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {myTransfers.length > 0 && (
                  <p className="text-[12.5px] text-ink-3 mt-4">
                    {myTransfers.length} of these involve you.
                  </p>
                )}
              </Panel>

              {/* Who paid what */}
              <Panel>
                <h3 className="font-semibold text-ink mb-1">Who has been paying</h3>
                <p className="text-[12px] text-ink-3 mb-5">
                  Total each member has fronted for the group.
                </p>

                {sheet.paidByMember.length === 0 ? (
                  <EmptyState title="No shared expenses yet" className="!py-8" />
                ) : (
                  <div className="space-y-4">
                    {[...sheet.paidByMember]
                      .sort((a, b) => b.paid - a.paid)
                      .map((m) => (
                        <div key={m.userId}>
                          <div className="flex items-center gap-2.5 mb-2">
                            <Avatar name={m.name} size={28} />
                            <span className="text-[13.5px] text-ink flex-1 truncate">
                              {m.userId === user?._id ? 'You' : m.name}
                            </span>
                            <span className="text-[13.5px] font-semibold numeric text-ink">
                              {inr(m.paid)}
                            </span>
                          </div>
                          <Progress value={(m.paid / maxPaid) * 100} height={6} />
                        </div>
                      ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              <Panel>
                <h3 className="font-semibold text-ink mb-5">Balances</h3>
                <div className="space-y-3">
                  {sheet.balances.map((b) => (
                    <div key={b.userId} className="flex items-center gap-3">
                      <Avatar name={b.name} size={32} />
                      <span className="flex-1 text-[13.5px] text-ink truncate">
                        {b.userId === user?._id ? 'You' : b.name}
                      </span>
                      <Badge
                        tone={b.balance > 0.01 ? 'safe' : b.balance < -0.01 ? 'risk' : 'neutral'}
                      >
                        {b.balance > 0.01
                          ? `+${inr(b.balance)}`
                          : b.balance < -0.01
                            ? `−${inr(Math.abs(b.balance))}`
                            : 'settled'}
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="text-[11.5px] text-ink-3 mt-4 leading-relaxed">
                  A positive balance means the group owes that person; negative means they owe
                  the group.
                </p>
              </Panel>

              <Panel>
                <div className="flex items-center gap-2.5 mb-5">
                  <span className="w-9 h-9 rounded-md bg-white/50 text-ink-3 flex items-center justify-center">
                    <History className="w-[18px] h-[18px]" />
                  </span>
                  <h3 className="font-semibold text-ink">Group activity</h3>
                </div>

                {activity.length === 0 ? (
                  <EmptyState title="Nothing yet" className="!py-8" />
                ) : (
                  <ul className="space-y-3.5 max-h-[420px] overflow-y-auto scroll-slim pr-1">
                    {activity.slice(0, 20).map((item) => (
                      <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3">
                        <span
                          className={cn(
                            'w-8 h-8 rounded-sm flex items-center justify-center shrink-0 mt-0.5',
                            item.kind === 'settlement'
                              ? 'bg-[var(--safe-wash)] text-safe'
                              : item.kind === 'goal'
                                ? 'bg-[var(--accent-wash)] text-accent'
                                : 'bg-white/50 text-ink-3'
                          )}
                        >
                          {ACTIVITY_ICON[item.kind]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-ink leading-snug">
                            {item.kind === 'settlement' ? (
                              <>
                                <strong>{item.actor}</strong> paid{' '}
                                <strong>{item.counterparty}</strong> {inr(item.amount)}
                              </>
                            ) : item.kind === 'goal' ? (
                              <>
                                <strong>{item.actor}</strong> set up goal{' '}
                                <strong>{item.name}</strong>
                              </>
                            ) : (
                              <>
                                <strong>{item.actor}</strong>{' '}
                                {item.kind === 'income' ? 'added income' : 'paid'}{' '}
                                {inr(item.amount)}
                                {item.category ? ` · ${item.category}` : ''}
                              </>
                            )}
                          </p>
                          <p className="text-[11.5px] text-ink-3 mt-0.5">
                            {relativeDate(item.date)}
                            {item.splitCount ? ` · split ${item.splitCount} ways` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={!!settleFor}
        onClose={() => setSettleFor(null)}
        title="Record a payment"
        subtitle={
          settleFor
            ? `${settleFor.fromName} pays ${settleFor.toName}. This only records the transfer — move the money in your own banking app.`
            : undefined
        }
      >
        <form onSubmit={confirmSettle} className="space-y-4">
          <Field label="Amount paid" hint="Adjust if only part of the balance was settled.">
            <MoneyInput
              autoFocus
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value)}
              min="0"
              step="0.01"
            />
          </Field>
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="ghost" onClick={() => setSettleFor(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Record payment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
