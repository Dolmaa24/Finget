import React from 'react';
import { CreditCard, ShieldCheck, AlertTriangle, AlertOctagon, Sparkles } from 'lucide-react';
import type { AffordabilityResult } from '../hooks/useFingetBackend';

interface Props {
  data: AffordabilityResult;
  simulatedData?: AffordabilityResult;
}

export const AffordabilityCard: React.FC<Props> = ({ data, simulatedData }) => {
  const isSimulated = !!simulatedData;
  const displayData = simulatedData || data;
  
  const getStatusConfig = () => {
    switch (displayData.riskLevel) {
      case 'Risky':
        return {
          textColor: 'text-rose-400',
          bgPill: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
          cardBorder: 'border-rose-500/30',
          icon: <AlertOctagon className="w-4 h-4 text-rose-400" />,
          message: 'Budget exceeded. Immediate risk to target savings.',
        };
      case 'Warning':
        return {
          textColor: 'text-amber-400',
          bgPill: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
          cardBorder: 'border-amber-500/30',
          icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
          message: 'Approaching daily threshold. Calibrate spending.',
        };
      case 'Safe':
      default:
        return {
          textColor: 'text-white',
          bgPill: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
          cardBorder: 'border-white/15',
          icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
          message: 'Capital shield active. You are fully on track.',
        };
    }
  };

  const config = getStatusConfig();
  
  return (
    <div className={`relative p-7 sm:p-8 rounded-3xl border ${config.cardBorder} glass-card-frosted-heavy shadow-[0_16px_50px_rgba(0,0,0,0.7)] transition-all duration-300 overflow-hidden text-white`}>
      {/* Dynamic Background Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-[90px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-xs">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-300">
              Safe-to-Spend Daily Allowance
            </h3>
            <p className="text-[11px] font-medium text-slate-400">Guaranteed non-deficit spending limit</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSimulated && (
            <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold uppercase flex items-center gap-1 shadow-xs">
              <Sparkles className="w-3 h-3 text-amber-400" />
              SIMULATED
            </span>
          )}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${config.bgPill} shadow-xs backdrop-blur-md`}>
            {config.icon}
            <span>{displayData.riskLevel.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Main Metric Value */}
      <div className="relative z-10 mb-8">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-500">₹</span>
          <span className={`text-5xl sm:text-7xl font-black font-display tracking-tight ${config.textColor} transition-all duration-300`}>
            {displayData.safeToSpendToday.toLocaleString()}
          </span>
          <span className="text-sm font-semibold text-slate-400">/ day</span>
        </div>
      </div>

      {/* Sub-Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-white/10 relative z-10">
        <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-white/10 shadow-xs backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
            Remaining Monthly Pool
          </p>
          <p className="text-lg font-bold text-white">
            ₹{displayData.remainingBudget.toLocaleString()}
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-white/10 shadow-xs backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
            Target Daily Savings
          </p>
          <p className="text-lg font-bold text-emerald-400">
            ₹{(displayData.targetDailySavings || 1000).toLocaleString()}
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-white/10 shadow-xs backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
            Shield Status
          </p>
          <p className="text-xs font-semibold text-slate-200 leading-snug">
            {config.message}
          </p>
        </div>
      </div>
    </div>
  );
};


