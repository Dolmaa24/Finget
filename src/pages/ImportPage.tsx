import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  MessageSquareText,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Trash2,
} from 'lucide-react';
import {
  importApi,
  txApi,
  type ImportRow,
  type ImportStatus,
} from '../api';
import { useScope } from '../context/scopeStore';
import { useToast } from '../context/toastStore';
import { inr } from '../lib/format';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  PageHeader,
  Panel,
  Select,
  Textarea,
} from '../components/ui';
import { cn } from '../lib/cn';

/**
 * Import — paste SMS or drop a screenshot, review, then commit.
 *
 * Nothing on this page writes anything until the person presses the button at
 * the bottom. That is not caution for its own sake: an import that files a
 * wrong row silently corrupts safe-to-spend, and there would be no way to tell
 * which row was the phantom.
 */

const ATTENTION_LABEL: Record<string, string> = {
  date: 'date',
  merchant: 'merchant',
  category: 'category',
  type: 'in or out',
};

export const ImportPage: React.FC = () => {
  const { scope, isFriends, group, context, groupId, bumpRevision } = useScope();
  const { toast } = useToast();

  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [unrecognised, setUnrecognised] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    importApi.status().then(setStatus).catch(() => setStatus(null));
    txApi.categories().then(setCategories).catch(() => setCategories([]));
  }, []);

  /** A scope change invalidates parsed rows — they were deduped against the old one. */
  useEffect(() => {
    setRows(null);
    setUnrecognised([]);
  }, [context, groupId]);

  const parseSms = async () => {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const res = await importApi.parseSms(scope, text);
      setRows(res.rows);
      setUnrecognised(res.unrecognised || []);
      if (res.rows.length === 0) {
        toast('No transactions found in that text.', 'info');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not read that.', 'error');
    } finally {
      setParsing(false);
    }
  };

  const readImage = useCallback(
    async (file: File) => {
      if (!status?.screenshotEnabled) return;

      if (file.size > status.maxImageBytes) {
        toast('That image is too large. Try a smaller one.', 'error');
        return;
      }

      setParsing(true);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read that file'));
          reader.readAsDataURL(file);
        });

        const res = await importApi.parseScreenshot(scope, dataUrl);
        setRows((prev) => [...(prev || []), ...res.rows]);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not read that screenshot.', 'error');
      } finally {
        setParsing(false);
      }
    },
    [scope, status, toast]
  );

  /** Paste a screenshot straight from the clipboard — the common gesture. */
  useEffect(() => {
    if (!status?.screenshotEnabled) return;

    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files || [])[0];
      if (file?.type.startsWith('image/')) {
        e.preventDefault();
        readImage(file);
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [status, readImage]);

  const patch = (index: number, changes: Partial<ImportRow>) =>
    setRows((prev) => prev?.map((r, i) => (i === index ? { ...r, ...changes } : r)) ?? prev);

  const selected = rows?.filter((r) => r.include) ?? [];

  const commit = async () => {
    if (selected.length === 0) return;
    setCommitting(true);
    try {
      const res = await importApi.commit(scope, selected);
      bumpRevision();
      setRows(null);
      setText('');
      setUnrecognised([]);

      const skippedDupes = res.skipped.filter((s) => s.reason === 'already imported').length;
      toast(
        `${res.imported} imported${skippedDupes ? `, ${skippedDupes} skipped as already there` : ''}.`,
        'success'
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not import.', 'error');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={isFriends ? `Friends mode · ${group?.name ?? ''}` : 'Personal mode'}
        title="Import"
        subtitle={
          isFriends
            ? 'Add expenses to this group without typing them one by one.'
            : 'Stop typing transactions in one at a time.'
        }
      />

      <div className="space-y-6">
        {/* The trust claim, stated rather than implied. */}
        <Panel>
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-md bg-[var(--safe-wash)] text-safe flex items-center justify-center shrink-0">
              <ShieldCheck className="w-[18px] h-[18px]" />
            </span>
            <div className="text-[13px] text-ink-2 leading-relaxed">
              <p className="mb-1.5">
                <strong className="text-ink">Nothing is saved until you say so.</strong> Everything
                below lands in a list you check first.
              </p>
              <p>
                Pasted messages are read on the server and never sent anywhere else. Screenshots are
                read once and{' '}
                <strong className="text-ink">discarded immediately — Finget stores no images</strong>.
              </p>
            </div>
          </div>
        </Panel>

        {/* Paste SMS — the path that always works */}
        <Panel>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
              <MessageSquareText className="w-[18px] h-[18px]" />
            </span>
            <h2 className="font-semibold text-ink">Paste your bank messages</h2>
          </div>
          <p className="text-[13px] text-ink-2 mb-5">
            Copy a batch of bank or UPI SMS and paste them all at once. OTPs and balance alerts are
            ignored.
          </p>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={'Rs.1248.00 debited from A/c XX4417 on 14-08-26 to VPA bluetokai@okhdfcbank Ref 438291047265\n\nINR 899.00 spent at NETFLIX on 16-08-26'}
            className="font-mono text-[12.5px]"
          />

          <div className="flex justify-end mt-4">
            <Button onClick={parseSms} loading={parsing} disabled={!text.trim()}>
              Read {text.trim() ? `${text.trim().split(/\n\s*\n|\n/).filter(Boolean).length} lines` : 'messages'}
            </Button>
          </div>
        </Panel>

        {/* Screenshot — honest about being unavailable */}
        <Panel>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center">
              <Upload className="w-[18px] h-[18px]" />
            </span>
            <h2 className="font-semibold text-ink">Payment screenshot</h2>
            {status && !status.screenshotEnabled && <Badge>Not set up</Badge>}
          </div>

          {status?.screenshotEnabled ? (
            <>
              <p className="text-[13px] text-ink-2 mb-5">
                Paste a screenshot anywhere on this page, or choose a file. It is read once and
                thrown away.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readImage(file);
                  e.target.value = '';
                }}
              />
              <Button variant="glass" onClick={() => fileRef.current?.click()} loading={parsing}>
                Choose a screenshot
              </Button>
            </>
          ) : (
            <p className="text-[13px] text-ink-2 leading-relaxed">
              {status?.message ||
                'Screenshot reading is not connected on this server. Pasting your bank SMS above works without it and handles most imports.'}
            </p>
          )}
        </Panel>

        {/* The review sheet */}
        {rows !== null && (
          <Panel>
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
              <h2 className="font-semibold text-ink">Check before importing</h2>
              <p className="text-[12.5px] text-ink-3">
                {selected.length} of {rows.length} selected
              </p>
            </div>
            <p className="text-[13px] text-ink-2 mb-5">
              Edit anything that looks wrong. Rows Finget thinks you already have are unticked.
            </p>

            {rows.length === 0 ? (
              <EmptyState
                icon={<MessageSquareText className="w-6 h-6" />}
                title="Nothing found"
                body="No transactions in that text. Bank SMS usually contains an amount, a date, and who was paid."
              />
            ) : (
              <div className="space-y-3">
                {rows.map((row, i) => (
                  <ReviewRow
                    key={`${row.reference || row.raw || i}-${i}`}
                    row={row}
                    categories={categories}
                    onChange={(changes) => patch(i, changes)}
                    onRemove={() => setRows((prev) => prev?.filter((_, j) => j !== i) ?? prev)}
                  />
                ))}
              </div>
            )}

            {unrecognised.length > 0 && (
              <div className="glass-well rounded-md p-4 mt-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[13px] text-ink-2 mb-2">
                      {unrecognised.length} message{unrecognised.length === 1 ? '' : 's'} looked like
                      money but didn't match a format Finget knows. Add {unrecognised.length === 1 ? 'it' : 'them'} by hand for now.
                    </p>
                    <ul className="space-y-1">
                      {unrecognised.slice(0, 5).map((u, i) => (
                        <li key={i} className="text-[11.5px] text-ink-3 font-mono truncate">
                          {u}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div className="flex items-center justify-between gap-3 flex-wrap mt-6 pt-5 border-t border-white/50">
                <Button variant="ghost" onClick={() => setRows(null)}>
                  Discard
                </Button>
                <Button onClick={commit} loading={committing} disabled={selected.length === 0}>
                  Import {selected.length} transaction{selected.length === 1 ? '' : 's'}
                </Button>
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const ReviewRow: React.FC<{
  row: ImportRow;
  categories: string[];
  onChange: (changes: Partial<ImportRow>) => void;
  onRemove: () => void;
}> = ({ row, categories, onChange, onRemove }) => {
  const [open, setOpen] = useState(false);

  /** A field Finget could not read is outlined, never silently filled. */
  const attention = (field: string) =>
    row.needsAttention.includes(field) ? 'ring-1 ring-[var(--warn)]' : '';

  const dateValue = row.date ? new Date(row.date).toISOString().slice(0, 10) : '';

  return (
    <div className={cn('glass-well rounded-md p-4', !row.include && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={row.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          aria-label={`Include ${row.merchant || 'this transaction'}`}
          className="mt-1 w-4 h-4 accent-[var(--accent)] shrink-0"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <p className="font-semibold text-ink text-[14px] truncate">
              {row.merchant || <span className="text-ink-3 font-normal">Unnamed</span>}
            </p>
            <p
              className={cn(
                'text-[15px] font-semibold numeric shrink-0',
                row.type === 'income' ? 'text-safe' : 'text-ink'
              )}
            >
              {row.type === 'income' ? '+' : ''}
              {inr(row.amount)}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {row.date ? (
              <span className="text-[12px] text-ink-3">
                {new Date(row.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            ) : (
              <Badge tone="warn">No date</Badge>
            )}
            {row.category && (
              <span className="text-[12px] text-ink-3">
                {row.category}
                {row.categorySource === 'learned' && ' · your usual'}
              </span>
            )}
            {row.issuerLabel && <span className="text-[12px] text-ink-3">{row.issuerLabel}</span>}
          </div>

          {/* Duplicates explain themselves rather than just being unticked. */}
          {row.duplicateOf && (
            <div className="flex items-start gap-2 mt-2.5 text-[12.5px] text-warn">
              <Copy className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Looks like one you already have
                {row.duplicateOf.label ? ` — ${row.duplicateOf.label}` : ''} on{' '}
                {new Date(row.duplicateOf.date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
                . Tick it if this is a separate purchase.
              </span>
            </div>
          )}

          {row.needsAttention.length > 0 && !row.duplicateOf && (
            <p className="text-[12px] text-warn mt-2">
              Check the{' '}
              {row.needsAttention.map((f) => ATTENTION_LABEL[f] || f).join(', ')}.
            </p>
          )}

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-[12px] text-accent font-semibold mt-2.5"
          >
            {open ? 'Done' : 'Edit'}
          </button>

          {open && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Amount">
                <MoneyInput
                  value={String(row.amount ?? '')}
                  onChange={(e) => onChange({ amount: Number(e.target.value) })}
                  min="0"
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={dateValue}
                  className={attention('date')}
                  onChange={(e) =>
                    onChange({ date: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </Field>
              <Field label="Merchant">
                <Input
                  value={row.merchant || ''}
                  className={attention('merchant')}
                  onChange={(e) => onChange({ merchant: e.target.value })}
                  maxLength={60}
                />
              </Field>
              <Field label="Category">
                <Select
                  value={row.category || ''}
                  className={attention('category')}
                  onChange={(e) => onChange({ category: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="In or out">
                <Select
                  value={row.type}
                  className={attention('type')}
                  onChange={(e) => onChange({ type: e.target.value as 'expense' | 'income' })}
                >
                  <option value="expense">Money out</option>
                  <option value="income">Money in</option>
                </Select>
              </Field>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  icon={<Trash2 className="w-4 h-4" />}
                >
                  Remove
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
