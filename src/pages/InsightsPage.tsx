import React, { useEffect, useState } from 'react';
import { Lightbulb, HeartPulse } from 'lucide-react';
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
        setHealth(data.healthScore || null);
        setInsights(data.insights || []);
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Financial insights</h1>
        <p className="text-slate-400">
          Rule-based signals plus AI reasoning — scoped to{' '}
          {context === 'group' ? 'your selected group' : 'your personal finances'}.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="text-danger">{error}</p>
      ) : (
        <>
          {health && (
            <div className="bg-navy-800 rounded-3xl p-6 border border-slate-700/50 flex items-center gap-4">
              <div className="p-4 rounded-2xl bg-primary/10 text-primary">
                <HeartPulse className="w-10 h-10" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">Financial health score</p>
                <p className="text-4xl font-black text-white">{health.score}</p>
                <p className="text-slate-400">{health.label}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {insights.map((ins, i) => (
              <div
                key={`${ins.title}-${i}`}
                className="bg-navy-800 rounded-2xl p-5 border border-slate-700/50 shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-100">{ins.title}</h3>
                      {ins.source && (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-slate-700 text-slate-400">
                          {ins.source}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm mb-2">{ins.description}</p>
                    {ins.actionable_tip && (
                      <p className="text-primary text-sm font-medium">→ {ins.actionable_tip}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {insights.length === 0 && (
              <p className="text-slate-500 text-center py-8">Add transactions to unlock insights.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
