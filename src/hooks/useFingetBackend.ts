import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { fetchAffordability, addTransaction, streamCoachMessage } from '../api';
import type { Message } from './useAiCoach';

export type RiskLevel = 'Safe' | 'Warning' | 'Risky';

export interface AffordabilityResult {
  safeToSpendToday: number;
  remainingBudget: number;
  riskLevel: RiskLevel;
  totalObligations: number;
  safeDaily: number;
  targetDailySavings: number;
  income?: number;
  expenses?: number;
}

export interface SimulationResult {
  amountSubtracted: number;
  newRemainingBudget: number;
  savingsDelayedDays: number;
  newRiskLevel: RiskLevel;
}

export const useFingetBackend = () => {
  const { token } = useAuth();
  const { context, groupId } = useScope();
  const [loading, setLoading] = useState(true);
  const [affordability, setAffordability] = useState<AffordabilityResult>({
    safeToSpendToday: 0,
    remainingBudget: 0,
    riskLevel: 'Safe',
    totalObligations: 0,
    safeDaily: 0,
    targetDailySavings: 0,
  });
  const [lastNudge, setLastNudge] = useState<{ message: string } | null>(null);

  const [currentSpending] = useState<number>(0);

  const loadData = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetchAffordability(context, groupId)
      .then((data) => {
        setAffordability({
          safeToSpendToday: data.safeDaily || 0,
          remainingBudget: data.remaining || 0,
          riskLevel: (data.risk as RiskLevel) || 'Safe',
          totalObligations: data.expenses || 0,
          safeDaily: data.safeDaily || 0,
          targetDailySavings: 0,
          income: data.income || 0,
          expenses: data.expenses || 0,
        });
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
      });
  }, [token, context, groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const simulatePurchase = async (purchaseAmount: number): Promise<SimulationResult> => {
    const body: Record<string, unknown> = { amount: purchaseAmount };
    if (context === 'group' && groupId) {
      body.context = 'group';
      body.groupId = groupId;
    }
    const res = await fetch('http://localhost:5000/api/finance/simulate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Simulation failed');
    const data = await res.json();

    return {
      amountSubtracted: purchaseAmount,
      newRemainingBudget: data.remaining,
      savingsDelayedDays: Math.ceil(purchaseAmount / Math.max(1, affordability.safeDaily)),
      newRiskLevel: data.risk as RiskLevel,
    };
  };

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your Finget Coach. Ask anything about your money." },
  ]);

  const sendMessageToCoach = async (text: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      let acc = '';
      await streamCoachMessage(
        {
          question: text,
          income: affordability.income || 0,
          expenses: affordability.expenses || 0,
          safeToSpend: affordability.safeDaily,
          context,
          groupId,
        },
        (chunk) => {
          acc += chunk;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') last.content = acc;
            return next;
          });
        }
      );
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') last.content = 'Could not reach the AI coach. Check your API key.';
        return next;
      });
    }
  };

  const handleAddTransaction = async (data: Record<string, unknown>) => {
    const payload = { ...data };
    if (context === 'group' && groupId) {
      payload.context = 'group';
      payload.groupId = groupId;
    } else {
      payload.context = 'user';
    }
    const result = await addTransaction(payload);
    setLastNudge(
      result.nudge && typeof result.nudge === 'object' && result.nudge !== null && 'message' in result.nudge
        ? { message: String((result.nudge as { message: string }).message) }
        : null
    );
    loadData();
  };

  return {
    profile: null,
    currentSpending,
    affordability,
    simulatePurchase,
    messages,
    sendMessageToCoach,
    handleAddTransaction,
    loading,
    lastNudge,
    clearNudge: () => setLastNudge(null),
  };
};
