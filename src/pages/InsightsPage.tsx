import { cn } from '../lib/cn';
import React from 'react';
import { Lightbulb, HeartPulse, Sparkles, Ruler, Info } from 'lucide-react';
import { useScope } from '../context/scopeStore';
import { useInsights } from '../hooks/useFinget';
import { Badge, EmptyState, PageHeader, Panel, SkeletonPanel } from '../components/ui';

const scoreTone = (score: number) =>
  score > 80 ? 'safe' : score > 60 ? 'accent' : score > 40 ? 'warn' : 'risk';

export const InsightsPage: React.FC = () => {
  const { isFriends, group } = useScope();
  const { data, loading, error } = useInsights();

  const health = data.healthScore;
  const tone = health ? scoreTone(health.score) : 'neutral';

  const ruleInsights = data.insights.filter((i) => i.source !== 'ai');
  const aiInsights = data.insights.filter((i) => i.source === 'ai');

  return (
    <div>
      <PageHeader
        eyebrow={isFriends ? `Friends mode · ${group?.name ?? ''}` : 'Personal mode'}
        title="Insights"
        subtitle={
          isFriends
            ? "Patterns across the group's shared spending."
            : 'Deterministic signals from your data, plus AI reasoning on top.'
        }
      />

      {loading ? (
        <div className="space-y-5">
          <SkeletonPanel height={140} />
          <SkeletonPanel height={110} />
          <SkeletonPanel height={110} />
        </div>
      ) : error ? (
        <EmptyState icon={<Lightbulb className="w-6 h-6" />} title="Could not load insights" body={error} />
      ) : (
        <div className="space-y-6">
          {/* Health score */}
          {health && (
            <Panel className="flex flex-wrap items-center gap-6">
              <div
                className={cn(
                  'w-20 h-20 rounded-xl flex items-center justify-center shrink-0',
                  tone === 'safe'
                    ? 'bg-[var(--safe-wash)] text-safe'
                    : tone === 'warn'
                      ? 'bg-[var(--warn-wash)] text-warn'
                      : tone === 'risk'
                        ? 'bg-[var(--risk-wash)] text-risk'
                        : 'bg-[var(--accent-wash)] text-accent'
                )}
              >
                <HeartPulse className="w-9 h-9" />
              </div>

              <div className="min-w-0">
                <p className="eyebrow mb-1.5">Financial health score</p>
                <div className="flex items-baseline gap-3">
                  <span className="display numeric text-[46px]">{health.score}</span>
                  <Badge tone={tone as 'safe' | 'warn' | 'risk' | 'accent'}>{health.label}</Badge>
                </div>
                {health.hint && <p className="text-[13px] text-ink-2 mt-1.5">{health.hint}</p>}
              </div>
            </Panel>
          )}

          {/* Rule-based */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Ruler className="w-4 h-4 text-ink-3" />
              <h2 className="text-sm font-semibold text-ink-2">Detected patterns</h2>
              <span className="text-[12px] text-ink-3">· instant, always on</span>
            </div>

            {ruleInsights.length === 0 ? (
              <EmptyState
                icon={<Lightbulb className="w-6 h-6" />}
                title="Not enough data yet"
                body="Log a few more transactions and patterns will start showing up here."
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 stagger">
                {ruleInsights.map((ins, i) => (
                  <Panel key={`${ins.title}-${i}`} interactive>
                    <div className="flex items-start gap-3.5">
                      <span className="w-9 h-9 rounded-md bg-[var(--warn-wash)] text-warn flex items-center justify-center shrink-0">
                        <Lightbulb className="w-[18px] h-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-ink mb-1.5">{ins.title}</h3>
                        <p className="text-[13.5px] text-ink-2 leading-relaxed">
                          {ins.description}
                        </p>
                        {ins.actionable_tip && (
                          <p className="text-[13px] text-accent font-medium mt-3">
                            → {ins.actionable_tip}
                          </p>
                        )}
                      </div>
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </section>

          {/* AI */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-ink-2">AI reasoning</h2>
            </div>

            {!data.aiEnabled ? (
              <Panel className="flex items-start gap-3">
                <Info className="w-4.5 h-4.5 text-warn mt-0.5 shrink-0" />
                <p className="text-[13.5px] text-ink-2 leading-relaxed">
                  AI insights are off because no{' '}
                  <code className="font-mono text-[12px]">GROQ_API_KEY</code> is configured on the
                  backend. The detected patterns above are computed locally and keep working
                  regardless.
                </p>
              </Panel>
            ) : aiInsights.length === 0 ? (
              <EmptyState title="No AI insights this round" body="Add more transactions for richer analysis." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 stagger">
                {aiInsights.map((ins, i) => (
                  <Panel key={`${ins.title}-${i}`} interactive>
                    <div className="flex items-start gap-3.5">
                      <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center shrink-0">
                        <Sparkles className="w-[18px] h-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <h3 className="font-semibold text-ink">{ins.title}</h3>
                          <Badge tone="accent">AI</Badge>
                        </div>
                        <p className="text-[13.5px] text-ink-2 leading-relaxed">
                          {ins.description}
                        </p>
                        {ins.actionable_tip && (
                          <p className="text-[13px] text-accent font-medium mt-3">
                            → {ins.actionable_tip}
                          </p>
                        )}
                      </div>
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
