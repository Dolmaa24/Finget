import React, { useState } from 'react';
import { Check, Copy, Link2, Share2, X } from 'lucide-react';
import { shareApi, type ShareCard } from '../api';
import { useScope } from '../context/scopeStore';
import { useToast } from '../context/toastStore';
import { rupeesToPaise } from '../lib/format';
import { Button } from './ui';

/**
 * Turns "₹8,499 = 6 days of Goa" into a link.
 *
 * The card is a SNAPSHOT taken server-side. Nothing here builds the payload —
 * the client sends the amount and the server decides what is safe to show, so
 * a change to redaction rules applies to the app without an app release.
 */
export const ShareTranslation: React.FC<{ amount: number; headline: string }> = ({
  amount,
  headline,
}) => {
  const { scope } = useScope();
  const { toast } = useToast();

  const [card, setCard] = useState<ShareCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      setCard(await shareApi.createTranslate(scope, rupeesToPaise(amount)));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create the link.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Could not copy the link.', 'error');
    }
  };

  const revoke = async () => {
    if (!card) return;
    const { token } = card;
    setCard(null);
    try {
      await shareApi.revoke(token);
      toast('Link revoked. It stops working immediately.', 'success');
    } catch {
      toast('Could not revoke that link — try again from Settings.', 'error');
    }
  };

  if (!card) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={create}
        loading={creating}
        icon={<Share2 className="w-4 h-4" />}
      >
        Share this
      </Button>
    );
  }

  return (
    <div className="glass-well rounded-md p-4 animate-fade">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[13px] text-ink-2 leading-relaxed">
          Anyone with this link sees{' '}
          <strong className="text-ink">
            ₹{Math.round(amount).toLocaleString('en-IN')} = {headline}
          </strong>
          . No figures beyond that, and no name.
        </p>
        <button
          type="button"
          onClick={revoke}
          aria-label="Revoke this link"
          className="text-ink-3 hover:text-ink transition-colors p-1 rounded-pill hover:bg-white/50 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Hidden when the server cannot rasterise, rather than showing a broken image. */}
      {card.imageUrl && (
        <img
          src={card.imageUrl}
          alt=""
          className="w-full rounded-sm border border-white/70 mb-3"
          loading="lazy"
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3 min-w-0">
          <Link2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate font-mono">{card.url}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          className="ml-auto"
          icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </div>
  );
};
