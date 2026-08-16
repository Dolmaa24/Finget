import React, { useEffect, useState } from 'react';
import { User, PiggyBank, ShieldCheck, Wand2, LogOut, Lock } from 'lucide-react';
import { authApi, financeApi, type BudgetSettings } from '../api';
import { useAuth } from '../context/authStore';
import { useScope } from '../context/scopeStore';
import { useToast } from '../context/toastStore';
import { inr } from '../lib/format';
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

  const [budget, setBudget] = useState<BudgetSettings | null>(null);
  const [savingsTarget, setSavingsTarget] = useState('');
  const [emergencyBuffer, setEmergencyBuffer] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const [auto, setAuto] = useState<AutoBudget | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setName(user?.name || '');
    setIncome(user?.monthlyIncome ? String(user.monthlyIncome) : '');
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
              hint="Drives your personal safe-to-spend, and your share of any group's pooled income."
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
                  {isFriends ? 'Pooled income' : 'Monthly income'}:{' '}
                  <strong className="text-ink numeric">{inr(budget?.monthlyIncome || 0)}</strong>
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
