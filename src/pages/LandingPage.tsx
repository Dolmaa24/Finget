import React, { useState } from 'react';
import {
  ShieldCheck,
  Sparkles,
  Users,
  ArrowRight,
  Split,
  Target,
  Scale,
  MessageSquare,
} from 'lucide-react';
import { AuthModal } from '../components/AuthModal';
import { BrandMark, Wordmark } from '../components/Brand';
import { Badge, Button, Progress } from '../components/ui';
import { inr } from '../lib/format';

const FEATURES = [
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    title: 'Safe to spend, today',
    body: 'Not last month’s report. Income minus what you’ve spent minus what you promised to save, divided by the days actually left.',
  },
  {
    icon: <Sparkles className="w-5 h-5" />,
    title: 'See the cost before you pay it',
    body: 'Type an amount and watch it land: new daily allowance, new risk level, and how many days it pushes back your goal.',
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: 'Friends mode',
    body: 'Flip one switch and the whole app becomes a shared wallet — pooled income, split expenses, one settle-up sheet.',
  },
];

const FRIENDS_FEATURES = [
  { icon: <Split className="w-4 h-4" />, label: 'Equal or custom splits' },
  { icon: <Scale className="w-4 h-4" />, label: 'Minimal settle-up' },
  { icon: <Target className="w-4 h-4" />, label: 'Shared goals' },
  { icon: <MessageSquare className="w-4 h-4" />, label: 'Group AI coach' },
];

