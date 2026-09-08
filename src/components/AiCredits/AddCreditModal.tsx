import React, { useState } from 'react';
import { aiCreditApi, type AiProvider } from '../../api';
import { inr } from '../../lib/format';
import { useToast } from '../../context/toastStore';
import { Button, Modal, Field, Select, Input } from '../ui';

interface AddCreditModalProps {
  open: boolean;
  onClose: () => void;
  providers: AiProvider[];
  selectedProvider?: AiProvider | null;
  onSuccess?: () => void;
}

export const AddCreditModal: React.FC<AddCreditModalProps> = ({
  open,
  onClose,
  providers,
  selectedProvider,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [providerId, setProviderId] = useState(selectedProvider?._id || providers[0]?._id || '');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('50');
  const [creditType, setCreditType] = useState<'grant' | 'paid' | 'subscription'>('paid');
  const [expiryDate, setExpiryDate] = useState('');
  const [autoSyncLedger, setAutoSyncLedger] = useState(true);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (selectedProvider) {
      setProviderId(selectedProvider._id);
    } else if (providers.length > 0 && !providerId) {
      setProviderId(providers[0]._id);
    }
  }, [selectedProvider, providers, providerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!providerId || !name || isNaN(numAmount) || numAmount <= 0) {
      toast('Please enter a valid credit name and positive amount.', 'error');
      return;
    }

    setLoading(true);
    try {
      await aiCreditApi.createCredit({
        providerId,
        name: name.trim(),
        amount: numAmount,
        creditType,
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined,
        autoSyncLedger: creditType !== 'grant' && autoSyncLedger,
      });

      toast(
        `Added $${numAmount} ${creditType === 'grant' ? 'Grant' : 'Credit'} to ${providers.find(p => p._id === providerId)?.name || 'Provider'}!`,
        'success'
      );
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to add credit';
      toast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const num = Number(amount) || 0;

  return (
    <Modal open={open} onClose={onClose} title="Add AI Credit / Grant Balance">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <Field label="AI Provider">
          <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            {providers.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Credit Package Name" hint="e.g. OpenAI ₹10k Grant, Prepaid Recharge, Claude Max">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. OpenAI ₹10k Startup Grant"
            required
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Credit Type">
            <Select
              value={creditType}
              onChange={(e) => setCreditType(e.target.value as 'grant' | 'paid' | 'subscription')}
            >
              <option value="paid">Paid Prepaid Balance</option>
              <option value="grant">Promotional Grant / Free Tier</option>
              <option value="subscription">Flat Rate Subscription</option>
            </Select>
          </Field>

          <Field label="Amount (₹)">
            <Input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="5000"
              required
            />
          </Field>
        </div>

        <Field
          label="Expiry Date (Optional)"
          hint="Grants expiring sooner are automatically burned first by FIFO logic"
        >
          <Input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </Field>

        {creditType !== 'grant' && (
          <div className="glass-well rounded-lg p-3 border border-white/60 flex items-start gap-2.5">
            <input
              type="checkbox"
              id="syncLedger"
              checked={autoSyncLedger}
              onChange={(e) => setAutoSyncLedger(e.target.checked)}
              className="mt-1"
            />
            <label htmlFor="syncLedger" className="text-xs text-ink-2 leading-relaxed cursor-pointer select-none">
              <strong className="text-ink font-semibold">Sync with Finget General Ledger</strong>
              <br />
              Automatically book a ₹{inr(num)} software expense transaction in your main ledger so your Safe-to-Spend remains integer-accurate.
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Adding...' : 'Add Credit Package'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
