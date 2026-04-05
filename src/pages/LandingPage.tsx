import React, { useState, useEffect } from 'react';
import { ShieldCheck, Target, BotMessageSquare, CheckCircle2, Mail, MapPin, Users, Activity } from 'lucide-react';
import { AffordabilityCard } from '../components/AffordabilityCard';
import type { AffordabilityResult } from '../hooks/useFingetBackend';
import { AuthModal } from '../components/AuthModal';

const MOCK_DEMO_DATA: AffordabilityResult = {
  safeToSpendToday: 2150,
  remainingBudget: 43000,
  riskLevel: 'Safe',
  totalObligations: 70000,
  safeDaily: 2150,
  targetDailySavings: 1000,
};

interface Props {
  onEnter?: () => void;
  demoData?: AffordabilityResult;
}

export const LandingPage: React.FC<Props> = ({ demoData }) => {
  const [scrolled, setScrolled] = useState(false);
  const [showAuth, setShowAuth] = useState<'login' | 'signup' | null>(null);
  
  const displayData = demoData || MOCK_DEMO_DATA;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center pt-24 pb-0 relative overflow-x-hidden bg-navy-900">
      
      {/* Glassmorphism Navbar */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-navy-900/80 backdrop-blur-lg border-b border-slate-700/50 shadow-lg py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
             <div className="h-8 w-auto">
                <img src="/logo.png" alt="Finget Logo" className="h-full w-auto object-contain" />
             </div>
             <span className="text-xl font-bold tracking-widest text-[#00E5FF]">FINGΞT</span>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">How it Works</a>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button onClick={() => setShowAuth('signup')} className="px-5 py-2.5 bg-primary hover:bg-emerald-400 text-white text-sm font-semibold rounded-xl transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(16,185,129,0.4)]">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center z-10">
        {/* Left Side: Hero */}
        <div className="space-y-10 mt-16 sm:mt-24">
          
          <div className="flex items-center gap-5 mb-16">
            {/* Logo Text */}
            <h1 className="text-5xl sm:text-[64px] font-black text-[#00E5FF] tracking-[0.1em] leading-none">
              F I N G Ξ T
            </h1>
            {/* Logo Image */}
            <div className="relative h-12 sm:h-[64px] w-auto flex-shrink-0">
               <img src="/logo.png" alt="Finget Logo" className="h-full w-auto object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
            </div>
          </div>
          
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium text-slate-100 leading-[1.3] tracking-wide font-mono max-w-2xl">
            Jitni aukaat ho utna he kharcha kro!<br />
            <span className="text-slate-300">F I N G Ξ T kro!</span>
          </h2>
          
          <div className="flex flex-col sm:flex-row gap-4 pt-8">
            <button 
              onClick={() => setShowAuth('signup')}
              className="px-8 py-4 bg-navy-900 text-white font-medium text-lg rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] border border-[#00E5FF]/30 hover:border-[#00E5FF]/60 hover:bg-navy-800 shadow-[0_0_20px_rgba(0,229,255,0.15)]"
            >
              Create a free account
            </button>
          </div>
        </div>

        {/* Right Side: Visual */}
        <div className="relative w-full max-w-md mx-auto aspect-square flex items-center justify-center perspective-[1000px]">
          <div className="w-full transform rotate-y-[-5deg] rotate-x-[5deg] hover:rotate-y-0 hover:rotate-x-0 transition-transform duration-700 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(16,185,129,0.2)] rounded-3xl group">
             <AffordabilityCard data={displayData} />
             {/* Decorative Note */}
             <div className="absolute -bottom-6 -right-6 bg-navy-800 border border-warning/30 backdrop-blur-md p-4 rounded-2xl shadow-xl flex items-start gap-3 transition-transform animate-bounce group-hover:scale-105 group-hover:border-warning/50 z-20">
               <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-warning text-sm font-bold">₹</span>
               </div>
               <div>
                  <p className="text-sm font-medium text-slate-200">Simulated Purchase</p>
                  <p className="text-xs text-warning font-semibold">Savings delayed by 3 days</p>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section id="features" className="w-full max-w-6xl mt-32 grid grid-cols-1 md:grid-cols-3 gap-6 z-10 pt-10">
        <div className="group bg-navy-800/40 border border-slate-700/50 hover:bg-navy-800/80 hover:border-primary/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.1)] p-8 rounded-3xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-2">
          <ShieldCheck className="w-8 h-8 text-primary mb-6 group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-semibold text-slate-100 mb-3">Affordability Engine</h3>
          <p className="text-slate-400 leading-relaxed text-sm">Calculates your real-time safe spending threshold based on fixed expenses and your strict savings goals.</p>
        </div>
        <div className="group bg-navy-800/40 border border-slate-700/50 hover:bg-navy-800/80 hover:border-blue-500/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] p-8 rounded-3xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-2">
          <Target className="w-8 h-8 text-blue-400 mb-6 group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-semibold text-slate-100 mb-3">Future Impact</h3>
          <p className="text-slate-400 leading-relaxed text-sm">Simulate purchases before you make them. See exactly how an impulse buy delays your long-term goals.</p>
        </div>
        <div className="group bg-navy-800/40 border border-slate-700/50 hover:bg-navy-800/80 hover:border-purple-500/50 hover:shadow-[0_0_30px_rgba(168,85,247,0.1)] p-8 rounded-3xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-2">
          <BotMessageSquare className="w-8 h-8 text-purple-400 mb-6 group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-semibold text-slate-100 mb-3">AI Money Coach</h3>
          <p className="text-slate-400 leading-relaxed text-sm">A practical assistant that understands your financial context and helps you make better decisions.</p>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="w-full max-w-6xl mt-32 z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-100 tracking-tight">How it Works</h2>
          <p className="text-slate-400 mt-4 text-lg">Three simple steps to financial clarity.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting Line (Desktop) */}
          <div className="hidden md:block absolute top-[28px] left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-transparent via-slate-700 to-transparent z-0" />
          
          <div className="relative z-10 flex flex-col items-center text-center group">
            <div className="w-14 h-14 rounded-full bg-navy-800 border-2 border-slate-700 flex items-center justify-center mb-6 group-hover:border-primary group-hover:bg-primary/10 transition-colors duration-300">
               <Activity className="w-6 h-6 text-slate-300 group-hover:text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-slate-100 mb-2">1. Add Income & Goals</h3>
            <p className="text-slate-400 text-sm">Input your monthly earnings and set your strict savings targets.</p>
          </div>
          
          <div className="relative z-10 flex flex-col items-center text-center group">
            <div className="w-14 h-14 rounded-full bg-navy-800 border-2 border-slate-700 flex items-center justify-center mb-6 group-hover:border-primary group-hover:bg-primary/10 transition-colors duration-300">
               <CheckCircle2 className="w-6 h-6 text-slate-300 group-hover:text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-slate-100 mb-2">2. See Safe To Spend</h3>
            <p className="text-slate-400 text-sm">Get your exact daily allowance that protects your future goals.</p>
          </div>
          
          <div className="relative z-10 flex flex-col items-center text-center group">
            <div className="w-14 h-14 rounded-full bg-navy-800 border-2 border-slate-700 flex items-center justify-center mb-6 group-hover:border-primary group-hover:bg-primary/10 transition-colors duration-300">
               <BotMessageSquare className="w-6 h-6 text-slate-300 group-hover:text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-slate-100 mb-2">3. Make Smart Decisions</h3>
            <p className="text-slate-400 text-sm">Use the simulator or AI coach before any big impulse purchase.</p>
          </div>
        </div>
      </section>

      {/* Trust / Social Proof Strip */}
      <section className="w-full mt-32 py-10 border-y border-slate-800 bg-navy-900/50 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 text-center">
          <div>
            <p className="text-2xl font-bold text-slate-200">10,000+</p>
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mt-1">Users</p>
          </div>
          <div className="hidden md:block w-px h-12 bg-slate-800" />
          <div>
            <p className="text-2xl font-bold text-slate-200">₹5Cr+</p>
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mt-1">Managed</p>
          </div>
          <div className="hidden md:block w-px h-12 bg-slate-800" />
          <div>
            <p className="text-xl font-medium text-slate-300 max-w-[200px] leading-tight mx-auto">
              Built for real-life decisions
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800 mt-16 pb-24 md:pb-8 pt-16 z-10 bg-[#0F172A]">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          {/* Col 1 */}
          <div>
             <div className="flex items-center gap-2 mb-6">
               <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
               <h4 className="text-lg font-bold tracking-widest text-[#00E5FF]">FINGΞT</h4>
             </div>
             <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
               The decision-first financial system designed to eliminate anxiety around spending.
             </p>
          </div>
          
          {/* Col 2 */}
          <div className="space-y-4">
             <div className="flex items-start gap-3">
               <Users className="w-5 h-5 text-slate-500 mt-0.5" />
               <div>
                 <h5 className="text-sm font-semibold text-slate-200">Team</h5>
                 <p className="text-xs text-slate-400 mt-1">Built by developers focused on smarter finance</p>
               </div>
             </div>
             <div className="flex items-start gap-3">
               <MapPin className="w-5 h-5 text-slate-500 mt-0.5" />
               <div>
                 <h5 className="text-sm font-semibold text-slate-200">Location</h5>
                 <p className="text-xs text-slate-400 mt-1">India 🌏</p>
               </div>
             </div>
          </div>
          
          {/* Col 3 */}
          <div>
             <div className="flex items-start gap-3 mb-4">
               <Mail className="w-5 h-5 text-slate-500 mt-0.5" />
               <div>
                 <h5 className="text-sm font-semibold text-slate-200">Support</h5>
                 <a href="mailto:support@finget.com" className="text-xs text-primary hover:text-primary-hover transition-colors mt-1 block">support@finget.com</a>
               </div>
             </div>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto px-6 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
           <p>© 2026 Finget. All rights reserved.</p>
        </div>
      </footer>

      {/* Mobile Sticky CTA */}
      <div className="md:hidden fixed bottom-4 left-4 right-4 z-50 animate-slide-up">
         <button onClick={() => setShowAuth('signup')} className="w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-[0_10px_30px_rgba(16,185,129,0.3)] border border-emerald-400/50 flex items-center justify-center gap-2 active:scale-95 transition-transform">
            Check My Budget
         </button>
      </div>

      {showAuth && (
        <AuthModal 
          defaultTab={showAuth} 
          onClose={() => setShowAuth(null)} 
        />
      )}
    </div>
  );
};
