import React from 'react';
import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';
import { useGoals } from '../hooks/useGoals';
import { useScope } from '../context/ScopeContext';

const colors = ['bg-primary', 'bg-blue-500', 'bg-amber-500', 'bg-violet-500'];

export const GoalsTracker: React.FC = () => {
  const { context, groupId } = useScope();
  const { goals, loading } = useGoals({ context, groupId: groupId || undefined });

  const top = goals.slice(0, 4);

  return (
    <div className="bg-navy-800 rounded-3xl p-6 border border-slate-700/50 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-slate-100">Goals</h3>
        </div>
        <Link to="/goals" className="text-xs text-primary font-medium hover:underline">
          Manage
        </Link>
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : top.length === 0 ? (
        <p className="text-slate-500 text-sm">No goals yet. Create one on the Goals page.</p>
      ) : (
        <div className="space-y-6">
          {top.map((goal, i) => {
            const pct = Math.min(
              100,
              Math.round(((goal.currentAmount || 0) / Math.max(1, goal.targetAmount)) * 100)
            );
            return (
              <div key={goal._id}>
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <h4 className="text-sm font-medium text-slate-200">{goal.name}</h4>
                    <p className="text-xs text-slate-400">
                      ₹{(goal.currentAmount || 0).toLocaleString()} / ₹{goal.targetAmount.toLocaleString()}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-slate-300">{pct}%</span>
                </div>
                <div className="h-2 w-full bg-navy-900 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className={`h-full ${colors[i % colors.length]} rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
