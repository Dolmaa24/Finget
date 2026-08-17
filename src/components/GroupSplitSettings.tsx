import { cn } from '../lib/cn';
import React, { useState } from 'react';
import { Scale, BellOff, Bell, ShieldCheck } from 'lucide-react';
import { groupApi, type Group, type SplitMode } from '../api';
import { useAuth } from '../context/authStore';
import { useToast } from '../context/toastStore';
import { Button, SegmentedControl } from './ui';

/**
 * How this group splits, and whether it chases.
 *
 * Two switches with deliberately different owners:
 *
 *   SPLIT MODE and the group-wide collector belong to admins — they are
 *   decisions about how the group works.
 *
 *   INCOME SHARING and the personal mute belong to each member, and no admin
 *   can set them for anyone else. Consent someone else can grant on your behalf
 *   is not consent, and a mute an admin can override is not a mute.
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

  const setMode = (mode: SplitMode) =>
    run(
      () => groupApi.update(group._id, { splitMode: mode }).then(onChange),
      mode === 'weighted'
        ? 'New expenses will be split by income where members have opted in.'
        : 'New expenses will be split equally.'
    );

  const toggleIncomeSharing = () =>
    run(
      () => groupApi.setIncomeSharing(group._id, !group.incomeSharingOptedIn).then(onChange),
      group.incomeSharingOptedIn
        ? 'Income sharing off. Your share goes back to the group average.'
        : 'Income sharing on for this group. You can turn it off any time.'
    );

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
      {/* ---------- Split mode ---------- */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <Scale className="w-4 h-4 text-accent" />
          <p className="text-[13px] font-semibold text-ink">Default split</p>
        </div>

        {group.isAdmin ? (
          <SegmentedControl
            value={group.splitMode}
            onChange={setMode}
            className="w-full [&>button]:flex-1"
            options={[
              { value: 'equal', label: 'Equally' },
              { value: 'weighted', label: 'By income' },
            ]}
          />
        ) : (
          <p className="text-[12.5px] text-ink-2">
            This group splits{' '}
            <strong className="text-ink">
              {group.splitMode === 'weighted' ? 'by income' : 'equally'}
            </strong>{' '}
            by default. Any single expense can still be split another way.
          </p>
        )}
      </div>

      {/* ---------- Income sharing (yours alone) ---------- */}
      <div className="pt-4 border-t border-white/50">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink mb-1">Share your income here</p>
            {/*
              The honest version, per the milestone. Weighted splitting cannot
              hide the ratio it produces, so saying "your income stays private"
              would be a lie by omission. Say what is actually true: the number
              never leaves, the ratio does.
            */}
            <p className="text-[12px] text-ink-2 leading-relaxed">
              Finget never shows anyone your income — not the amount, not a total it could be
              subtracted out of. What the group does see is your share of each expense, so a
              bigger share does tell people you earn more than the average here. That trade is
              the whole feature, and it's yours to make.
            </p>
            <p className="text-[12px] text-ink-3 leading-relaxed mt-1.5">
              {group.incomeSharingCount === 0
                ? 'Nobody has turned this on yet, so "by income" splits equally for now.'
                : `${group.incomeSharingCount} ${
                    group.incomeSharingCount === 1 ? 'member has' : 'members have'
                  } turned this on. Anyone who hasn't pays the group average.`}
            </p>
          </div>

          <Button
            size="sm"
            variant={group.incomeSharingOptedIn ? 'glass' : 'primary'}
            loading={busy}
            onClick={toggleIncomeSharing}
            className="shrink-0"
          >
            {group.incomeSharingOptedIn ? 'Turn off' : 'Turn on'}
          </Button>
        </div>

        {group.incomeSharingOptedIn && (
          <p className="text-[11.5px] text-safe flex items-center gap-1.5 mt-2.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            On for this group only. Your other groups are unaffected.
          </p>
        )}
      </div>

      {/* ---------- Reminders ---------- */}
      <div className="pt-4 border-t border-white/50 space-y-3">
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
