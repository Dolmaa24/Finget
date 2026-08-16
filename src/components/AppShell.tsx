import { cn } from '../lib/cn';
import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Target,
  Sparkles,
  MessageSquare,
  Receipt,
  Lightbulb,
  PiggyBank,
  Users,
  Settings,
  LogOut,
  Plus,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/authStore';
import { useScope } from '../context/scopeStore';
import { BrandMark, Wordmark } from './Brand';
import { ModeSwitch } from './ModeSwitch';
import { Avatar } from './ui';
import { AddTransactionModal } from './AddTransactionModal';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** 'both' | 'user' | 'group' — which modes this destination belongs to. */
  modes: 'both' | 'user' | 'group';
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-[19px] h-[19px]" />, modes: 'both' },
  { to: '/transactions', label: 'Activity', icon: <Receipt className="w-[19px] h-[19px]" />, modes: 'both' },
  { to: '/goals', label: 'Goals', icon: <Target className="w-[19px] h-[19px]" />, modes: 'both' },
  { to: '/split', label: 'Split & settle', icon: <Users className="w-[19px] h-[19px]" />, modes: 'group' },
  { to: '/future-impact', label: 'What-if', icon: <Sparkles className="w-[19px] h-[19px]" />, modes: 'both' },
  { to: '/ledger', label: 'Kept', icon: <PiggyBank className="w-[19px] h-[19px]" />, modes: 'both' },
  { to: '/insights', label: 'Insights', icon: <Lightbulb className="w-[19px] h-[19px]" />, modes: 'both' },
  { to: '/coach', label: 'AI Coach', icon: <MessageSquare className="w-[19px] h-[19px]" />, modes: 'both' },
  { to: '/friends', label: 'Groups', icon: <Users className="w-[19px] h-[19px]" />, modes: 'user' },
  { to: '/settings', label: 'Settings', icon: <Settings className="w-[19px] h-[19px]" />, modes: 'both' },
];

const RailLink: React.FC<{ item: NavItem; onNavigate?: () => void; expanded?: boolean }> = ({
  item,
  onNavigate,
  expanded,
}) => (
  <NavLink
    to={item.to}
    onClick={onNavigate}
    title={item.label}
    className={({ isActive }) =>
      cn(
        'group relative flex items-center rounded-md transition-all duration-250 ease-spatial',
        expanded ? 'gap-3 px-3.5 h-12 w-full' : 'justify-center w-12 h-12',
        isActive
          ? 'bg-white/80 text-accent shadow-soft'
          : 'text-ink-3 hover:text-ink hover:bg-white/45'
      )
    }
  >
    {item.icon}
    {expanded && <span className="text-sm font-medium">{item.label}</span>}
    {!expanded && (
      <span
        className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-sm px-2.5 py-1.5 text-[12px] font-medium
                   glass-strong text-ink opacity-0 -translate-x-1 transition-all duration-200
                   group-hover:opacity-100 group-hover:translate-x-0 z-50"
      >
        {item.label}
      </span>
    )}
  </NavLink>
);

export const AppShell: React.FC = () => {
  const { user, logout } = useAuth();
  const { context, group, isFriends } = useScope();
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const items = NAV.filter((n) => n.modes === 'both' || n.modes === context);

  return (
    <div className="min-h-screen">
      <div className="app-ground" />
      <div className="app-orbs" aria-hidden>
        <span className="app-orb app-orb--1" />
        <span className="app-orb app-orb--2" />
        <span className="app-orb app-orb--3" />
        <span className="app-orb app-orb--4" />
      </div>

      {/* ---------- Floating vertical rail (desktop) ---------- */}
      <nav
        aria-label="Main"
        className="hidden lg:flex fixed left-5 top-1/2 -translate-y-1/2 z-40 flex-col items-center gap-1.5
                   glass-strong glass-sheen rounded-xl p-2.5"
      >
        <div className="pb-2 mb-1 border-b border-white/50">
          <BrandMark size={38} />
        </div>
        {items.map((item) => (
          <RailLink key={item.to} item={item} />
        ))}
        <div className="pt-2 mt-1 border-t border-white/50">
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className="flex items-center justify-center w-12 h-12 rounded-md text-ink-3 hover:text-risk hover:bg-white/45 transition-all duration-250"
          >
            <LogOut className="w-[19px] h-[19px]" />
          </button>
        </div>
      </nav>

      {/* ---------- Top bar ---------- */}
      <header className="sticky top-0 z-30 px-4 sm:px-6 pt-4 pb-2">
        <div className="max-w-shell mx-auto lg:pl-[92px]">
          <div className="glass-strong glass-sheen rounded-pill h-16 px-3 sm:px-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNav(true)}
              aria-label="Open menu"
              className="lg:hidden p-2.5 rounded-pill text-ink-2 hover:bg-white/50 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="lg:hidden">
              <BrandMark size={32} />
            </div>
            <div className="hidden lg:block">
              <Wordmark />
            </div>

            {/* Scope indicator */}
            <div className="hidden sm:flex items-center gap-2 ml-2 pl-3 border-l border-white/60 min-w-0">
              <span className="text-base leading-none">{isFriends ? group?.emoji || '👥' : '🙂'}</span>
              <span className="text-sm font-medium text-ink-2 truncate">
                {isFriends ? group?.name || 'Friends mode' : 'Personal'}
              </span>
            </div>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill bg-[var(--accent)] text-white
                         text-[13px] font-semibold shadow-soft hover:bg-[var(--accent-soft)]
                         transition-all duration-200 active:scale-[0.97]"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Add</span>
            </button>

            <ModeSwitch compact />

            <NavLink to="/settings" className="shrink-0" title={user?.name}>
              <Avatar name={user?.name} size={38} />
            </NavLink>
          </div>
        </div>
      </header>

      {/* ---------- Mobile drawer ---------- */}
      {mobileNav && (
        <div className="lg:hidden fixed inset-0 z-[90] animate-fade">
          <div
            className="absolute inset-0 bg-[rgb(60_48_38/0.3)] backdrop-blur-md"
            onClick={() => setMobileNav(false)}
          />
          <nav
            aria-label="Main"
            className="absolute left-3 top-3 bottom-3 w-72 glass-modal glass-sheen rounded-xl p-4 flex flex-col animate-pop"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <BrandMark size={34} />
                <Wordmark />
              </div>
              <button
                type="button"
                onClick={() => setMobileNav(false)}
                aria-label="Close menu"
                className="p-2 rounded-pill text-ink-3 hover:bg-white/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto scroll-slim">
              {items.map((item) => (
                <RailLink
                  key={item.to}
                  item={item}
                  expanded
                  onNavigate={() => setMobileNav(false)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-3 px-3.5 h-12 rounded-md text-risk hover:bg-white/45 transition-colors mt-2 border-t border-white/50"
            >
              <LogOut className="w-[19px] h-[19px]" />
              <span className="text-sm font-medium">Sign out</span>
            </button>
          </nav>
        </div>
      )}

      {/* ---------- Content ---------- */}
      <main className="px-4 sm:px-6 pb-24 lg:pb-12">
        <div key={location.pathname} className="max-w-shell mx-auto lg:pl-[92px] pt-4 animate-rise">
          <Outlet />
        </div>
      </main>

      <AddTransactionModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
};
