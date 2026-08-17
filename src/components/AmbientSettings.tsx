import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Download, Smartphone, Check, ShieldCheck } from 'lucide-react';
import { pushApi, type PushConfig, type PushTopics } from '../api';
import { useToast } from '../context/toastStore';
import { canPromptInstall, isStandalone, promptInstall, supportsBadging } from '../lib/pwa';
import { Badge, Button, Panel, SkeletonPanel } from './ui';

/**
 * The ambient number: install the app, and choose what interrupts you.
 *
 * Every capability here is missing somewhere Finget cares about — iOS has no
 * install prompt (you use Share → Add to Home Screen), Firefox has no Badging
 * API, and a server without VAPID keys has no push at all. So each block asks
 * whether the capability exists before offering it, and says something true
 * when it does not, rather than showing a button that quietly does nothing.
 */

const TOPIC_COPY: { key: keyof PushTopics; label: string; body: string }[] = [
  {
    key: 'vaultExpiry',
    label: 'Vault decisions',
    body: "When the 48 hours are up on something you held back. You asked to be asked.",
  },
  {
    key: 'tripPace',
    label: 'Trip pace',
    body: 'When a trip is spending faster than its clock — while there is still trip left.',
  },
  {
    key: 'weekendWarning',
    label: 'Weekend heads-up',
    body: 'Friday, if what is left will not cover a normal weekend for you.',
  },
];

/**
 * base64url → bytes, the only form `pushManager.subscribe` accepts.
 *
 * Allocated as `new Uint8Array(length)` rather than via `Uint8Array.from`, so
 * the type is `Uint8Array<ArrayBuffer>` and not `Uint8Array<ArrayBufferLike>` —
 * `BufferSource` does not accept the latter, since it could be backed by a
 * SharedArrayBuffer.
 */
function decodeVapidKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export const AmbientSettings: React.FC = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [topics, setTopics] = useState<PushTopics | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [installable, setInstallable] = useState(canPromptInstall());

  const pushSupported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  const load = useCallback(async () => {
    try {
      const next = await pushApi.config();
      setConfig(next);

      if (!pushSupported) return;
      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      setSubscribed(Boolean(existing));
      setEndpoint(existing?.endpoint ?? null);
    } catch {
      setConfig((prev) => prev ?? { available: false, unavailableReason: null, publicKey: null, devices: 0 });
    }
  }, [pushSupported]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  useEffect(() => {
    const onInstallable = () => setInstallable(true);
    const onInstalled = () => setInstallable(false);
    window.addEventListener('finget:installable', onInstallable);
    window.addEventListener('finget:installed', onInstalled);
    return () => {
      window.removeEventListener('finget:installable', onInstallable);
      window.removeEventListener('finget:installed', onInstalled);
    };
  }, []);

  const enable = async () => {
    if (!config?.publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast(
          permission === 'denied'
            ? 'Notifications are blocked for this site. You can re-allow them in your browser settings.'
            : 'Notifications not enabled.',
          'error'
        );
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: push must be tied to a visible notification.
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(config.publicKey),
      });

      const result = await pushApi.subscribe(subscription.toJSON() as PushSubscriptionJSON);
      setSubscribed(true);
      setEndpoint(subscription.endpoint);
      setTopics(result.topics);
      toast('This device will get Finget notifications.', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not enable notifications.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await pushApi.unsubscribe(subscription.endpoint).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setEndpoint(null);
      toast('Notifications off for this device.', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not turn them off.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleTopic = async (key: keyof PushTopics) => {
    if (!endpoint || !topics) return;
    const next = !topics[key];
    setTopics({ ...topics, [key]: next });
    try {
      const result = await pushApi.setTopics(endpoint, { [key]: next });
      setTopics(result.topics);
    } catch {
      setTopics({ ...topics });
      toast('Could not save that preference.', 'error');
    }
  };

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') toast('Finget added to your home screen.', 'success');
  };

  const header = (
    <div className="flex items-center gap-2.5 mb-1.5">
      <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
        <Smartphone className="w-[18px] h-[18px]" />
      </span>
      <h2 className="font-semibold text-ink">The number, everywhere</h2>
      {isStandalone() && <Badge tone="safe" icon={<Check className="w-3 h-3" />}>Installed</Badge>}
    </div>
  );

  if (!config) {
    return (
      <Panel>
        {header}
        <SkeletonPanel height={90} />
      </Panel>
    );
  }

  return (
    <Panel>
      {header}
      <p className="text-[13px] text-ink-2 mb-6 leading-relaxed">
        Finget is most useful at the moment you're deciding, which is rarely the moment you'd open
        an app. Install it to your home screen and it opens on the number — offline too, clearly
        marked with how old it is.
      </p>

      {/* ---------- Install ---------- */}
      {!isStandalone() && (
        <div className="glass-well rounded-md p-4 mb-4">
          {installable ? (
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[13px] text-ink-2 flex-1 min-w-0">
                Add Finget to your home screen — it opens straight to today's number.
              </p>
              <Button size="sm" icon={<Download className="w-4 h-4" />} onClick={install}>
                Install
              </Button>
            </div>
          ) : (
            /* iOS never fires `beforeinstallprompt`, so tell them the manual route. */
            <p className="text-[12.5px] text-ink-2 leading-relaxed">
              To install: on iPhone, tap Share then <strong>Add to Home Screen</strong>. On Android
              Chrome, use the menu then <strong>Install app</strong>.
            </p>
          )}
        </div>
      )}

      {/* ---------- Notifications ---------- */}
      <div className="border-t border-white/50 pt-4">
        <div className="flex items-center gap-2 mb-2.5">
          <BellRing className="w-4 h-4 text-accent" />
          <p className="text-[13px] font-semibold text-ink">Notifications</p>
        </div>

        {!config.available ? (
          <p className="text-[12.5px] text-ink-2 leading-relaxed">
            Push isn't set up on this server, so there's nothing to enable. The bell in the top bar
            still receives everything while you have Finget open.
            {config.unavailableReason && (
              <span className="block text-ink-3 mt-1.5">
                For whoever runs this server: {config.unavailableReason}.
              </span>
            )}
          </p>
        ) : !pushSupported ? (
          <p className="text-[12.5px] text-ink-2 leading-relaxed">
            This browser doesn't support push notifications. Everything still arrives in the bell
            in the top bar.
          </p>
        ) : (
          <>
            <p className="text-[12.5px] text-ink-2 leading-relaxed mb-3.5">
              Three things only, and each one is something you can act on right then. Never a
              summary of what you already spent.
            </p>

            <div className="space-y-2.5 mb-4">
              {TOPIC_COPY.map((topic) => (
                <div key={topic.key} className="flex items-start gap-3">
                  <button
                    type="button"
                    disabled={!subscribed || !topics}
                    onClick={() => toggleTopic(topic.key)}
                    aria-pressed={topics ? topics[topic.key] : false}
                    className={
                      'mt-0.5 w-9 h-5 rounded-pill shrink-0 transition-colors relative ' +
                      (topics?.[topic.key] && subscribed ? 'bg-[var(--accent)]' : 'bg-white/60') +
                      (subscribed ? ' cursor-pointer' : ' opacity-50 cursor-not-allowed')
                    }
                  >
                    <span
                      className={
                        'absolute top-0.5 w-4 h-4 rounded-pill bg-white shadow-soft transition-all ' +
                        (topics?.[topic.key] && subscribed ? 'left-[18px]' : 'left-0.5')
                      }
                    />
                  </button>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">{topic.label}</p>
                    <p className="text-[12px] text-ink-2 leading-relaxed">{topic.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {subscribed ? (
                <Button size="sm" variant="glass" loading={busy} onClick={disable}>
                  Turn off on this device
                </Button>
              ) : (
                <Button size="sm" loading={busy} onClick={enable}>
                  Enable notifications
                </Button>
              )}
              {config.devices > 0 && (
                <span className="text-[12px] text-ink-3">
                  {config.devices} {config.devices === 1 ? 'device' : 'devices'} subscribed
                </span>
              )}
            </div>

            <p className="text-[11.5px] text-ink-3 mt-3 leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px text-safe" />
              A notification carries a figure and a sentence — never a merchant, a transaction, or
              a list. Nothing about what you bought passes through Google's or Apple's servers.
            </p>

            {supportsBadging() && (
              <p className="text-[11.5px] text-ink-3 mt-2 leading-relaxed">
                Your app icon also shows a badge when something wants attention.
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
};