export const LandingPage: React.FC = () => {
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null);

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <div className="app-ground" />
      <div className="app-orbs" aria-hidden>
        <span className="app-orb app-orb--1" />
        <span className="app-orb app-orb--2" />
        <span className="app-orb app-orb--3" />
        <span className="app-orb app-orb--4" />
      </div>

      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40 px-4 sm:px-6 pt-4">
        <nav className="max-w-shell mx-auto glass-strong glass-sheen rounded-pill h-16 px-4 sm:px-6 flex items-center gap-3">
          <BrandMark size={34} />
          <Wordmark />
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setAuth('login')}>
            Log in
          </Button>
          <Button size="sm" onClick={() => setAuth('signup')}>
            Get started
          </Button>
        </nav>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="px-4 sm:px-6 pt-16 sm:pt-24 pb-20">
        <div className="max-w-shell mx-auto grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <div className="animate-rise">
            <Badge tone="accent" className="mb-6">
              Decision-first money
            </Badge>

            <h1 className="display text-[46px] sm:text-[68px] mb-6">
              Stop tracking.
              <br />
              Start deciding.
            </h1>

            <p className="text-lg text-ink-2 leading-relaxed max-w-lg mb-9">
              Most apps tell you what you already spent. Finget answers the only question that
              matters in the shop: <em className="text-ink not-italic font-medium">can I afford
              this, right now, without hurting anything I care about?</em>
            </p>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => setAuth('signup')} icon={<ArrowRight className="w-4 h-4" />}>
                Create a free account
              </Button>
              <Button size="lg" variant="glass" onClick={() => setAuth('login')}>
                I already have one
              </Button>
            </div>
          </div>

          {/* Product preview. Extra bottom padding keeps room for the
              floating what-if chip so it never covers the card's figures. */}
          <div className="relative pb-20 animate-rise" style={{ animationDelay: '0.12s' }}>
            <div className="glass-strong glass-sheen rounded-xl p-7 lift">
              <div className="flex items-center justify-between mb-5">
                <p className="eyebrow">Safe to spend today</p>
                <Badge tone="safe" icon={<ShieldCheck className="w-3.5 h-3.5" />}>
                  Safe
                </Badge>
              </div>

              <p className="display numeric text-[58px] leading-none text-safe mb-2">
                {inr(2150)}
              </p>
              <p className="text-sm text-ink-2 mb-7">You&rsquo;re on track.</p>

              <div className="pt-5 border-t border-white/55">
                <div className="flex justify-between text-[12px] text-ink-3 mb-2">
                  <span>Spent this month</span>
                  <span className="numeric">
                    {inr(27000)} of {inr(70000)}
                  </span>
                </div>
                <Progress value={38} />

                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                      Left
                    </p>
                    <p className="text-base font-semibold numeric">{inr(43000)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                      Days left
                    </p>
                    <p className="text-base font-semibold numeric">20</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                      Saving
                    </p>
                    <p className="text-base font-semibold numeric">{inr(10000)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating what-if chip */}
            <div
              className="absolute bottom-0 left-0 sm:-left-8 glass-strong glass-sheen rounded-lg p-4 max-w-[260px] animate-rise"
              style={{ animationDelay: '0.3s' }}
            >
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-md bg-[var(--warn-wash)] text-warn flex items-center justify-center shrink-0">
                  <Sparkles className="w-[18px] h-[18px]" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-ink">If you buy this…</p>
                  <p className="text-[12px] text-ink-2 mt-0.5 leading-snug">
                    Goa trip slips by <strong className="text-warn">9 days</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="px-4 sm:px-6 py-16">
        <div className="max-w-shell mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 stagger">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass glass-sheen rounded-lg p-7 lift">
                <span className="w-11 h-11 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center mb-5">
                  {f.icon}
                </span>
                <h3 className="font-semibold text-ink text-lg mb-2.5">{f.title}</h3>
                <p className="text-[14px] text-ink-2 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Friends mode ---------- */}
      <section className="px-4 sm:px-6 py-16">
        <div className="max-w-shell mx-auto glass-strong glass-sheen rounded-xl p-9 sm:p-14">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge tone="accent" className="mb-5">
                Friends mode
              </Badge>
              <h2 className="display text-[36px] sm:text-[44px] mb-5">
                Money is rarely
                <br />
                a solo sport.
              </h2>
              <p className="text-ink-2 leading-relaxed mb-8 max-w-md">
                Trips, flatshares, couples. Switch modes and every screen you already know —
                dashboard, goals, coach, insights — re-scopes to the group instead of you.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {FRIENDS_FEATURES.map((f) => (
                  <div key={f.label} className="flex items-center gap-2.5 text-[13.5px] text-ink-2">
                    <span className="w-8 h-8 rounded-sm glass-well flex items-center justify-center text-accent shrink-0">
                      {f.icon}
                    </span>
                    {f.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Settle-up preview */}
            <div className="glass rounded-lg p-6">
              <p className="eyebrow mb-5">Settle up · Goa trip</p>
              <div className="space-y-3">
                {[
                  { from: 'Bob', to: 'Alice', amount: 1966 },
                  { from: 'Carol', to: 'Alice', amount: 966 },
                ].map((t) => (
                  <div
                    key={t.from}
                    className="glass-well rounded-md p-3.5 flex items-center gap-3 text-[13.5px]"
                  >
                    <span className="font-medium text-ink">{t.from}</span>
                    <ArrowRight className="w-4 h-4 text-ink-4" />
                    <span className="font-medium text-ink">{t.to}</span>
                    <span className="ml-auto font-semibold numeric text-ink">{inr(t.amount)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[12.5px] text-ink-3 mt-4 leading-relaxed">
                Finget reduces every debt in the group to the fewest possible payments.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="px-4 sm:px-6 py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="display text-[36px] sm:text-[46px] mb-5">
            Know your number.
          </h2>
          <p className="text-ink-2 mb-9 text-lg">
            Free to start. Your first safe-to-spend figure is about two minutes away.
          </p>
          <Button size="lg" onClick={() => setAuth('signup')} icon={<ArrowRight className="w-4 h-4" />}>
            Get started
          </Button>
        </div>
      </section>

      <footer className="px-4 sm:px-6 pb-10">
        <div className="max-w-shell mx-auto glass rounded-lg px-7 py-6 flex flex-wrap items-center gap-4">
          <BrandMark size={30} />
          <p className="text-[13px] text-ink-2">
            Finget — the decision-first financial system.
          </p>
          <p className="text-[12.5px] text-ink-3 ml-auto">
            © {new Date().getFullYear()} Finget
          </p>
        </div>
      </footer>

      <AuthModal open={!!auth} onClose={() => setAuth(null)} defaultTab={auth || 'login'} />
    </div>
  );
};
