import React, { useState } from 'react';
import { Clock, Check } from 'lucide-react';
import { deflectionApi } from '../api';
import { useScope } from '../context/scopeStore';
import { useToast } from '../context/toastStore';
import { inr, rupeesToPaise } from '../lib/format';
import { Button, Field, Input } from './ui';

/**
 * "I want this" — opens a 48-hour hold.
 *
 * The amount leaves safe-to-spend the instant this is pressed, and the
 * confirmation says so with the actual before/after figures. That is the whole
 * mechanism: wanting something has to cost something immediately, or waiting
 * two days is just a delay rather than a decision.
 *
 * Nothing here scolds. The copy treats putting something in the vault as a
 * sensible thing a sensible person does.
 */
export const VaultButton: React.FC<{
  amount: number;
  onHeld?: () => void;
}> = ({ amount, onHeld }) => {
  const { scope, isFriends } = useScope();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ before: number; after: number } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    setSaving(true);
    try {
      const res = await deflectionApi.hold(scope, {
        label: label.trim(),
        amountPaise: rupeesToPaise(amount),
      });
      setDone({
        before: res.safeToSpend.before.remaining,
        after: res.safeToSpend.after.remaining,
      });
      setOpen(false);
      setLabel('');
      onHeld?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not hold that.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="glass-well rounded-md p-4 animate-fade">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-md bg-[var(--safe-wash)] text-safe flex items-center justify-center shrink-0">
            <Check className="w-[18px] h-[18px]" />
          </span>
          <div>
            <p className="font-semibold text-ink text-sm mb-1">Held for 48 hours</p>
            <p className="text-[13px] text-ink-2 leading-relaxed">
              {isFriends ? "The group's" : 'Your'} budget left is now{' '}
              <strong className="text-ink numeric">{inr(done.after)}</strong>, down from{' '}
              <span className="numeric">{inr(done.before)}</span>. Finget will ask you once
              in two days. If you never answer, the money comes back.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        icon={<Clock className="w-4 h-4" />}
      >
        I want this
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="glass-well rounded-md p-4 animate-fade">
      <Field
        label="What is it?"
        hint="The ledger needs a name so it can tell you later what you walked away from."
      >
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Sony headphones"
          maxLength={120}
          autoFocus
        />
      </Field>
      <p className="text-[12.5px] text-ink-3 mt-3 mb-4">
        {inr(amount)} comes out of {isFriends ? "the group's" : 'your'} safe-to-spend right
        away, for two days.
      </p>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!label.trim()}>
          Hold it for 48 hours
        </Button>
      </div>
    </form>
  );
};
