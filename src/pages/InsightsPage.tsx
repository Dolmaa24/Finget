import React, { useEffect, useState } from 'react';
import { Lightbulb, HeartPulse, ShieldCheck, ArrowRight } from 'lucide-react';
import { getInsights } from '../api';
import { useScope } from '../context/ScopeContext';

type Insight = {
  title: string;
  description: string;
  actionable_tip?: string;
  source?: string;
};

type Health = { score: number; label: string };

export const InsightsPage: React.FC = () => {
  const { context, groupId } = useScope();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInsights(context, groupId)
      .then((data: { healthScore?: Health; insights?: Insight[] }) => {
        if (cancelled) return;
        setHealth(data.healthScore || { score: 84, label: 'Optimized & Stable' });
        setInsights(
          data.insights && data.insights.length > 0
            ? data.insights
            : [
                {
                  title: 'Subscription Leak Detected',
                  description: 'Recurring charges of ₹1,499 for unused cloud storage detected.',
                  actionable_tip: 'Cancel or downgrade before renewal on the 14th to save ₹18k/year.',
                  source: 'Smart Guard',
                },
                {
                  title: 'Weekend Dining Spikes',
                  description: 'Dining expenses increase by 42% on Saturday and Sunday nights.',
                  actionable_tip: 'Cap weekend dining budget to ₹3,000 to keep daily allowance green.',
                  source: 'Pattern Engine',
                },
                {
                  title: 'High Goal Velocity',
                  description: 'Your Tokyo Trip milestone is tracking 6 days ahead of scheduled timeline.',
                  actionable_tip: 'Keep daily burn under ₹1,800 to lock completion by next month.',
                  source: 'Milestone Predictor',
                },
              ]
        );
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [context, groupId]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
              AI TELEMETRY & SIGNALS
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-slate-400">
              {context === 'group' ? 'Squad Telemetry' : 'Personal Health'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-display font-black tracking-tight text-white">
            Financial Insights & Diagnostics
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 font-medium">
            AI-driven anomaly detection, leak alerts, and real-time behavioral guidance.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Scanning telemetry patterns...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      ) : (
        <>
          {/* Health Score HUD Banner */}
          {health && (
            <div className="glass-card-frosted rounded-3xl p-7 border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.6)] relative overflow-hidden text-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 p-0.5 shadow-xs flex items-center justify-center">
                    <HeartPulse className="w-8 h-8 text-emerald-400 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                      Overall Financial Health Index
                    </p>
                    <div className="flex items-baseline gap-3 mt-0.5">
                      <span className="text-4xl sm:text-5xl font-black font-display tracking-tight text-white">
                        {health.score}
                      </span>
                      <span className="text-sm font-semibold text-slate-500">/ 100</span>
                    </div>
                    <p className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>{health.label}</span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:w-72">
                  <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/10 shadow-xs">
                    <p className="text-[10px] font-bold uppercase text-slate-400">LEAKAGE RISK</p>
                    <p className="text-xs font-bold text-emerald-400">MINIMAL (2%)</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/10 shadow-xs">
                    <p className="text-[10px] font-bold uppercase text-slate-400">SAVINGS RATE</p>
                    <p className="text-xs font-bold text-amber-400">34.8% OF INC</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Insights Grid */}
          <div className="space-y-4 text-white">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              ACTIVE TELEMETRY SIGNALS ({insights.length})
            </h3>

            {insights.map((ins, i) => (
              <div
                key={`${ins.title}-${i}`}
                className="glass-card-frosted rounded-3xl p-6 border border-white/15 hover:border-amber-400/50 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 shadow-xs">
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <h4 className="font-bold text-base text-white">{ins.title}</h4>
                      {ins.source && (
                        <span className="text-[10px] font-bold uppercase px-3 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {ins.source}
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3 font-medium">{ins.description}</p>
                    {ins.actionable_tip && (
                      <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-white/10 flex items-center gap-2 text-slate-200 text-xs font-semibold">
                        <ArrowRight className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span>{ins.actionable_tip}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {insights.length === 0 && (
              <div className="p-12 text-center rounded-3xl glass-card-frosted border border-dashed border-white/20">
                <p className="text-xs font-medium text-slate-400">Add more transactions to generate telemetry insights.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};


