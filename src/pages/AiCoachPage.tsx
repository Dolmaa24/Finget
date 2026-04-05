import React, { useEffect, useState } from 'react';
import { AiMoneyCoach } from '../components/AiMoneyCoach';
import { useAiCoach } from '../hooks/useAiCoach';
import { useScope } from '../context/ScopeContext';
import { fetchAffordability } from '../api';

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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto flex flex-col h-[80vh]">
      <h1 className="text-3xl font-black text-white mb-2">AI Coach</h1>
      <p className="text-slate-400 mb-6">
        Real-time streaming advice using your transactions, goals, and patterns.
        {context === 'group' && groupId ? ' Group-aware mode.' : ''}
      </p>

      <div className="flex-1 min-h-0">
        <AiMoneyCoach messages={messages} onSendMessage={handleSend} isTyping={isTyping} />
      </div>
    </div>
  );
};
