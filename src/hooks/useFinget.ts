import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  aiApi,
  financeApi,
  goalApi,
  groupApi,
  txApi,
  streamCoach,
  API_ORIGIN,
  type Affordability,
  type BalanceSheet,
  type ActivityItem,
  type Goal,
  type HealthScore,
  type Insight,
  type Transaction,
} from '../api';
import { useAuth } from '../context/authStore';
import { useScope } from '../context/scopeStore';

/** Shared shape for every async resource below. */
interface Resource<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

/**
 * Generic scope-aware fetcher. Re-runs whenever the mode, group or global
 * revision changes, and drops responses that arrive after a scope switch so a
 * slow personal request can never paint over Friends data.
 */
function useScopedResource<T>(
  loader: () => Promise<T>,
  initial: T,
  deps: unknown[]
): Resource<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    loader()
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setError(errorMessage(err));
        setData(initial);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    // `loader` and `initial` are intentionally excluded: callers pass inline
    // closures, and `deps` describes what actually invalidates the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, reload };
}

/* ------------------------- affordability ------------------------- */

const EMPTY_AFFORDABILITY: Affordability = {
  safeDaily: 0,
  remaining: 0,
  risk: 'Safe',
  income: 0,
  baseIncome: 0,
  extraIncome: 0,
  expenses: 0,
  savingsTarget: 0,
  emergencyBuffer: 0,
  daysLeftInMonth: 30,
  monthlyBurnRate: 0,
  scope: 'user',
  memberCount: 1,
};

export function useAffordability() {
  const { scope, context, groupId, revision } = useScope();
  return useScopedResource<Affordability>(
    () => financeApi.affordability(scope),
    EMPTY_AFFORDABILITY,
    [context, groupId, revision]
  );
}

/* -------------------------- transactions ------------------------- */

export function useTransactions() {
  const { scope, context, groupId, revision } = useScope();
  return useScopedResource<Transaction[]>(() => txApi.list(scope), [], [
    context,
    groupId,
    revision,
  ]);
}

/* ----------------------------- goals ----------------------------- */

export function useGoals() {
  const { scope, context, groupId, revision } = useScope();
  const resource = useScopedResource<Goal[]>(() => goalApi.list(scope), [], [
    context,
    groupId,
    revision,
  ]);

  const create = useCallback(
    async (body: Partial<Goal>) => {
      await goalApi.create(scope, body);
      resource.reload();
    },
    [scope, resource]
  );

  const update = useCallback(
    async (id: string, body: Partial<Goal>) => {
      await goalApi.update(id, body);
      resource.reload();
    },
    [resource]
  );

  const contribute = useCallback(
    async (id: string, amount: number) => {
      await goalApi.contribute(id, amount);
      resource.reload();
    },
    [resource]
  );

  const remove = useCallback(
    async (id: string) => {
      await goalApi.remove(id);
      resource.reload();
    },
    [resource]
  );

  return { ...resource, goals: resource.data, create, update, contribute, remove };
}

/* ---------------------------- insights --------------------------- */

export function useInsights() {
  const { scope, context, groupId, revision } = useScope();
  return useScopedResource<{
    healthScore: HealthScore | null;
    insights: Insight[];
    aiEnabled: boolean;
  }>(
    () => aiApi.insights(scope),
    { healthScore: null, insights: [], aiEnabled: false },
    [context, groupId, revision]
  );
}

/* ------------------------- group balances ------------------------ */

const EMPTY_SHEET: BalanceSheet = {
  balances: [],
  transfers: [],
  totalGroupSpend: 0,
  paidByMember: [],
  settlements: [],
};

export function useBalances() {
  const { groupId, revision } = useScope();
  return useScopedResource<BalanceSheet>(
    () => (groupId ? groupApi.balances(groupId) : Promise.resolve(EMPTY_SHEET)),
    EMPTY_SHEET,
    [groupId, revision]
  );
}

export function useActivity() {
  const { groupId, revision } = useScope();
  return useScopedResource<ActivityItem[]>(
    () => (groupId ? groupApi.activity(groupId) : Promise.resolve([])),
    [],
    [groupId, revision]
  );
}

/* --------------------------- live sync --------------------------- */

/**
 * Keeps one socket per active group and bumps the global revision whenever a
 * member adds an expense, settles up, or funds a shared goal — so every open
 * view refreshes without polling.
 */
export function useGroupLiveSync() {
  const { token } = useAuth();
  const { groupId, bumpRevision } = useScope();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!groupId || !token) return;

    const socket = io(API_ORIGIN, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('joinGroup', { groupId, token }));

    const refresh = () => bumpRevision();
    socket.on('transaction:created', refresh);
    socket.on('settlement:created', refresh);
    socket.on('goal:updated', refresh);
    socket.on('group:updated', refresh);

    return () => {
      socket.emit('leaveGroup', { groupId });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [groupId, token, bumpRevision]);
}

/* --------------------------- ai coach ---------------------------- */

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useCoach() {
  const { scope, context, groupId } = useScope();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    setMessages([]);

    aiApi
      .history(scope)
      .then(({ messages: history, aiEnabled: enabled }) => {
        if (cancelled) return;
        setAiEnabled(enabled);
        setMessages(
          history
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        );
      })
      .catch(() => {
        /* no history yet is fine */
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, groupId]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || isTyping) return;

      abortRef.current = new AbortController();
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: '' },
      ]);
      setIsTyping(true);

      // Accumulate locally, then replace the last bubble — mutating the
      // message object in place would not trigger a re-render.
      let acc = '';
      const paint = (content: string) =>
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content };
          return next;
        });

      try {
        await streamCoach(
          scope,
          question,
          (chunk) => {
            acc += chunk;
            paint(acc);
          },
          abortRef.current.signal
        );
      } catch (err) {
        paint(`⚠️ ${errorMessage(err)}`);
      } finally {
        setIsTyping(false);
      }
    },
    [scope, isTyping]
  );

  const clear = useCallback(async () => {
    await aiApi.clearHistory(scope).catch(() => {});
    setMessages([]);
  }, [scope]);

  return { messages, send, clear, isTyping, aiEnabled, loadingHistory };
}

/* -------------------------- simulation --------------------------- */

/** Debounced what-if simulation driven by an amount the user is typing. */
export function useSimulation(amount: number, delay = 350) {
  const { scope, context, groupId } = useScope();
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof financeApi.simulate>
  > | null>(null);
  const [pending, setPending] = useState(false);

  const key = useMemo(() => `${context}:${groupId}:${amount}`, [context, groupId, amount]);

  useEffect(() => {
    if (!(amount > 0)) {
      setResult(null);
      setPending(false);
      return;
    }

    setPending(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      financeApi
        .simulate(scope, amount)
        .then((res) => !cancelled && setResult(res))
        .catch(() => !cancelled && setResult(null))
        .finally(() => !cancelled && setPending(false));
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay]);

  return { result, pending };
}
