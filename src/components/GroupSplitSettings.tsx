import { cn } from '../lib/cn';
import React, { useState } from 'react';
import { BellOff, Bell } from 'lucide-react';
import { groupApi, type Group } from '../api';
import { useAuth } from '../context/authStore';
import { useToast } from '../context/toastStore';
import { Button } from './ui';

/**
 * Settle-up reminders settings for a Trip.
 */
export const GroupSplitSettings: React.FC<{ group: Group; onChange: () => void }> = ({
  group,
  onChange,
}) => {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const muted = Boolean(user?.reminderPrefs?.mutedGroups?.includes(group._id));

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast(done, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleGroupReminders = () =>
    run(
      () => groupApi.update(group._id, { remindersEnabled: !group.remindersEnabled }).then(onChange),
      group.remindersEnabled
        ? 'Settle-up reminders are off for this group.'
        : 'Settle-up reminders are back on for this group.'
    );

  const toggleMyMute = () =>
    run(
      () => groupApi.muteReminders(group._id, !muted).then(() => refreshUser()),
      muted ? "You'll get settle-up reminders for this group again." : 'Muted. The balance still shows on Split & settle.'
    );

  return (
    <div className="glass-well rounded-md p-4 space-y-5 mb-5">
      {/* ---------- Reminders ---------- */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {group.remindersEnabled && !muted ? (
            <Bell className="w-4 h-4 text-accent" />
          ) : (
            <BellOff className="w-4 h-4 text-ink-3" />
          )}
          <p className="text-[13px] font-semibold text-ink">Settle-up reminders</p>
        </div>

        <p className="text-[12px] text-ink-2 leading-relaxed">
          A quiet nudge after 3 days, a second after 7, and a plain summary after 14 — then it
          stops. Reminders go only to whoever owes, never to the group.
        </p>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button size="sm" variant="glass" loading={busy} onClick={toggleMyMute}>
            {muted ? 'Unmute for me' : 'Mute for me'}
          </Button>

          {group.isAdmin && (
            <Button size="sm" variant="ghost" loading={busy} onClick={toggleGroupReminders}>
              {group.remindersEnabled ? 'Turn off for everyone' : 'Turn on for everyone'}
            </Button>
          )}
        </div>

        <p
          className={cn(
            'text-[11.5px]',
            group.remindersEnabled && !muted ? 'text-ink-3' : 'text-ink-2'
          )}
        >
          {!group.remindersEnabled
            ? 'Off for this whole group. Balances still show on Split & settle.'
            : muted
              ? "You won't be reminded about this group. Balances still show on Split & settle."
              : 'On. You can mute yourself any time.'}
        </p>
      </div>
    </div>
  );
};
