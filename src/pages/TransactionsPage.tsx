import { cn } from '../lib/cn';
import React, { useMemo, useState } from 'react';
import { Receipt, Trash2, Plus, Search, ArrowDownLeft, ArrowUpRight, Split } from 'lucide-react';
import { txApi } from '../api';
import { useScope } from '../context/scopeStore';
import { useAuth } from '../context/authStore';
import { useToast } from '../context/toastStore';
import { useTransactions, useGroupLiveSync } from '../hooks/useFinget';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { inr, fullDate, relativeDate } from '../lib/format';
import { Avatar, Badge, Button, EmptyState, Input, PageHeader, Select, SkeletonPanel } from '../components/ui';

export const TransactionsPage: React.FC = () => {
  const { isFriends, group, bumpRevision } = useScope();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: transactions, loading, error, reload } = useTransactions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [category, setCategory] = useState('all');
  const [addOpen, setAddOpen] = useState(false);

  useGroupLiveSync();

  const categories = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.category).filter(Boolean))).sort(),
    [transactions]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (filter !== 'all' && t.type !== filter) return false;
      if (category !== 'all' && t.category !== category) return false;
      if (!q) return true;
      const payer = typeof t.paidBy === 'object' ? t.paidBy?.name || '' : '';
      return (
        t.category?.toLowerCase().includes(q) ||
        t.note?.toLowerCase().includes(q) ||
        payer.toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    });
  }, [transactions, query, filter, category]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    visible.forEach((t) => {
      if (t.type === 'income') income += t.amount;
      else expense += t.amount;
    });
    return { income, expense };
  }, [visible]);

  // Group rows by calendar day for a readable ledger.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof visible>();
    visible.forEach((t) => {
      const key = new Date(t.date).toDateString();
      map.set(key, [...(map.get(key) || []), t]);
    });
    return Array.from(map.entries());
  }, [visible]);

  const remove = async (id: string) => {
    try {
      await txApi.remove(id);
      toast('Entry deleted.', 'success');
      bumpRevision();
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete.', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={isFriends ? `Friends mode · ${group?.name ?? ''}` : 'Personal mode'}
        title="Activity"
        subtitle={
          isFriends
            ? 'Every shared expense, who paid, and how it was split.'
            : 'Your personal ledger.'
        }
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>
            Add
          </Button>
        }
      />

      {/* Filters */}
      <div className="glass glass-sheen rounded-lg p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, categories, people…"
            className="pl-10"
          />
        </div>
        {/* Fixed-width wrappers: the control's own `w-full` would otherwise
            win over a `w-auto` override and push each select onto its own row. */}
        <div className="w-[150px] shrink-0">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </Select>
        </div>
        <div className="w-[170px] shrink-0">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Totals */}
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          <Badge tone="risk" icon={<ArrowUpRight className="w-3.5 h-3.5" />}>
            {inr(totals.expense)} out
          </Badge>
          <Badge tone="safe" icon={<ArrowDownLeft className="w-3.5 h-3.5" />}>
            {inr(totals.income)} in
          </Badge>
          <Badge>{visible.length} entries</Badge>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonPanel key={i} height={68} />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={<Receipt className="w-6 h-6" />} title="Could not load" body={error} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Receipt className="w-6 h-6" />}
          title={transactions.length === 0 ? 'No entries yet' : 'Nothing matches those filters'}
          body={
            transactions.length === 0
              ? isFriends
                ? 'Add a shared expense and split it with the group.'
                : 'Log your first income or expense to start tracking.'
              : 'Try clearing the search or filters.'
          }
          action={
            transactions.length === 0 ? (
              <Button onClick={() => setAddOpen(true)} icon={<Plus className="w-4 h-4" />}>
                Add entry
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-7">
          {grouped.map(([day, items]) => (
            <section key={day}>
              <p className="eyebrow mb-3">{fullDate(day)}</p>
              <div className="space-y-2.5 stagger">
                {items.map((t) => {
                  const payer = typeof t.paidBy === 'object' ? t.paidBy : null;
                  const isMine = payer?._id === user?._id;
                  const splitCount = t.splits?.length || 0;
                  const myShare = t.splits?.find(
                    (s) => (typeof s.userId === 'object' ? s.userId._id : s.userId) === user?._id
                  );

                  return (
                    <div
                      key={t._id}
                      className="glass glass-sheen rounded-md px-4 py-3.5 flex items-center gap-3.5 group"
                    >
                      {isFriends && payer ? (
                        <Avatar name={payer.name} size={40} />
                      ) : (
                        <span
                          className={cn(
                            'w-10 h-10 rounded-sm flex items-center justify-center shrink-0',
                            t.type === 'income'
                              ? 'bg-[var(--safe-wash)] text-safe'
                              : 'bg-white/50 text-ink-3'
                          )}
                        >
                          {t.type === 'income' ? (
                            <ArrowDownLeft className="w-[18px] h-[18px]" />
                          ) : (
                            <Receipt className="w-[18px] h-[18px]" />
                          )}
                        </span>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] font-medium text-ink truncate">
                            {t.note || t.category}
                          </p>
                          {t.note && (
                            <span className="text-[11px] text-ink-3 px-2 py-0.5 rounded-pill bg-white/45">
                              {t.category}
                            </span>
                          )}
                          {splitCount > 0 && (
                            <span className="text-[11px] text-accent px-2 py-0.5 rounded-pill bg-[var(--accent-wash)] inline-flex items-center gap-1">
                              <Split className="w-3 h-3" />
                              {splitCount}-way
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-ink-3 mt-0.5">
                          {isFriends && payer ? `${isMine ? 'You' : payer.name} paid · ` : ''}
                          {relativeDate(t.date)}
                          {myShare ? ` · your share ${inr(myShare.amount, { precise: true })}` : ''}
                        </p>
                      </div>

                      <span
                        className={cn(
                          'text-[15px] font-semibold numeric shrink-0',
                          t.type === 'income' ? 'text-safe' : 'text-ink'
                        )}
                      >
                        {t.type === 'income' ? '+' : '−'}
                        {inr(t.amount)}
                      </span>

                      <button
                        type="button"
                        onClick={() => remove(t._id)}
                        aria-label="Delete entry"
                        className="p-2 rounded-pill text-ink-4 hover:text-risk hover:bg-white/60 transition-all
                                   opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <AddTransactionModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={reload} />
    </div>
  );
};
