import { cn } from '../lib/cn';
import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, AlertOctagon, Users, CalendarDays, Clock } from 'lucide-react';
import type { Affordability, RiskLevel } from '../api';
import { inr } from '../lib/format';
import { Badge, Progress } from './ui';

const RISK_CONFIG: Record<
  RiskLevel,
  { tone: 'safe' | 'warn' | 'risk'; icon: React.ReactNode; message: string; color: string }
> = {
  Safe: {
    tone: 'safe',
    icon: <ShieldCheck className="w-3.5 h-3.5" />,
    message: "You're on track.",
    color: 'var(--safe)',
  },
  Warning: {
    tone: 'warn',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    message: 'Running tight — watch the next few days.',
    color: 'var(--warn)',
  },
  Risky: {
    tone: 'risk',
    icon: <AlertOctagon className="w-3.5 h-3.5" />,
    message: 'Over budget. Savings are at risk.',
    color: 'var(--risk)',
  },
};

/**
 * The headline number: what is safe to spend today.
 * When `simulated` is supplied, the card previews the post-purchase state
 * alongside the real one instead of silently replacing it.
 */
export const AffordabilityCard: React.FC<{
  data: Affordability;
  simulated?: { safeDaily: number; remaining: number; risk: RiskLevel } | null;
  isGroup?: boolean;
  groupName?: string;
  memberCount?: number;
}> = ({ data, simulated, isGroup, groupName, memberCount }) => {
  const shown = simulated ?? data;
  const config = RISK_CONFIG[shown.risk] || RISK_CONFIG.Safe;

  const spentRatio =
    data.income > 0 ? Math.min(100, (data.expenses / data.income) * 100) : 0;

  return (
    <div
      className="glass-strong glass-sheen rounded-xl p-7 sm:p-8 relative overflow-hidden"
      style={{
        boxShadow: `var(--shadow-lg), inset 0 0 90px -60px ${config.color}`,
      }}
    >
      {/* Ambient wash tinted by risk */}
      <div
        aria-hidden
        className="absolute -top-24 -right-20 w-72 h-72 rounded-full blur-3xl opacity-25 pointer-events-none transition-colors duration-700"
        style={{ background: config.color }}
      />

      <div className="relative flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <p className="eyebrow">
            {isGroup ? 'Shared safe to spend today' : 'Safe to spend today'}
          </p>
          {isGroup && groupName && (
            <p className="text-[13px] text-ink-3 mt-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              {groupName} · {memberCount} member{memberCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <Badge tone={config.tone} icon={config.icon}>
          {shown.risk}
        </Badge>
      </div>

      <div className="relative">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span
            className="display numeric text-[52px] sm:text-[68px] leading-none transition-colors duration-500"
            style={{ color: config.color }}
          >
            {inr(Math.max(0, shown.safeDaily))}
          </span>
          {simulated && (
            <span className="text-base text-ink-3 line-through numeric">
              {inr(Math.max(0, data.safeDaily))}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-2 mt-3">{config.message}</p>
      </div>

      {/* Month burn-down */}
      <div className="relative mt-7 pt-6 border-t border-white/55">
        <div className="flex items-center justify-between text-[12px] text-ink-3 mb-2">
          <span>Spent this month</span>
          <span className="numeric">
            {inr(data.expenses)} of {inr(data.income)}
          </span>
        </div>
        <Progress
          value={spentRatio}
          tone={spentRatio > 90 ? 'risk' : spentRatio > 70 ? 'warn' : 'accent'}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
              Left this month
            </p>
            <p
              className={cn(
                'text-lg font-semibold numeric',
                shown.remaining < 0 ? 'text-risk' : 'text-ink'
              )}
            >
              {inr(shown.remaining)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
              Days left
            </p>
            <p className="text-lg font-semibold numeric text-ink flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-ink-3" />
              {data.daysLeftInMonth}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
              Savings target
            </p>
            <p className="text-lg font-semibold numeric text-ink">{inr(data.savingsTarget)}</p>
          </div>
        </div>

        {/* A number that dropped for a reason has to say the reason, or it reads
            as a bug. Only rendered when something is actually on hold. */}
        {data.held > 0 && (
          <Link
            to="/ledger"
            className="glass-well rounded-md px-4 py-3 mt-4 flex items-center gap-3 lift"
          >
            <Clock className="w-4 h-4 text-ink-3 shrink-0" />
            <p className="text-[12.5px] text-ink-2">
              <strong className="text-ink numeric">{inr(data.held)}</strong> is held in your
              48-hour vault, so it isn't counted as safe to spend.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
};
