import React from 'react';
import { Link } from 'react-router-dom';
import { Target, ArrowRight } from 'lucide-react';
import { useGoals } from '../hooks/useFinget';
import { inr, pct } from '../lib/format';
import { Progress, EmptyState, Button } from './ui';

export const GoalsTracker: React.FC<{ isGroup?: boolean }> = ({ isGroup }) => {
  const { goals, loading } = useGoals();
  const top = goals.slice(0, 4);

  return (
    <div className="glass glass-sheen rounded-lg p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-md bg-[var(--safe-wash)] text-safe flex items-center justify-center">
            <Target className="w-[18px] h-[18px]" />
          </span>
          <h3 className="font-semibold text-ink">{isGroup ? 'Shared goals' : 'Goals'}</h3>
        </div>
        <Link
          to="/goals"
          className="text-[13px] font-semibold text-accent hover:opacity-75 transition-opacity inline-flex items-center gap-1"
        >
          Manage <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-12 rounded-sm" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <EmptyState
          title="No goals yet"
          body={
            isGroup
              ? 'Set a shared target — everyone can chip in.'
              : 'Give your savings a destination.'
          }
          action={
            <Link to="/goals">
              <Button size="sm">Create a goal</Button>
            </Link>
          }
          className="!py-8"
        />
      ) : (
        <div className="space-y-5">
          {top.map((goal) => {
            const percent = pct(goal.currentAmount || 0, goal.targetAmount);
            return (
              <div key={goal._id}>
                <div className="flex justify-between items-end mb-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink truncate">{goal.name}</p>
                    <p className="text-[12px] text-ink-3 numeric">
                      {inr(goal.currentAmount || 0)} of {inr(goal.targetAmount)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ink-2 numeric shrink-0">
                    {percent}%
                  </span>
                </div>
                <Progress
                  value={percent}
                  tone={percent >= 100 ? 'safe' : 'accent'}
                  height={6}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
