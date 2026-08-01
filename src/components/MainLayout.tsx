import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { BurgerSidebar } from './BurgerSidebar';
import { ScopeToggle } from './ScopeToggle';
import { Menu, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const MainLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen text-slate-100 flex flex-col relative overflow-x-hidden font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Constant Fixed Luxury Glass Background */}
      <div className="fixed-luxury-bg" />
      <div className="ambient-light-overlay" />

      {/* Top Refined Glass Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/65 backdrop-blur-2xl px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.5)] transition-all">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-white/15 hover:border-amber-400 text-slate-300 hover:text-white shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
            aria-label="Open Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 p-0.5 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-all">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-white">
              FINGET
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Autonomous Intelligence Active</span>
          </div>
        </div>

        {/* Right Header: Scope Toggle & User Badge */}
        <div className="flex items-center gap-3">
          <ScopeToggle />

          {user && (
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-white/15">
              <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center text-xs font-bold shadow-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left leading-tight hidden md:block">
                <p className="text-xs font-semibold text-white truncate max-w-[120px]">{user.name}</p>
                <p className="text-[10px] text-amber-400 font-medium">Verified Vault</p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Navigation Sidebar Drawer */}
      <BurgerSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Workspace */}
      <main className="flex-1 relative z-10 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};

