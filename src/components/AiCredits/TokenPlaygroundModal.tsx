import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { aiCreditApi, type AiProvider, type ModelPricing } from '../../api';
import { useToast } from '../../context/toastStore';
import { Button, Modal, Field, Select } from '../ui';

interface TokenPlaygroundModalProps {
  open: boolean;
  onClose: () => void;
  providers: AiProvider[];
  onUsageLogged?: () => void;
}

export const TokenPlaygroundModal: React.FC<TokenPlaygroundModalProps> = ({
  open,
  onClose,
  providers,
  onUsageLogged,
}) => {
  const { toast } = useToast();
  const [models, setModels] = useState<ModelPricing[]>([]);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [promptText, setPromptText] = useState('Explain how compound interest accelerates long-term wealth creation in 200 words.');
  const [outputTokens, setOutputTokens] = useState(350);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [estimate, setEstimate] = useState<{
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
    costINR: number;
  } | null>(null);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    aiCreditApi.getModels().then((res) => {
      setModels(res.models);
      if (res.models.length > 0 && !selectedModel) {
        setSelectedModel(res.models[0].key);
      }
    }).catch(console.error);
  }, [selectedModel]);

  useEffect(() => {
    if (providers.length > 0 && !selectedProviderId) {
      setSelectedProviderId(providers[0]._id);
    }
  }, [providers, selectedProviderId]);

  // Recalculate estimate on changes
  useEffect(() => {
    if (!selectedModel) return;
    const inputEstimate = Math.max(1, Math.ceil(promptText.length / 4));
    aiCreditApi
      .estimateCost({
        model: selectedModel,
        inputTokens: inputEstimate,
        outputTokens: Number(outputTokens) || 0,
      })
      .then(setEstimate)
      .catch(console.error);
  }, [selectedModel, promptText, outputTokens]);

  const handleTestDeduction = async () => {
    if (!selectedProviderId || !selectedModel || !estimate) return;
    setLogging(true);
    try {
      await aiCreditApi.logUsage({
        providerId: selectedProviderId,
        model: selectedModel,
        inputTokens: estimate.inputTokens,
        outputTokens: estimate.outputTokens,
        cost: estimate.totalCost,
        source: 'playground',
        notes: `Playground prompt: ${promptText.slice(0, 30)}...`,
      });

      toast(
        `Deducted ₹${estimate.totalCost.toFixed(2)} from ${providers.find(p => p._id === selectedProviderId)?.name || 'AI'} balance!`,
        'success'
      );
      onUsageLogged?.();
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Deduction failed';
      toast(errorMsg, 'error');
    } finally {
      setLogging(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="AI Token Cost Playground & Estimator">
      <div className="space-y-4 pt-1">
        <p className="text-xs text-ink-3">
          Simulate prompt consumption, compare model economics, and verify FIFO credit burn in real-time.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Model">
            <Select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name} (₹{m.inputPerM}/M in · ₹{m.outputPerM}/M out)
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Charge To Provider Balance">
            <Select
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
            >
              {providers.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} (Bal: ₹{p.velocity?.totalBalance.toLocaleString() ?? '0'})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Test Prompt / Input Text">
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-xs rounded-lg glass-well border border-white/60 focus:border-accent focus:outline-none resize-none font-mono"
            placeholder="Type or paste prompt text here to calculate token volume..."
          />
        </Field>

        <Field
          label={`Expected Output Tokens: ${outputTokens}`}
          hint="Slider for generated tokens (1 token ≈ 0.75 words)"
        >
          <input
            type="range"
            min={10}
            max={4000}
            step={10}
            value={outputTokens}
            onChange={(e) => setOutputTokens(Number(e.target.value))}
            className="w-full"
          />
        </Field>

        {/* Calculation Result Card */}
        {estimate && (
          <div className="glass-well rounded-xl p-4 border border-accent/30 bg-accent/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-[var(--accent-wash)] text-accent flex items-center justify-center font-bold">
                  ₹
                </span>
                <div>
                  <h4 className="text-sm font-bold text-ink">Estimated Token Cost</h4>
                  <p className="text-[11px] text-ink-3">
                    {estimate.inputTokens} input + {estimate.outputTokens} output ={' '}
                    <strong>{estimate.inputTokens + estimate.outputTokens} total tokens</strong>
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-lg font-bold text-ink">₹{estimate.totalCost.toFixed(3)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/50 text-[11px] text-ink-2 flex items-center justify-between">
              <span>
                Input: ₹{(estimate.inputCost).toFixed(3)} · Output: ₹{(estimate.outputCost).toFixed(3)}
              </span>
              <span className="text-emerald-600 font-medium">FIFO Burn Active</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleTestDeduction}
            disabled={logging || !estimate || estimate.totalCost <= 0}
            className="gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {logging ? 'Deducting...' : 'Test & Deduct via FIFO'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
