import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Plus, Sparkles, TrendingUp, ArrowUpRight, Zap, CheckCircle2 } from 'lucide-react';
import { useFingetBackend } from '../hooks/useFingetBackend';
import { AffordabilityCard } from '../components/AffordabilityCard';
import { ScenarioSimulator } from '../components/ScenarioSimulator';
import { AiMoneyCoach } from '../components/AiMoneyCoach';
import { GoalsTracker } from '../components/GoalsTracker';
import { useAuth } from '../context/AuthContext';

export const Dashboard: React.FC = () => {
  const {
    affordability,
    simulatePurchase,
    messages,
    sendMessageToCoach,
    loading,
    handleAddTransaction,
    lastNudge,
    clearNudge,
  } = useFingetBackend();
  const { user } = useAuth();
  const [simulatedData, setSimulatedData] = useState<any>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('Food');
  const [txDescription, setTxDescription] = useState('');
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  const [successToast, setSuccessToast] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSimulate = async (amount: number) => {
    const simResult = await simulatePurchase(amount);
    setSimulatedData({
      ...affordability,
      safeToSpendToday: Math.max(0, affordability.safeToSpendToday - amount),
      remainingBudget: simResult.newRemainingBudget,
      riskLevel: simResult.newRiskLevel,
    });
    return simResult;
  };

  const handleCreateTx = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(txAmount);
    if (isNaN(num) || num <= 0) return;

    handleAddTransaction({
      amount: num,
      category: txCategory,
      type: txType,
      description: txDescription || `${txCategory} purchase`,
    });

    setSuccessToast(`Logged ₹${num.toLocaleString()} ${txCategory} transaction!`);
    setTimeout(() => setSuccessToast(''), 3500);

    setTxAmount('');
    setTxDescription('');
    setIsAddOpen(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-full bg-stone-900 text-white shadow-xl animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold">{successToast}</span>
        </div>
      )}

      {/* Top Banner Alert / Nudge */}
      {lastNudge && (
        <div className="flex items-start justify-between gap-3 p-4 rounded-3xl bg-amber-500/15 border border-amber-500/30 text-amber-200 backdrop-blur-xl shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Financial Warning Nudge</p>
              <p className="text-sm font-medium text-slate-200 mt-0.5">{lastNudge.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearNudge}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-display font-black tracking-tight text-white">
            Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-rose-300 to-cyan-300">{user?.name || 'Operator'}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 font-medium">
            Real-time capital shield active. Zero financial blindspots.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleAddTransaction({ amount: 1500, category: 'Food', type: 'expense', description: 'Test Cafe Tx' })}
            className="px-4 py-2 rounded-full bg-slate-900/60 hover:bg-slate-850 border border-white/15 text-slate-200 text-xs font-bold transition-all shadow-xs backdrop-blur-md"
          >
            + Quick ₹1.5k Tx
          </button>

          <button
            onClick={() => setIsAddOpen(true)}
            className="amber-pill-btn flex items-center gap-2 text-xs font-bold px-5 py-2.5 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Record Transaction</span>
          </button>
        </div>
      </div>


      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Synchronizing financial stream...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-7 space-y-6">
            <AffordabilityCard data={affordability} simulatedData={simulatedData} />

            <ScenarioSimulator
              onSimulate={handleSimulate}
              onClearSimulate={() => setSimulatedData(null)}
              currentAffordability={affordability}
            />

            {/* Quick Hub Navigator */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link
                to="/insights"
                className="glass-card-frosted p-5 rounded-3xl border border-white/15 hover:border-amber-400/60 transition-all group relative overflow-hidden shadow-xs"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-xs">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <h4 className="font-bold text-sm text-white mb-1">Financial Insights Hub</h4>
                <p className="text-xs text-slate-400 font-medium">Health scores, leak detection, & AI analysis.</p>
              </Link>

              <Link
                to="/future-impact"
                className="glass-card-frosted p-5 rounded-3xl border border-white/15 hover:border-amber-400/60 transition-all group relative overflow-hidden shadow-xs"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-xs">
                    <Zap className="w-4 h-4" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <h4 className="font-bold text-sm text-white mb-1">Future Impact Sandbox</h4>
                <p className="text-xs text-slate-400 font-medium">Forecast net worth trajectory across 12 months.</p>
              </Link>
            </div>
          </div>

          {/* Right Column: AI Coach & Goals */}
          <div className="lg:col-span-5 space-y-6">
            <AiMoneyCoach messages={messages} onSendMessage={sendMessageToCoach} />
            <GoalsTracker />
          </div>
        </div>
      )}

      {/* Modal: Quick Add Transaction */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="glass-card-frosted-heavy w-full max-w-md p-6 sm:p-7 rounded-3xl border border-white/20 shadow-2xl relative text-white">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-xs">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold font-display text-white">Record Transaction</h3>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTx} className="space-y-4">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1.5 rounded-full bg-slate-900/80 border border-white/10">
                <button
                  type="button"
                  onClick={() => setTxType('expense')}
                  className={`py-2 rounded-full text-xs font-bold transition-all ${
                    txType === 'expense'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Expense (-)
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('income')}
                  className={`py-2 rounded-full text-xs font-bold transition-all ${
                    txType === 'income'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Income (+)
                </button>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-300 font-bold mb-1.5">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="e.g. 2400"
                  className="w-full bg-slate-900/70 border border-white/15 rounded-2xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-300 font-bold mb-1.5">
                  Category
                </label>
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="w-full bg-slate-900/80 border border-white/15 rounded-2xl px-4 py-3 text-xs font-semibold text-white focus:outline-none focus:border-amber-400 shadow-xs"
                >
                  <option value="Food" className="bg-slate-900 text-white">Food & Dining</option>
                  <option value="Shopping" className="bg-slate-900 text-white">Shopping & Tech</option>
                  <option value="Travel" className="bg-slate-900 text-white">Travel & Transit</option>
                  <option value="Subscriptions" className="bg-slate-900 text-white">Subscriptions</option>
                  <option value="Utilities" className="bg-slate-900 text-white">Utilities & Bills</option>
                  <option value="Entertainment" className="bg-slate-900 text-white">Entertainment</option>
                  <option value="Salary" className="bg-slate-900 text-white">Salary / Earnings</option>
                  <option value="Other" className="bg-slate-900 text-white">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-300 font-bold mb-1.5">
                  Description / Merchant (Optional)
                </label>
                <input
                  type="text"
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  placeholder="e.g. Starbucks or Amazon order"
                  className="w-full bg-slate-900/70 border border-white/15 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-400 shadow-xs"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="amber-pill-btn w-full py-3.5 text-xs font-bold uppercase tracking-wider shadow-md"
                >
                  Confirm & Sync Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


