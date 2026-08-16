import React from 'react';
import { useScope } from '../context/scopeStore';
import { useCoach } from '../hooks/useFinget';
import { AiMoneyCoach } from '../components/AiMoneyCoach';
import { PageHeader } from '../components/ui';

export const AiCoachPage: React.FC = () => {
  const { isFriends, group } = useScope();
  const { messages, send, clear, isTyping, aiEnabled } = useCoach();

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[520px]">
      <PageHeader
        eyebrow={isFriends ? `Friends mode · ${group?.name ?? ''}` : 'Personal mode'}
        title="AI coach"
        subtitle={
          isFriends
            ? "Ask about the group's shared wallet — it reasons over pooled income, split expenses and shared goals."
            : 'It reads your real numbers before answering, so the advice fits your actual month.'
        }
      />

      <AiMoneyCoach
        className="flex-1 min-h-0"
        messages={messages}
        onSend={send}
        onClear={clear}
        isTyping={isTyping}
        aiEnabled={aiEnabled}
        isGroup={isFriends}
      />
    </div>
  );
};
