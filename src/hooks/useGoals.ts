import { useState, useCallback, useEffect } from 'react';
import { fetchFingetApi, buildQuery } from '../api';

export interface Goal {
  _id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  priority: 'Low' | 'Medium' | 'High';
  sortOrder?: number;
}

export function useGoals(contextScope: { context?: 'user' | 'group'; groupId?: string }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGoals = useCallback(async () => {
    try {
      setLoading(true);
      const q = buildQuery(contextScope.context || 'user', contextScope.groupId || null);
      const data = await fetchFingetApi(`/goals${q}`);
      setGoals(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [contextScope.context, contextScope.groupId]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const addGoal = async (goalData: Partial<Goal>) => {
    const data = await fetchFingetApi('/goals', {
      method: 'POST',
      body: JSON.stringify({
        ...goalData,
        context: contextScope.context || 'user',
        groupId: contextScope.groupId,
      }),
    });
    setGoals((prev) => [...prev, data]);
    return data;
  };

  const updateGoal = async (id: string, updateData: Partial<Goal>) => {
    const data = await fetchFingetApi(`/goals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
    setGoals((prev) => prev.map((g) => (g._id === id ? data : g)));
  };

  const deleteGoal = async (id: string) => {
    await fetchFingetApi(`/goals/${id}`, { method: 'DELETE' });
    setGoals((prev) => prev.filter((g) => g._id !== id));
  };

  return { goals, loading, loadGoals, addGoal, updateGoal, deleteGoal };
}
