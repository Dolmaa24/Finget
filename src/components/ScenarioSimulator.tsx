import { cn } from '../lib/cn';
import React, { useMemo, useState } from 'react';
import { Calculator, TrendingDown, Target, Info, RotateCcw } from 'lucide-react';
import type { Affordability } from '../api';
import { useSimulation } from '../hooks/useFinget';
import { inr, clamp } from '../lib/format';
import { Badge, Button, MoneyInput } from './ui';
import { ShareTranslation } from './ShareTranslation';

/**
 * "Can I buy this?" — types or drags an amount and shows what it costs in
 * budget headroom *and* in goal delay.
 */
export const ScenarioSimulator: React.FC<{
  affordability: Affordability;
  onPreview?: (preview: { safeDaily: number; remaining: number; risk: Affordability['risk'] } | null) => void;
}> = ({ affordability, onPreview }) => {
  const [amount, setAmount] = useState('');
  const numeric = Number(amount) || 0;
  const { result, pending } = useSimulation(numeric);

  const sliderMax = useMemo(
    () => Math.max(10000, Math.round((affordability.remaining || 0) * 1.5)),
    [affordability.remaining]
  );

  // Push the preview up so the affordability card can show the "after" state.
  React.useEffect(() => {
    if (!onPreview) return;
    onPreview(
      result ? { safeDaily: result.safeDaily, remaining: result.remaining, risk: result.risk } : null
    );
  }, [result, onPreview]);

  const reset = () => setAmount('');

  const worstGoal = result?.goalImpacts?.[0];

  return (
    <div className="glass glass-sheen rounded-lg p-6 flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
            <Calculator className="w-[18px] h-[18px]" />
          </span>
          <div>
            <h3 className="font-semibold text-ink leading-tight">What if I buy this?</h3>
            <p className="text-[12px] text-ink-3">Test the damage before you spend.</p>
          </div>
        </div>
        {numeric > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-ink-3 hover:text-ink transition-colors p-1.5 rounded-pill hover:bg-white/50"
            aria-label="Reset simulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      <MoneyInput
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        min="0"
        className="h-14 !text-2xl font-semibold"
      />

      <div className="mt-4 mb-1">
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={100}
          value={clamp(numeric, 0, sliderMax)}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Purchase amount"
          style={
            {
              '--range-progress': `${(clamp(numeric, 0, sliderMax) / sliderMax) * 100}%`,
            } as React.CSSProperties
          }
        />
        <div className="flex justify-between text-[11px] text-ink-3 numeric">
          <span>₹0</span>
          <span>{inr(sliderMax)}</span>
        </div>
      </div>

      <div className="mt-4 flex-1">
        {numeric <= 0 ? (
          <div className="h-[150px] rounded-md border border-dashed border-white/70 bg-white/20 flex items-center justify-center">
            <p className="text-sm text-ink-3">Enter an amount to see the impact</p>
          </div>
        ) : pending && !result ? (
          <div className="h-[150px] rounded-md border border-dashed border-white/70 bg-white/20 flex items-center justify-center">
            <p className="text-sm text-ink-3 animate-pulse">Calculating impact…</p>
          </div>
        ) : result ? (
          <div className="space-y-3 animate-fade">
            <div className="glass-well rounded-md p-4">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'w-9 h-9 rounded-md flex items-center justify-center shrink-0',
                    result.risk === 'Risky'
                      ? 'bg-[var(--risk-wash)] text-risk'
                      : result.risk === 'Warning'
                        ? 'bg-[var(--warn-wash)] text-warn'
                        : 'bg-[var(--safe-wash)] text-safe'
                  )}
                >
                  {result.risk === 'Risky' ? (
                    <TrendingDown className="w-[18px] h-[18px]" />
                  ) : (
                    <Target className="w-[18px] h-[18px]" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="font-semibold text-ink text-sm">After this purchase</p>
                    <Badge
                      tone={
                        result.risk === 'Risky'
                          ? 'risk'
                          : result.risk === 'Warning'
                            ? 'warn'
                            : 'safe'
                      }
                    >
                      {result.risk}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-ink-2 leading-relaxed">
                    Budget left drops to{' '}
                    <strong className="text-ink numeric">{inr(result.remaining)}</strong>, and your
                    daily allowance to{' '}
                    <strong className="text-ink numeric">{inr(result.safeDaily)}</strong>.
                  </p>
                </div>
              </div>
            </div>

            {worstGoal && (
              <div className="glass-well rounded-md p-4 flex items-start gap-3">
                <Info className="w-4 h-4 text-ink-3 mt-0.5 shrink-0" />
                <p className="text-[13px] text-ink-2 leading-relaxed">
                  {worstGoal.blocked ? (
                    <>
                      This stalls <strong className="text-ink">{worstGoal.name}</strong> completely —
                      there would be nothing left to save this month.
                    </>
                  ) : worstGoal.delayDays && worstGoal.delayDays > 0 ? (
                    <>
                      Delays <strong className="text-ink">{worstGoal.name}</strong> by about{' '}
                      <strong className="text-warn">{worstGoal.delayDays} days</strong>.
                    </>
                  ) : (
                    <>
                      No measurable delay to <strong className="text-ink">{worstGoal.name}</strong>.
                    </>
                  )}
                </p>
              </div>
            )}

            {result.risk === 'Risky' && (
              <p className="text-[13px] text-risk bg-[var(--risk-wash)] rounded-sm px-3.5 py-2.5 text-center font-medium">
                This pushes you past your safe limit for the month.
              </p>
            )}

            {/* The headline is the shareable thing, so the share lives with it. */}
            {result.headline && <ShareTranslation amount={numeric} headline={result.headline} />}
          </div>
        ) : (
          <div className="h-[150px] rounded-md border border-dashed border-white/70 bg-white/20 flex items-center justify-center">
            <p className="text-sm text-ink-3">Could not simulate right now.</p>
          </div>
        )}
      </div>

      {numeric > 0 && result && (
        <Button variant="ghost" size="sm" className="mt-4 self-start" onClick={reset}>
          Clear
        </Button>
      )}
    </div>
  );
};
