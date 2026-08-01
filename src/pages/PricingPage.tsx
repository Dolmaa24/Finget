import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Sparkles, Shield, ArrowRight, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from '../components/AuthModal';

export const PricingPage: React.FC = () => {
  const [annual, setAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('signup');
  const { token } = useAuth();
  const navigate = useNavigate();

  const handleCta = () => {
    if (token) {
      navigate('/dashboard');
    } else {
      setAuthTab('signup');
      setShowAuthModal(true);
    }
  };

  const tiers = [
    {
      name: 'Starter Vault',
      tagline: 'Essential real-time spending intelligence for individuals',
      priceMonthly: 0,
      priceAnnual: 0,
      badge: null,
      highlight: false,
      features: [
        'Real-time Safe-to-Spend daily limit',
        'Manual & CSV transaction imports',
        'Basic financial health score',
        'Up to 3 financial goals with priority',
        'Standard category auto-budgeting',
        'Community access',
      ],
      cta: 'Start Free Forever',
      btnClass: 'glass-pill-btn',
    },
    {
      name: 'Pro Intelligence',
      tagline: 'Deep predictive simulations & unlimited AI Money Coaching',
      priceMonthly: 499,
      priceAnnual: 374,
      badge: 'MOST POPULAR',
      highlight: true,
      features: [
        'Everything in Starter Vault',
        'Unlimited AI Money Coach chat & streaming',
        'Future Impact Purchase Simulator',
        'Subscription Leak Radar & recurring alerts',
        'Dynamic 50/30/20 auto-budget generation',
        'Unlimited prioritized financial goals',
        'Advanced wealth growth timeline projector',
        'Priority 24/7 AI response queue',
      ],
      cta: 'Claim Pro Intelligence',
      btnClass: 'amber-pill-btn',
    },
    {
      name: 'Squad Multiplayer',
      tagline: 'Collaborative expense sharing and group goal vaults',
      priceMonthly: 999,
      priceAnnual: 749,
      badge: 'TEAMS & FAMILIES',
      highlight: false,
      features: [
        'Everything in Pro Intelligence',
        'Up to 10 Squad members per group',
        'Real-time WebSocket shared transaction ledger',
        'Group goal vaults & split expense balancer',
        'Squad financial health leaderboard',
        'Role-based permissions & admin audit log',
        'Dedicated priority support',
      ],
      cta: 'Deploy Squad Mode',
      btnClass: 'dark-pill-btn',
    },
  ];

  const faqs = [
    {
      q: 'How does Finget calculate my "Safe-to-Spend" daily allowance?',
      a: 'Finget connects your verified recurring fixed obligations (rent, EMIs, utilities), monthly savings targets, and current ledger balance. It then divides your true disposable balance across the remaining days of the billing cycle, shielding your savings from impulse buys.',
    },
    {
      q: 'Can I switch between monthly and annual plans at any time?',
      a: 'Yes, you can upgrade, downgrade, or cancel your subscription anytime with prorated billing directly from your account settings.',
    },
    {
      q: 'What makes the Future Impact Simulator different from ordinary budgeting?',
      a: 'Ordinary apps only look backwards at what you already spent. Finget’s Future Impact Simulator lets you test any purchase amount BEFORE spending, showing you exactly how many days it delays your milestone goals.',
    },
    {
      q: 'Is my financial data secure?',
      a: 'Yes. All data is encrypted end-to-end with AES-256 and TLS 1.3. We never sell your personal data to advertisers or third parties.',
    },
    {
      q: 'How does Friends / Squad mode work?',
      a: 'You can create a shared group with friends, roommates, or partners. Group transactions sync live using WebSockets, and group goals update in real-time as members contribute.',
    },
  ];

  return (
  return (
    <div className="min-h-screen text-white selection:bg-amber-500/30 selection:text-amber-200 relative overflow-hidden font-sans">
      {/* Constant Fixed Luxury Glass Background */}
      <div className="fixed-luxury-bg" />
      <div className="ambient-light-overlay" />

      {/* Floating Navigation */}
      <header className="fixed top-4 inset-x-0 z-50 max-w-6xl mx-auto px-4">
        <div className="bg-slate-950/70 border border-white/15 rounded-full px-6 py-3.5 flex items-center justify-between shadow-[0_8px_30px_rgb(0,0,0,0.6)] backdrop-blur-2xl transition-all">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 group text-left"
          >
            <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-amber-400 via-rose-400 to-cyan-400 p-0.5 shadow-md shadow-orange-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-white">
              FINGET
            </span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="text-xs font-semibold text-slate-300 hover:text-white transition-colors px-3 py-1.5"
            >
              ← Home
            </button>
            <button
              onClick={handleCta}
              className="amber-pill-btn px-5 py-2 text-xs uppercase tracking-wider font-bold flex items-center gap-1.5"
            >
              <span>{token ? 'Console' : 'Launch Console'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Header */}
      <section className="relative z-10 pt-36 pb-16 text-center max-w-4xl mx-auto px-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-6 shadow-sm backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>TRANSPARENT TIER ARCHITECTURE</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black font-display text-white tracking-tight mb-6 leading-tight">
          Invest in Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-rose-300 to-cyan-300">Financial Future</span>
        </h1>

        <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed mb-10 font-normal">
          Pick the intelligence tier that fits your capital strategy. Save up to 25% with annual billing.
        </p>

        {/* Monthly / Annual Switcher */}
        <div className="inline-flex items-center gap-2 p-1.5 rounded-full bg-slate-900/70 border border-white/15 backdrop-blur-xl shadow-sm">
          <button
            onClick={() => setAnnual(false)}
            className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
              !annual
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-5 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
              annual
                ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-sm font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Annual (25% OFF)</span>
            <span className="px-2 py-0.5 text-[9px] bg-white/30 text-white rounded-full font-bold uppercase">
              2 mo free
            </span>
          </button>
        </div>
      </section>

      {/* Pricing Cards Matrix */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {tiers.map((tier, i) => {
            const price = annual ? tier.priceAnnual : tier.priceMonthly;
            return (
              <div
                key={i}
                className={`relative rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 ${
                  tier.highlight
                    ? 'glass-card-frosted-heavy border-amber-500/50 shadow-[0_16px_50px_rgba(245,158,11,0.2)] lg:-translate-y-3'
                    : 'glass-card-frosted border border-white/15'
                }`}
              >
                {/* Popular Badge */}
                {tier.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold text-[10px] tracking-widest shadow-md">
                    {tier.badge}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold font-display text-white">{tier.name}</h3>
                    {tier.highlight ? (
                      <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <Sparkles className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="p-2 rounded-2xl bg-slate-800/80 text-slate-300 border border-white/10">
                        <Shield className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed mb-6 min-h-[36px]">
                    {tier.tagline}
                  </p>

                  {/* Price */}
                  <div className="mb-8 pb-6 border-b border-white/10">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl sm:text-5xl font-black text-white">
                        ₹{price.toLocaleString()}
                      </span>
                      <span className="text-slate-400 text-xs font-semibold">/ month</span>
                    </div>
                    {annual && tier.priceMonthly > 0 && (
                      <p className="text-[11px] font-semibold text-emerald-400 mt-1">
                        Billed annually (₹{(tier.priceAnnual * 12).toLocaleString()}/year)
                      </p>
                    )}
                    {tier.priceMonthly === 0 && (
                      <p className="text-[11px] font-medium text-slate-400 mt-1">
                        Zero commitment, no card required
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <div className="space-y-3.5 mb-8">
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                      Included Capabilities:
                    </p>
                    {tier.features.map((feat, fi) => (
                      <div key={fi} className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 p-0.5 rounded-full shrink-0 ${
                            tier.highlight
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs text-slate-200 leading-relaxed font-medium">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleCta}
                  className={`w-full py-3.5 text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2 ${tier.btnClass}`}
                >
                  <span>{tier.cta}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Detailed Feature Comparison Matrix */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-black font-display text-white mb-3">
            Feature Comparison Matrix
          </h2>
          <p className="text-slate-300 text-sm font-medium">
            Everything you need to know about what's packed into each plan.
          </p>
        </div>

        <div className="glass-card-frosted-heavy rounded-3xl p-6 sm:p-8 overflow-x-auto shadow-sm border border-white/15">
          <table className="w-full text-left text-xs text-slate-200">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider font-bold">
                <th className="py-4 px-4 font-bold">Capabilities</th>
                <th className="py-4 px-4 font-bold text-center">Starter</th>
                <th className="py-4 px-4 font-bold text-center text-amber-400">Pro</th>
                <th className="py-4 px-4 font-bold text-center text-white">Squad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 font-sans">
              <tr>
                <td className="py-4 px-4 font-semibold text-white">Safe-to-Spend Daily Engine</td>
                <td className="py-4 px-4 text-center text-emerald-400 font-bold">✓</td>
                <td className="py-4 px-4 text-center text-amber-400 font-bold">✓ (Realtime)</td>
                <td className="py-4 px-4 text-center text-white font-bold">✓ (Group Scoped)</td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-white">Pre-Purchase Impact Simulator</td>
                <td className="py-4 px-4 text-center text-slate-400">3 per day</td>
                <td className="py-4 px-4 text-center text-amber-400 font-bold">Unlimited</td>
                <td className="py-4 px-4 text-center text-white font-bold">Unlimited</td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-white">AI Money Coach Streaming</td>
                <td className="py-4 px-4 text-center text-slate-500">—</td>
                <td className="py-4 px-4 text-center text-amber-400 font-bold">Unlimited Fast Queue</td>
                <td className="py-4 px-4 text-center text-white font-bold">Multi-member Access</td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-white">Subscription Leak Radar</td>
                <td className="py-4 px-4 text-center text-slate-500">—</td>
                <td className="py-4 px-4 text-center text-amber-400 font-bold">Active</td>
                <td className="py-4 px-4 text-center text-white font-bold">Active</td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-white">Collaborative Squad Ledger</td>
                <td className="py-4 px-4 text-center text-slate-500">—</td>
                <td className="py-4 px-4 text-center text-slate-500">—</td>
                <td className="py-4 px-4 text-center text-white font-bold">Up to 10 Seats</td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-white">Goal Prioritization & Drag Reorder</td>
                <td className="py-4 px-4 text-center text-slate-300 font-semibold">3 Goals</td>
                <td className="py-4 px-4 text-center text-amber-400 font-bold">Unlimited</td>
                <td className="py-4 px-4 text-center text-white font-bold">Shared Vaults</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-28">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-4 backdrop-blur-md">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>KNOWLEDGE BASE</span>
          </div>
          <h2 className="text-3xl font-black font-display text-white">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="glass-card-frosted rounded-2xl overflow-hidden transition-all shadow-xs border border-white/15"
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full p-5 text-left flex items-center justify-between gap-4 hover:bg-white/5 transition-colors"
              >
                <span className="font-display font-bold text-white text-sm sm:text-base">
                  {faq.q}
                </span>
                {openFaq === idx ? (
                  <ChevronUp className="w-5 h-5 text-amber-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                )}
              </button>
              {openFaq === idx && (
                <div className="px-5 pb-5 text-slate-300 text-xs sm:text-sm leading-relaxed border-t border-white/10 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-20">
        <div className="glass-card-frosted-heavy rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden border border-white/20 shadow-2xl">
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-black font-display text-white mb-4">
              Ready to take complete control of your capital?
            </h2>
            <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto mb-8 font-normal">
              Join thousands who rely on Finget to make confident financial decisions every day.
            </p>
            <button
              onClick={handleCta}
              className="amber-pill-btn px-8 py-4 text-sm uppercase tracking-wider font-bold inline-flex items-center gap-2 shadow-lg"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>Launch Your Financial Shield</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-slate-950/70 py-8 px-6 text-center text-xs text-slate-400 font-medium backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 FINGET AI TECHNOLOGIES. ALL RIGHTS RESERVED.</p>
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>ALL SYSTEMS OPERATIONAL</span>
          </div>
        </div>
      </footer>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          defaultTab={authTab}
        />
      )}
    </div>
  );
};

