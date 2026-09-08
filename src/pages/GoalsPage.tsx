import { cn } from '../lib/cn';
import React, { useState } from 'react';
import { Target, Plus, Trash2, TrendingUp, Flag, CalendarClock, Users } from 'lucide-react';
import { useScope } from '../context/scopeStore';
import { useToast } from '../context/toastStore';
import { useGoals, useGroupLiveSync } from '../hooks/useFinget';
import type { Goal } from '../api';
import { inr, pct, fullDate } from '../lib/format';
import { Avatar, Badge, Button, EmptyState, Field, Input, Modal, MoneyInput, PageHeader, Progress, SkeletonPanel } from '../components/ui';

const PRIORITY_TONE = {
  High: 'risk',
  Medium: 'warn',
  Low: 'safe',
} as const;

export const GoalsPage: React.FC = () => {
  const { isFriends, group } = useScope();
  const { toast } = useToast();
  const { goals, loading, create, update, contribute, remove } = useGoals();
  const [activeTab, setActiveTab] = useState<'goals' | 'wishlist'>('goals');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', targetAmount: '', deadline: '' });
  const [saving, setSaving] = useState(false);
  const [fundingId, setFundingId] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState('');

  useGroupLiveSync();

  const submitGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !(Number(form.targetAmount) > 0)) return;
    setSaving(true);
    try {
      await create({
        name: form.name.trim(),
        targetAmount: Number(form.targetAmount),
        deadline: form.deadline || undefined,
        priority: 'Medium',
      });
      toast('Goal created.', 'success');
      setForm({ name: '', targetAmount: '', deadline: '' });
      setCreateOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create goal.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitFunds = async (goal: Goal) => {
    const amount = Number(fundAmount);
    if (!(amount > 0)) return;
    try {
      await contribute(goal._id, amount);
      toast(`${inr(amount)} added to ${goal.name}.`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add funds.', 'error');
    } finally {
      setFundingId(null);
      setFundAmount('');
    }
  };

  const cyclePriority = async (goal: Goal) => {
    const next =
      goal.priority === 'High' ? 'Medium' : goal.priority === 'Medium' ? 'Low' : 'High';
    await update(goal._id, { priority: next });
  };

  const deleteGoal = async (goal: Goal) => {
    try {
      await remove(goal._id);
      toast(`${goal.name} removed.`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete.', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={isFriends ? `Friends mode · ${group?.name ?? ''}` : 'Personal mode'}
        title={isFriends ? 'Shared goals' : 'Goals'}
        subtitle={
          isFriends
            ? 'Save toward something together — every contribution is credited to whoever made it.'
            : 'Give your savings a destination and watch the pace.'
        }
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
            New goal
          </Button>
        }
      />

      <div className="flex border-b border-black/5 mb-6 gap-2">
        <button
          type="button"
          className={cn("px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors", activeTab === 'goals' ? "border-[var(--brand)] text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}
          onClick={() => setActiveTab('goals')}
        >
          Savings Goals
        </button>
        <button
          type="button"
          className={cn("px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors", activeTab === 'wishlist' ? "border-[var(--brand)] text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}
          onClick={() => setActiveTab('wishlist')}
        >
          Wishlist
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <SkeletonPanel key={i} height={230} />
          ))}
        </div>
      ) : goals.filter(g => activeTab === 'wishlist' ? g.name.startsWith('🎁 Wishlist:') : !g.name.startsWith('🎁 Wishlist:')).length === 0 ? (
        <EmptyState
          icon={<Target className="w-6 h-6" />}
          title={activeTab === 'wishlist' ? "Your wishlist is empty" : "No goals yet"}
          body={
            activeTab === 'wishlist' 
              ? 'Save items from the web using the Finget browser extension.'
              : isFriends
              ? 'Set a shared target — a trip, a deposit, a rainy-day fund.'
              : 'A goal turns leftover money into progress instead of drift.'
          }
          action={
            activeTab === 'goals' ? (
              <Button onClick={() => setCreateOpen(true)} icon={<Plus className="w-4 h-4" />}>
                Create your first goal
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 stagger">
          {goals.filter(g => activeTab === 'wishlist' ? g.name.startsWith('🎁 Wishlist:') : !g.name.startsWith('🎁 Wishlist:')).map((goal) => {
            const percent = pct(goal.currentAmount || 0, goal.targetAmount);
            const complete = percent >= 100;
            const remaining = Math.max(0, goal.targetAmount - (goal.currentAmount || 0));

            // Per-member contribution rollup for shared goals.
            const byPerson = new Map<string, number>();
            (goal.contributions || []).forEach((c) => {
              const name = typeof c.userId === 'object' ? c.userId?.name || 'Member' : 'Member';
              byPerson.set(name, (byPerson.get(name) || 0) + c.amount);
            });

            return (
              <div key={goal._id} className="glass glass-sheen rounded-lg p-6 group flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        'w-9 h-9 rounded-md flex items-center justify-center shrink-0',
                        complete
                          ? 'bg-[var(--safe-wash)] text-safe'
                          : 'bg-[var(--accent-wash)] text-accent'
                      )}
                    >
                      <Target className="w-[18px] h-[18px]" />
                    </span>
                    <h3 className="font-semibold text-ink truncate">{goal.name}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteGoal(goal)}
                    aria-label={`Delete ${goal.name}`}
                    className="p-1.5 rounded-pill text-ink-4 hover:text-risk hover:bg-white/60 transition-all
                               opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-end justify-between gap-3 mb-3">
                  <div>
                    <p className="text-2xl font-semibold numeric text-ink">
                      {inr(goal.currentAmount || 0)}
                    </p>
                    <p className="text-[12px] text-ink-3 numeric">of {inr(goal.targetAmount)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => cyclePriority(goal)}
                    title="Change priority"
                    className="shrink-0"
                  >
                    <Badge tone={PRIORITY_TONE[goal.priority]} icon={<Flag className="w-3 h-3" />}>
                      {goal.priority}
                    </Badge>
                  </button>
                </div>

                <Progress value={percent} tone={complete ? 'safe' : 'accent'} />

                <div className="flex items-center justify-between mt-2.5 text-[12px] text-ink-3">
                  <span className="numeric">{percent}%</span>
                  {goal.deadline && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="w-3.5 h-3.5" />
                      {fullDate(goal.deadline)}
                    </span>
                  )}
                </div>

                {isFriends && byPerson.size > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/55">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-2.5 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Contributions
                    </p>
                    <div className="space-y-2">
                      {Array.from(byPerson.entries()).map(([name, amount]) => (
                        <div key={name} className="flex items-center gap-2">
                          <Avatar name={name} size={22} />
                          <span className="text-[12.5px] text-ink-2 flex-1 truncate">{name}</span>
                          <span className="text-[12.5px] font-semibold numeric text-ink">
                            {inr(amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-5">
                  {fundingId === goal._id ? (
                    <div className="flex gap-2 animate-pop">
                      <MoneyInput
                        autoFocus
                        value={fundAmount}
                        onChange={(e) => setFundAmount(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitFunds(goal)}
                        placeholder="0"
                        className="h-10"
                      />
                      <Button size="sm" onClick={() => submitFunds(goal)}>
                        Add
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setFundingId(null)}>
                        ✕
                      </Button>
                    </div>
                  ) : complete ? (
                    <p className="text-center text-[13px] font-semibold text-safe py-2">
                      🎉 Goal reached
                    </p>
                  ) : (
                    <Button
                      variant="glass"
                      size="sm"
                      className="w-full"
                      icon={<TrendingUp className="w-4 h-4" />}
                      onClick={() => {
                        setFundingId(goal._id);
                        setFundAmount('');
                      }}
                    >
                      Add funds · {inr(remaining)} to go
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={isFriends ? 'New shared goal' : 'New goal'}
        subtitle={isFriends ? `Everyone in ${group?.name} can contribute.` : undefined}
      >
        <form onSubmit={submitGoal} className="space-y-4">
          <Field label="What are you saving for?">
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={isFriends ? 'Goa trip' : 'New laptop'}
              required
            />
          </Field>
          <Field label="Target amount">
            <MoneyInput
              value={form.targetAmount}
              onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
              placeholder="50000"
              min="1"
              required
            />
          </Field>
          <Field label="Deadline (optional)" hint="Adding one unlocks pace warnings in Insights.">
            <Input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2.5 pt-1">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create goal
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
