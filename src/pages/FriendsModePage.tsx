import { cn } from '../lib/cn';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  UserPlus,
  Copy,
  Check,
  LogOut,
  RefreshCw,
  Crown,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { groupApi, goalApi, type Group } from '../api';
import { useScope } from '../context/scopeStore';
import { useAuth } from '../context/authStore';
import { useToast } from '../context/toastStore';
import { usePaywall } from '../context/paywallStore';
import { Avatar, Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Panel, SkeletonPanel, MoneyInput } from '../components/ui';
import { TripSettings } from '../components/TripSettings';
import { GroupSplitSettings } from '../components/GroupSplitSettings';
import { TripPassCard } from '../components/TripPassCard';

const EMOJI_CHOICES = ['👥', '🏖️', '🏠', '✈️', '🍽️', '🎉', '💼', '🚗', '🎓', '💍'];

export const FriendsModePage: React.FC = () => {
  const { groups, loadingGroups, reloadGroups, setScope, groupId, context } = useScope();
  const { user } = useAuth();
  const { toast } = useToast();
  const { showPaywallFor } = usePaywall();
  const navigate = useNavigate();

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('👥');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const [isTrip, setIsTrip] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [createGoalOption, setCreateGoalOption] = useState(true);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const tripFields = isTrip && startDate && endDate
        ? {
            kind: 'trip' as const,
            startDate: startDate || null,
            endDate: endDate || null,
            potPaise: budget ? Number(budget) * 100 : 0,
          }
        : undefined;

      const group = await groupApi.create(name.trim(), emoji, tripFields);

      if (isTrip && createGoalOption && budget && Number(budget) > 0) {
        try {
          await goalApi.create(
            { context: 'user' },
            {
              name: `Trip: ${group.name}`,
              targetAmount: Number(budget),
              deadline: startDate || undefined,
              priority: 'High',
            }
          );
        } catch (goalErr) {
          console.error('Could not create savings goal:', goalErr);
        }
      }

      await reloadGroups();
      setScope('group', group._id);
      toast(`${group.name} created. Share code ${group.inviteCode} to invite people.`, 'success');
      setName('');
      setEmoji('👥');
      setStartDate('');
      setEndDate('');
      setBudget('');
      setIsTrip(true);
      setCreateGoalOption(true);
      setCreateOpen(false);
      navigate('/dashboard');
    } catch (err) {
      /**
       * The free-tier group wall. Closing the dialog first is the point of the
       * UX rule: the sheet explains what Plus would do, and it must not appear
       * behind a form the person is still looking at.
       */
      if (showPaywallFor(err)) {
        setCreateOpen(false);
        setName('');
      } else {
        setError(err instanceof Error ? err.message : 'Could not create the group.');
      }
    } finally {
      setBusy(false);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError('');
    try {
      const group = await groupApi.joinByCode(code.trim().toUpperCase());
      await reloadGroups();
      setScope('group', group._id);
      toast(`Joined ${group.name}.`, 'success');
      setCode('');
      setJoinOpen(false);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that group.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (group: Group) => {
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      setCopied(group._id);
      setTimeout(() => setCopied(null), 2000);
      toast('Invite code copied.', 'success');
    } catch {
      toast(`Invite code: ${group.inviteCode}`, 'info');
    }
  };

  const rotate = async (group: Group) => {
    try {
      const { inviteCode } = await groupApi.rotateCode(group._id);
      await reloadGroups();
      toast(`New invite code: ${inviteCode}. The old one no longer works.`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not rotate the code.', 'error');
    }
  };

  const leave = async (group: Group) => {
    try {
      const res = await groupApi.leave(group._id);
      await reloadGroups();
      if (groupId === group._id) setScope('user');
      toast(res.msg, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not leave.', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Friends mode"
        title="Trips"
        subtitle="A trip is a shared wallet: shared goals, split expenses and one settle-up sheet. Income is pooled only for the members who choose to share it."
        actions={
          <>
            <Button variant="glass" icon={<UserPlus className="w-4 h-4" />} onClick={() => setJoinOpen(true)}>
              Join
            </Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
              New trip
            </Button>
          </>
        }
      />

      {loadingGroups ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <SkeletonPanel height={220} />
          <SkeletonPanel height={220} />
        </div>
      ) : groups.length === 0 ? (
        <>
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="No trips yet"
            body="Create a trip, a flatshare or a couple's budget — then invite people with a six-character code."
            action={
              <div className="flex gap-2.5">
                <Button onClick={() => setCreateOpen(true)} icon={<Plus className="w-4 h-4" />}>
                  Create a trip
                </Button>
                <Button variant="glass" onClick={() => setJoinOpen(true)}>
                  I have a code
                </Button>
              </div>
            }
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-8 stagger">
            {[
              {
                title: 'Split anything',
                body: 'Equal or custom shares, with the payer recorded on every entry.',
              },
              {
                title: 'Settle in one step',
                body: 'Finget works out the fewest payments that clear all debts.',
              },
              {
                title: 'Shared goals',
                body: 'Save together, with each contribution credited to whoever made it.',
              },
            ].map((f) => (
              <Panel key={f.title}>
                <Sparkles className="w-5 h-5 text-accent mb-3" />
                <p className="font-semibold text-ink mb-1.5">{f.title}</p>
                <p className="text-[13px] text-ink-2 leading-relaxed">{f.body}</p>
              </Panel>
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 stagger">
          {groups.map((group) => {
            const active = context === 'group' && groupId === group._id;

            return (
              <div
                key={group._id}
                className={cn(
                  'glass glass-sheen rounded-lg p-6',
                  active && 'ring-2 ring-[var(--accent)]'
                )}
              >
                <div className="flex items-start gap-3 mb-5">
                  <span className="text-3xl leading-none">{group.emoji || '👥'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-ink text-lg truncate">{group.name}</h3>
                      {group.isActive ? (
                        <Badge tone="safe">Active</Badge>
                      ) : (
                        <Badge tone="neutral">
                          {group.inactiveSinceDays !== undefined
                            ? `Inactive (${group.inactiveSinceDays} days)`
                            : 'Inactive'}
                        </Badge>
                      )}
                      {active && <Badge tone="accent">Current</Badge>}
                      {group.isAdmin && (
                        <Badge icon={<Crown className="w-3 h-3" />}>Admin</Badge>
                      )}
                    </div>
                    {/*
                      This line used to read "₹X pooled income", summing every
                      member's salary. In a two-person group that is one
                      subtraction away from the other person's exact income, so
                      the server stopped sending the figures and the line now
                      says something a co-member is actually entitled to know.
                    */}
                    <p className="text-[12.5px] text-ink-3 mt-0.5">
                      {group.members.length} member{group.members.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                {/* Members */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {group.members.map((m) => (
                    <span
                      key={m._id}
                      className="inline-flex items-center gap-2 rounded-pill glass-well pl-1 pr-3 py-1"
                      title={m.email}
                    >
                      <Avatar name={m.name} size={24} />
                      <span className="text-[12.5px] text-ink-2">
                        {m._id === user?._id ? 'You' : m.name}
                      </span>
                    </span>
                  ))}
                </div>

                {/* The Trip Pass sits ABOVE the settings, on trips only. It is
                    an offer, not a setting, and burying it under three toggles
                    is how it stops being seen. */}
                {group.kind === 'trip' && (
                  <TripPassCard group={group} onChange={reloadGroups} />
                )}

                {/* Split mode, income sharing and the Silent Collector */}
                <GroupSplitSettings group={group} onChange={reloadGroups} />

                {/* Trip mode + the public share link */}
                {group.isAdmin && <TripSettings group={group} onChange={reloadGroups} />}

                {/* Invite code */}
                <div className="glass-well rounded-md p-3.5 flex items-center gap-3 mb-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                      Invite code
                    </p>
                    <p className="text-lg font-semibold tracking-[0.2em] text-ink numeric">
                      {group.inviteCode}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyCode(group)}
                    aria-label="Copy invite code"
                    className="p-2.5 rounded-pill text-ink-3 hover:text-accent hover:bg-white/60 transition-colors"
                  >
                    {copied === group._id ? (
                      <Check className="w-4 h-4 text-safe" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  {group.isAdmin && (
                    <button
                      type="button"
                      onClick={() => rotate(group)}
                      aria-label="Generate a new invite code"
                      title="Generate a new code (revokes the old one)"
                      className="p-2.5 rounded-pill text-ink-3 hover:text-accent hover:bg-white/60 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex gap-2.5">
                  {active ? (
                    <Button
                      className="flex-1"
                      icon={<ArrowRight className="w-4 h-4" />}
                      onClick={() => navigate('/dashboard')}
                    >
                      Open dashboard
                    </Button>
                  ) : (
                    <Button
                      variant="glass"
                      className="flex-1"
                      onClick={() => {
                        setScope('group', group._id);
                        navigate('/dashboard');
                      }}
                    >
                      Switch to this group
                    </Button>
                  )}
                  {group.isAdmin && (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await groupApi.update(group._id, { isActive: !group.isActive });
                          await reloadGroups();
                          toast(`Trip marked as ${!group.isActive ? 'Active' : 'Inactive'}.`, 'success');
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Could not change status.', 'error');
                        }
                      }}
                      title={group.isActive ? "Mark trip as settled and inactive" : "Mark trip as active"}
                    >
                      {group.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => leave(group)}
                    icon={<LogOut className="w-4 h-4" />}
                    title="Leave group"
                  >
                    Leave
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Create ---------- */}
      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setError('');
        }}
        title="New trip"
        subtitle="You'll get an invite code to share. Fill in trip details to start tracking or saving."
      >
        <form onSubmit={create} className="space-y-5">
          <Field label="Trip name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Goa trip"
              required
              maxLength={40}
            />
          </Field>

          <Field label="Icon">
            <div className="flex flex-wrap gap-2">
              {EMOJI_CHOICES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cn(
                    'w-11 h-11 rounded-md text-xl transition-all duration-200',
                    emoji === e ? 'bg-white/85 shadow-soft scale-105' : 'glass-well hover:bg-white/50'
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>

          <label className="flex items-center gap-2.5 cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={isTrip}
              onChange={(e) => setIsTrip(e.target.checked)}
              className="rounded border-white/60 bg-white/20 text-accent focus:ring-accent"
            />
            <span className="text-sm font-semibold text-ink-2">This is a trip (with dates and budget)</span>
          </label>

          {isTrip && (
            <div className="space-y-4 pt-2 border-t border-white/30">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required={isTrip}
                  />
                </Field>
                <Field label="Ends">
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required={isTrip}
                  />
                </Field>
              </div>

              <Field
                label="Budget (willing to spend)"
                hint="Set the total budget for the trip."
              >
                <MoneyInput
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </Field>

              {budget && Number(budget) > 0 && (
                <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={createGoalOption}
                    onChange={(e) => setCreateGoalOption(e.target.checked)}
                    className="rounded border-white/60 bg-white/20 text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-ink-3">Add a saving goal to my goals for this trip</span>
                </label>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-risk bg-[var(--risk-wash)] rounded-sm px-3.5 py-2.5">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create trip
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---------- Join ---------- */}
      <Modal
        open={joinOpen}
        onClose={() => {
          setJoinOpen(false);
          setError('');
        }}
        title="Join a trip"
        subtitle="Ask a member for the six-character invite code."
      >
        <form onSubmit={join} className="space-y-5">
          <Field label="Invite code">
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={8}
              className="text-center text-xl tracking-[0.35em] font-semibold uppercase"
              required
            />
          </Field>

          {error && (
            <p className="text-sm text-risk bg-[var(--risk-wash)] rounded-sm px-3.5 py-2.5">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="ghost" onClick={() => setJoinOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Join trip
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
