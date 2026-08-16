/* ============================================================
   Finget API client.
   Every data call routes through here with an explicit scope, so
   personal and Friends mode can never silently read each other.
   ============================================================ */

export const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:5001';
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
      'Cannot reach the Finget server. Is the backend running on port 5001?',
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
  /** Ring-fenced by live 48-hour vault holds. Not spent, not available. */
  held: number;
  heldPaise: number;
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
  headline: string;
  headlineKind: HeadlineKind;
  daysOfSafeSpend: number | null;
}

/**
 * Which frame produced `headline`. The two numeric frames use different
 * denominators on purpose — `delayDays` is savings capacity lost, while
 * `daysOfSafeSpend` is amount ÷ daily allowance. Never compare them.
 */
export type HeadlineKind = 'goal_delay' | 'safe_days' | 'rupees';

/** Goal currency: what a purchase actually costs, in terms that land. */
export interface Translation {
  amountPaise: number;
  amount: number;
  currency: 'INR';
  daysOfSafeSpend: number | null;
  goalImpacts: (GoalImpact & { goalId: string | null; outstandingPaise: number })[];
  headline: string;
  headlineKind: HeadlineKind;
  riskAfter: RiskLevel;
  remainingAfterPaise: number;
  remainingAfter: number;
  safeDailyAfterPaise: number;
  safeDailyAfter: number;
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

  /**
   * Goal currency. Takes integer paise — the client never does the ÷100 itself,
   * it passes what the server gave it or uses `rupeesToPaise` at the input edge.
   */
  translate: (scope: ScopeRef, amountPaise: number) =>
    api<Translation>('/finance/translate', {
      method: 'POST',
      body: JSON.stringify({ amountPaise, ...scopeBody(scope) }),
    }),

