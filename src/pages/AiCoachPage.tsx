import React, { useEffect, useState } from 'react';
import { AiMoneyCoach } from '../components/AiMoneyCoach';
import { useAiCoach } from '../hooks/useAiCoach';
import { useScope } from '../context/ScopeContext';
import { fetchAffordability } from '../api';
import { Cpu } from 'lucide-react';

export const AiCoachPage: React.FC = () => {
  const { context, groupId } = useScope();
  const { messages, sendMessage, isTyping } = useAiCoach({ context, groupId: groupId || undefined });
  const [affordability, setAffordability] = useState({
    monthlyIncome: 0,
    totalObligations: 0,
    safeDaily: 0,
  });

  useEffect(() => {
    fetchAffordability(context, groupId)
      .then((data) => {
        setAffordability({
          monthlyIncome: data.income || 0,
          totalObligations: data.expenses || 0,
          safeDaily: data.safeDaily || 0,
        });
      })
      .catch(console.error);
  }, [context, groupId]);

  const handleSend = (msg: string) => {
    sendMessage(msg, affordability);
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col h-[calc(100vh-140px)] space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">
              AI ADVISORY ENGINE
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-semibold text-stone-500">
              {context === 'group' ? 'Squad Synced' : 'Personal Model'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-stone-900">
            AI Money Coach & Strategist
          </h1>
          <p className="text-xs text-stone-600 mt-0.5 font-medium">
            Real-time advisory powered by transaction histories, savings velocities, and target horizons.
          </p>
        </div>

        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full glass-card-frosted border border-white/80 text-amber-900 text-xs font-bold shrink-0 shadow-xs">
          <Cpu className="w-4 h-4 text-amber-600" />
          <span>Finget Advisor Engine: Online</span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <AiMoneyCoach messages={messages} onSendMessage={handleSend} isTyping={isTyping} />
      </div>
    </div>
  );
};


