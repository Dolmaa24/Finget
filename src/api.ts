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

export const fetchFingetApi = async (path: string, options: RequestInit = {}) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    ...(options.headers as Record<string, string> || {}),
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error((errorData as { msg?: string; error?: string }).msg || (errorData as { error?: string }).error || "API Request Failed");
  }
  return res.json();
};

export const fetchAffordability = async (context: "user" | "group" = "user", groupId?: string | null) => {
  const q = buildQuery(context, groupId);
  const res = await fetch(`${API}/finance/affordability${q}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });
  if (!res.ok) throw new Error("Affordability failed");
  return res.json();
};

export const addTransaction = async (data: Record<string, unknown>) => {
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
  return res.json() as Promise<{ transaction: unknown; nudge: unknown | null }>;
};

export const getTransactions = async (context: "user" | "group" = "user", groupId?: string | null) => {
  const q = buildQuery(context, groupId);
  const res = await fetch(`${API}/transactions${q}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("Failed to load transactions");
  return res.json();
};

export async function streamCoachMessage(body: Record<string, unknown>, onChunk: (text: string) => void) {
  const res = await fetch(`${API}/ai/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Coach request failed");
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
}

export async function getCoachHistory(context: "user" | "group", groupId?: string | null) {
  const q =
    context === "group" && groupId
      ? `?context=group&groupId=${encodeURIComponent(groupId)}`
      : "?context=user";
  return fetchFingetApi(`/ai/coach/history${q}`) as Promise<{ messages: { role: string; content: string }[] }>;
}

export async function getInsights(context: "user" | "group", groupId?: string | null) {
  const q = buildQuery(context, groupId);
  return fetchFingetApi(`/ai/insights${q}`);
}
