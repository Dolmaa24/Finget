import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  X,
  LayoutDashboard,
  Target,
  Lightbulb,
  MessageSquare,
  Users,
  Settings,
  LogOut,
  History,
  Sparkles,
  Tag,
  ShieldCheck,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const BurgerSidebar: React.FC<Props> = ({ isOpen, onClose }) => {
  const { logout, user } = useAuth();
  const location = useLocation();

  const links = [
    { name: 'Financial Dashboard', path: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { name: 'Goals & Milestones', path: '/goals', icon: <Target className="w-4 h-4" /> },
    { name: 'Future Wealth Projections', path: '/future-impact', icon: <Sparkles className="w-4 h-4" /> },
    { name: 'AI Money Coach', path: '/coach', icon: <MessageSquare className="w-4 h-4" /> },
    { name: 'Transactions & Ledger', path: '/transactions', icon: <History className="w-4 h-4" /> },
    { name: 'Financial Telemetry', path: '/insights', icon: <Lightbulb className="w-4 h-4" /> },
    { name: 'Squad Multi-Ledger', path: '/friends', icon: <Users className="w-4 h-4" /> },
    { name: 'Pricing & Tiers', path: '/pricing', icon: <Tag className="w-4 h-4" /> },
    { name: 'Settings & Model', path: '/settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-slate-950/90 border-r border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-50 transform transition-transform duration-300 ease-out flex flex-col justify-between backdrop-blur-3xl text-slate-100 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-5 mb-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 p-0.5 shadow-md shadow-amber-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </div>
              </div>
              <div>
                <h2 className="font-display text-lg font-bold tracking-tight text-white">
                  FINGET
                </h2>
                <p className="text-[10px] uppercase font-semibold tracking-wider text-amber-400">Autonomous OS</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Profile Card */}
          {user && (
            <div className="mb-6 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-purple-600/10 border border-white/15 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-white truncate">{user.name}</p>
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                </div>
                <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          )}

          {/* Nav List */}
          <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
            {links.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-purple-500/20 text-white border border-amber-400/40 shadow-sm font-bold'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white border border-transparent'
                  }`}
                >
                  <span className={isActive ? 'text-amber-400' : 'text-slate-400'}>{link.icon}</span>
                  <span>{link.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Sign Out */}
        <div className="p-6 border-t border-white/10 bg-slate-950/60">
          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-xs font-bold text-slate-300 bg-white/10 hover:bg-rose-500/20 hover:text-rose-300 border border-white/15 hover:border-rose-500/40 transition-all shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out Session</span>
          </button>
        </div>
      </aside>
    </>
  );
};

