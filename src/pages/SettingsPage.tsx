import React, { useEffect, useState } from 'react';
import { fetchFingetApi } from '../api';

export const SettingsPage: React.FC = () => {
  const [suggestion, setSuggestion] = useState<{
    month?: string;
    totalPool?: number;
    categories?: Record<string, number>;
    note?: string;
  } | null>(null);
  const [active, setActive] = useState<{ month?: string; categories?: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchFingetApi('/finance/auto-budget?context=user')
      .then((data: { suggestion: typeof suggestion; activeBudget: typeof active }) => {
        setSuggestion(data.suggestion);
        setActive(data.activeBudget);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveActive = async () => {
    if (!suggestion) return;
    await fetchFingetApi('/finance/active-budget', {
      method: 'PUT',
      body: JSON.stringify({
        activeBudget: {
          month: suggestion.month,
          categories: suggestion.categories,
        },
      }),
    });
    setActive({ month: suggestion.month, categories: suggestion.categories });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="animate-in fade-in max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">User settings</h1>
        <p className="text-slate-400">Auto-budget generator from your last 30 days of spending.</p>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="bg-navy-800 rounded-3xl p-6 border border-slate-700/50 space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Auto-budget</h2>
          <p className="text-sm text-slate-400">{suggestion?.note}</p>
          {suggestion?.totalPool != null && (
            <p className="text-white font-bold">Pool after savings & buffer: ₹{suggestion.totalPool.toLocaleString()}</p>
          )}
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {suggestion?.categories &&
              Object.entries(suggestion.categories).map(([cat, amt]) => (
                <li key={cat} className="flex justify-between text-sm border-b border-slate-700/50 py-2">
                  <span className="text-slate-300">{cat}</span>
                  <span className="text-primary font-mono">₹{Number(amt).toLocaleString()}</span>
                </li>
              ))}
          </ul>
          <button
            type="button"
            onClick={saveActive}
            className="bg-primary text-navy-950 font-bold px-6 py-2 rounded-xl"
          >
            Save as active budget
          </button>
          {saved && <p className="text-primary text-sm">Saved.</p>}
          {active?.month && (
            <p className="text-xs text-slate-500">
              Active budget month: {active.month} ({Object.keys(active.categories || {}).length} categories)
            </p>
          )}
        </div>
      )}
    </div>
  );
};
