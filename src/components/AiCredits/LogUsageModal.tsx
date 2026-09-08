import React, { useState, useEffect } from 'react';
import { aiCreditApi, type AiProvider, type ModelPricing } from '../../api';
import { useToast } from '../../context/toastStore';
import { Button, Modal, Field, Select, Input } from '../ui';

interface LogUsageModalProps {
  open: boolean;
  onClose: () => void;
  providers: AiProvider[];
  selectedProvider?: AiProvider | null;
  onSuccess?: () => void;
}

export const LogUsageModal: React.FC<LogUsageModalProps> = ({
  open,
  onClose,
  providers,
  selectedProvider,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [providerId, setProviderId] = useState(selectedProvider?._id || providers[0]?._id || '');
  const [models, setModels] = useState<ModelPricing[]>([]);
  const [model, setModel] = useState('gpt-4o');
  const [inputTokens, setInputTokens] = useState('2500');
  const [outputTokens, setOutputTokens] = useState('600');
  const [customCost, setCustomCost] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    aiCreditApi.getModels().then((res) => {
      setModels(res.models);
      if (res.models.length > 0 && !model) {
        setModel(res.models[0].key);
      }
    }).catch(console.error);
  }, [model]);

  useEffect(() => {
    if (selectedProvider) {
      setProviderId(selectedProvider._id);
    } else if (providers.length > 0 && !providerId) {
      setProviderId(providers[0]._id);
    }
  }, [selectedProvider, providers, providerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId || !model) return;

    setLoading(true);
    try {
      await aiCreditApi.logUsage({
        providerId,
        model,
        inputTokens: Number(inputTokens) || 0,
        outputTokens: Number(outputTokens) || 0,
        cost: customCost ? Number(customCost) : undefined,
        notes: notes.trim() || undefined,
        source: 'manual_entry',
      });

      toast('Logged AI usage and deducted via FIFO burn engine!', 'success');
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to log usage';
      toast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log AI API Token Spend">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <Field label="AI Provider">
          <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            {providers.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} (Bal: ₹{p.velocity?.totalBalance.toLocaleString() ?? '0'})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Model">
          <Select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Input Tokens">
            <Input
              type="number"
              min="0"
              value={inputTokens}
              onChange={(e) => setInputTokens(e.target.value)}
            />
          </Field>
          <Field label="Output Tokens">
            <Input
              type="number"
              min="0"
              value={outputTokens}
              onChange={(e) => setOutputTokens(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Direct Cost (₹, Optional)" hint="Leave blank to auto-calculate from standard pricing table">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={customCost}
            onChange={(e) => setCustomCost(e.target.value)}
            placeholder="Auto-calculated"
          />
        </Field>

        <Field label="Notes / Workload Tag">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Chatbot customer triage, code generation"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Logging...' : 'Log & Deduct (FIFO)'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
