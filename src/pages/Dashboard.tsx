import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Activity, X } from 'lucide-react';
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
  const { logout } = useAuth();
  const [simulatedData, setSimulatedData] = useState<any>(null);

  const handleSimulate = async (amount: number) => {
    const simResult = await simulatePurchase(amount);
    
    // Create a mock affordability object for the card preview
    setSimulatedData({
      ...affordability,
      safeToSpendToday: Math.max(0, affordability.safeToSpendToday - amount),
      remainingBudget: simResult.newRemainingBudget,
      riskLevel: simResult.newRiskLevel,
    });
    
    return simResult;
  };

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col pt-20 relative">
      {/* Glassmorphism Navbar */}
      <nav className="fixed top-0 w-full z-50 transition-all duration-300 bg-navy-900/80 backdrop-blur-lg border-b border-slate-700/50 shadow-lg py-3">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
             <div className="h-8 w-auto">
                <img src="/logo.png" alt="Finget Logo" className="h-full w-auto object-contain" />
             </div>
             <span className="text-xl font-bold tracking-widest text-[#00E5FF]">FINGΞT</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-300 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-users"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </button>
            <button onClick={logout} className="p-2 text-slate-300 hover:text-danger transition-colors">
              <LogOut className="w-6 h-6 stroke-[1.5]" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12 relative w-full">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none -z-10" />
        
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
          {lastNudge && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <span className="flex-1">{lastNudge.message}</span>
              <button type="button" onClick={clearNudge} className="text-amber-200/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
              {/* Header */}
          <header className="flex justify-between items-center mb-10">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-100 mb-1">Your Focus</h2>
              <p className="text-slate-400 font-medium">Clear mind, safe spending.</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => handleAddTransaction({ amount: 2000, category: 'Food', type: 'expense' })}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-navy-800 border border-slate-700/50 rounded-full hover:bg-slate-800 transition text-sm font-medium text-slate-200"
              >
                + Test Tx (₹2k)
              </button>
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-navy-800 border border-slate-700/50 rounded-full">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-slate-200">Engine Active</span>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Left Column (Primary Tools) */}
            <div className="xl:col-span-2 space-y-8">
              
              {/* Top Priority UI Element */}
              <AffordabilityCard 
                 data={affordability} 
                 simulatedData={simulatedData} 
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Scenario Simulator */}
                <ScenarioSimulator 
                  onSimulate={handleSimulate} 
                  onClearSimulate={() => setSimulatedData(null)}
                  currentAffordability={affordability} 
                />

                <div className="bg-navy-800 rounded-3xl p-6 border border-slate-700/50 shadow-lg flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100 mb-4">Insights</h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-4">
                      Open the full insights hub for health score, subscription leak detection, category alerts, and
                      AI-generated suggestions — all driven by your real transaction data.
                    </p>
                  </div>
                  <Link
                    to="/insights"
                    className="mt-2 text-sm text-primary font-medium hover:text-primary-hover flex justify-end"
                  >
                    View insights →
                  </Link>
                </div>
              </div>
            </div>

            {/* Right Column (Secondary / Engagement Tools) */}
            <div className="space-y-8">
              {/* AI Money Coach */}
              <AiMoneyCoach messages={messages} onSendMessage={sendMessageToCoach} />
              
              {/* Goals Tracker */}
              <GoalsTracker />
            </div>
            </div>
          </>
        )}
        </div>
      </main>
    </div>
  );
};
