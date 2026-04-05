import { useState, useCallback, useEffect } from 'react';
import { streamCoachMessage, getCoachHistory } from '../api';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function useAiCoach(contextScope: { context?: 'user' | 'group'; groupId?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { messages: hist } = await getCoachHistory(
          contextScope.context || 'user',
          contextScope.groupId || null
        );
        if (cancelled || !hist?.length) return;
        setMessages(
          hist
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        );
      } catch {
        /* no history */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contextScope.context, contextScope.groupId]);

  const sendMessage = useCallback(
    async (
      text: string,
      affordability: { monthlyIncome?: number; totalObligations?: number; safeDaily?: number }
    ) => {
      setMessages((prev) => [...prev, { role: 'user', content: text }]);
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      setIsTyping(true);

      try {
        await streamCoachMessage(
          {
            question: text,
            income: affordability.monthlyIncome || 0,
            expenses: affordability.totalObligations || 0,
            safeToSpend: affordability.safeDaily || 0,
            context: contextScope.context || 'user',
            groupId: contextScope.groupId,
          },
          (textChunk) => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') {
                last.content += textChunk;
              }
              return next;
            });
          }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error';
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            last.content = `⚠️ ${msg}`;
          }
          return next;
        });
      } finally {
        setIsTyping(false);
      }
    },
    [contextScope.context, contextScope.groupId]
  );

  return { messages, sendMessage, isTyping };
}
