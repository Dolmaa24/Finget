import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, TrendingDown, CalendarRange, Wallet } from 'lucide-react';
import { financeApi } from '../api';
import { useScope } from '../context/scopeStore';
import { useTransactions } from '../hooks/useFinget';
import { inr, clamp } from '../lib/format';
import { EmptyState, Field, PageHeader, Panel, Select, Stat } from '../components/ui';

type Result = Awaited<ReturnType<typeof financeApi.futureImpact>>;

export const FutureImpactPage: React.FC = () => {
  const { scope, isFriends, group, context, groupId } = useScope();
  const { data: transactions, loading: loadingTx } = useTransactions();

  const [category, setCategory] = useState('');
  const [reduce, setReduce] = useState(2000);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);

  // Only offer categories the user actually spends on.
  const categories = useMemo(() => {
    const totals = new Map<string, number>();
    transactions.forEach((t) => {
      if (t.type !== 'expense' || !t.category) return;
      totals.set(t.category, (totals.get(t.category) || 0) + t.amount);
    });
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => ({ name, total }));
  }, [transactions]);

  useEffect(() => {
    if (categories.length > 0 && !categories.some((c) => c.name === category)) {
      setCategory(categories[0].name);
    }
  }, [categories, category]);

  const currentSpend = categories.find((c) => c.name === category)?.total || 0;
  const sliderMax = Math.max(2000, Math.ceil(currentSpend / 500) * 500);

  useEffect(() => {
    if (!category) {
      setResult(null);
      return;
    }
    setPending(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      financeApi
        .futureImpact(scope, category, reduce)
        .then((res) => !cancelled && setResult(res))
        .catch(() => !cancelled && setResult(null))
        .finally(() => !cancelled && setPending(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, reduce, context, groupId]);

  const timelineWidth = result
    ? clamp((result.projectedMonthlySavings / Math.max(1, sliderMax)) * 100, 0, 100)
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow={isFriends ? `Friends mode · ${group?.name ?? ''}` : 'Personal mode'}
        title="What if we cut back?"
        subtitle={
          isFriends
            ? 'See what trimming a shared category compounds into over a year.'
            : 'Small habit changes, compounded. Drag to see what a category cut is really worth.'
        }
      />

      {loadingTx ? (
        <Panel>
          <div className="skeleton h-40 rounded-md" />
        </Panel>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="w-6 h-6" />}
          title="No spending to model yet"
          body="Log a few expenses and this page will show what cutting each category is worth."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* Controls */}
          <Panel className="lg:col-span-2 space-y-6">
            <Field label="Category" hint={`Currently ${inr(currentSpend)} in the last 30 days.`}>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} · {inr(c.total)}
                  </option>
                ))}
              </Select>
            </Field>

            <div>
              <div className="flex justify-between items-baseline mb-3">
                <span className="text-[12px] font-semibold text-ink-2">
                  Cut monthly spend by
                </span>
                <span className="text-xl font-semibold numeric text-accent">{inr(reduce)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={sliderMax}
                step={250}
                value={clamp(reduce, 0, sliderMax)}
                onChange={(e) => setReduce(Number(e.target.value))}
                aria-label="Monthly reduction"
                style={
                  {
                    '--range-progress': `${(clamp(reduce, 0, sliderMax) / sliderMax) * 100}%`,
                  } as React.CSSProperties
                }
              />
              <div className="flex justify-between text-[11px] text-ink-3 numeric">
                <span>₹0</span>
                <span>{inr(sliderMax)}</span>
              </div>
            </div>

            {result && result.reductionApplied < reduce && (
              <p className="text-[12.5px] text-ink-3 leading-relaxed">
                You only spend {inr(result.currentMonthSpendApprox)} on {category}, so the model caps
                the saving at {inr(result.reductionApplied)}.
              </p>
            )}
          </Panel>

          {/* Results */}
          <div className="lg:col-span-3 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Stat
                label="Saved per month"
                value={inr(result?.projectedMonthlySavings || 0)}
                tone="safe"
                icon={<Wallet className="w-3.5 h-3.5" />}
              />
              <Stat
                label="Saved per year"
                value={inr(result?.projectedYearlySavings || 0)}
                tone="accent"
                icon={<CalendarRange className="w-3.5 h-3.5" />}
              />
            </div>

            <Panel className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <div className="flex items-center gap-2.5 mb-5">
                <span className="w-9 h-9 rounded-md bg-[var(--safe-wash)] text-safe flex items-center justify-center">
                  <TrendingDown className="w-[18px] h-[18px]" />
                </span>
                <div>
                  <h3 className="font-semibold text-ink">Compounding effect</h3>
                  <p className="text-[12px] text-ink-3">If the habit sticks.</p>
                </div>
              </div>

              <div className="glass-well rounded-pill h-4 overflow-hidden mb-3">
                <div
                  className="h-full rounded-pill transition-[width] duration-700 ease-spatial"
                  style={{
                    width: `${timelineWidth}%`,
                    background:
                      'linear-gradient(90deg, var(--safe), color-mix(in srgb, var(--safe) 55%, white))',
                  }}
                />
              </div>

              <p className="text-[13.5px] text-ink-2 leading-relaxed">
                {result?.timelineMonthsToSave100k != null ? (
                  <>
                    At this pace you would bank{' '}
                    <strong className="text-ink">₹1,00,000</strong> in about{' '}
                    <strong className="text-safe">{result.timelineMonthsToSave100k} months</strong>{' '}
                    from this one change.
                  </>
                ) : (
                  'Increase the reduction to see a timeline.'
                )}
              </p>

              {result && result.projectedYearlySavings > 0 && (
                <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-white/55">
                  {[
                    { label: '1 year', value: result.projectedYearlySavings },
                    { label: '3 years', value: result.projectedYearlySavings * 3 },
                    { label: '5 years', value: result.projectedYearlySavings * 5 },
                  ].map((h) => (
                    <div key={h.label}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                        {h.label}
                      </p>
                      <p className="text-base font-semibold numeric text-ink">{inr(h.value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
};
