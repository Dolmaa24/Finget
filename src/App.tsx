import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { PricingPage } from './pages/PricingPage';
import { Dashboard } from './pages/Dashboard';
import { GoalsPage } from './pages/GoalsPage';
import { InsightsPage } from './pages/InsightsPage';
import { AiCoachPage } from './pages/AiCoachPage';
import { FriendsModePage } from './pages/FriendsModePage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { FutureImpactPage } from './pages/FutureImpactPage';
import { MainLayout } from './components/MainLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ScopeProvider } from './context/ScopeContext';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/" />;
  return <>{children}</>;
}

function AppContent() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Public Routes - Landing page is always directly accessible at / */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />

        {/* Protected Routes wrapped in MainLayout */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/coach" element={<AiCoachPage />} />
          <Route path="/friends" element={<FriendsModePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/future-impact" element={<FutureImpactPage />} />
        </Route>

        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScopeProvider>
          <AppContent />
        </ScopeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;


