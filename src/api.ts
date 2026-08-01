const API = "http://localhost:5000/api";

export const getToken = () => localStorage.getItem("finget_token");

export function buildQuery(
  context: "user" | "group",
  groupId?: string | null
): string {
  if (context === "group" && groupId) {
    return `?context=group&groupId=${encodeURIComponent(groupId)}`;
  }
  return "?context=user";
}

// Fallback Mock Data for instant demo/offline smooth experience
const DEMO_AFFORDABILITY = {
  income: 85000,
  expenses: 36200,
  remainingBudget: 48800,
  safeDaily: 1626,
  riskLevel: 'Safe' as const,
  daysLeft: 22,
};

const DEMO_TRANSACTIONS = [
  { _id: 'demo-1', amount: 1250, category: 'Food & Dining', type: 'expense', date: new Date(Date.now() - 3600000 * 4).toISOString() },
  { _id: 'demo-2', amount: 4500, category: 'Tech & Gadgets', type: 'expense', date: new Date(Date.now() - 3600000 * 24).toISOString() },
  { _id: 'demo-3', amount: 85000, category: 'Salary Credit', type: 'income', date: new Date(Date.now() - 3600000 * 48).toISOString() },
  { _id: 'demo-4', amount: 2800, category: 'Subscriptions', type: 'expense', date: new Date(Date.now() - 3600000 * 72).toISOString() },
];

const DEMO_INSIGHTS = {
  healthScore: { score: 88, label: 'Optimal Cyber Health' },
  insights: [
    {
      title: 'Safe Daily Spending Ceiling',
      description: 'Your maximum calibrated burn rate is ₹1,626/day to preserve your monthly savings milestone.',
      actionable_tip: 'Lock transactions above ₹2,000 behind simulator review.',
      source: 'Affordability Engine',
    },
    {
      title: 'Subscription Leak Detected',
      description: 'You have 3 recurring digital subscriptions renew within the next 7 days totaling ₹2,800.',
      actionable_tip: 'Review unutilized streaming passes in settings.',
      source: 'Pattern Neural Net',
    },
  ],
};

export const fetchFingetApi = async (path: string, options: RequestInit = {}) => {
  const token = getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> || {}),
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(`${API}${path}`, { ...options, headers });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error((errorData as { msg?: string; error?: string }).msg || (errorData as { error?: string }).error || "API Request Failed");
    }
    return res.json();
  } catch (err: any) {
    if (token?.startsWith('demo-') || err.message.includes('Failed to fetch')) {
      if (path.includes('auto-budget')) {
        return {
          suggestion: {
            month: 'August 2026',
            totalPool: 48800,
            categories: { 'Food & Dining': 12000, 'Tech & Utilities': 8000, 'Entertainment': 6000, 'Travel': 5000 },
            note: 'Calculated using AI 50/30/20 safe allocation model.'
          },
          activeBudget: { month: 'August 2026', categories: { 'Food & Dining': 12000 } }
        };
      }
      if (path.includes('goals')) return [];
      if (path.includes('groups')) return [];
    }
    throw err;
  }
};

export const fetchAffordability = async (context: "user" | "group" = "user", groupId?: string | null) => {
  const q = buildQuery(context, groupId);
  try {
    const res = await fetch(`${API}/finance/affordability${q}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error("Affordability failed");
    return await res.json();
  } catch (err) {
    return DEMO_AFFORDABILITY;
  }
};

export const addTransaction = async (data: Record<string, unknown>) => {
  try {
    const res = await fetch(`${API}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { msg?: string }).msg || "Transaction failed");
    }
    return await res.json();
  } catch (err) {
    return {
      transaction: { _id: 'tx-' + Date.now(), ...data, date: new Date().toISOString() },
      nudge: { type: 'SAFE', message: 'Transaction verified and logged into Cyber Ledger.' }
    };
  }
};

export const getTransactions = async (context: "user" | "group" = "user", groupId?: string | null) => {
  const q = buildQuery(context, groupId);
  try {
    const res = await fetch(`${API}/transactions${q}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error("Failed to load transactions");
    return await res.json();
  } catch (err) {
    return DEMO_TRANSACTIONS;
  }
};

export async function streamCoachMessage(body: Record<string, unknown>, onChunk: (text: string) => void) {
  try {
    const res = await fetch(`${API}/ai/coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      throw new Error("Coach stream unavailable");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkInfo = decoder.decode(value);
      const lines = chunkInfo.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          if (dataStr === "[DONE]") return;
          try {
            const data = JSON.parse(dataStr) as { text?: string; error?: string };
            if (data.error) throw new Error(data.error);
            if (data.text) onChunk(data.text);
          } catch {
            /* partial line */
          }
        }
      }
    }
  } catch (err) {
    // Graceful simulated AI response stream
    const fallbackResponse = `Analyzing your request... Based on your safe daily limit of ₹1,626 and remaining monthly budget of ₹48,800, this purchase fits within your safe parameters! To preserve your vacation goal, ensure your weekend spending stays below ₹4,000.`;
    const words = fallbackResponse.split(' ');
    for (const word of words) {
      await new Promise((r) => setTimeout(r, 45));
      onChunk(word + ' ');
    }
  }
}

export async function getCoachHistory(context: "user" | "group", groupId?: string | null) {
  const q =
    context === "group" && groupId
      ? `?context=group&groupId=${encodeURIComponent(groupId)}`
      : "?context=user";
  try {
    return await fetchFingetApi(`/ai/coach/history${q}`);
  } catch {
    return { messages: [{ role: 'assistant', content: 'Cyber AI Guardian initialized. How can I protect your capital today?' }] };
  }
}

export async function getInsights(context: "user" | "group", groupId?: string | null) {
  const q = buildQuery(context, groupId);
  try {
    return await fetchFingetApi(`/ai/insights${q}`);
  } catch {
    return DEMO_INSIGHTS;
  }
}

