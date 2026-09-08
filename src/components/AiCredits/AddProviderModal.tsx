import React, { useState } from 'react';
import { aiCreditApi } from '../../api';
import { useToast } from '../../context/toastStore';
import { Button, Modal, Field, Select, Input } from '../ui';

interface AddProviderModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const PROVIDER_OPTIONS = [
  { key: 'openai', name: 'OpenAI' },
  { key: 'anthropic', name: 'Anthropic' },
  { key: 'groq', name: 'Groq Cloud' },
  { key: 'deepseek', name: 'DeepSeek' },
  { key: 'gemini', name: 'Google Gemini' },
  { key: 'cohere', name: 'Cohere' },
  { key: 'mistral', name: 'Mistral AI' },
  { key: 'perplexity', name: 'Perplexity' },
  { key: 'openrouter', name: 'OpenRouter' },
  { key: 'together', name: 'Together AI' },
  { key: 'fireworks', name: 'Fireworks AI' },
  { key: 'custom', name: 'Custom / Self-Hosted LLM' },
];

export const AddProviderModal: React.FC<AddProviderModalProps> = ({ open, onClose, onSuccess }) => {
  const { toast } = useToast();
  const [providerKey, setProviderKey] = useState('openai');
  const [name, setName] = useState('OpenAI');
  const [authCredentials, setAuthCredentials] = useState('');
  const [syncType, setSyncType] = useState<'api' | 'manual' | 'local_proxy'>('api');
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState('500');
  const [loading, setLoading] = useState(false);

  const handleProviderSelect = (key: string) => {
    setProviderKey(key);
    const found = PROVIDER_OPTIONS.find((p) => p.key === key);
    if (found) setName(found.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await aiCreditApi.createProvider({
        name: name.trim(),
        providerKey,
        authCredentials: authCredentials.trim() || undefined,
        syncType,
        lowBalanceThreshold: Number(lowBalanceThreshold) || 100,
      });

      toast(`Connected AI Provider: ${name}!`, 'success');
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create provider';
      toast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect New AI Provider">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <Field label="Platform Provider">
          <Select value={providerKey} onChange={(e) => handleProviderSelect(e.target.value)}>
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Display Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. OpenAI Production"
            required
          />
        </Field>

        <Field label="Integration / Sync Mode">
          <Select
            value={syncType}
            onChange={(e) => setSyncType(e.target.value as 'api' | 'manual' | 'local_proxy')}
          >
            <option value="api">Admin API Sync (Direct usage / credit endpoint)</option>
            <option value="local_proxy">Local Backend Proxy (Intercepted token calls)</option>
            <option value="manual">Manual Ledger (Top-ups & self-logged spend)</option>
          </Select>
        </Field>

        <Field label="API Key or Admin Secret (Optional & Masked)">
          <Input
            type="password"
            value={authCredentials}
            onChange={(e) => setAuthCredentials(e.target.value)}
            placeholder="sk-... or gsk-..."
          />
        </Field>

        <Field
          label="Low Balance Alert Threshold (₹)"
          hint="Triggers an in-app alert when total remaining credits drop below this amount."
        >
          <Input
            type="number"
            min="1"
            value={lowBalanceThreshold}
            onChange={(e) => setLowBalanceThreshold(e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Connecting...' : 'Connect Provider'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
