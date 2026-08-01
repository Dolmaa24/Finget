import React from 'react';
import { Link } from 'react-router-dom';
import { Target, ArrowRight, PlusCircle } from 'lucide-react';
import { useGoals } from '../hooks/useGoals';
import { useScope } from '../context/ScopeContext';

const gradientBars = [
  'from-amber-400 via-rose-400 to-purple-500 shadow-sm',
  'from-cyan-400 to-blue-500 shadow-sm',
  'from-emerald-400 to-teal-500 shadow-sm',
  'from-amber-400 to-orange-500 shadow-sm',
];

export const GoalsTracker: React.FC = () => {
  const { context, groupId } = useScope();
  const { goals, loading } = useGoals({ context, groupId: groupId || undefined });

  const top = goals.slice(0, 4);

  return (
    <div className="glass-card-frosted rounded-3xl p-6 sm:p-7 border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex flex-col justify-between text-white">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-xs">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-display text-white">Active Milestones</h3>
              <p className="text-[10px] font-medium text-slate-400">Capital lock & target tracking</p>
            </div>
          </div>
          <Link
            to="/goals"
            className="flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
          >
            <span>VIEW ALL</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : top.length === 0 ? (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-dashed border-white/20 text-center shadow-xs">
            <p className="text-xs font-medium text-slate-400 mb-3">No active milestone locks</p>
            <Link
              to="/goals"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-slate-950 text-xs font-bold hover:bg-slate-200 transition-all shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>Set First Goal</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {top.map((goal, i) => {
              const pct = Math.min(
                100,
                Math.round(((goal.currentAmount || 0) / Math.max(1, goal.targetAmount)) * 100)
              );
              const barGradient = gradientBars[i % gradientBars.length];

              return (
                <div key={goal._id} className="p-3.5 rounded-2xl bg-slate-900/50 border border-white/10 shadow-xs backdrop-blur-md">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-white">{goal.name}</h4>
                      <p className="text-[10px] font-semibold text-slate-400">
                        ₹{(goal.currentAmount || 0).toLocaleString()} / ₹{goal.targetAmount.toLocaleString()}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-white/15 text-white text-[10px] font-bold">
                      {pct}%
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${barGradient} rounded-full transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center text-[10px] font-semibold text-slate-400">
        <span>AUTO-REBALANCE: ACTIVE</span>
        <span className="text-emerald-400 font-bold">0% AT RISK</span>
      </div>
    </div>
  );
};


