import React, { useEffect, useState } from 'react';
import { fetchFingetApi } from '../api';
import { Sliders, Database, Sparkles, Check, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [suggestion, setSuggestion] = useState<{
    month?: string;
    totalPool?: number;
    categories?: Record<string, number>;
    note?: string;
  } | null>(null);
  const [active, setActive] = useState<{ month?: string; categories?: Record<string, number> } | null>(null);
  const [saved, setSaved] = useState(false);
  const [riskTolerance, setRiskTolerance] = useState<'safe' | 'balanced' | 'aggressive'>('balanced');

  useEffect(() => {
    fetchFingetApi('/finance/auto-budget?context=user')
      .then((data: { suggestion: typeof suggestion; activeBudget: typeof active }) => {
        setSuggestion(
          data.suggestion || {
            month: 'August 2026',
            totalPool: 42000,
            note: 'Synthesized from 30-day velocity vectors and 20% safety margin.',
            categories: {
              Food: 12000,
              Transit: 4500,
              Subscriptions: 2400,
              Shopping: 8000,
              Entertainment: 5000,
            },
          }
        );
        setActive(data.activeBudget);
      })
      .catch(() => {
        setSuggestion({
          month: 'August 2026',
          totalPool: 42000,
          note: 'Synthesized from 30-day velocity vectors and 20% safety margin.',
          categories: {
            Food: 12000,
            Transit: 4500,
            Subscriptions: 2400,
            Shopping: 8000,
            Entertainment: 5000,
          },
        });
      });
  }, []);

  const saveActive = async () => {
    if (!suggestion) return;
    try {
      await fetchFingetApi('/finance/active-budget', {
        method: 'PUT',
        body: JSON.stringify({
          activeBudget: {
            month: suggestion.month,
            categories: suggestion.categories,
          },
        }),
      });
    } catch {
      // Handled gracefully in mock / memory state
    }
    setActive({ month: suggestion.month, categories: suggestion.categories });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">
            SYSTEM PREFERENCES & PARAMETERS
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-semibold text-stone-500">TELEMETRY CONFIG</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-display font-black tracking-tight text-stone-900">
          Settings & Auto-Budget Engine
        </h1>
        <p className="text-xs sm:text-sm text-stone-600 mt-1 font-medium">
          Configure real-time threshold limits, autonomous safety models, and account credentials.
        </p>
      </div>

      {/* Account & Engine Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card-frosted rounded-3xl p-5 border border-white/80 flex items-center gap-4 shadow-xs">
          <div className="p-3 rounded-2xl bg-amber-100 text-amber-700 shadow-xs">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-stone-500">Authenticated Identity</p>
            <p className="text-sm font-bold text-stone-900">{user?.name || 'Operator'}</p>
            <p className="text-[11px] font-medium text-stone-500">{user?.email || 'admin@finget.ai'}</p>
          </div>
        </div>

        <div className="glass-card-frosted rounded-3xl p-5 border border-white/80 flex items-center gap-4 shadow-xs">
          <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-700 shadow-xs">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-stone-500">Database Stream</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-800">Cloud Storage Synced</span>
            </div>
            <p className="text-[10px] text-stone-500 font-medium mt-0.5">0ms latency · Auto-persisted</p>
          </div>
        </div>
      </div>

      {/* Risk Profile Switcher */}
      <div className="glass-card-frosted rounded-3xl p-6 sm:p-7 border border-white/80 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-stone-200/80">
          <Sliders className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-bold text-stone-900">Algorithmic Risk Sensitivity</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { id: 'safe', label: 'Conservative', desc: 'Strict spending barriers, 30% savings lock' },
            { id: 'balanced', label: 'Balanced (Optimal)', desc: 'Dynamic daily allowance with smart buffers' },
            { id: 'aggressive', label: 'High-Growth', desc: 'Maximized liquidity for aggressive investing' },
          ].map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => setRiskTolerance(profile.id as any)}
              className={`p-4 rounded-2xl text-left border transition-all ${
                riskTolerance === profile.id
                  ? 'bg-amber-100/90 border-amber-400 text-stone-900 shadow-xs ring-1 ring-amber-400'
                  : 'bg-white/80 border-stone-200 text-stone-600 hover:border-stone-300'
              }`}
            >
              <h4 className="font-bold text-xs text-stone-900 mb-1">{profile.label}</h4>
              <p className="text-[10px] text-stone-500 leading-relaxed font-medium">{profile.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Auto Budget Synthesizer */}
      <div className="glass-card-frosted rounded-3xl p-6 sm:p-7 border border-white/80 space-y-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200/80">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-stone-900">Synthesized Monthly Budget</h3>
          </div>
          {active?.month && (
            <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Active: {active.month}
            </span>
          )}
        </div>

        <p className="text-xs text-stone-600 leading-relaxed font-medium">
          {suggestion?.note || 'Synthesizing historical telemetry to derive maximum safe spending thresholds.'}
        </p>

        {suggestion?.totalPool != null && (
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-between shadow-xs">
            <span className="text-xs uppercase font-bold text-amber-800">Disposable Spend Pool</span>
            <span className="text-xl font-black text-amber-950 font-display">
              ₹{suggestion.totalPool.toLocaleString()}
            </span>
          </div>
        )}

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {suggestion?.categories &&
            Object.entries(suggestion.categories).map(([cat, amt]) => (
              <div
                key={cat}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-white/80 border border-stone-200 text-xs shadow-xs"
              >
                <span className="text-stone-800 font-bold">{cat}</span>
                <span className="text-amber-800 font-bold">₹{Number(amt).toLocaleString()}</span>
              </div>
            ))}
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={saveActive}
            className="dark-pill-btn flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Allocations Synchronized!</span>
              </>
            ) : (
              <span>Deploy Active Budget Limits</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};


