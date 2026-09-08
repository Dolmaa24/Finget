import React, { useState } from 'react';
import {
  Clock,
  AlertTriangle,
  Plus,
  RefreshCw,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import type { AiProvider } from '../../api';
import { Badge, Button } from '../ui';

interface AiCreditCardProps {
  provider: AiProvider;
  onAddCredit: (provider: AiProvider) => void;
  onSync: (providerId: string) => Promise<void>;
  onDelete: (providerId: string) => void;
  onLogUsage?: (provider: AiProvider) => void;
}

const PROVIDER_LOGOS: Record<string, { color: string; bg: string; icon: string }> = {
  openai: { color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: '🟢' },
  anthropic: { color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/30', icon: '🟠' },
  openrouter: { color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/30', icon: '🟣' },
  groq: { color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/30', icon: '⚡' },
  deepseek: { color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/30', icon: '🐋' },
  gemini: { color: 'text-cyan-500', bg: 'bg-cyan-500/10 border-cyan-500/30', icon: '✨' },
  mistral: { color: 'text-rose-500', bg: 'bg-rose-500/10 border-rose-500/30', icon: '🌪️' },
  custom: { color: 'text-slate-500', bg: 'bg-slate-500/10 border-slate-500/30', icon: '⚙️' },
};

export const AiCreditCard: React.FC<AiCreditCardProps> = ({
  provider,
  onAddCredit,
  onSync,
  onDelete,
  onLogUsage,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const style = PROVIDER_LOGOS[provider.providerKey] || PROVIDER_LOGOS.custom;
  const totalBalance = provider.velocity?.totalBalance ?? 0;
  const grantBal = provider.grantBalance ?? 0;
  const paidBal = provider.paidBalance ?? 0;
  const dailyBurn = provider.velocity?.dailyBurn ?? 0;
  const runwayDays = provider.velocity?.runwayDays ?? 0;
  const lowThreshold = provider.settings?.lowBalanceThreshold ?? 10;
  const isLow = totalBalance < lowThreshold;

  // Check nearest expiring grant
  const expiringCredit = provider.credits?.find((c) => {
    if (!c.expiryDate || c.remainingBalance <= 0) return false;
    const days = Math.ceil((new Date(c.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days <= 14 && days >= 0;
  });

  const handleSyncClick = async () => {
    setSyncing(true);
    try {
      await onSync(provider._id);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="glass glass-sheen rounded-xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-soft border border-white/60 dark:border-white/10 relative">
      {/* Top row */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl border ${style.bg} ${style.color}`}
            >
              {style.icon}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-ink text-base leading-snug">{provider.name}</h3>
                <Badge tone={isLow ? 'warn' : provider.status === 'active' ? 'safe' : 'neutral'}>
                  {isLow ? 'Low balance' : provider.status}
                </Badge>
              </div>
              <p className="text-[12px] text-ink-3 capitalize flex items-center gap-1.5 mt-0.5">
                <span>{provider.syncType === 'api' ? 'API Synced' : provider.syncType === 'local_proxy' ? 'Proxy Logged' : 'Manual Ledger'}</span>
                {provider.lastSyncedAt && (
                  <>
                    <span>·</span>
                    <span title={new Date(provider.lastSyncedAt).toLocaleString()}>
                      Synced {new Date(provider.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSyncClick}
              disabled={syncing}
              title="Sync provider credits"
              className="p-1.5 rounded-pill text-ink-3 hover:text-ink hover:bg-white/50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-accent' : ''}`} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 rounded-pill text-ink-3 hover:text-ink hover:bg-white/50 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-44 glass-modal rounded-lg p-1 z-30 shadow-lg border border-white/60 animate-fade">
                    {onLogUsage && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onLogUsage(provider);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs font-medium text-ink hover:bg-white/50 rounded-md transition-colors"
                      >
                        Log Token Usage
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(provider._id);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs font-medium text-risk hover:bg-risk/10 rounded-md transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove Provider
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Balance Display */}
        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-ink tracking-tight">₹{totalBalance.toLocaleString()}</span>
          </div>

          {/* Grant vs Paid bar */}
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[11px] text-ink-2 font-medium mb-1">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Grants: ₹{grantBal.toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-accent" /> Paid: ₹{paidBal.toLocaleString()}
              </span>
            </div>

            <div className="w-full bg-black/10 dark:bg-white/10 h-2 rounded-full overflow-hidden flex">
              {totalBalance > 0 ? (
                <>
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{ width: `${(grantBal / totalBalance) * 100}%` }}
                    title={`Grants: ₹${grantBal}`}
                  />
                  <div
                    className="bg-[var(--accent)] h-full transition-all duration-500"
                    style={{ width: `${(paidBal / totalBalance) * 100}%` }}
                    title={`Paid: ₹${paidBal}`}
                  />
                </>
              ) : (
                <div className="bg-risk/40 w-full h-full" />
              )}
            </div>
          </div>
        </div>

        {/* Burn Velocity & Runway */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="glass-well rounded-lg p-2.5">
            <p className="text-[11px] text-ink-3 uppercase tracking-wider font-semibold">Daily Burn</p>
            <p className="text-sm font-bold text-ink mt-0.5">
              ₹{dailyBurn.toFixed(2)}<span className="text-[11px] font-normal text-ink-3">/day</span>
            </p>
          </div>

          <div className="glass-well rounded-lg p-2.5">
            <p className="text-[11px] text-ink-3 uppercase tracking-wider font-semibold">Runway</p>
            <p className="text-sm font-bold text-ink mt-0.5 flex items-center gap-1">
              {runwayDays >= 999 ? (
                '∞ ample'
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-accent" /> {runwayDays} days
                </>
              )}
            </p>
          </div>
        </div>

        {/* Expiration alert banner */}
        {expiringCredit && (
          <div className="mb-3 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <span className="truncate">
              Grant "{expiringCredit.name}" expires in{' '}
              <strong>
                {Math.max(1, Math.ceil((new Date(expiringCredit.expiryDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* Footer Action */}
      <div className="pt-2 border-t border-white/40 dark:border-white/10 flex items-center justify-between gap-2">
        <Button
          variant="glass"
          size="sm"
          onClick={() => onAddCredit(provider)}
          className="w-full gap-1 text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Add Credit / Grant
        </Button>
      </div>
    </div>
  );
};
