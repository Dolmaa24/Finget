import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Check, ShieldCheck, Unlink } from 'lucide-react';
import { whatsappApi, type WhatsAppStatus } from '../api';
import { useToast } from '../context/toastStore';
import { Badge, Button, Field, Input, Panel, SkeletonPanel } from './ui';

/**
 * Linking a WhatsApp number.
 *
 * The code goes to WhatsApp and is replied on WhatsApp — there is deliberately
 * no "enter the code here" box. Typing it back into this page would only prove
 * the person still had the session they were already using; replying from the
 * number proves they hold the number, which is the thing that will authorise
 * every future message.
 *
 * So this component polls for the link completing rather than collecting
 * anything. The user's next action is in another app.
 */

/** Brisk while a link is pending — the user is staring at two apps. */
const POLL_MS = 4000;

export const WhatsAppLink: React.FC = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await whatsappApi.status());
    } catch {
      // Leave the last known state on screen; the next poll will correct it.
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  // Only poll while there is something to wait for.
  useEffect(() => {
    if (!status?.pendingPhone) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [status?.pendingPhone, load]);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await whatsappApi.startLink(phone);
      toast('Code sent. Reply to it on WhatsApp to finish linking.', 'success');
      setPhone('');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not send the code.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    setSaving(true);
    try {
      await whatsappApi.unlink();
      toast('Number unlinked. WhatsApp can no longer log anything for you.', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not unlink.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <div className="flex items-center gap-2.5 mb-1.5">
      <span className="w-9 h-9 rounded-md bg-[var(--safe-wash)] text-safe flex items-center justify-center">
        <MessageCircle className="w-[18px] h-[18px]" />
      </span>
      <h2 className="font-semibold text-ink">Log by WhatsApp</h2>
      {status?.linked && <Badge tone="safe" icon={<Check className="w-3 h-3" />}>Linked</Badge>}
    </div>
  );

  if (!status) {
    return (
      <Panel>
        {header}
        <SkeletonPanel height={90} />
      </Panel>
    );
  }

  /* Not configured on this server — say so plainly rather than showing a form
     that cannot work. Same posture as the AI coach and screenshot import. */
  if (!status.available) {
    return (
      <Panel>
        {header}
        <p className="text-[13px] text-ink-2 leading-relaxed">
          WhatsApp isn't connected on this server, so there's nothing to link yet. Everything
          else — logging in the app, import, splits — works exactly as it does now.
        </p>
        <p className="text-[12px] text-ink-3 mt-2">
          For whoever runs this server: {status.unavailableReason}.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      {header}
      <p className="text-[13px] text-ink-2 mb-6 leading-relaxed">
        Message Finget the way you'd text a friend — <em>450 dinner split with Goa</em> — and it's
        logged without opening the app. You get the confirmation and what it cost you in goal
        terms, right there in the chat.
      </p>

      {status.linked ? (
        <div className="space-y-4">
          <div className="glass-well rounded-md p-4 flex items-center gap-3 flex-wrap">
            <ShieldCheck className="w-4.5 h-4.5 text-safe shrink-0" />
            <p className="text-[13px] text-ink-2 flex-1 min-w-0">
              Linked to <strong className="text-ink numeric">{status.phone}</strong>
            </p>
            <Button size="sm" variant="ghost" loading={saving} icon={<Unlink className="w-4 h-4" />} onClick={unlink}>
              Unlink
            </Button>
          </div>

          <div className="text-[12.5px] text-ink-2 leading-relaxed space-y-1">
            <p className="font-medium text-ink">Try sending:</p>
            <p>• <em>450 dinner</em> — a personal expense</p>
            <p>• <em>450 dinner split with Goa</em> — logged to a group and split</p>
            <p>• <em>what's my number</em> · <em>who owes what</em> · <em>undo</em></p>
          </div>

          {/*
            The number is a credential: messages from it write to this ledger
            with no password behind them. Someone changing phones needs to know
            to unlink, and that is worth one sentence here.
          */}
          <p className="text-[11.5px] text-ink-3 leading-relaxed">
            Anyone holding this number can log expenses to your account. Unlink it before you give
            the number up, and every write can be reversed for ten minutes by replying UNDO.
          </p>
        </div>
      ) : status.pendingPhone ? (
        <div className="space-y-3">
          <div className="glass-well rounded-md p-4">
            <p className="text-[13px] text-ink leading-relaxed">
              Code sent to <strong className="numeric">{status.pendingPhone}</strong>.
            </p>
            <p className="text-[12.5px] text-ink-2 mt-1.5 leading-relaxed">
              Open WhatsApp and <strong>reply with just that code</strong>. Replying from the number
              is what proves it's yours — there's nothing to type back in here.
            </p>
            {status.attemptsLeft !== null && status.attemptsLeft < 5 && (
              <p className="text-[12px] text-ink-3 mt-2">
                {status.attemptsLeft} {status.attemptsLeft === 1 ? 'try' : 'tries'} left.
              </p>
            )}
          </div>
          <Button size="sm" variant="ghost" loading={saving} onClick={() => void load()}>
            Check again
          </Button>
        </div>
      ) : (
        <form onSubmit={sendCode} className="space-y-4">
          <Field
            label="Your WhatsApp number"
            hint="We'll message you a code. Reply to it on WhatsApp to finish."
          >
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={phone.trim().length < 8}>
              Send code
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
};
