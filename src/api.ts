/* ============================================================
   Finget API client.
   Every data call routes through here with an explicit scope, so
   personal and Friends mode can never silently read each other.
   ============================================================ */

export const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API = `${API_ORIGIN}/api`;

export type Scope = 'user' | 'group';

export interface ScopeRef {
  context: Scope;
  groupId?: string | null;
}

export const getToken = () => localStorage.getItem('finget_token');

export function buildQuery(context: Scope, groupId?: string | null): string {
  if (context === 'group' && groupId) {
    return `?context=group&groupId=${encodeURIComponent(groupId)}`;
  }
  return '?context=user';
}

/** Body fields that carry scope on POST/PUT requests. */
export function scopeBody(scope: ScopeRef): Record<string, unknown> {
  return scope.context === 'group' && scope.groupId
    ? { context: 'group', groupId: scope.groupId }
    : { context: 'user' };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    ...((options.headers as Record<string, string>) || {}),
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      'Cannot reach the Finget server. Is the backend running on port 5000?',
      0
    );
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { msg?: string; error?: string };
    throw new ApiError(data.msg || data.error || `Request failed (${res.status})`, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------------------------- auth ---------------------------- */

export interface Profile {
  _id: string;
  name: string;
  email: string;
  monthlyIncome: number;
}

export const authApi = {
  signup: (body: { name: string; email: string; password: string; monthlyIncome: number }) =>
    api<{ token: string; user: Profile }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    api<{ token: string; user: Profile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  me: () => api<Profile>('/auth/me'),
  updateMe: (body: { name?: string; monthlyIncome?: number }) =>
    api<Profile>('/auth/me', { method: 'PUT', body: JSON.stringify(body) }),
};

/* -------------------------- finance --------------------------- */

export type RiskLevel = 'Safe' | 'Warning' | 'Risky';

export interface Affordability {
  safeDaily: number;
  remaining: number;
  risk: RiskLevel;
  income: number;
  baseIncome: number;
  extraIncome: number;
  expenses: number;
  savingsTarget: number;
  emergencyBuffer: number;
  daysLeftInMonth: number;
  monthlyBurnRate: number;
  scope: Scope;
  memberCount: number;
}

export interface GoalImpact {
  name: string;
  outstanding: number;
  delayDays: number | null;
  blocked: boolean;
}

export interface Simulation {
  amount: number;
  remaining: number;
  safeDaily: number;
  risk: RiskLevel;
  impact: string;
  savingsDelayedDays: number | null;
  goalImpacts: GoalImpact[];
}

export interface BudgetSettings {
  scope: Scope;
  savingsTarget: number;
  emergencyBuffer: number;
  monthlyIncome: number;
  editable: boolean;
}

export const financeApi = {
  affordability: (scope: ScopeRef) =>
    api<Affordability>(`/finance/affordability${buildQuery(scope.context, scope.groupId)}`),

  simulate: (scope: ScopeRef, amount: number) =>
    api<Simulation>('/finance/simulate', {
      method: 'POST',
      body: JSON.stringify({ amount, ...scopeBody(scope) }),
    }),

  autoBudget: (scope: ScopeRef) =>
    api<{
      suggestion: {
        month: string;
        totalPool: number;
        categories: Record<string, number>;
        note: string;
      };
      activeBudget: { month?: string; categories?: Record<string, number> } | null;
    }>(`/finance/auto-budget${buildQuery(scope.context, scope.groupId)}`),

  saveActiveBudget: (activeBudget: { month?: string; categories?: Record<string, number> }) =>
    api('/finance/active-budget', {
      method: 'PUT',
      body: JSON.stringify({ activeBudget }),
    }),

  futureImpact: (scope: ScopeRef, category: string, reduceByMonthly: number) =>
    api<{
      category: string;
      currentMonthSpendApprox: number;
      reductionApplied: number;
      projectedMonthlySavings: number;
      projectedYearlySavings: number;
      timelineMonthsToSave100k: number | null;
    }>('/finance/future-impact', {
      method: 'POST',
      body: JSON.stringify({ category, reduceByMonthly, ...scopeBody(scope) }),
    }),

  budgetSettings: (scope: ScopeRef) =>
    api<BudgetSettings>(`/finance/budget-settings${buildQuery(scope.context, scope.groupId)}`),

  updateBudgetSettings: (
    scope: ScopeRef,
    body: { savingsTarget?: number; emergencyBuffer?: number }
  ) =>
    api<BudgetSettings>('/finance/budget-settings', {
      method: 'PUT',
      body: JSON.stringify({ ...body, ...scopeBody(scope) }),
    }),
};

/* ------------------------ transactions ------------------------ */

export interface Member {
  _id: string;
  name: string;
  email?: string;
  monthlyIncome?: number;
  isAdmin?: boolean;
}

export interface Split {
  userId: Member | string;
  amount: number;
  status: 'pending' | 'settled';
}

export interface Transaction {
  _id: string;
  amount: number;
  category: string;
  note?: string;
  type: 'expense' | 'income';
  date: string;
  paidBy?: Member | string;
  splitMode?: string;
  splits?: Split[];
}

export interface Nudge {
  type: string;
  severity: string;
  message: string;
  category: string;
}

export interface NewTransaction {
  amount: number;
  category: string;
  type: 'expense' | 'income';
  note?: string;
  date?: string;
  paidBy?: string;
  splitMode?: 'equal' | 'custom' | 'none';
  splits?: { userId: string; amount: number }[];
  splitWith?: string[];
}

export const txApi = {
  list: (scope: ScopeRef) =>
    api<Transaction[]>(`/transactions${buildQuery(scope.context, scope.groupId)}`),

  create: (scope: ScopeRef, body: NewTransaction) =>
    api<{ transaction: Transaction; nudge: Nudge | null }>('/transactions', {
      method: 'POST',
      body: JSON.stringify({ ...body, ...scopeBody(scope) }),
    }),

  remove: (id: string) => api(`/transactions/${id}`, { method: 'DELETE' }),

  categories: () => api<string[]>('/transactions/categories'),
};

/* --------------------------- goals ---------------------------- */

export interface Contribution {
  userId: Member | string;
  amount: number;
  date: string;
}

export interface Goal {
  _id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  priority: 'Low' | 'Medium' | 'High';
  sortOrder?: number;
  contributions?: Contribution[];
}

export const goalApi = {
  list: (scope: ScopeRef) => api<Goal[]>(`/goals${buildQuery(scope.context, scope.groupId)}`),

  create: (scope: ScopeRef, body: Partial<Goal>) =>
    api<Goal>('/goals', { method: 'POST', body: JSON.stringify({ ...body, ...scopeBody(scope) }) }),

  update: (id: string, body: Partial<Goal>) =>
    api<Goal>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  contribute: (id: string, amount: number) =>
    api<Goal>(`/goals/${id}/contribute`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

  remove: (id: string) => api(`/goals/${id}`, { method: 'DELETE' }),
};

/* --------------------------- groups --------------------------- */

export interface Group {
  _id: string;
  name: string;
  emoji: string;
  inviteCode: string;
  createdAt: string;
  savingsTarget: number;
  emergencyBuffer: number;
  isAdmin: boolean;
  members: Member[];
}

export interface Balance {
  userId: string;
  name: string;
  balance: number;
}

export interface Transfer {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  amount: number;
}

export interface BalanceSheet {
  balances: Balance[];
  transfers: Transfer[];
  totalGroupSpend: number;
  paidByMember: { userId: string; name: string; paid: number }[];
  settlements: {
    _id: string;
    from: string;
    to: string;
    fromName: string;
    toName: string;
    amount: number;
    date: string;
    note?: string;
  }[];
}

export interface ActivityItem {
  kind: 'expense' | 'income' | 'settlement' | 'goal';
  id: string;
  actor: string;
  counterparty?: string;
  amount: number;
  category?: string;
  note?: string;
  name?: string;
  saved?: number;
  splitCount?: number;
  date: string;
}

export const groupApi = {
  list: () => api<Group[]>('/groups'),
  get: (id: string) => api<Group>(`/groups/${id}`),

  create: (name: string, emoji?: string) =>
    api<Group>('/groups', { method: 'POST', body: JSON.stringify({ name, emoji }) }),

  joinByCode: (inviteCode: string) =>
    api<Group>('/groups/join', { method: 'POST', body: JSON.stringify({ inviteCode }) }),

  update: (id: string, body: { name?: string; emoji?: string }) =>
    api<Group>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  rotateCode: (id: string) =>
    api<{ inviteCode: string }>(`/groups/${id}/rotate-code`, { method: 'POST' }),

  leave: (id: string) =>
    api<{ msg: string; deleted: boolean }>(`/groups/${id}/leave`, { method: 'POST' }),

  balances: (id: string) => api<BalanceSheet>(`/groups/${id}/balances`),

  settle: (id: string, body: { from: string; to: string; amount: number; note?: string }) =>
    api(`/groups/${id}/settle`, { method: 'POST', body: JSON.stringify(body) }),

  activity: (id: string) => api<ActivityItem[]>(`/groups/${id}/activity`),
};

/* --------------------------- ai ------------------------------- */

export interface Insight {
  title: string;
  description: string;
  actionable_tip?: string;
  source?: string;
}

export interface HealthScore {
  score: number;
  label: string;
  hint?: string;
}

export const aiApi = {
  insights: (scope: ScopeRef) =>
    api<{ healthScore: HealthScore; insights: Insight[]; aiEnabled: boolean }>(
      `/ai/insights${buildQuery(scope.context, scope.groupId)}`
    ),

  history: (scope: ScopeRef) =>
    api<{ messages: { role: string; content: string }[]; aiEnabled: boolean }>(
      `/ai/coach/history${buildQuery(scope.context, scope.groupId)}`
    ),

  clearHistory: (scope: ScopeRef) =>
    api(`/ai/coach/history${buildQuery(scope.context, scope.groupId)}`, { method: 'DELETE' }),
};

/**
 * Streams the coach reply chunk by chunk over SSE.
 * Buffers partial lines — a chunk boundary can land mid-JSON.
 */
export async function streamCoach(
  scope: ScopeRef,
  question: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API}/ai/coach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ question, ...scopeBody(scope) }),
    signal,
  });

  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; msg?: string };
    throw new ApiError(data.error || data.msg || 'The coach could not respond.', res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the trailing fragment for the next read.
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') return;
      try {
        const data = JSON.parse(payload) as { text?: string; error?: string };
        if (data.error) throw new ApiError(data.error, 500);
        if (data.text) onChunk(data.text);
      } catch (err) {
        if (err instanceof ApiError) throw err;
        /* incomplete JSON — wait for more bytes */
      }
    }
  }
}
