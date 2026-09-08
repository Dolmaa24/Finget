import { cn } from '../lib/cn';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Users, Split as SplitIcon } from 'lucide-react';
import { txApi, type NewTransaction } from '../api';
import { useScope } from '../context/scopeStore';
import { useAuth } from '../context/authStore';
import { useToast } from '../context/toastStore';
import { inr } from '../lib/format';
import { Modal, Button, Field, Input, Select, MoneyInput, SegmentedControl, Avatar } from './ui';

const FALLBACK_CATEGORIES = [
  'Food', 'Groceries', 'Rent', 'Transport', 'Shopping', 'Bills',
  'Entertainment', 'Health', 'Travel', 'Subscriptions', 'Education', 'Other',
];

type SplitChoice = 'none' | 'equal' | 'custom';

export const AddTransactionModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}> = ({ open, onClose, onSaved }) => {
  const { scope, isFriends, group, bumpRevision } = useScope();
  const { user } = useAuth();
  const { toast } = useToast();

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = useState('');
  const [splitChoice, setSplitChoice] = useState<SplitChoice>('equal');
  const [participants, setParticipants] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const members = useMemo(() => group?.members || [], [group]);

  useEffect(() => {
    if (!open) return;
    txApi.categories().then(setCategories).catch(() => setCategories(FALLBACK_CATEGORIES));
  }, [open]);

  // Reset the form each time the sheet opens so a previous entry never leaks in.
  useEffect(() => {
    if (!open) return;
    setType('expense');
    setAmount('');
    setCategory('Food');
    setNote('');
    setDate(new Date().toISOString().slice(0, 10));
    setError('');
    // Honour whatever the group agreed on, rather than making someone re-pick
    // "weighted" forty times over a trip.
    setSplitChoice(isFriends ? 'equal' : 'none');
    setPaidBy(user?._id || '');
    setParticipants(members.map((m) => m._id));
    setCustomSplits({});
  }, [open, isFriends, user?._id, members]);

  const numericAmount = Number(amount) || 0;
  const splittable = isFriends && type === 'expense';

  const customTotal = useMemo(
    () => Object.values(customSplits).reduce((s, v) => s + (Number(v) || 0), 0),
    [customSplits]
  );

  const toggleParticipant = (id: string) => {
    setParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!(numericAmount > 0)) {
      setError('Enter an amount greater than zero.');
      return;
    }

    const body: NewTransaction = {
      amount: numericAmount,
      category: type === 'income' ? category || 'Income' : category,
      type,
      note: note.trim() || undefined,
      date,
    };

    if (splittable) {
      body.paidBy = paidBy || user?._id;

      if (splitChoice === 'equal') {
        if (participants.length === 0) {
          setError('Pick at least one person to split with.');
          return;
        }
        body.splitMode = 'equal';
        body.splitWith = participants;
      } else if (splitChoice === 'custom') {
        if (Math.abs(customTotal - numericAmount) > 0.5) {
          setError(
            `Custom shares add up to ${inr(customTotal)} but the expense is ${inr(numericAmount)}.`
          );
          return;
        }
        body.splitMode = 'custom';
        body.splits = Object.entries(customSplits)
          .filter(([, v]) => Number(v) > 0)
          .map(([userId, v]) => ({ userId, amount: Number(v) }));
      } else {
        body.splitMode = 'none';
      }
    }

    setSaving(true);
    try {
      const res = await txApi.create(scope, body);
      toast(
        `${type === 'income' ? 'Income' : 'Expense'} of ${inr(numericAmount)} added.`,
        'success'
      );
      if (res.nudge) toast(res.nudge.message, 'error');
      bumpRevision();
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const splitPreview = useMemo(() => {
    if (splitChoice !== 'equal' || participants.length === 0 || !numericAmount) return null;
    return numericAmount / participants.length;
  }, [splitChoice, participants.length, numericAmount]);



  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isFriends ? `Add to ${group?.name || 'group'}` : 'Add a transaction'}
      subtitle={
        isFriends
          ? 'Shared entries update every member instantly.'
          : 'Logged against your personal ledger.'
      }
      width="max-w-xl"
    >
      <form onSubmit={submit} className="space-y-5">
        <SegmentedControl
          value={type}
          onChange={(v) => setType(v)}
          className="w-full [&>button]:flex-1"
          options={[
            { value: 'expense', label: 'Expense', icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
            { value: 'income', label: 'Income', icon: <ArrowDownLeft className="w-3.5 h-3.5" /> },
          ]}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Amount">
            <MoneyInput
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min="0"
              step="0.01"
            />
          </Field>

          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note (optional)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dinner at Olive"
              maxLength={120}
            />
          </Field>
        </div>

        {splittable && members.length > 0 && (
          <div className="glass-well rounded-md p-4 space-y-4">
            <div className="flex items-center gap-2">
              <SplitIcon className="w-4 h-4 text-accent" />
              <p className="text-sm font-semibold text-ink">Split this expense</p>
            </div>

            <Field label="Paid by">
              <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                {members.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m._id === user?._id ? `${m.name} (you)` : m.name}
                  </option>
                ))}
              </Select>
            </Field>

            <SegmentedControl
              value={splitChoice}
              onChange={(v) => setSplitChoice(v)}
              className="w-full [&>button]:flex-1"
              options={[
                { value: 'equal', label: 'Equally' },
                { value: 'custom', label: 'Custom' },
                { value: 'none', label: "Don't split" },
              ]}
            />            {splitChoice === 'equal' && (
              <div className="space-y-2">
                <p className="text-[12px] text-ink-3">Tap to include or exclude people.</p>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => {
                    const on = participants.includes(m._id);
                    return (
                      <button
                        key={m._id}
                        type="button"
                        onClick={() => toggleParticipant(m._id)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-pill pl-1 pr-3 py-1 border transition-all duration-200',
                          on
                            ? 'bg-white/85 border-white text-ink shadow-soft'
                            : 'bg-white/25 border-white/50 text-ink-4'
                        )}
                      >
                        <Avatar name={m.name} size={24} className={on ? '' : 'opacity-50'} />
                        <span className="text-[13px] font-medium">
                          {m._id === user?._id ? 'You' : m.name.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {splitPreview !== null && (
                  <p className="text-[13px] text-ink-2">
                    <span className="font-semibold text-accent">{inr(splitPreview, { precise: true })}</span>{' '}
                    each across {participants.length}{' '}
                    {participants.length === 1 ? 'person' : 'people'}.
                  </p>
                )}
              </div>
            )}

            {splitChoice === 'custom' && (
              <div className="space-y-2.5">
                {members.map((m) => (
                  <div key={m._id} className="flex items-center gap-3">
                    <Avatar name={m.name} size={28} />
                    <span className="text-[13px] text-ink-2 flex-1 truncate">
                      {m._id === user?._id ? 'You' : m.name}
                    </span>
                    <div className="w-32">
                      <MoneyInput
                        value={customSplits[m._id] || ''}
                        onChange={(e) =>
                          setCustomSplits((prev) => ({ ...prev, [m._id]: e.target.value }))
                        }
                        placeholder="0"
                        className="h-10"
                      />
                    </div>
                  </div>
                ))}
                <p
                  className={cn(
                    'text-[13px] font-medium text-right',
                    Math.abs(customTotal - numericAmount) > 0.5 ? 'text-risk' : 'text-safe'
                  )}
                >
                  {inr(customTotal)} of {inr(numericAmount)}
                </p>
              </div>
            )}
          </div>
        )}

        {isFriends && members.length === 0 && (
          <p className="text-[13px] text-ink-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Invite people to this group to start splitting.
          </p>
        )}

        {error && (
          <p className="text-sm text-risk bg-[var(--risk-wash)] rounded-sm px-3.5 py-2.5">{error}</p>
        )}

        <div className="flex justify-end gap-2.5 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Add {type === 'income' ? 'income' : 'expense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
