import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { BurgerSidebar } from './BurgerSidebar';
import { ScopeToggle } from './ScopeToggle';
import { Menu } from 'lucide-react';

export const MainLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-navy-900 text-white flex relative">
      {/* Floating Burger Menu Button (Mobile & Desktop) */}
      <button 
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-40 p-3 bg-navy-800/80 backdrop-blur-md rounded-full border border-slate-700/50 shadow-xl hover:bg-slate-800 transition-colors"
      >
        <Menu className="w-6 h-6 text-slate-300" />
      </button>

      {/* Global Scope Toggle */}
      <ScopeToggle />

      {/* Sidebar Component */}
      <BurgerSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 ml-0 lg:ml-16 transition-all duration-300">
        <Outlet />
      </main>
    </div>
  );
};
