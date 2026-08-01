import React, { useState, useEffect } from 'react';
import { Calculator, Sparkles, Flame, Check } from 'lucide-react';
import type { SimulationResult, AffordabilityResult } from '../hooks/useFingetBackend';

interface Props {
  onSimulate: (amount: number) => Promise<SimulationResult>;
  onClearSimulate: () => void;
  currentAffordability: AffordabilityResult;
}

export const ScenarioSimulator: React.FC<Props> = ({ onSimulate, onClearSimulate, currentAffordability }) => {
  const [amount, setAmount] = useState<string>('');
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const presets = [
    { label: 'Dinner / Drinks', val: 1500 },
    { label: 'Weekend Shopping', val: 4500 },
    { label: 'Flight Booking', val: 8500 },
    { label: 'Flagship Tech', val: 24000 },
  ];

  useEffect(() => {
    const num = parseInt(amount.replace(/,/g, ''), 10);
    if (!isNaN(num) && num > 0) {
      setIsSimulating(true);
      const timer = setTimeout(async () => {
        try {
          const res = await onSimulate(num);
          setSimulation(res);
        } catch (e) {
          console.error(e);
        } finally {
          setIsSimulating(false);
        }
      }, 350);
      return () => clearTimeout(timer);
    } else {
      setSimulation(null);
      onClearSimulate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    setAmount(value);
  };

  const maxSlider = Math.max(15000, (currentAffordability.remainingBudget || 0) * 1.2);

  return (
    <div className="glass-card-frosted rounded-3xl p-6 sm:p-7 border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex flex-col justify-between text-white">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-xs">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-display text-white">Purchase Impact Simulator</h3>
              <p className="text-[11px] font-medium text-slate-400">Pre-test expenses before swiping</p>
            </div>
          </div>
          {amount && (
            <button
              onClick={() => setAmount('')}
              className="text-[11px] font-semibold text-slate-400 hover:text-amber-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-lg">₹</span>
            <input
              type="text"
              value={amount ? Number(amount).toLocaleString() : ''}
              onChange={handleAmountChange}
              placeholder="0"
              className="w-full bg-slate-900/60 border border-white/15 rounded-2xl py-3 pl-9 pr-4 text-xl font-bold text-white focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all placeholder:text-slate-500 shadow-xs backdrop-blur-md"
            />
          </div>

          {/* Slider */}
          <div className="mt-3 px-1">
            <input
              type="range"
              min="0"
              max={maxSlider}
              step="250"
              value={amount ? Number(amount) : 0}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-semibold text-slate-400 mt-1">
              <span>₹0</span>
              <span>₹{Math.round(maxSlider / 2).toLocaleString()}</span>
              <span>₹{Math.round(maxSlider).toLocaleString()}</span>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            {presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setAmount(p.val.toString())}
                className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-900/60 hover:bg-amber-500/20 hover:text-amber-300 border border-white/15 text-slate-300 transition-all shadow-xs backdrop-blur-md"
              >
                +{p.label} (₹{p.val.toLocaleString()})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Output HUD */}
      <div className="mt-4 pt-4 border-t border-white/10">
        {isSimulating ? (
          <div className="h-[90px] flex items-center justify-center rounded-2xl bg-slate-900/50 border border-white/10 shadow-xs backdrop-blur-md">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold animate-pulse">
              <Sparkles className="w-4 h-4" />
              <span>Simulating impact on capital shield...</span>
            </div>
          </div>
        ) : simulation ? (
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/15 space-y-2.5 shadow-xs backdrop-blur-md">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold">New Monthly Pool:</span>
              <span className="font-bold text-white">₹{simulation.newRemainingBudget.toLocaleString()}</span>
            </div>
            {simulation.savingsDelayedDays > 0 ? (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs font-medium">
                <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Delays primary savings goal by <strong>{simulation.savingsDelayedDays} days</strong></span>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs font-medium">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zero impact on current goal timeline!</span>
              </div>
            )}
          </div>
        ) : (
          <div className="h-[90px] flex items-center justify-center rounded-2xl bg-slate-900/30 border border-dashed border-white/15 text-xs font-semibold text-slate-400 backdrop-blur-sm">
            Select or enter an expense above to test impact
          </div>
        )}
      </div>
    </div>
  );
};


