import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Plus,
  Zap,
  Clock,
  AlertTriangle,
  Play,
  RotateCw,
  Layers,
} from 'lucide-react';
import { aiCreditApi, type AiCreditDashboard, type AiProvider } from '../api';
import { useToast } from '../context/toastStore';
import { PageHeader, Panel, Button, EmptyState, Badge } from '../components/ui';
import { AiCreditCard } from '../components/AiCredits/AiCreditCard';
import { ModelBreakdownChart } from '../components/AiCredits/ModelBreakdownChart';
import { AddCreditModal } from '../components/AiCredits/AddCreditModal';
import { AddProviderModal } from '../components/AiCredits/AddProviderModal';
import { TokenPlaygroundModal } from '../components/AiCredits/TokenPlaygroundModal';
import { LogUsageModal } from '../components/AiCredits/LogUsageModal';

export const AiCreditsPage: React.FC = () => {
  const { toast } = useToast();
  const [data, setData] = useState<AiCreditDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals state
  const [addCreditOpen, setAddCreditOpen] = useState(false);
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [logUsageOpen, setLogUsageOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider | null>(null);

  const loadDashboard = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await aiCreditApi.getDashboard();
      setData(res);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load AI credits';
      toast(errorMsg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSyncProvider = async (providerId: string) => {
    try {
      await aiCreditApi.syncProvider(providerId);
      toast('Provider credits synced successfully!', 'success');
      await loadDashboard(true);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Sync failed';
      toast(errorMsg, 'error');
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!window.confirm('Are you sure you want to remove this provider and its tracked credits?')) return;
    try {
      await aiCreditApi.deleteProvider(providerId);
      toast('Provider removed.', 'info');
      await loadDashboard(true);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Delete failed';
      toast(errorMsg, 'error');
    }
  };

  const handleOpenAddCredit = (provider?: AiProvider) => {
    setSelectedProvider(provider || null);
    setAddCreditOpen(true);
  };

  const handleOpenLogUsage = (provider?: AiProvider) => {
    setSelectedProvider(provider || null);
    setLogUsageOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          eyebrow="Developer & AI Infrastructure"
          title="AI Credits & API Spend"
          subtitle="FIFO burn-down engine, multi-provider credit tracking, and general ledger synchronization."
        />

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="glass"
            size="sm"
            onClick={() => setPlaygroundOpen(true)}
            className="gap-1.5 text-xs font-semibold"
          >
            <Play className="w-3.5 h-3.5 text-accent fill-current" /> Token Playground
          </Button>

          <Button
            variant="glass"
            size="sm"
            onClick={() => setAddProviderOpen(true)}
            className="gap-1.5 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Connect Platform
          </Button>

          <Button
            size="sm"
            onClick={() => handleOpenAddCredit()}
            className="gap-1.5 text-xs font-semibold"
          >
            <Zap className="w-3.5 h-3.5" /> + Add Credit / Grant
          </Button>

          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="p-2 rounded-pill text-ink-3 hover:text-ink hover:bg-white/50 transition-colors"
            title="Refresh dashboard"
          >
            <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Panel key={i}>
              <div className="skeleton h-24 rounded-md" />
            </Panel>
          ))}
        </div>
      ) : data ? (
        <>
          {/* Active Alerts Banner */}
          {data.alerts && data.alerts.length > 0 && (
            <div className="space-y-2">
              {data.alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-semibold text-ink">{alert.title}</h5>
                      <p className="text-ink-2 mt-0.5">{alert.body}</p>
                    </div>
                  </div>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => handleOpenAddCredit()}
                    className="shrink-0 text-[11px] h-7 px-2.5 bg-white/80"
                  >
                    Top Up
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Top Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-3 uppercase tracking-wider">
                  Total Active Balance
                </span>
                <Badge tone="safe">FIFO Active</Badge>
              </div>
              <p className="text-2xl font-bold text-ink mt-1.5">
                ₹{data.summary.totalBalanceINR.toLocaleString()}
              </p>
              <p className="text-xs font-medium text-ink-3 mt-0.5">
                across {data.summary.providerCount} platforms
              </p>
            </Panel>

            <Panel className="p-4">
              <span className="text-xs font-semibold text-ink-3 uppercase tracking-wider">
                30-Day API Spend
              </span>
              <p className="text-2xl font-bold text-ink mt-1.5">
                ₹{data.summary.totalSpend30dINR.toLocaleString()}
              </p>
              <p className="text-xs font-medium text-ink-3 mt-0.5">
                synced to ledger
              </p>
            </Panel>

            <Panel className="p-4">
              <span className="text-xs font-semibold text-ink-3 uppercase tracking-wider">
                Daily Burn Velocity
              </span>
              <p className="text-2xl font-bold text-ink mt-1.5">
                ₹{data.summary.totalDailyBurnUSD.toFixed(2)}
                <span className="text-xs font-normal text-ink-3">/day</span>
              </p>
              <p className="text-xs font-medium text-ink-3 mt-0.5">
                daily burn rate
              </p>
            </Panel>

            <Panel className="p-4">
              <span className="text-xs font-semibold text-ink-3 uppercase tracking-wider">
                Estimated Runway
              </span>
              <p className="text-2xl font-bold text-ink mt-1.5 flex items-center gap-1.5">
                <Clock className="w-5 h-5 text-accent" />
                {data.summary.runwayDays >= 999 ? 'Ample' : `${data.summary.runwayDays} days`}
              </p>
              <p className="text-xs font-medium text-ink-3 mt-0.5">
                Until next recharge needed
              </p>
            </Panel>
          </div>

          {/* Providers Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                <Cpu className="w-4 h-4 text-accent" /> Connected Providers & Credit Pools
              </h3>
              <span className="text-xs text-ink-3">
                {data.providers.length} platform{data.providers.length === 1 ? '' : 's'} tracked
              </span>
            </div>

            {data.providers.length === 0 ? (
              <EmptyState
                icon={<Cpu className="w-8 h-8" />}
                title="No AI Providers Connected"
                body="Add OpenAI, Anthropic, OpenRouter, Groq or custom endpoints to track credits and token burn."
                action={
                  <Button onClick={() => setAddProviderOpen(true)}>
                    <Plus className="w-4 h-4 mr-1.5" /> Connect First Provider
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {data.providers.map((prov) => (
                  <AiCreditCard
                    key={prov._id}
                    provider={prov}
                    onAddCredit={handleOpenAddCredit}
                    onSync={handleSyncProvider}
                    onDelete={handleDeleteProvider}
                    onLogUsage={handleOpenLogUsage}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Analytics & Model Cost Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ModelBreakdownChart
                breakdown={data.modelBreakdown}
                totalSpendINR={data.summary.totalSpend30dINR}
              />
            </div>

            {/* FIFO Logic & Rules Explainer Card */}
            <div className="glass glass-sheen rounded-xl p-5 border border-white/60 dark:border-white/10 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-600 flex items-center justify-center font-bold text-xs">
                    FIFO
                  </span>
                  <h4 className="font-semibold text-ink text-sm">First-In-First-Out Burn Logic</h4>
                </div>

                <p className="text-xs text-ink-2 leading-relaxed space-y-2">
                  <span>
                    Finget burns promotional grants and expiring credits first before deducting from paid cash reserves.
                  </span>
                </p>

                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-ink-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>1. Grants nearing expiration</span>
                  </div>
                  <div className="flex items-center gap-2 text-ink-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    <span>2. Paid credits with nearest expiry</span>
                  </div>
                  <div className="flex items-center gap-2 text-ink-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span>3. Oldest non-expiring balances</span>
                  </div>
                </div>
              </div>

              <Button
                variant="glass"
                size="sm"
                onClick={() => setLogUsageOpen(true)}
                className="mt-4 w-full text-xs font-semibold gap-1.5"
              >
                Log Manual API Spend
              </Button>
            </div>
          </div>

          {/* Recent Usage Logs Ledger */}
          <div className="glass glass-sheen rounded-xl p-5 border border-white/60 dark:border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-[var(--accent-wash)] text-accent flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="font-semibold text-ink text-sm">Recent Token Usage Events</h4>
                  <p className="text-xs text-ink-3">Live stream of programmatic deductions</p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenLogUsage()}
                className="text-xs text-accent hover:text-accent font-semibold"
              >
                + Record Usage
              </Button>
            </div>

            {data.recentUsage.length === 0 ? (
              <p className="text-xs text-ink-3 text-center py-6">No API usage recorded yet.</p>
            ) : (
              <div className="overflow-x-auto scroll-slim">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/60 text-ink-3 uppercase text-[10px] tracking-wider font-semibold">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Tokens (In / Out)</th>
                      <th className="py-2.5 px-3">Cost (₹)</th>
                      <th className="py-2.5 px-3">Burned From</th>
                      <th className="py-2.5 px-3">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/40">
                    {data.recentUsage.map((u) => (
                      <tr key={u._id} className="hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                        <td className="py-2.5 px-3 text-ink-3 font-mono text-[11px] whitespace-nowrap">
                          {new Date(u.timestamp).toLocaleDateString()} {new Date(u.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-ink whitespace-nowrap">
                          {u.providerId?.name || 'AI'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-2 font-medium whitespace-nowrap">
                          {u.model}
                        </td>
                        <td className="py-2.5 px-3 text-ink-2 font-mono whitespace-nowrap">
                          {u.inputTokens.toLocaleString()} in / {u.outputTokens.toLocaleString()} out
                        </td>
                        <td className="py-2.5 px-3 font-bold text-ink whitespace-nowrap">
                          ₹{u.cost.toFixed(3)}
                        </td>
                        <td className="py-2.5 px-3 text-ink-3 truncate max-w-[150px]">
                          {u.deductedCreditId?.name ? (
                            <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                              {u.deductedCreditId.name}
                            </span>
                          ) : (
                            <span className="text-ink-3">Default Pool</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <Badge tone={u.source === 'api_sync' ? 'safe' : u.source === 'local_proxy' ? 'neutral' : 'warn'}>
                            {u.source}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Modals */}
      {data && (
        <>
          <AddCreditModal
            open={addCreditOpen}
            onClose={() => setAddCreditOpen(false)}
            providers={data.providers}
            selectedProvider={selectedProvider}
            onSuccess={() => loadDashboard(true)}
          />

          <AddProviderModal
            open={addProviderOpen}
            onClose={() => setAddProviderOpen(false)}
            onSuccess={() => loadDashboard(true)}
          />

          <TokenPlaygroundModal
            open={playgroundOpen}
            onClose={() => setPlaygroundOpen(false)}
            providers={data.providers}
            onUsageLogged={() => loadDashboard(true)}
          />

          <LogUsageModal
            open={logUsageOpen}
            onClose={() => setLogUsageOpen(false)}
            providers={data.providers}
            selectedProvider={selectedProvider}
            onSuccess={() => loadDashboard(true)}
          />
        </>
      )}
    </div>
  );
};
