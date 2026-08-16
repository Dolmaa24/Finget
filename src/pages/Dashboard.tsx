import { cn } from '../lib/cn';
import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Lightbulb,
  ArrowRight,
  Wallet,
  TrendingUp,
  Users,
  Scale,
  Activity,
  PiggyBank,
} from 'lucide-react';
import { useAuth } from '../context/authStore';
import { useScope } from '../context/scopeStore';
import {
  useAffordability,
  useBalances,
  useGroupLiveSync,
  useInsights,
  useTransactions,
} from '../hooks/useFinget';
import { AffordabilityCard } from '../components/AffordabilityCard';
import { ScenarioSimulator } from '../components/ScenarioSimulator';
import { GoalsTracker } from '../components/GoalsTracker';
import { inr, relativeDate } from '../lib/format';
import { Avatar, Badge, Button, EmptyState, Panel, SkeletonPanel, Stat } from '../components/ui';
import type { RiskLevel } from '../api';

type Preview = { safeDaily: number; remaining: number; risk: RiskLevel } | null;

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { isFriends, group } = useScope();
  const { data: affordability, loading, error } = useAffordability();
  const { data: transactions } = useTransactions();
  const { data: insightData } = useInsights();
  const { data: sheet } = useBalances();
  const [preview, setPreview] = useState<Preview>(null);

  // Live updates when another member acts.
  useGroupLiveSync();

  const handlePreview = useCallback((next: Preview) => setPreview(next), []);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const myBalance = sheet.balances.find((b) => b.userId === user?._id);
  const recent = transactions.slice(0, 5);
  const topInsight = insightData.insights[0];

  if (error) {
    return (
      <Panel className="mt-6">
        <EmptyState
          icon={<Activity className="w-6 h-6" />}
          title="Could not load your dashboard"
          body={error}
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-7">
      <header className="pt-2">
        <p className="eyebrow mb-2">
          {isFriends ? `Friends mode · ${group?.name ?? ''}` : 'Personal mode'}
        </p>
        <h1 className="display text-[36px] sm:text-[46px]">
          {isFriends ? (
            <>
              {group?.emoji} {group?.name}
            </>
          ) : (
            <>
              {greeting}, {firstName}
            </>
          )}
        </h1>
        <p className="text-ink-2 mt-2">
          {isFriends
            ? 'One shared wallet. Everything below is pooled across members.'
            : 'Clear head, safe spending.'}
        </p>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <SkeletonPanel height={320} className="xl:col-span-2" />
          <SkeletonPanel height={320} />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          {/* -------- Primary column -------- */}
          <div className="xl:col-span-2 space-y-6">
            <AffordabilityCard
              data={affordability}
              simulated={preview}
              isGroup={isFriends}
              groupName={group?.name}
              memberCount={affordability.memberCount}
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
              <Stat
                label="Income"
                value={inr(affordability.income)}
                sub={isFriends ? 'Pooled' : 'This month'}
                icon={<Wallet className="w-3.5 h-3.5" />}
              />
              <Stat
                label="Spent"
                value={inr(affordability.expenses)}
                sub={`${affordability.daysLeftInMonth} days left`}
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                tone={affordability.expenses > affordability.income * 0.8 ? 'warn' : 'neutral'}
              />
              <Stat
                label="Left"
                value={inr(affordability.remaining)}
                tone={affordability.remaining < 0 ? 'risk' : 'safe'}
                icon={<PiggyBank className="w-3.5 h-3.5" />}
              />
              {isFriends ? (
                <Stat
                  label="Your balance"
                  value={inr(myBalance?.balance ?? 0)}
                  sub={
                    (myBalance?.balance ?? 0) > 0
                      ? 'You are owed'
                      : (myBalance?.balance ?? 0) < 0
                        ? 'You owe'
                        : 'Settled'
                  }
                  tone={
                    (myBalance?.balance ?? 0) > 0
                      ? 'safe'
                      : (myBalance?.balance ?? 0) < 0
                        ? 'risk'
                        : 'neutral'
                  }
                  icon={<Scale className="w-3.5 h-3.5" />}
                />
              ) : (
                <Stat
                  label="Health"
                  value={insightData.healthScore?.score ?? '—'}
                  sub={insightData.healthScore?.label}
                  tone="accent"
                  icon={<Activity className="w-3.5 h-3.5" />}
                />
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ScenarioSimulator affordability={affordability} onPreview={handlePreview} />

              {/* Recent activity */}
              <div className="glass glass-sheen rounded-lg p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold text-ink">Recent activity</h3>
                  <Link
                    to="/transactions"
                    className="text-[13px] font-semibold text-accent hover:opacity-75 inline-flex items-center gap-1"
                  >
                    All <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {recent.length === 0 ? (
                  <EmptyState
                    title="Nothing logged yet"
                    body="Use the Add button up top to record your first entry."
                    className="!py-8"
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {recent.map((t) => {
                      const payer = typeof t.paidBy === 'object' ? t.paidBy?.name : undefined;
                      return (
                        <li key={t._id} className="flex items-center gap-3">
                          {isFriends && payer ? (
                            <Avatar name={payer} size={34} />
                          ) : (
                            <span
                              className={cn(
                                'w-[34px] h-[34px] rounded-sm flex items-center justify-center shrink-0',
                                t.type === 'income'
                                  ? 'bg-[var(--safe-wash)] text-safe'
                                  : 'bg-white/50 text-ink-3'
                              )}
                            >
                              <Wallet className="w-4 h-4" />
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-medium text-ink truncate">
                              {t.note || t.category}
                            </p>
                            <p className="text-[11.5px] text-ink-3">
                              {isFriends && payer ? `${payer} · ` : ''}
                              {relativeDate(t.date)}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'text-sm font-semibold numeric shrink-0',
                              t.type === 'income' ? 'text-safe' : 'text-ink'
                            )}
                          >
                            {t.type === 'income' ? '+' : '−'}
                            {inr(t.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* -------- Secondary column -------- */}
          <div className="space-y-6">
            <GoalsTracker isGroup={isFriends} />

            {isFriends && sheet.balances.length > 0 && (
              <div className="glass glass-sheen rounded-lg p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
                      <Users className="w-[18px] h-[18px]" />
                    </span>
                    <h3 className="font-semibold text-ink">Who owes what</h3>
                  </div>
                  <Link
                    to="/split"
                    className="text-[13px] font-semibold text-accent hover:opacity-75 inline-flex items-center gap-1"
                  >
                    Settle <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <ul className="space-y-3">
                  {sheet.balances.map((b) => (
                    <li key={b.userId} className="flex items-center gap-3">
                      <Avatar name={b.name} size={32} />
                      <span className="flex-1 text-[13.5px] text-ink truncate">
                        {b.userId === user?._id ? 'You' : b.name}
                      </span>
                      <Badge
                        tone={b.balance > 0.01 ? 'safe' : b.balance < -0.01 ? 'risk' : 'neutral'}
                      >
                        {b.balance > 0.01
                          ? `owed ${inr(b.balance)}`
                          : b.balance < -0.01
                            ? `owes ${inr(Math.abs(b.balance))}`
                            : 'settled'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {topInsight && (
              <div className="glass glass-sheen rounded-lg p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-9 h-9 rounded-md bg-[var(--warn-wash)] text-warn flex items-center justify-center">
                    <Lightbulb className="w-[18px] h-[18px]" />
                  </span>
                  <h3 className="font-semibold text-ink">Top insight</h3>
                </div>
                <p className="text-[13.5px] font-semibold text-ink mb-1.5">{topInsight.title}</p>
                <p className="text-[13px] text-ink-2 leading-relaxed">{topInsight.description}</p>
                {topInsight.actionable_tip && (
                  <p className="text-[13px] text-accent font-medium mt-3">
                    → {topInsight.actionable_tip}
                  </p>
                )}
                <Link to="/insights">
                  <Button variant="glass" size="sm" className="mt-5 w-full">
                    See all insights
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
