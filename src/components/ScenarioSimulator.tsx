import React, { useState, useEffect } from 'react';
import { Target, TrendingDown, Info, Calculator } from 'lucide-react';
import type { SimulationResult, AffordabilityResult } from '../hooks/useFingetBackend';

interface Props {
  onSimulate: (amount: number) => Promise<SimulationResult>;
  onClearSimulate: () => void;
  currentAffordability: AffordabilityResult;
}

export const ScenarioSimulator: React.FC<Props> = ({ onSimulate, onClearSimulate }) => {
  const [amount, setAmount] = useState<string>('');
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    const num = parseInt(amount.replace(/,/g, ''), 10);
    if (!isNaN(num) && num > 0) {
      setIsSimulating(true);
      const timer = setTimeout(async () => {
        try {
          const res = await onSimulate(num);
          setSimulation(res);
        } catch(e) {
          console.error(e);
        } finally {
          setIsSimulating(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setSimulation(null);
      onClearSimulate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers
    const value = e.target.value.replace(/\D/g, '');
    setAmount(value);
  };

  return (
    <div className="bg-navy-800 rounded-3xl p-6 border border-slate-700/50 shadow-lg">
       <div className="flex items-center gap-2 mb-6">
        <Calculator className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-slate-100">Future Impact Simulator</h3>
      </div>
      
      <p className="text-slate-400 text-sm mb-4">
        What do you want to buy? Test the impact before spending.
      </p>

      <div className="relative mb-6">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-lg">₹</span>
        <input
          type="text"
          value={amount ? Number(amount).toLocaleString() : ''}
          onChange={handleAmountChange}
          placeholder="0"
          className="w-full bg-navy-900 border border-slate-600 rounded-2xl py-4 pl-10 pr-4 text-xl font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-slate-600"
        />
      </div>

      <div className="space-y-4">
        {isSimulating ? (
          <div className="h-[120px] flex items-center justify-center border-2 border-dashed border-slate-700/50 rounded-2xl">
            <p className="text-slate-500 text-sm font-medium animate-pulse">Calculating impact...</p>
          </div>
        ) : simulation ? (
          <>
            <div className="bg-navy-900/50 rounded-2xl p-4 flex items-start gap-4 transition-all">
              <div className={`p-2 rounded-xl mt-1 ${simulation.newRiskLevel === 'Risky' ? 'bg-danger/20 text-danger' : simulation.newRiskLevel === 'Warning' ? 'bg-warning/20 text-warning' : 'bg-primary/20 text-primary'}`}>
                {simulation.newRiskLevel === 'Risky' ? <TrendingDown className="w-5 h-5" /> : <Target className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="text-slate-200 font-medium leading-tight mb-1">Impact Analysis</h4>
                <p className="text-slate-400 text-sm mb-2">
                  This purchase will reduce your remaining monthly budget to <strong className="text-slate-200">₹{simulation.newRemainingBudget.toLocaleString()}</strong>.
                </p>
                {simulation.savingsDelayedDays > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-300">
                      Savings delayed by <span className={simulation.newRiskLevel === 'Risky' ? 'text-danger' : 'text-warning'}>{simulation.savingsDelayedDays} days</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
            {simulation.newRiskLevel === 'Risky' && (
              <p className="text-center text-xs text-danger font-medium px-4 py-2 border border-danger/20 rounded-xl bg-danger/5">
                Warning: This exceeds your safe daily allowance.
              </p>
            )}
          </>
        ) : (
          <div className="h-[120px] flex items-center justify-center border-2 border-dashed border-slate-700/50 rounded-2xl">
            <p className="text-slate-500 text-sm font-medium">Enter amount to see impact</p>
          </div>
        )}
      </div>
    </div>
  );
};
