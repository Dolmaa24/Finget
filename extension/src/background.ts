import type {
  ChipTranslation,
  ConnectionState,
  DeflectResult,
  Message,
  TranslateResult,
  RoastResult,
  WishlistResult,
} from "./lib/messages";

/**
 * The service worker is the only place the token lives and the only place that
 * talks to Finget.
 *
 * Content scripts run inside pages Finget does not control, so they never hold
 * the credential and never make the request — they ask for a translation and
 * get back four display fields. A hostile page that fully compromises a
 * content script learns a price it already knew.
 *
 * Requests are made from here for a second reason: an MV3 service worker with
 * `host_permissions` for the API is exempt from page CORS, while a content
 * script has not been since Chrome 85.
 */

const DEFAULT_API = "http://localhost:5001";

const STORAGE_KEYS = {
  token: "finget_api_token",
  apiBaseUrl: "finget_api_base_url",
} as const;

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

/**
 * One call per distinct price per 60 seconds.
 *
 * Without this, a single Amazon page can fire a dozen identical requests as
 * the DOM settles, and browsing ten products would burn the per-minute limit.
 * Keyed by amount because the answer only depends on the amount.
 */
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 200;

const cache = new Map<number, { at: number; result: TranslateResult }>();

/** In-flight de-duplication: two scripts asking at once make one request. */
const inFlight = new Map<number, Promise<TranslateResult>>();

function cacheGet(amountPaise: number): TranslateResult | null {
  const hit = cache.get(amountPaise);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(amountPaise);
    return null;
  }
  return hit.result;
}

function cacheSet(amountPaise: number, result: TranslateResult) {
  // Insertion-ordered, so the oldest key is the first one out.
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(amountPaise, { at: Date.now(), result });
}

/* ------------------------------------------------------------------ */
/* Credentials                                                         */
/* ------------------------------------------------------------------ */

async function readStorage() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.token, STORAGE_KEYS.apiBaseUrl]);
  return {
    token: (data[STORAGE_KEYS.token] as string | undefined) ?? null,
    apiBaseUrl: (data[STORAGE_KEYS.apiBaseUrl] as string | undefined) ?? DEFAULT_API,
  };
}

async function getState(): Promise<ConnectionState> {
  const { token, apiBaseUrl } = await readStorage();
  return {
    connected: Boolean(token),
    apiBaseUrl,
    // A prefix is enough to tell two tokens apart in the popup, and is not
    // itself a credential.
    tokenPrefix: token ? token.slice(0, 10) : undefined,
  };
}

async function disconnect() {
  await chrome.storage.local.remove([STORAGE_KEYS.token]);
  cache.clear();
}

/**
 * Accepts a token from the web app's connect page. Validated for shape only —
 * the server is what decides whether it is real, on the first translate.
 */
async function pair(token: string, apiBaseUrl?: string) {
  if (typeof token !== "string" || !token.startsWith("fgt_") || token.length < 20) {
    return { ok: false };
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.token]: token,
    ...(apiBaseUrl ? { [STORAGE_KEYS.apiBaseUrl]: apiBaseUrl } : {}),
  });
  cache.clear();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Translate                                                           */
/* ------------------------------------------------------------------ */

