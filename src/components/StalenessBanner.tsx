import React, { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { inr } from '../lib/format';
import { describeAge, readCachedAmbient, type CachedAmbient } from '../lib/pwa';

/**
 * "You're offline, and this number is from an hour ago."
 *
 * The one rule Milestone 7 is built around: a stale number is never shown
 * without saying it is stale. Finget's whole proposition is a figure you act
 * on in a shop — a cached one presented as current is the app confidently
 * telling someone to spend money they may no longer have.
 *
 * The offline shell in `public/offline.html` enforces the same rule for people
 * who never reach the React app at all. This is the in-app half: the dashboard
 * keeps rendering whatever it last loaded, and this bar says how old it is.
 */
export const StalenessBanner: React.FC = () => {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  /** Bumped on a timer so "moments ago" becomes "2 minutes ago" without a reload. */
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    if (!offline) return;
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, [offline]);

  /**
   * Read during render, not mirrored into state. It is a cheap localStorage
   * read, so the honest thing is to derive it — copying it into state through
   * an effect would cost an extra render for a value already available, and
   * `tick` re-running this is exactly how the age stays current.
   */
  void tick;
  const cached: CachedAmbient | null = offline ? readCachedAmbient() : null;

  if (!offline) return null;

  return (
    <div className="px-4 sm:px-6 pt-3">
      <div className="max-w-shell mx-auto lg:pl-[92px]">
        <div
          role="status"
          className="glass-strong rounded-md px-4 py-3 flex items-start gap-3 border border-[var(--warn-wash,rgb(183_121_31/0.25))]"
        >
          <CloudOff className="w-[18px] h-[18px] text-warn shrink-0 mt-0.5" />
          <div className="min-w-0 text-[13px] leading-relaxed">
            {cached ? (
              <>
                <p className="text-ink font-medium">
                  You're offline — showing your number from {describeAge(cached.cachedAt)}.
                </p>
                <p className="text-ink-2 mt-0.5">
                  Last known safe to spend:{' '}
                  <strong className="numeric text-ink">{inr(cached.safeDaily)}</strong>. It may have
                  moved since, so treat it as a guide rather than a green light.
                </p>
              </>
            ) : (
              <p className="text-ink">
                You're offline. Anything you log will need a connection to save.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
