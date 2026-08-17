import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  PiggyBank,
  ShieldCheck,
  Wand2,
  LogOut,
  Lock,
  Puzzle,
  Trash2,
  Bell,
  BellOff,
} from 'lucide-react';
import { authApi, financeApi, tokenApi, type ApiToken, type BudgetSettings } from '../api';
import { useAuth } from '../context/authStore';
import { useScope } from '../context/scopeStore';
import { useToast } from '../context/toastStore';
import { inr } from '../lib/format';
import { WhatsAppLink } from '../components/WhatsAppLink';
import { AmbientSettings } from '../components/AmbientSettings';
import {
  Avatar,
  Badge,
  Button,
  Field,
  Input,
  MoneyInput,
  PageHeader,
  Panel,
  SkeletonPanel,
} from '../components/ui';

type AutoBudget = Awaited<ReturnType<typeof financeApi.autoBudget>>;

export const SettingsPage: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();
  const { scope, isFriends, group, context, groupId, bumpRevision } = useScope();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [income, setIncome] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [savingReminders, setSavingReminders] = useState(false);

  const [budget, setBudget] = useState<BudgetSettings | null>(null);
  const [savingsTarget, setSavingsTarget] = useState('');
  const [emergencyBuffer, setEmergencyBuffer] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const [auto, setAuto] = useState<AutoBudget | null>(null);
  const [loading, setLoading] = useState(true);

  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name || '');
    setIncome(user?.monthlyIncome ? String(user.monthlyIncome) : '');
    setUpiId(user?.upiId || '');
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      financeApi.budgetSettings(scope).catch(() => null),
      financeApi.autoBudget(scope).catch(() => null),
    ])
      .then(([settings, autoBudget]) => {
        if (cancelled) return;
        if (settings) {
          setBudget(settings);
          setSavingsTarget(settings.savingsTarget ? String(settings.savingsTarget) : '');
          setEmergencyBuffer(settings.emergencyBuffer ? String(settings.emergencyBuffer) : '');
        }
        setAuto(autoBudget);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, groupId]);

  /**
   * Connected apps are personal, not scoped — a token belongs to the person,
   * not to whichever group they happen to be viewing. So this loads once
   * rather than on every scope change.
   */
  useEffect(() => {
    let cancelled = false;
    tokenApi
      .list()
      .then((list) => !cancelled && setTokens(list))
      .catch(() => !cancelled && setTokens([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const revokeToken = async (id: string) => {
    setRevoking(id);
    try {
      await tokenApi.revoke(id);
      setTokens((prev) => prev.filter((t) => t._id !== id));
      toast('Disconnected. That key stops working immediately.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not disconnect.', 'error');
    } finally {
      setRevoking(null);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await authApi.updateMe({
        name: name.trim() || undefined,
        monthlyIncome: income === '' ? undefined : Number(income),
      });
      await refreshUser();
      bumpRevision();
      toast('Profile updated.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const saveReminderSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingReminders(true);
    try {
      await authApi.updateMe({ upiId: upiId.trim() });
      await refreshUser();
      toast(
        upiId.trim()
          ? 'Saved. People who owe you get a one-tap pay button.'
          : 'UPI ID cleared. Your reminders go out without a pay button.',
        'success'
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save.', 'error');
    } finally {
      setSavingReminders(false);
    }
  };

  const toggleMuteAll = async () => {
    setSavingReminders(true);
    try {
      const next = !user?.reminderPrefs?.mutedAll;
      await authApi.updateMe({ mutedAll: next });
      await refreshUser();
      toast(
        next
          ? 'All settle-up reminders muted. Balances still show on Split & settle.'
          : 'Settle-up reminders are back on.',
        'success'
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save.', 'error');
    } finally {
      setSavingReminders(false);
    }
  };

  const saveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBudget(true);
    try {
      const next = await financeApi.updateBudgetSettings(scope, {
        savingsTarget: savingsTarget === '' ? 0 : Number(savingsTarget),
        emergencyBuffer: emergencyBuffer === '' ? 0 : Number(emergencyBuffer),
      });
      setBudget((prev) => (prev ? { ...prev, ...next } : prev));
      bumpRevision();
      toast(
        isFriends ? "Shared budget rules updated." : 'Budget rules updated.',
        'success'
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save.', 'error');
    } finally {
      setSavingBudget(false);
    }
  };

  const applyAutoBudget = async () => {
    if (!auto?.suggestion) return;
    try {
      await financeApi.saveActiveBudget({
        month: auto.suggestion.month,
        categories: auto.suggestion.categories,
      });
      toast('Auto-budget saved as your active budget.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save.', 'error');
    }
  };

  const canEditBudget = budget?.editable !== false;

  return (
    <div>
      <PageHeader
        eyebrow={isFriends ? `Friends mode · ${group?.name ?? ''}` : 'Personal mode'}
        title="Settings"
        subtitle={
          isFriends
            ? "Shared rules apply to the whole group. Your profile stays personal."
            : 'Your profile and the rules that drive safe-to-spend.'
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Profile */}
        <Panel>
          <div className="flex items-center gap-3 mb-6">
            <Avatar name={user?.name} size={48} />
            <div className="min-w-0">
              <h2 className="font-semibold text-ink">{user?.name || 'Your profile'}</h2>
              <p className="text-[12.5px] text-ink-3 truncate">{user?.email}</p>
            </div>
          </div>

          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </Field>
            <Field
              label="Monthly income"
              hint="Drives your safe-to-spend. Shared with a group only if you turn on income sharing there — and even then, only as your share of an expense, never as a figure."
            >
              <MoneyInput
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                min="0"
                placeholder="0"
              />
            </Field>
            <div className="flex justify-between items-center pt-1">
              <Button
                type="button"
                variant="ghost"
                icon={<LogOut className="w-4 h-4" />}
                onClick={logout}
              >
                Sign out
              </Button>
              <Button type="submit" loading={savingProfile} icon={<User className="w-4 h-4" />}>
                Save profile
              </Button>
            </div>
          </form>
        </Panel>

        {/* PWA install, push notifications, badging */}
        <AmbientSettings />

        {/* WhatsApp */}
        <WhatsAppLink />

        {/* Settle-up reminders */}
        <Panel>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
              <Bell className="w-[18px] h-[18px]" />
            </span>
            <h2 className="font-semibold text-ink">Settle-up reminders</h2>
          </div>
          <p className="text-[13px] text-ink-2 mb-6 leading-relaxed">
            When you owe someone in a group, Finget nudges you once after 3 days, again after 7,
            and sends a plain summary after 14 — then it stops. Only you get them, never the
            group.
          </p>

          <form onSubmit={saveReminderSettings} className="space-y-4">
            <Field
              label="Your UPI ID (optional)"
              hint="Put on reminders sent to people who owe you, so paying you back is one tap. Leave it blank and the reminder still goes out, just without the button."
            >
              <Input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="you@okhdfcbank"
                maxLength={128}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>

            {/*
              The trust line, in the place where someone is deciding whether to
              hand over a payment handle. Finget is not in the payment path and
              this is where that has to be said plainly.
            */}
            <p className="text-[12px] text-ink-3 leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-px text-safe" />
              Finget never holds or moves money. The pay button opens the other person's own UPI
              app, and the debt stays open here until someone records the payment.
            </p>

            <div className="flex justify-between items-center gap-3 pt-1 flex-wrap">
              <Button
                type="button"
                variant="ghost"
                loading={savingReminders}
                icon={
                  user?.reminderPrefs?.mutedAll ? (
                    <Bell className="w-4 h-4" />
                  ) : (
                    <BellOff className="w-4 h-4" />
                  )
                }
                onClick={toggleMuteAll}
              >
                {user?.reminderPrefs?.mutedAll ? 'Unmute all reminders' : 'Mute all reminders'}
              </Button>
              <Button type="submit" loading={savingReminders}>
                Save
              </Button>
            </div>

            {user?.reminderPrefs?.mutedAll && (
              <p className="text-[12.5px] text-ink-2 bg-white/45 rounded-sm px-3.5 py-2.5 leading-relaxed">
                Every reminder is muted, in every group. What you owe still shows on Split &amp;
                settle — muting silences the messages, not the debt.
              </p>
            )}
          </form>
        </Panel>

        {/* Budget rules */}
        <Panel>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="w-9 h-9 rounded-md bg-[var(--safe-wash)] text-safe flex items-center justify-center">
              <ShieldCheck className="w-[18px] h-[18px]" />
            </span>
            <h2 className="font-semibold text-ink">
              {isFriends ? 'Shared budget rules' : 'Budget rules'}
            </h2>
            {isFriends && !canEditBudget && (
              <Badge icon={<Lock className="w-3 h-3" />}>Admins only</Badge>
            )}
          </div>
          <p className="text-[13px] text-ink-2 mb-6 leading-relaxed">
            Safe-to-spend is income minus what you have already spent, minus the savings you
            promise yourself. The buffer sets when Finget starts warning you.
          </p>

          {loading ? (
            <div className="space-y-4">
              <SkeletonPanel height={70} />
              <SkeletonPanel height={70} />
            </div>
          ) : (
            <form onSubmit={saveBudget} className="space-y-4">
              <Field
                label="Monthly savings target"
                hint="Ring-fenced before anything is called safe to spend."
              >
                <MoneyInput
                  value={savingsTarget}
                  onChange={(e) => setSavingsTarget(e.target.value)}
                  min="0"
                  placeholder="0"
                  disabled={!canEditBudget}
                />
              </Field>
              <Field
                label="Emergency buffer"
                hint="Drop below this and the risk level turns to Warning."
              >
                <MoneyInput
                  value={emergencyBuffer}
                  onChange={(e) => setEmergencyBuffer(e.target.value)}
                  min="0"
                  placeholder="0"
                  disabled={!canEditBudget}
                />
              </Field>

              <div className="glass-well rounded-md p-4 flex items-center gap-3">
                <PiggyBank className="w-4.5 h-4.5 text-ink-3 shrink-0" />
                <p className="text-[12.5px] text-ink-2">
                  {isFriends ? 'Shared income' : 'Monthly income'}:{' '}
                  <strong className="text-ink numeric">{inr(budget?.monthlyIncome || 0)}</strong>
                  {isFriends && (
                    <span className="text-ink-3">
                      {' '}
                      — only from members who turned on income sharing.
                    </span>
                  )}
                </p>
              </div>

              {canEditBudget && (
                <div className="flex justify-end pt-1">
                  <Button type="submit" loading={savingBudget}>
                    Save rules
                  </Button>
                </div>
              )}
            </form>
          )}
        </Panel>

        {/* Connected apps */}
        <Panel className="lg:col-span-2">
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
              <Puzzle className="w-[18px] h-[18px]" />
            </span>
            <h2 className="font-semibold text-ink">Connected apps</h2>
          </div>
          <p className="text-[13px] text-ink-2 mb-6 leading-relaxed">
            Keys you've given to Finget's browser extension. Each one can only ask what a
            price means for your goals — it cannot read your transactions, goals or groups.
          </p>

          {tokens.length === 0 ? (
            <div className="glass-well rounded-md p-4 flex items-center justify-between flex-wrap gap-3">
              <p className="text-[13px] text-ink-3">Nothing connected yet.</p>
              <Link to="/extension/connect">
                <Button variant="glass">Connect the extension</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.map((t) => (
                <div
                  key={t._id}
                  className="glass-well rounded-md px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink truncate">{t.name}</p>
                    <p className="text-[12px] text-ink-3">
                      <span className="font-mono">{t.prefix}…</span>
                      {' · '}
                      {t.lastUsedAt
                        ? `last used ${new Date(t.lastUsedAt).toLocaleDateString('en-IN')}`
                        : 'never used'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    loading={revoking === t._id}
                    onClick={() => revokeToken(t._id)}
                    icon={<Trash2 className="w-4 h-4" />}
                  >
                    Disconnect
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Auto budget */}
        <Panel className="lg:col-span-2">
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
              <Wand2 className="w-[18px] h-[18px]" />
            </span>
            <h2 className="font-semibold text-ink">Auto-budget</h2>
          </div>
          <p className="text-[13px] text-ink-2 mb-6">
            {auto?.suggestion?.note || 'Generated from the last 30 days of spending.'}
          </p>

          {loading ? (
            <SkeletonPanel height={160} />
          ) : !auto?.suggestion || Object.keys(auto.suggestion.categories || {}).length === 0 ? (
            <p className="text-[13px] text-ink-3">
              Log some expenses and Finget will propose a category split here.
            </p>
          ) : (
            <>
              <p className="text-[13px] text-ink-2 mb-4">
                Pool after savings and buffer:{' '}
                <strong className="text-ink numeric">{inr(auto.suggestion.totalPool)}</strong>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {Object.entries(auto.suggestion.categories)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amount]) => (
                    <div
                      key={cat}
                      className="glass-well rounded-sm px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <span className="text-[13px] text-ink-2 truncate">{cat}</span>
                      <span className="text-[13px] font-semibold numeric text-ink shrink-0">
                        {inr(amount)}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3">
                {auto.activeBudget?.month && (
                  <p className="text-[12.5px] text-ink-3">
                    Active budget: {auto.activeBudget.month} ·{' '}
                    {Object.keys(auto.activeBudget.categories || {}).length} categories
                  </p>
                )}
                <Button variant="glass" onClick={applyAutoBudget} className="ml-auto">
                  Save as active budget
                </Button>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
};