async function requestTranslation(amountPaise: number): Promise<TranslateResult> {
  const { token, apiBaseUrl } = await readStorage();
  if (!token) return { ok: false, reason: "logged-out" };

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/api/finance/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amountPaise, context: "user" }),
    });
  } catch {
    // No network, server down, or the user is on a plane. Say nothing.
    return { ok: false, reason: "offline" };
  }

  if (res.status === 401) {
    // Revoked from Settings, or expired. 
    // TEMPORARILY DISABLED: Do not disconnect so the session persists across backend restarts.
    // await disconnect();
    return { ok: false, reason: "logged-out" };
  }
  if (res.status === 429) return { ok: false, reason: "rate-limited" };
  if (!res.ok) return { ok: false, reason: "error" };

  try {
    const data = (await res.json()) as ChipTranslation;
    return {
      ok: true,
      translation: {
        amountPaise: data.amountPaise,
        headline: data.headline,
        headlineKind: data.headlineKind,
        riskAfter: data.riskAfter,
      },
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

async function translate(amountPaise: number): Promise<TranslateResult> {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    return { ok: false, reason: "error" };
  }

  const cached = cacheGet(amountPaise);
  if (cached) return cached;

  const existing = inFlight.get(amountPaise);
  if (existing) return existing;

  const pending = requestTranslation(amountPaise)
    .then((result) => {
      // Never cache a transient failure — the next page load should retry.
      if (result.ok) cacheSet(amountPaise, result);
      return result;
    })
    .finally(() => inFlight.delete(amountPaise));

  inFlight.set(amountPaise, pending);
  return pending;
}

/* ------------------------------------------------------------------ */
/* Vault                                                               */
/* ------------------------------------------------------------------ */

/**
 * Opens a 48-hour hold from the chip.
 *
 * Deliberately NOT cached and NOT de-duplicated by amount: unlike a
 * translation, this writes, and two different products at the same price are
 * two different decisions. The chip disables its own button after a success
 * so a double-click cannot open two holds for one thing.
 */
async function deflect(amountPaise: number, label: string, sourceUrl?: string): Promise<DeflectResult> {
  const { token, apiBaseUrl } = await readStorage();
  if (!token) return { ok: false, reason: "logged-out" };

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/api/deflections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amountPaise, label, sourceUrl, context: "user" }),
    });
  } catch {
    return { ok: false, reason: "offline" };
  }

  if (res.status === 401) {
    // await disconnect();
    return { ok: false, reason: "logged-out" };
  }
  if (res.status === 429) return { ok: false, reason: "rate-limited" };

  if (!res.ok) {
    // The server's message is worth surfacing here — "that would hold back more
    // than a quarter of the group's room" is guidance, not a failure.
    const body = (await res.json().catch(() => ({}))) as { msg?: string };
    return { ok: false, reason: "error", message: body.msg };
  }

  try {
    const data = (await res.json()) as {
      deflection: { vaultUntil: string };
      vaultHours: number;
    };
    return { ok: true, heldUntil: data.deflection.vaultUntil, vaultHours: data.vaultHours };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/* ------------------------------------------------------------------ */
/* Roast & Wishlist                                                   */
/* ------------------------------------------------------------------ */

async function getRoast(amountPaise: number, label: string): Promise<RoastResult> {
  const { token, apiBaseUrl } = await readStorage();
  if (!token) return { ok: false, reason: "logged-out" };

  try {
    const res = await fetch(`${apiBaseUrl}/api/ai/roast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      // API expects amount in rupees, amountPaise / 100
      body: JSON.stringify({ amount: amountPaise / 100, itemOrCategory: label, context: "user" }),
    });

    if (res.status === 401) {
      // await disconnect();
      return { ok: false, reason: "logged-out" };
    }
    if (!res.ok) return { ok: false, reason: "error" };

    const data = await res.json();
    return { ok: true, roast: data.roast };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

async function addWishlist(amountPaise: number, label: string): Promise<WishlistResult> {
  const { token, apiBaseUrl } = await readStorage();
  if (!token) return { ok: false, reason: "logged-out" };

  try {
    const res = await fetch(`${apiBaseUrl}/api/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetAmount: amountPaise / 100, name: `🎁 Wishlist: ${label}`, priority: "Medium", context: "user" }),
    });

    if (res.status === 401) {
      // await disconnect();
      return { ok: false, reason: "logged-out" };
    }
    if (!res.ok) return { ok: false, reason: "error" };

    return { ok: true };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "translate":
        sendResponse(await translate(message.amountPaise));
        break;
      case "deflect":
        sendResponse(await deflect(message.amountPaise, message.label, message.sourceUrl));
        break;
      case "roast":
        sendResponse(await getRoast(message.amountPaise, message.label));
        break;
      case "wishlist":
        sendResponse(await addWishlist(message.amountPaise, message.label));
        break;
      case "get-state":
        sendResponse(await getState());
        break;
      case "disconnect":
        await disconnect();
        sendResponse({ ok: true });
        break;
      case "pair":
        sendResponse(await pair(message.token, message.apiBaseUrl));
        break;
      default:
        sendResponse({ ok: false });
    }
  })();

  // Keeps the message channel open for the async work above.
  return true;
});
