import React, { useState } from 'react';
import { CalendarDays, Link2, Check, Copy, RefreshCw } from 'lucide-react';
import { groupApi, API_ORIGIN, type Group } from '../api';
import { useToast } from '../context/toastStore';
import { inr, rupeesToPaise } from '../lib/format';
import { Button, Field, Input, MoneyInput } from './ui';

/**
 * Turn a group into a trip, and manage its public share link.
 *
 * Two links, deliberately different:
 *
 *   The 6-char INVITE CODE is for reading out loud. Redeeming it needs an
 *   account and is attempt-limited, so the short code cannot be walked.
 *
 *   The 22-char SHARE LINK is for sending. It opens a preview that shows the
 *   trip, who is in it, and when — but never the total, because that is the
 *   figure that would make a forwarded link worth having. Resetting it kills
 *   every link already sent and removes nobody from the group.
 */
export const TripSettings: React.FC<{ group: Group; onChange: () => void }> = ({
  group,
  onChange,
}) => {
  const { toast } = useToast();

  const asDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

  const [startDate, setStartDate] = useState(asDate(group.startDate));
  const [endDate, setEndDate] = useState(asDate(group.endDate));
  const [pot, setPot] = useState(group.pot ? String(group.pot) : '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = group.previewToken ? `${API_ORIGIN}/join/${group.previewToken}` : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await groupApi.update(group._id, {
        kind: 'trip',
        startDate: startDate || null,
        endDate: endDate || null,
        potPaise: pot === '' ? 0 : rupeesToPaise(Number(pot)),
      });
      onChange();
      toast('Trip dates saved. The burn strip is live on your dashboard.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const makeHousehold = async () => {
    setSaving(true);
    try {
      await groupApi.update(group._id, { kind: 'household' });
      onChange();
      toast('Back to a regular group.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(shareUrl, 'info');
    }
  };

  const resetLink = async () => {
    try {
      await groupApi.rotatePreview(group._id);
      onChange();
      toast('New link created. The old one stops working; nobody was removed.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not reset the link.', 'error');
    }
  };

  return (
    <div className="glass-well rounded-md p-4 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="w-4 h-4 text-ink-3" />
        <p className="text-[13px] font-semibold text-ink">
          {group.kind === 'trip' ? 'Trip' : 'Make this a trip'}
        </p>
      </div>

      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Ends">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>

        <Field
          label="What you're all willing to spend"
          hint="Optional. With a budget, Finget can tell you whether you're running hot."
        >
          <MoneyInput value={pot} onChange={(e) => setPot(e.target.value)} min="0" placeholder="0" />
        </Field>

        <div className="flex gap-2 justify-end pt-1">
          {group.kind === 'trip' && (
            <Button type="button" variant="ghost" size="sm" onClick={makeHousehold}>
              Not a trip
            </Button>
          )}
          <Button type="submit" size="sm" loading={saving} disabled={!startDate || !endDate}>
            {group.kind === 'trip' ? 'Save dates' : 'Start the trip'}
          </Button>
        </div>
      </form>

      {shareUrl && (
        <div className="mt-4 pt-4 border-t border-white/50">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-2">
            Share link
          </p>
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-ink-3 shrink-0" />
            <span className="text-[12px] text-ink-2 truncate font-mono min-w-0 flex-1">
              {shareUrl}
            </span>
            <button
              type="button"
              onClick={copyLink}
              aria-label="Copy share link"
              className="p-2 rounded-pill text-ink-3 hover:text-accent hover:bg-white/60 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-safe" /> : <Copy className="w-4 h-4" />}
            </button>
            {group.isAdmin && (
              <button
                type="button"
                onClick={resetLink}
                aria-label="Reset the share link"
                title="Create a new link. The old one stops working; nobody is removed."
                className="p-2 rounded-pill text-ink-3 hover:text-accent hover:bg-white/60 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[11.5px] text-ink-3 mt-2">
            Shows the trip and who's in it — never the total.
          </p>
        </div>
      )}

      {group.kind === 'trip' && group.pot > 0 && (
        <p className="text-[12px] text-ink-3 mt-3 numeric">Budget: {inr(group.pot)}</p>
      )}
    </div>
  );
};
