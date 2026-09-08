import React from 'react';
import { Cpu, Layers } from 'lucide-react';

interface ModelBreakdownProps {
  breakdown: {
    model: string;
    cost: number;
    tokens: number;
    count: number;
    percentage: number;
  }[];
  totalSpendINR: number;
}

const MODEL_COLORS = [
  'bg-emerald-500 text-emerald-600',
  'bg-amber-500 text-amber-600',
  'bg-blue-500 text-blue-600',
  'bg-purple-500 text-purple-600',
  'bg-orange-500 text-orange-600',
  'bg-rose-500 text-rose-600',
  'bg-cyan-500 text-cyan-600',
];

export const ModelBreakdownChart: React.FC<ModelBreakdownProps> = ({
  breakdown,
  totalSpendINR,
}) => {
  if (!breakdown || breakdown.length === 0) {
    return (
      <div className="glass glass-sheen rounded-xl p-5 text-center text-ink-3">
        <Cpu className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm font-medium">No model usage recorded yet</p>
        <p className="text-xs">Log API requests or run simulations to see model cost distribution.</p>
      </div>
    );
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
    return tokens.toString();
  };

  return (
    <div className="glass glass-sheen rounded-xl p-5 border border-white/60 dark:border-white/10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-[var(--accent-wash)] text-accent flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </span>
          <div>
            <h4 className="font-semibold text-ink text-sm">Model Spend Distribution (30d)</h4>
            <p className="text-xs text-ink-3">Cost and token volume by LLM</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-semibold text-ink">₹{totalSpendINR.toLocaleString()} Total</span>
        </div>
      </div>

      {/* Stacked Percentage Bar */}
      <div className="w-full bg-black/5 dark:bg-white/5 h-3 rounded-full overflow-hidden flex gap-0.5 mb-4">
        {breakdown.map((item, idx) => {
          const color = MODEL_COLORS[idx % MODEL_COLORS.length].split(' ')[0];
          return (
            <div
              key={item.model}
              className={`${color} h-full transition-all duration-500`}
              style={{ width: `${Math.max(3, item.percentage)}%` }}
              title={`${item.model}: ₹${item.cost.toFixed(2)} (${item.percentage}%)`}
            />
          );
        })}
      </div>

      {/* Itemized List */}
      <div className="space-y-2.5">
        {breakdown.map((item, idx) => {
          const colorDot = MODEL_COLORS[idx % MODEL_COLORS.length].split(' ')[0];
          return (
            <div
              key={item.model}
              className="flex items-center justify-between text-xs p-2 rounded-lg hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full ${colorDot} shrink-0`} />
                <span className="font-semibold text-ink truncate font-mono text-[13px]">
                  {item.model}
                </span>
                <span className="text-ink-3 text-[11px]">
                  ({formatTokens(item.tokens)} tokens · {item.count} reqs)
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold text-ink">₹{item.cost.toFixed(2)}</span>
                <span className="w-10 text-right font-medium text-ink-3">
                  {item.percentage}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
