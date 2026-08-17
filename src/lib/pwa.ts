/**
 * PWA plumbing: service worker registration, install prompt, app badge.
 *
 * All of it is best-effort. Every API here is missing on some browser Finget
 * cares about — iOS has no `beforeinstallprompt`, Firefox has no Badging API,
 * and a service worker is unavailable on any insecure origin. Nothing in the
 * app may depend on these succeeding, so each function fails silently and the
 * UI asks first whether the capability exists.
 */

/** The last-known ambient number, so the app can render it while offline. */
const AMBIENT_KEY = 'finget_last_ambient';

export interface CachedAmbient {
  safeDaily: number;
  risk: 'Safe' | 'Warning' | 'Risky';
  context: string;
  label: string | null;
  /** When this was FETCHED, not when the server computed it. */
  cachedAt: string;
}

/* ------------------------------------------------------------------ */
/* Service worker                                                      */
/* ------------------------------------------------------------------ */

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  /**
   * Production only. In dev, Vite serves modules that the shell cache would
   * happily hold on to, and debugging "why is my edit not showing" through a
   * stale service worker costs more than offline support in dev is worth.
   */
  if (!import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unregistrable worker means no offline shell. The app is otherwise
      // completely unaffected, so there is nothing to tell the user.
    });
  });
}

/* ------------------------------------------------------------------ */
/* The ambient number, cached for offline                              */
/* ------------------------------------------------------------------ */

export function rememberAmbient(value: Omit<CachedAmbient, 'cachedAt'>): void {
  try {
    const payload: CachedAmbient = { ...value, cachedAt: new Date().toISOString() };
    localStorage.setItem(AMBIENT_KEY, JSON.stringify(payload));
  } catch {
    /* Private browsing, or a full quota. Not worth surfacing. */
  }
}

export function readCachedAmbient(): CachedAmbient | null {
  try {
    const raw = localStorage.getItem(AMBIENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAmbient;
    // Without a timestamp there is no honest way to show the number at all.
    if (typeof parsed?.safeDaily !== 'number' || !parsed?.cachedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** "4 minutes ago", "2 hours ago", "3 days ago". */
export function describeAge(iso: string, now = Date.now()): string {
  const ageMs = now - new Date(iso).getTime();
  const minutes = Math.round(ageMs / 60000);
  if (minutes < 1) return 'moments ago';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(ageMs / 3600000);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(ageMs / 86400000);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/* ------------------------------------------------------------------ */
/* Badging                                                             */
/* ------------------------------------------------------------------ */

/**
 * `setAppBadge` / `clearAppBadge` are declared on `Navigator` by TypeScript's
 * DOM lib as non-optional, which is a lie on Firefox and Safari-on-macOS. So
 * the types come from the lib and the EXISTENCE check happens at runtime — a
 * local interface redeclaring them optional conflicts with the lib and does not
 * typecheck.
 */
export const supportsBadging = (): boolean =>
  typeof navigator !== 'undefined' && 'setAppBadge' in navigator;

/**
 * Set the app icon badge to the number of things WANTING ATTENTION.
 *
 * A deliberate reading of "badging for the number". The Badging API takes an
 * integer and most platforms render anything above 99 as "99+", so a rupee
 * amount cannot go here — ₹2,150 would display as "99+" and ₹40 as "40", which
 * is worse than nothing because it looks meaningful and is not.
 *
 * What a badge is genuinely good at is "something needs you". So: unread
 * notifications, plus one if today's number is below the buffer. Zero clears
 * it, which is the state a calm app should be in most of the time.
 */
export async function setAttentionBadge(unread: number, risk?: string): Promise<void> {
  if (!supportsBadging()) return;

  const count = Math.max(0, unread) + (risk === 'Warning' || risk === 'Risky' ? 1 : 0);
  try {
    if (count > 0) await navigator.setAppBadge(count);
    else await navigator.clearAppBadge();
  } catch {
    /* Badging is a nicety; a rejection here changes nothing for the user. */
  }
}

/* ------------------------------------------------------------------ */
/* Install prompt                                                      */
/* ------------------------------------------------------------------ */

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: InstallPromptEvent | null = null;

/**
 * Chrome fires `beforeinstallprompt` once, early, and expects the page to hold
 * it until the user asks to install. Captured at module load so it is not
 * missed while React mounts.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new CustomEvent('finget:installable'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('finget:installed'));
  });
}

export const canPromptInstall = (): boolean => deferredPrompt !== null;

/** Already running as an installed app? */
export const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    // iOS predates the standard and still reports it here.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  // A prompt can only be used once; Chrome will fire a fresh one if declined.
  deferredPrompt = null;
  return outcome;
}
