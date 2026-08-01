import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, ShieldCheck, Sparkles, TrendingUp, Cpu, 
  Users, Activity, Calculator, Bot, Flame, Check, ChevronRight
} from 'lucide-react';
import { AuthModal } from '../components/AuthModal';
import { useAuth } from '../context/AuthContext';

export const LandingPage: React.FC = () => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('signup');
  const [testSpend, setTestSpend] = useState(3500);
  const [annualPricing, setAnnualPricing] = useState(true);
  const { token, loginWithDemo } = useAuth();
  const navigate = useNavigate();

  const handleLaunch = () => {
    if (token) {
      navigate('/dashboard');
    } else {
      setAuthTab('signup');
      setShowAuthModal(true);
    }
  };

  const handleDemo = () => {
    loginWithDemo();
    navigate('/dashboard');
  };

  // Live simulation math for hero preview
  const monthlyIncome = 85000;
  const fixedExpenses = 36200;
  const currentRemaining = monthlyIncome - fixedExpenses; // 48800
  const remainingAfterTest = Math.max(0, currentRemaining - testSpend);
  const safeDailyRemaining = Math.round(remainingAfterTest / 22);
  const delayDays = testSpend > 5000 ? Math.round(testSpend / 800) : testSpend > 2000 ? 3 : 0;

  return (
    <div className="min-h-screen text-slate-100 selection:bg-amber-500/30 selection:text-amber-200 relative overflow-hidden font-sans">
      {/* Constant Fixed Luxury Glass Background */}
      <div className="fixed-luxury-bg" />
      <div className="ambient-light-overlay" />

      {/* Floating Minimalist Glass Header */}
      <header className="fixed top-4 inset-x-0 z-50 max-w-6xl mx-auto px-4">
        <div className="bg-slate-950/60 border border-white/15 rounded-full px-6 py-3.5 flex items-center justify-between shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-all">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 p-0.5 shadow-md shadow-amber-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-white">
              FINGET
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <a href="#features" className="hover:text-amber-400 transition-colors">Features</a>
            <a href="#simulation" className="hover:text-amber-400 transition-colors">Live Simulation</a>
            <a href="#how-it-works" className="hover:text-amber-400 transition-colors">How it Operates</a>
            <button onClick={() => navigate('/pricing')} className="hover:text-amber-400 transition-colors">Pricing</button>
          </nav>

          <div className="flex items-center gap-2.5">
            {token ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="dark-pill-btn px-5 py-2 text-xs uppercase tracking-wider font-bold flex items-center gap-1.5"
              >
                <span>Console</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setAuthTab('login');
                    setShowAuthModal(true);
                  }}
                  className="hidden sm:inline-block px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setAuthTab('signup');
                    setShowAuthModal(true);
                  }}
                  className="amber-pill-btn px-5 py-2 text-xs uppercase tracking-wider font-bold"
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-36 sm:pt-44 pb-20 px-6 max-w-6xl mx-auto text-center">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-8 shadow-sm backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm animate-pulse" />
          <span>AUTONOMOUS CAPITAL REASONING v2.4</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-7xl font-black font-display text-white tracking-tight leading-[1.1] mb-6">
          Master Every Rupee. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-rose-300 to-cyan-300">
            Predict Every Decision.
          </span>
        </h1>

        <p className="text-slate-300 text-base sm:text-xl max-w-3xl mx-auto leading-relaxed mb-10 font-normal">
          Finget is not just a ledger—it's your <strong className="text-white font-semibold">real-time AI Wealth Engine</strong>. 
          It calculates daily safe-to-spend limits, tests purchases before you swipe, and delivers proactive financial intelligence.
        </p>

        {/* Hero CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <button
            onClick={handleLaunch}
            className="w-full sm:w-auto amber-pill-btn px-8 py-4 text-sm uppercase tracking-wider font-bold flex items-center justify-center gap-3 shadow-xl"
          >
            <Sparkles className="w-4 h-4 text-amber-200" />
            <span>Launch Finget Console</span>
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          
          <button
            onClick={handleDemo}
            className="w-full sm:w-auto glass-pill-btn px-7 py-4 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Instant Demo Vault (Zero Login)</span>
          </button>
        </div>

        {/* Interactive Hero Preview Card */}
        <div id="simulation" className="relative max-w-4xl mx-auto">
          <div className="glass-card-frosted-heavy p-6 sm:p-8 text-left shadow-[0_24px_70px_rgba(0,0,0,0.8)] border border-white/20">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full bg-rose-400/80" />
                <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 ml-2">LIVE AFFORDABILITY SIMULATOR</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                <Activity className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>REAL-TIME ENGINE</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6">
              {/* Left Slider Control */}
              <div className="lg:col-span-7 space-y-5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                    Test Planned Expense (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl">₹</span>
                    <input
                      type="number"
                      min="0"
                      max="40000"
                      step="500"
                      value={testSpend}
                      onChange={(e) => setTestSpend(Number(e.target.value))}
                      className="w-full bg-slate-900/60 border border-white/15 focus:border-amber-400 rounded-2xl pl-10 pr-4 py-3 text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 transition-all shadow-inner backdrop-blur-md"
                    />
                  </div>
                </div>

                {/* Range Slider */}
                <div>
                  <input
                    type="range"
                    min="0"
                    max="30000"
                    step="500"
                    value={testSpend}
                    onChange={(e) => setTestSpend(Number(e.target.value))}
                    className="w-full accent-amber-500 h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400 mt-1">
                    <span>₹0 (Coffee)</span>
                    <span>₹15,000 (Gadget)</span>
                    <span>₹30,000 (Trip)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/10 shadow-sm backdrop-blur-md">
                    <p className="text-[11px] font-bold text-slate-400 uppercase">Monthly Disposable</p>
                    <p className="text-xl font-black text-white">₹{currentRemaining.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/10 shadow-sm backdrop-blur-md">
                    <p className="text-[11px] font-bold text-slate-400 uppercase">Days Left In Cycle</p>
                    <p className="text-xl font-black text-amber-400">22 Days</p>
                  </div>
                </div>
              </div>

              {/* Right Output HUD */}
              <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-3xl bg-gradient-to-br from-amber-500/15 via-rose-500/10 to-purple-600/15 border border-amber-500/30 shadow-lg backdrop-blur-md">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-1">
                    Calibrated Daily Allowance
                  </p>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-3xl sm:text-4xl font-black text-white">
                      ₹{safeDailyRemaining.toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">/ day</span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs p-2.5 rounded-2xl bg-slate-900/60 border border-white/10 shadow-xs backdrop-blur-md">
                      <span className="text-slate-300 font-semibold">Remaining Pool:</span>
                      <span className="font-bold text-white">₹{remainingAfterTest.toLocaleString()}</span>
                    </div>
                    {delayDays > 0 ? (
                      <div className="flex items-center gap-2 text-xs p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-200 font-medium">
                        <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Delays savings milestone by <strong>{delayDays} days</strong></span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 font-medium">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Zero impact on current savings target!</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleLaunch}
                  className="w-full mt-5 py-3.5 rounded-full dark-pill-btn text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2"
                >
                  <span>Lock In Budget Strategy</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Ribbon */}
      <section className="relative z-10 border-y border-white/10 bg-slate-950/50 py-8 px-6 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="glass-card p-4">
            <p className="text-3xl sm:text-4xl font-black text-white">₹4.8 Cr+</p>
            <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mt-1">Capital Shielded</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-3xl sm:text-4xl font-black text-emerald-400">99.4%</p>
            <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mt-1">Budget Accuracy</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-3xl sm:text-4xl font-black text-amber-400">&lt; 80ms</p>
            <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mt-1">AI Reasoning Latency</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-3xl sm:text-4xl font-black text-cyan-400">24/7</p>
            <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mt-1">Real-Time Safeguard</p>
          </div>
        </div>
      </section>

      {/* 6 Feature Grid Section */}
      <section id="features" className="relative z-10 py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-4">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span>INTELLIGENCE MATRIX</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black font-display text-white tracking-tight">
            Engineered for Total Financial Clarity
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="glass-card-frosted p-7 flex flex-col justify-between hover:translate-y-[-3px] transition-all duration-300 border-white/15">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-5 shadow-xs">
                <Calculator className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold font-display text-white mb-2">Safe-to-Spend Engine</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Dynamically computes your daily spending allowance factoring in fixed EMIs, rent, and monthly savings milestones.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-xs font-semibold text-amber-400">
              <span>● Dynamic Day-by-Day Recalculation</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="glass-card-frosted p-7 flex flex-col justify-between hover:translate-y-[-3px] transition-all duration-300 border-white/15">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mb-5 shadow-xs">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold font-display text-white mb-2">Future Impact Simulator</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Test impulsive buys before spending. Know instantly how much closer or further you are from your primary goal.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-xs font-semibold text-rose-400">
              <span>● Zero Guesswork Decisions</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="glass-card-frosted p-7 flex flex-col justify-between hover:translate-y-[-3px] transition-all duration-300 border-white/15">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mb-5 shadow-xs">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold font-display text-white mb-2">Streaming AI Coach</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Ask questions like "Can I afford ₹4,000 for dinner?" and get instant contextual analysis backed by your real balance.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <span>● Real-time Stream Engine</span>
            </div>
          </div>

          {/* Card 4 */}
          <div className="glass-card-frosted p-7 flex flex-col justify-between hover:translate-y-[-3px] transition-all duration-300 border-white/15">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center mb-5 shadow-xs">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold font-display text-white mb-2">Friends & Squad Mode</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Collaborative group mode with WebSockets for split spending, trips, roommates, and joint goal vaults.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-xs font-semibold text-cyan-400">
              <span>● Realtime WebSocket Sync</span>
            </div>
          </div>

          {/* Card 5 */}
          <div className="glass-card-frosted p-7 flex flex-col justify-between hover:translate-y-[-3px] transition-all duration-300 border-white/15">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mb-5 shadow-xs">
                <Flame className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold font-display text-white mb-2">Subscription Leak Radar</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Catches stealth recurring charges, sudden price creeps, and unutilized memberships before they drain your pool.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-xs font-semibold text-purple-400">
              <span>● Automatic Recurring Filter</span>
            </div>
          </div>

          {/* Card 6 */}
          <div className="glass-card-frosted p-7 flex flex-col justify-between hover:translate-y-[-3px] transition-all duration-300 border-white/15">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-5 shadow-xs">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold font-display text-white mb-2">Goal Milestone Prioritization</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Drag and drop your financial goals to automatically redistribute incoming funds to what matters most first.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-xs font-semibold text-amber-400">
              <span>● Drag & Re-order Logic</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it Operates Flow */}
      <section id="how-it-works" className="relative z-10 py-20 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-4">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span>OPERATIONAL ARCHITECTURE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black font-display text-white">How Finget Protects You</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          <div className="glass-card-frosted p-6 relative border-white/15">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold flex items-center justify-center mb-4 shadow-sm">
              01
            </div>
            <h3 className="text-lg font-bold font-display text-white mb-2">Sync Obligations</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Enter your income and fixed expenses once. The system locks down non-negotiable living costs.
            </p>
          </div>

          <div className="glass-card-frosted p-6 relative border-white/15">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-rose-500 to-purple-600 text-white font-bold flex items-center justify-center mb-4 shadow-sm">
              02
            </div>
            <h3 className="text-lg font-bold font-display text-white mb-2">Simulate & Calibrate</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Before buying anything expensive, test it in the Simulator. Finget dynamically shows the exact goal delay.
            </p>
          </div>

          <div className="glass-card-frosted p-6 relative border-white/15">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-bold flex items-center justify-center mb-4 shadow-sm">
              03
            </div>
            <h3 className="text-lg font-bold font-display text-white mb-2">Hit Every Milestone</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Achieve personal and group financial goals on schedule with automated AI coaching nudges.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section on Landing Page */}
      <section id="pricing" className="relative z-10 py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>TRANSPARENT PLANS</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black font-display text-white mb-6">
            Predictable Pricing for High Performers
          </h2>
          
          {/* Switcher */}
          <div className="inline-flex items-center gap-2 p-1.5 rounded-full bg-slate-900/80 border border-white/15 backdrop-blur-xl shadow-sm">
            <button
              onClick={() => setAnnualPricing(false)}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                !annualPricing
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnualPricing(true)}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
                annualPricing
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Annual (Save 25%)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Starter */}
          <div className="glass-card-frosted p-8 flex flex-col justify-between border-white/15">
            <div>
              <h3 className="text-xl font-bold font-display text-white mb-2">Starter Vault</h3>
              <p className="text-xs text-slate-400 mb-6">Daily spending calculation & basic budget</p>
              <div className="mb-6 pb-6 border-b border-white/10">
                <span className="text-4xl font-bold text-white">₹0</span>
                <span className="text-slate-400 text-xs font-medium"> / forever</span>
              </div>
              <ul className="space-y-3 text-xs text-slate-300 mb-8">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Real-time Safe Daily limit
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Manual & CSV transaction sync
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> 3 Goals with drag priority
                </li>
              </ul>
            </div>
            <button
              onClick={handleLaunch}
              className="w-full py-3 glass-pill-btn text-xs uppercase tracking-wider font-bold"
            >
              Start Free
            </button>
          </div>

          {/* Pro */}
          <div className="glass-card-frosted-heavy p-8 flex flex-col justify-between border-amber-500/50 shadow-2xl relative lg:-translate-y-3">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white font-bold text-[10px] tracking-widest shadow-md">
              MOST POPULAR
            </div>
            <div>
              <h3 className="text-xl font-bold font-display text-white mb-2">Pro Intelligence</h3>
              <p className="text-xs text-slate-300 mb-6">Unlimited AI Money Coach & Simulations</p>
              <div className="mb-6 pb-6 border-b border-white/10">
                <span className="text-4xl font-bold text-white">
                  ₹{annualPricing ? 374 : 499}
                </span>
                <span className="text-slate-400 text-xs font-medium"> / month</span>
              </div>
              <ul className="space-y-3 text-xs text-slate-200 mb-8">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-400" /> Unlimited AI Coach Chat & Stream
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-400" /> Future Impact Purchase Simulator
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-400" /> Subscription Leak Radar
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-400" /> Unlimited Goal Milestones
                </li>
              </ul>
            </div>
            <button
              onClick={handleLaunch}
              className="w-full py-3.5 amber-pill-btn text-xs uppercase tracking-wider font-bold shadow-lg"
            >
              Get Pro Intelligence
            </button>
          </div>

          {/* Squad */}
          <div className="glass-card-frosted p-8 flex flex-col justify-between border-white/15">
            <div>
              <h3 className="text-xl font-bold font-display text-white mb-2">Squad Multiplayer</h3>
              <p className="text-xs text-slate-400 mb-6">Shared expense vaults & group live sync</p>
              <div className="mb-6 pb-6 border-b border-white/10">
                <span className="text-4xl font-bold text-white">
                  ₹{annualPricing ? 749 : 999}
                </span>
                <span className="text-slate-400 text-xs font-medium"> / month</span>
              </div>
              <ul className="space-y-3 text-xs text-slate-300 mb-8">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-cyan-400" /> Everything in Pro Intelligence
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-cyan-400" /> Up to 10 Squad seats
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-cyan-400" /> Realtime WebSocket shared ledger
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-cyan-400" /> Shared Group Goal Vaults
                </li>
              </ul>
            </div>
            <button
              onClick={handleLaunch}
              className="w-full py-3 dark-pill-btn text-xs uppercase tracking-wider font-bold"
            >
              Deploy Squad Mode
            </button>
          </div>
        </div>

        <div className="text-center mt-10">
          <button
            onClick={() => navigate('/pricing')}
            className="text-xs font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300 inline-flex items-center gap-1.5 transition-colors"
          >
            <span>View Full Feature Comparison Table & FAQ</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* Luxury Minimal Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-slate-950/70 py-10 px-6 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-400 font-medium">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 p-0.5 shadow-sm">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </div>
            </div>
            <span className="font-display text-sm font-bold text-white tracking-wider">
              FINGET
            </span>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/pricing')} className="hover:text-white transition-colors">
              Pricing
            </button>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#simulation" className="hover:text-white transition-colors">Live Demo</a>
          </div>

          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>ALL SYSTEMS VERIFIED & OPERATIONAL</span>
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
