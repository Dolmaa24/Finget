import React, { useState, useEffect } from 'react';
import { Flame, Copy, Check, ShieldAlert, RefreshCw } from 'lucide-react';
import { aiApi, type SavageRoastResponse } from '../api';
import { useScope } from '../context/scopeStore';
import { useToast } from '../context/toastStore';
import { inr } from '../lib/format';
import { Button } from './ui';
import { VaultButton } from './VaultButton';

interface SavageConscienceProps {
  amount: number;
  itemName?: string;
  onHeld?: () => void;
  className?: string;
}

type Persona = 'savage' | 'desi_mom' | 'toxic_cfo' | 'monk';

const PERSONAS: { id: Persona; label: string; icon: string; subtitle: string; toneClass: string }[] = [
  { id: 'savage', label: '🔥 Gen-Z Savage', icon: '💀', subtitle: 'Zero filter, brutal reality', toneClass: 'from-orange-500/20 to-red-500/20 border-orange-500/40' },
  { id: 'desi_mom', label: '👩‍🍳 Desi Mom Guilt', icon: '🩴', subtitle: 'Paisa ped pe ugta hai kya?', toneClass: 'from-amber-500/20 to-yellow-500/20 border-amber-500/40' },
  { id: 'toxic_cfo', label: '💼 Wall St CFO', icon: '📊', subtitle: 'CapEx Requisition Denied', toneClass: 'from-blue-500/20 to-indigo-500/20 border-blue-500/40' },
  { id: 'monk', label: '🧘 Zen Minimalist', icon: '🍃', subtitle: 'Is this true enlightenment?', toneClass: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/40' },
];

export const SavageConscience: React.FC<SavageConscienceProps> = ({
  amount,
  itemName = 'this item',
  onHeld,
  className = '',
}) => {
  const { scope } = useScope();
  const { toast } = useToast();
  const [persona, setPersona] = useState<Persona>('savage');
  const [data, setData] = useState<SavageRoastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchRoast = (selectedPersona: Persona = persona) => {
    if (amount <= 0) return;
    setLoading(true);
    aiApi
      .roast(scope, {
        amount,
        itemOrCategory: itemName,
        persona: selectedPersona,
      })
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        console.error('Roast error:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRoast(persona);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, persona, itemName]);

  const handleCopy = () => {
    if (!data) return;
    const text = `🔥 Savage Financial Reality Check (${inr(amount)} for ${itemName}):\n\n"${data.roast}"\n\n📌 Equivalents:\n${data.equivalents.join('\n')}\n\n⚡ ${data.punchline}\n— Checked with Finget`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast('Copied roast to clipboard!', 'info');
      setTimeout(() => setCopied(false), 2500);
    });
  };

  if (amount <= 0) {
    return (
      <div className={`glass-well rounded-lg p-5 text-center ${className}`}>
        <Flame className="w-8 h-8 text-orange-400 mx-auto mb-2 animate-bounce" />
        <p className="text-sm font-semibold text-ink">The Savage Conscience</p>
        <p className="text-xs text-ink-3">Enter an amount to activate the reality check.</p>
      </div>
    );
  }

  const currentPersona = PERSONAS.find((p) => p.id === persona);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br transition-all duration-300 p-5 ${currentPersona?.toneClass} ${className}`}
    >
      {/* Decorative flame orbs */}
      <div className="pointer-events-none absolute -right-6 -top-6 w-28 h-28 bg-orange-400/20 rounded-full blur-2xl" />
      <div className="pointer-events-none absolute -left-6 -bottom-6 w-28 h-28 bg-red-400/20 rounded-full blur-2xl" />

      {/* Header & Persona Selector */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 text-lg">
            {currentPersona?.icon}
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-bold text-ink flex items-center gap-1">
                The Savage Conscience <Flame className="w-4 h-4 text-orange-500 fill-orange-500 animate-pulse" />
              </h4>
            </div>
            <p className="text-[11px] text-ink-3">{currentPersona?.subtitle}</p>
          </div>
        </div>

        {/* Persona Tabs */}
        <div className="flex items-center gap-1 bg-black/10 dark:bg-white/10 p-1 rounded-pill backdrop-blur-md overflow-x-auto scroll-slim">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPersona(p.id);
                fetchRoast(p.id);
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-pill transition-all whitespace-nowrap ${
                persona === p.id
                  ? 'bg-white text-ink shadow-sm scale-105'
                  : 'text-ink-3 hover:text-ink hover:bg-white/40'
              }`}
            >
              {p.icon} {p.label.split(' ')[1] || p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Roast Content */}
      <div className="relative z-10 space-y-3.5">
        {loading ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-6 h-6 text-orange-500 animate-spin" />
            <p className="text-xs font-medium text-ink-2 animate-pulse">Consulting the savage financial spirits…</p>
          </div>
        ) : data ? (
          <>
            {/* The Main Roast Box */}
            <div className="glass-well rounded-lg p-4 border border-white/60 dark:border-white/10 shadow-sm relative">
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5 select-none">{currentPersona?.icon}</span>
                <div className="flex-1 space-y-2">
                  <p className="text-[14px] font-medium text-ink leading-relaxed italic">
                    "{data.roast}"
                  </p>
                  <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                    ⚡ {data.realityCheck}
                  </p>
                </div>
              </div>
            </div>

            {/* Equivalents Badges */}
            {data.equivalents && data.equivalents.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-ink-3 uppercase tracking-wider">
                  What ₹{inr(amount)} is actually worth:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.equivalents.map((eq, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white/70 dark:bg-black/40 border border-white/50 text-ink shadow-2xs backdrop-blur-sm"
                    >
                      {eq}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Delusion Score Meter */}
            <div className="space-y-1 bg-black/5 dark:bg-white/5 rounded-lg p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-2 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500" /> Financial Delusion Index:
                </span>
                <span className="font-bold text-red-600 dark:text-red-400">
                  {data.absurdityScore}% High Impulse
                </span>
              </div>
              <div className="w-full bg-black/10 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-600 transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, Math.max(10, data.absurdityScore))}%` }}
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <VaultButton amount={amount} onHeld={onHeld} />
                <Button
                  variant="glass"
                  size="sm"
                  onClick={handleCopy}
                  className="gap-1.5 text-xs font-semibold"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Share Roast'}
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchRoast(persona)}
                className="text-xs text-ink-3 hover:text-ink gap-1 p-1.5"
                title="Roast again"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <div className="py-4 text-center text-xs text-ink-3">
            Could not generate roast right now.
          </div>
        )}
      </div>
    </div>
  );
};
