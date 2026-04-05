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
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const BurgerSidebar: React.FC<Props> = ({ isOpen, onClose }) => {
  const { logout } = useAuth();
  const location = useLocation();

  const links = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { name: 'Goals', path: '/goals', icon: <Target className="w-5 h-5" /> },
    { name: 'Future Impact', path: '/future-impact', icon: <Sparkles className="w-5 h-5" /> },
    { name: 'AI Coach', path: '/coach', icon: <MessageSquare className="w-5 h-5" /> },
    { name: 'Transactions', path: '/transactions', icon: <History className="w-5 h-5" /> },
    { name: 'Insights', path: '/insights', icon: <Lightbulb className="w-5 h-5" /> },
    { name: 'Friends mode', path: '/friends', icon: <Users className="w-5 h-5" /> },
    { name: 'Settings', path: '/settings', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-navy-950/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 left-0 h-full w-72 bg-navy-800 border-r border-slate-700/50 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black tracking-tighter text-white">FINGET</h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700 transition">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto">
            {links.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={onClose}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                  }`}
                >
                  {link.icon}
                  {link.name}
                </Link>
              );
            })}
          </nav>

          <div className="pt-6 border-t border-slate-700/50">
            <button
              onClick={() => {
                logout();
                onClose();
              }}
              className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-danger hover:bg-danger/10 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
