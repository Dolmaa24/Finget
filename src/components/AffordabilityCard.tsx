import React from 'react';
import { CreditCard, ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react';
import type { AffordabilityResult } from '../hooks/useFingetBackend';

interface Props {
  data: AffordabilityResult;
  simulatedData?: AffordabilityResult;
}

export const AffordabilityCard: React.FC<Props> = ({ data, simulatedData }) => {
  const displayData = simulatedData || data;
  
  const getStatusConfig = () => {
    switch (displayData.riskLevel) {
      case 'Risky':
        return {
          color: 'text-danger',
          bg: 'bg-danger/10',
          borderColor: 'border-danger/30',
          icon: <AlertOctagon className="w-5 h-5 text-danger" />,
          message: 'Budget exceeded. Immediate risk to savings.',
        };
      case 'Warning':
        return {
          color: 'text-warning',
          bg: 'bg-warning/10',
          borderColor: 'border-warning/30',
          icon: <AlertTriangle className="w-5 h-5 text-warning" />,
          message: 'Running tight. Watch your spending.',
        };
      case 'Safe':
      default:
        return {
          color: 'text-primary',
          bg: 'bg-primary/10',
          borderColor: 'border-primary/30',
          icon: <ShieldCheck className="w-5 h-5 text-primary" />,
          message: "You're on track.",
        };
    }
  };

  const config = getStatusConfig();
  
  return (
    <div className={`relative p-6 rounded-3xl border ${config.borderColor} bg-navy-800/80 backdrop-blur-md shadow-2xl transition-all duration-300 overflow-hidden`}>
      {/* Background Glow */}
      <div className={`absolute top-0 right-0 w-32 h-32 ${config.bg} rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2`} />
      
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          Safe to spend today
        </h3>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.color}`}>
          {config.icon}
          {displayData.riskLevel}
        </div>
      </div>

      <div className="mb-2">
        <span className={`text-5xl sm:text-6xl font-black tracking-tight ${config.color} transition-colors duration-500`}>
          ₹{displayData.safeToSpendToday.toLocaleString()}
        </span>
      </div>

      <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-700/50">
        <div>
          <p className="text-xs text-slate-400 mb-1">Remaining Safe Budget</p>
          <p className="text-lg font-semibold text-slate-200">
            ₹{displayData.remainingBudget.toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 mb-1">Status</p>
          <p className="text-sm font-medium text-slate-300 max-w-[120px] leading-tight">
            {config.message}
          </p>
        </div>
      </div>
    </div>
  );
};