  /** @deprecated Rupee-denominated wrapper over `translate`. */
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

/* ------------------------ api tokens -------------------------- */

/** What a scoped credential is allowed to reach. One entry, one route. */
export type TokenScope = 'translate' | 'deflect';

/** Plain-language labels for the connect page and Settings. */
export const SCOPE_LABELS: Record<TokenScope, string> = {
  translate: 'Ask what a price means for your goals',
  deflect: 'Put something in your 48-hour vault',
};

/** A scoped credential held by something that is not the web app. */
export interface ApiToken {
  _id: string;
  name: string;
  scopes: TokenScope[];
  /** e.g. "fgt_A1b2C3" — enough to tell two apart, not enough to use. */
  prefix: string;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt: string;
}

export const tokenApi = {
  list: () => api<ApiToken[]>('/tokens'),

  /**
   * The plaintext token comes back exactly once, here. It is never stored by
   * the app and cannot be re-read — losing it means minting a new one.
   */
  create: (name?: string, scopes: TokenScope[] = ['translate', 'deflect']) =>
    api<{ token: string; apiToken: ApiToken }>('/tokens', {
      method: 'POST',
      body: JSON.stringify({ scopes, name }),
    }),

  revoke: (id: string) => api<{ msg: string }>(`/tokens/${id}`, { method: 'DELETE' }),
};

/* -------------------------- import ---------------------------- */

export interface ImportStatus {
  /** Always true — the SMS path needs no key and no provider. */
  smsEnabled: boolean;
  screenshotEnabled: boolean;
  visionProvider: string;
  message: string | null;
  maxImageBytes: number;
  maxSmsChars: number;
  /** The trust claim, served by the API so the UI states it rather than implies it. */
  imagesStored: false;
}

/** A parsed row awaiting review. Nothing is written until the person confirms. */
export interface ImportRow {
  amountPaise: number;
  amount: number;
  type: 'expense' | 'income';
  /** False when the direction was assumed rather than read. */
  directionDetected: boolean;
  date: string | null;
  merchant: string | null;
  issuerLabel: string | null;
  reference: string | null;
  confidence: number;
  source: 'sms' | 'screenshot';
  raw: string | null;
  category: string | null;
  categorySource: 'learned' | 'seed' | null;
  /** Fields to highlight rather than present as fact. */
  needsAttention: string[];
  duplicateOf: {
    transactionId: string | null;
    reason: string;
    confidence: number;
    amount: number;
    date: string;
    label: string | null;
  } | null;
  /** Pre-ticked, except for suspected duplicates. */
  include: boolean;
}

export const importApi = {
  status: () => api<ImportStatus>('/receipts/status'),

  /** Deterministic, offline, and needs no key. The primary import path. */
  parseSms: (scope: ScopeRef, text: string) =>
    api<{ rows: ImportRow[]; source: 'sms'; unrecognised: string[]; truncated: boolean }>(
      '/receipts/parse-sms',
      { method: 'POST', body: JSON.stringify({ text, ...scopeBody(scope) }) }
    ),

  /** The image is sent, read, and discarded — never stored server-side. */
  parseScreenshot: (scope: ScopeRef, dataUrl: string) =>
    api<{ rows: ImportRow[]; source: 'screenshot'; imageDiscarded: boolean }>('/receipts/parse', {
      method: 'POST',
      body: JSON.stringify({ image: dataUrl, ...scopeBody(scope) }),
    }),

  commit: (scope: ScopeRef, rows: Partial<ImportRow>[]) =>
    api<{ imported: number; skipped: { index: number; reason: string }[]; learnedCategories: number }>(
      '/receipts/commit',
      { method: 'POST', body: JSON.stringify({ rows, ...scopeBody(scope) }) }
    ),
};

/* ------------------------ deflections ------------------------- */

export type DeflectionState = 'considering' | 'deflected' | 'bought';

export interface Deflection {
  _id: string;
  label: string;
  amountPaise: number;
  sourceUrl?: string;
  state: DeflectionState;
  vaultUntil?: string;
  decidedAt?: string;
  autoResolved?: boolean;
  createdAt: string;
  translationSnapshot?: {
    headline?: string;
    headlineKind?: HeadlineKind;
    goalName?: string;
    riskAfter?: RiskLevel;
  };
}

/** Money kept. There is deliberately no "spent anyway" total in this shape. */
export interface Ledger {
  scope: Scope;
  month: number;
  quarter: number;
  allTime: number;
  count: { month: number; quarter: number; allTime: number };
  /** Null until there is something to translate — never "0 days of Goa". */
  headline: { text: string; kind: HeadlineKind; goalName: string | null } | null;
  held: number;
  heldPaise: number;
  holds: Deflection[];
  deflections: Deflection[];
}

export const deflectionApi = {
  /** "I want this." Ring-fences the amount for 48 hours, immediately. */
  hold: (scope: ScopeRef, body: { label: string; amountPaise: number; sourceUrl?: string }) =>
    api<{
      deflection: Deflection;
      vaultHours: number;
      graceHours: number;
      safeToSpend: {
        before: { remaining: number; safeDaily: number; risk: RiskLevel };
        after: { remaining: number; safeDaily: number; risk: RiskLevel };
      };
    }>('/deflections', { method: 'POST', body: JSON.stringify({ ...body, ...scopeBody(scope) }) }),

  resolve: (scope: ScopeRef, id: string, decision: 'deflected' | 'bought') =>
    api<{
      deflection: Deflection;
      released: boolean;
      safeToSpend: { remaining: number; safeDaily: number; risk: RiskLevel };
    }>(`/deflections/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision, ...scopeBody(scope) }),
    }),

  ledger: (scope: ScopeRef) =>
    api<Ledger>(`/deflections/ledger${buildQuery(scope.context, scope.groupId)}`),

  /** Holds whose 48 hours are up and which are waiting on an answer. */
  pending: (scope: ScopeRef) =>
    api<Deflection[]>(`/deflections/pending${buildQuery(scope.context, scope.groupId)}`),
};

/* -------------------------- share ----------------------------- */

export type ShareKind = 'translate' | 'deflection' | 'wrapped' | 'trip_invite';

export interface ShareCard {
  token: string;
  kind: ShareKind;
  url: string;
  /** Null when the server cannot rasterise — hide the preview, keep the link. */
  imageUrl: string | null;
  payload: Record<string, unknown>;
  expiresAt: string;
}

export const shareApi = {
  /**
   * Sends an intent, not a payload: the server recomputes the figures and
   * builds the card itself, so nothing unredacted can be smuggled in.
   */
  createTranslate: (scope: ScopeRef, amountPaise: number) =>
    api<ShareCard>('/share', {
      method: 'POST',
      body: JSON.stringify({ kind: 'translate', amountPaise, ...scopeBody(scope) }),
    }),

  /** The quarter's deflection total. The server refuses to mint one at zero. */
  createDeflection: (scope: ScopeRef) =>
    api<ShareCard>('/share', {
      method: 'POST',
      body: JSON.stringify({ kind: 'deflection', ...scopeBody(scope) }),
    }),

  list: () => api<ShareCard[]>('/share'),

  revoke: (token: string) => api<{ msg: string }>(`/share/${token}`, { method: 'DELETE' }),
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

export type GroupKind = 'household' | 'trip';

export interface Group {
  _id: string;
  name: string;
  emoji: string;
  inviteCode: string;
  /** 22-char opaque token for the public share link. Members only. */
  previewToken: string | null;
  createdAt: string;
  savingsTarget: number;
  emergencyBuffer: number;
  kind: GroupKind;
  startDate: string | null;
  endDate: string | null;
  pot: number;
  potPaise: number;
  timezone: string;
  wrappedGeneratedAt: string | null;
  isAdmin: boolean;
  members: Member[];
}

export type PaceStatus = 'under' | 'on' | 'over';

/** Live trip burn. `isTrip: false` for a household group — not an error. */
export type TripStatus =
  | { isTrip: false; kind: GroupKind }
  | {
      isTrip: true;
      kind: 'trip';
      name: string;
      emoji: string;
      startDate: string;
      endDate: string;
      dayIndex: number;
      totalDays: number;
      daysRemaining: number;
      started: boolean;
      finished: boolean;
      spent: number;
      spentPaise: number;
      pot: number;
      potPaise: number;
      /** Null when no pot is set — there is nothing to be over. */
      percentSpent: number | null;
      paceStatus: PaceStatus;
      dailyAllowance: number;
      projectedFinal: number;
      projectedOverspend: number | null;
      message: string;
    };

export interface Superlative {
  title: string;
  name: string | null;
  detail: string;
  memberId: string | null;
}

export interface Wrapped {
  tripName: string;
  emoji: string;
  days: number;
  memberCount: number;
  totalSpent: number;
  perMember: {
    memberId: string;
    name: string;
    firstName: string;
    paid: number;
    share: number;
    net: number;
  }[];
  biggestExpense: { label: string; category: string; amount: number } | null;
  topCategory: { name: string; amount: number } | null;
  superlatives: Superlative[];
  settleUp: { fromName: string; toName: string; amount: number }[];
  /** One AI sentence on top of facts it cannot change. Null without a key. */
  oneLiner: string | null;
  aiEnabled: boolean;
  viewerId: string;
}

/** What a stranger holding a trip link sees. Deliberately excludes the total. */
export interface TripPreview {
  name: string;
  emoji: string;
  kind: GroupKind;
  startDate: string | null;
  endDate: string | null;
  memberCount: number;
  initials: string[];
  inviterName: string;
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

export interface TripFields {
  kind?: GroupKind;
  startDate?: string | null;
  endDate?: string | null;
  potPaise?: number;
}

export const groupApi = {
  list: () => api<Group[]>('/groups'),
  get: (id: string) => api<Group>(`/groups/${id}`),

  create: (name: string, emoji?: string, trip?: TripFields) =>
    api<Group>('/groups', { method: 'POST', body: JSON.stringify({ name, emoji, ...trip }) }),

  joinByCode: (inviteCode: string) =>
    api<Group>('/groups/join', { method: 'POST', body: JSON.stringify({ inviteCode }) }),

  /** Finishes the flow the public /join/:previewToken preview began. */
  joinByToken: (previewToken: string) =>
    api<Group>('/groups/join-by-token', {
      method: 'POST',
      body: JSON.stringify({ previewToken }),
    }),

  update: (id: string, body: { name?: string; emoji?: string } & TripFields) =>
    api<Group>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  rotateCode: (id: string) =>
    api<{ inviteCode: string }>(`/groups/${id}/rotate-code`, { method: 'POST' }),

  /** Kills every link already shared. Touches nobody's membership. */
  rotatePreview: (id: string) =>
    api<{ previewToken: string }>(`/groups/${id}/rotate-preview`, { method: 'POST' }),

  tripStatus: (id: string) => api<TripStatus>(`/groups/${id}/trip-status`),

  /** `ai=0` skips the model call so the recap renders instantly. */
  wrapped: (id: string, withAi = true) =>
    api<Wrapped>(`/groups/${id}/wrapped${withAi ? '' : '?ai=0'}`),

  /** Each member mints their own card, with their own name on it. */
  shareWrapped: (id: string) =>
    api<ShareCard>(`/groups/${id}/wrapped/share`, { method: 'POST' }),

  shareInvite: (id: string) =>
    api<ShareCard & { joinUrl: string }>(`/groups/${id}/invite-card`, { method: 'POST' }),

  leave: (id: string) =>
    api<{ msg: string; deleted: boolean }>(`/groups/${id}/leave`, { method: 'POST' }),

  balances: (id: string) => api<BalanceSheet>(`/groups/${id}/balances`),

  settle: (id: string, body: { from: string; to: string; amount: number; note?: string }) =>
    api(`/groups/${id}/settle`, { method: 'POST', body: JSON.stringify(body) }),

  activity: (id: string) => api<ActivityItem[]>(`/groups/${id}/activity`),
};

/**
 * The public trip preview. Unauthenticated on purpose — a join flow that
 * demands a signup before showing what you are joining does not get used.
 * Bypasses `api()` because that helper always sends an Authorization header.
 */
export async function fetchTripPreview(previewToken: string): Promise<TripPreview> {
  const res = await fetch(`${API_ORIGIN}/join/${encodeURIComponent(previewToken)}.json`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { msg?: string };
    throw new ApiError(data.msg || 'This invite has expired or been turned off.', res.status);
  }
  return (await res.json()) as TripPreview;
}

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
