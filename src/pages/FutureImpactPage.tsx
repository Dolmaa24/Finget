import React, { useEffect, useState } from 'react';
import { TrendingUp, Zap, ShieldCheck } from 'lucide-react';
import { useScope } from '../context/ScopeContext';
import { getTransactions, fetchFingetApi } from '../api';

export const FutureImpactPage: React.FC = () => {
  const { context, groupId } = useScope();
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('Food');
  const [reduce, setReduce] = useState(3000);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    getTransactions(context, groupId)
      .then((txs: { category?: string }[]) => {
        const set = new Set<string>();
        txs.forEach((t) => {
          if (t.category) set.add(t.category);
        });
        const list = Array.from(set);
        setCategories(list.length ? list : ['Food', 'Entertainment', 'Subscriptions', 'Shopping']);
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
        .then((data) => {
          setResult(
            data || {
              projectedMonthlySavings: reduce,
              projectedYearlySavings: reduce * 12,
              timelineMonthsToSave100k: Math.max(1, Math.round(100000 / Math.max(1, reduce))),
            }
          );
        })
        .catch(() => {
          setResult({
            projectedMonthlySavings: reduce,
            projectedYearlySavings: reduce * 12,
            timelineMonthsToSave100k: Math.max(1, Math.round(100000 / Math.max(1, reduce))),
          });
        });
    }, 300);
    return () => clearTimeout(t);
  }, [category, reduce, context, groupId]);

  const monthly = Number(result?.projectedMonthlySavings || reduce);
  const yearly = monthly * 12;
  const threeYearCompound = Math.round(yearly * 3 * 1.12); // ~12% market index return
  const fiveYearCompound = Math.round(yearly * 5 * 1.25);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">
            TEMPORAL PROJECTION ENGINE
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-semibold text-stone-500">12% COMPOUND BENCHMARK</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-display font-black tracking-tight text-stone-900">
          Future Impact & Wealth Compounding
        </h1>
        <p className="text-xs sm:text-sm text-stone-600 mt-1 font-medium">
          Model how micro-optimizations today compound into exponential long-term wealth.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Config Panel */}
        <div className="lg:col-span-6 glass-card-frosted rounded-3xl p-6 sm:p-7 border border-white/80 space-y-6 shadow-xs">
          <div className="flex items-center gap-2 pb-4 border-b border-stone-200/80">
            <Zap className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-stone-900">Interactive Habit Sandbox</h3>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-stone-500 mb-2">
              Select Expenditure Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-xs font-bold text-stone-900 focus:outline-none focus:border-amber-500 shadow-xs"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-baseline mb-3">
              <span className="text-[10px] uppercase font-bold text-stone-500">Monthly Trimming Target</span>
              <span className="text-xl font-black text-stone-900 font-display">
                ₹{reduce.toLocaleString()} <span className="text-xs text-stone-500 font-normal">/ mo</span>
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={30000}
              step={500}
              value={reduce}
              onChange={(e) => setReduce(Number(e.target.value))}
              className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
            />
            <div className="flex justify-between text-[10px] font-semibold text-stone-400 mt-2">
              <span>₹500/mo</span>
              <span>₹15,000/mo</span>
              <span>₹30,000/mo</span>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <span className="block text-[10px] uppercase font-bold text-stone-500 mb-2">Instant Scenarios</span>
            <div className="grid grid-cols-3 gap-2">
              {[1500, 4000, 10000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setReduce(amt)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                    reduce === amt
                      ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                      : 'bg-white/80 border-stone-200 text-stone-600 hover:text-stone-900'
                  }`}
                >
                  ₹{amt.toLocaleString()}/mo
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Output Projections */}
        <div className="lg:col-span-6 space-y-4">
          <div className="glass-card-frosted rounded-3xl p-6 sm:p-7 border border-white/80 shadow-xs relative overflow-hidden">
            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest font-bold text-amber-700">
                  COMPOUND PROJECTION RADAR
                </span>
                <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold shadow-xs">
                  12% COMPOUND BENCHMARK
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/80 border border-stone-200 shadow-xs">
                  <p className="text-[10px] font-bold text-stone-500 uppercase">1-Year Direct Saved</p>
                  <p className="text-2xl font-black text-stone-900 font-display mt-1">
                    ₹{yearly.toLocaleString()}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 shadow-xs">
                  <p className="text-[10px] font-bold text-amber-800 uppercase">3-Year Compounded</p>
                  <p className="text-2xl font-black text-amber-900 font-display mt-1">
                    ₹{threeYearCompound.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200 flex items-center justify-between shadow-xs">
                <div>
                  <p className="text-[10px] font-bold text-amber-800 uppercase">5-Year Exponential Horizon</p>
                  <p className="text-2xl font-black text-stone-900 font-display mt-0.5">
                    ₹{fiveYearCompound.toLocaleString()}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-amber-700 shrink-0" />
              </div>

              <div className="pt-2 border-t border-stone-200 text-xs font-semibold text-stone-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {result?.timelineMonthsToSave100k != null
                    ? `Reach ₹1,00,000 milestone lock in approx ${result.timelineMonthsToSave100k} months.`
                    : 'Adjust trim pace to compute milestone horizon.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


