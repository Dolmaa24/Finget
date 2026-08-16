import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, TrendingUp, Sparkles } from 'lucide-react';
import { groupApi, type TripStatus, type PaceStatus } from '../api';
import { getSocket } from '../lib/socket';
import { inr } from '../lib/format';
import { Progress } from './ui';
import { cn } from '../lib/cn';

/**
 * The live trip burn.
 *
 * A group checks this several times a day, which makes it the retention
 * surface for a trip — and the reason they open Finget instead of arguing in
 * the group chat. It updates over the existing group socket room, so a
 * member's screen moves the moment someone else pays for lunch.
 *
 * TONE. "Running hot" is an observation about the pot, never a verdict about
 * the group. On day two nobody has overspent; they have spent early, which is
 * what trips do.
 */

const PACE: Record<PaceStatus, { tone: 'safe' | 'warn' | 'risk' | 'accent'; icon: React.ReactNode }> = {
  under: { tone: 'safe', icon: <Sparkles className="w-[18px] h-[18px]" /> },
  on: { tone: 'accent', icon: <TrendingUp className="w-[18px] h-[18px]" /> },
  over: { tone: 'warn', icon: <Flame className="w-[18px] h-[18px]" /> },
};

const TONE_CLASS = {
  safe: 'bg-[var(--safe-wash)] text-safe',
  warn: 'bg-[var(--warn-wash)] text-warn',
  risk: 'bg-[var(--risk-wash)] text-risk',
  accent: 'bg-[var(--accent-wash)] text-accent',
};

export const TripBurnStrip: React.FC<{ groupId: string }> = ({ groupId }) => {
  const [status, setStatus] = useState<TripStatus | null>(null);

  const load = useCallback(() => {
    groupApi
      .tripStatus(groupId)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [groupId]);

  useEffect(load, [load]);

  /**
   * Live updates. The server pushes a fully computed status on every group
   * expense, so nothing is recalculated here — the strip cannot disagree with
   * the dashboard about how the trip is going.
   */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onStatus = (next: TripStatus) => setStatus(next);
    socket.on('trip:status', onStatus);
    return () => {
      socket.off('trip:status', onStatus);
    };
  }, [groupId]);

  if (!status || !status.isTrip) return null;

  const pace = PACE[status.paceStatus];
  const timeProgress = status.started ? (status.dayIndex / status.totalDays) * 100 : 0;

  return (
    <div className="glass glass-sheen rounded-lg p-5 mb-6 animate-rise">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'w-9 h-9 rounded-md flex items-center justify-center shrink-0',
            TONE_CLASS[pace.tone]
          )}
        >
          {pace.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
            <p className="font-semibold text-ink text-[15px]">
              {status.emoji} {status.name}
            </p>
            <p className="text-[12.5px] text-ink-3 numeric">
              {inr(status.spent)}
              {status.pot > 0 && <> of {inr(status.pot)}</>}
            </p>
          </div>

          <p className="text-[13px] text-ink-2 mb-3">{status.message}</p>

          {status.pot > 0 && (
            <div className="relative">
              <Progress value={Math.min(100, status.percentSpent ?? 0)} tone={pace.tone} />
              {/* Where the trip is, against where the money is. The gap between
                  this marker and the bar IS the pace, made visible. */}
              {status.started && !status.finished && (
                <span
                  aria-hidden
                  className="absolute top-0 h-[8px] w-[2px] bg-[var(--ink-3)] opacity-60 rounded-full"
                  style={{ left: `calc(${Math.min(100, timeProgress)}% - 1px)` }}
                  title="Where the trip is"
                />
              )}
            </div>
          )}

          <div className="flex items-center gap-4 flex-wrap mt-3 text-[12px] text-ink-3">
            {status.pot > 0 && status.daysRemaining > 0 && (
              <span className="numeric">
                {inr(status.dailyAllowance)}/day left
              </span>
            )}
            {status.pot > 0 && status.started && (
              <span className="numeric">
                heading for {inr(status.projectedFinal)}
              </span>
            )}
            {status.finished && (
              <Link to="/wrapped" className="text-accent font-semibold ml-auto">
                See the recap →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
