import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useScope } from '../context/ScopeContext';
import { getTransactions, fetchFingetApi } from '../api';

export const FutureImpactPage: React.FC = () => {
  const { context, groupId } = useScope();
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('Food');
  const [reduce, setReduce] = useState(2000);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getTransactions(context, groupId)
      .then((txs: { category?: string }[]) => {
        const set = new Set<string>();
        txs.forEach((t) => {
          if (t.category) set.add(t.category);
        });
        const list = Array.from(set);
        setCategories(list.length ? list : ['Food', 'Entertainment', 'Subscriptions']);
        if (list.length) setCategory(list[0]);
      })
      .catch(console.error);
  }, [context, groupId]);

  useEffect(() => {
    const body: Record<string, unknown> = {
      category,
      reduceByMonthly: reduce,
    };
    if (context === 'group' && groupId) {
      body.context = 'group';
      body.groupId = groupId;
    }
    const t = setTimeout(() => {
      fetchFingetApi('/finance/future-impact', {
        method: 'POST',
        body: JSON.stringify(body),
      })
        .then((data) => setResult(data))
        .catch(console.error);
    }, 400);
    return () => clearTimeout(t);
  }, [category, reduce, context, groupId]);

  return (
    <div className="animate-in fade-in max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white mb-2 flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-primary" />
          Future impact simulator
        </h1>
        <p className="text-slate-400">
          Slide to see how cutting a category could compound into monthly and yearly savings.
        </p>
      </div>

      <div className="bg-navy-800 rounded-3xl p-6 border border-slate-700/50 space-y-6">
        <div>
          <label className="block text-xs text-slate-500 mb-2">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-navy-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex justify-between text-sm text-slate-400 mb-2">
            <span>Reduce monthly spend by</span>
            <span className="text-white font-bold">₹{reduce.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={0}
            max={50000}
            step={500}
            value={reduce}
            onChange={(e) => setReduce(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        {result && (
          <div className="rounded-2xl bg-navy-900/80 p-5 border border-slate-700/50 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500">Projected monthly savings</p>
                <p className="text-2xl font-black text-primary">
                  ₹{Number(result.projectedMonthlySavings || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Projected yearly savings</p>
                <p className="text-2xl font-black text-white">
                  ₹{Number(result.projectedYearlySavings || 0).toLocaleString()}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2">Savings timeline (visual)</p>
              <div className="h-4 rounded-full bg-navy-950 overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (Number(result.projectedMonthlySavings || 0) / 10000) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {result.timelineMonthsToSave100k != null
                  ? `≈ ${result.timelineMonthsToSave100k} months to save ₹1L at this pace (if you keep the habit).`
                  : 'Increase reduction to see a timeline to ₹1L.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
