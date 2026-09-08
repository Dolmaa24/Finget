import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Puzzle, ShieldCheck } from 'lucide-react';
import { tokenApi, API_ORIGIN } from '../api';
import { useAuth } from '../context/authStore';
import { useToast } from '../context/toastStore';
import { Button, PageHeader, Panel } from '../components/ui';

/**
 * The one place a scoped extension token is created.
 *
 * Two things make this a real consent step rather than a formality: nothing is
 * minted until the button is pressed, and the page names exactly what the
 * token can reach. The extension never sees the app's JWT.
 *
 * Handover is a `window.postMessage` the extension's content script picks up.
 * That is used instead of `chrome.runtime.sendMessage` because the page cannot
 * know the extension id — it differs between a store build and an unpacked
 * one. If the bridge is not there, the token is shown as copyable text and the
 * flow still completes by hand.
 */
export const ExtensionConnectPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [extensionDetected, setExtensionDetected] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [paired, setPaired] = useState(false);
  const [minting, setMinting] = useState(false);
  const [copied, setCopied] = useState(false);

  /** Listen for the bridge announcing itself, and for the pairing result. */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; ok?: boolean };
      if (data?.type === 'finget:pong') setExtensionDetected(true);
      if (data?.type === 'finget:paired') {
        setPaired(Boolean(data.ok));
        if (data.ok) toast('Extension connected.', 'success');
      }
    };

    window.addEventListener('message', onMessage);
    // The bridge posts a pong on load, but this page may have mounted after
    // that fired — ask again.
    window.postMessage({ type: 'finget:ping' }, window.location.origin);

    return () => window.removeEventListener('message', onMessage);
  }, [toast]);

  const connect = useCallback(async () => {
    setMinting(true);
    try {
      const { token: plaintext } = await tokenApi.create('Browser extension', [
        'translate',
        'deflect',
        'roast',
        'goals',
      ]);
      setToken(plaintext);
      // Hand it straight over. The extension validates it on first use.
      window.postMessage(
        { type: 'finget:pair', token: plaintext, apiBaseUrl: API_ORIGIN },
        window.location.origin
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create the token.', 'error');
    } finally {
      setMinting(false);
    }
  }, [toast]);

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Could not copy — select the token and copy it manually.', 'error');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        eyebrow="Browser extension"
        title="Connect Finget to your browser"
        subtitle="See what a purchase actually costs you, on the product page, before you buy it."
      />

      <Panel>
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
            <Puzzle className="w-[18px] h-[18px]" />
          </span>
          <h2 className="font-semibold text-ink">
            {paired ? 'Connected' : `Connect as ${user?.name || 'you'}`}
          </h2>
        </div>

        {/* What the credential can do, in plain words, before it exists. */}
        <div className="glass-well rounded-md p-4 mb-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-4.5 h-4.5 text-safe shrink-0 mt-0.5" />
            <div className="text-[13px] text-ink-2 leading-relaxed">
              <p className="mb-2">
                This creates a separate key for the extension — not your login. It can do
                exactly one thing: ask what a price means for your goals.
              </p>
              <p>
                It cannot read your transactions, your groups, or your goals, and you can
                disconnect it from Settings at any time.
              </p>
            </div>
          </div>
        </div>

        {!token && (
          <>
            <Button onClick={connect} loading={minting} className="w-full sm:w-auto">
              Connect the extension
            </Button>
            {!extensionDetected && (
              <p className="text-[12.5px] text-ink-3 mt-4">
                Finget's extension isn't detected in this browser yet. You can still connect
                — you'll get a key to paste into the extension.
              </p>
            )}
          </>
        )}

        {token && (
          <div>
            {paired ? (
              <div className="flex items-center gap-2 text-safe text-[13.5px] font-semibold mb-4">
                <Check className="w-4 h-4" /> The extension has the key. You're done.
              </div>
            ) : (
              <p className="text-[13px] text-ink-2 mb-3">
                Paste this into the extension's popup to finish connecting. It is shown once
                and cannot be recovered — if you lose it, just connect again.
              </p>
            )}

            <div className="glass-well rounded-md p-3 flex items-center gap-3">
              <code className="text-[12.5px] text-ink-2 break-all flex-1 font-mono">{token}</code>
              <Button
                variant="ghost"
                onClick={copy}
                icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
};
