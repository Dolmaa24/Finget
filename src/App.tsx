import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { Dashboard } from './pages/Dashboard';
import { GoalsPage } from './pages/GoalsPage';
import { InsightsPage } from './pages/InsightsPage';
import { AiCoachPage } from './pages/AiCoachPage';
import { FriendsModePage } from './pages/FriendsModePage';
import { SplitPage } from './pages/SplitPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { FutureImpactPage } from './pages/FutureImpactPage';
import { ExtensionConnectPage } from './pages/ExtensionConnectPage';
import { LedgerPage } from './pages/LedgerPage';
import { AppShell } from './components/AppShell';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/authStore';
import { ScopeProvider } from './context/ScopeContext';
import { ToastProvider } from './context/ToastContext';

function AppRoutes() {
  const { token } = useAuth();

  return (
    <Routes>
      <Route path="/" element={token ? <Navigate to="/dashboard" replace /> : <LandingPage />} />

      <Route element={token ? <AppShell /> : <Navigate to="/" replace />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/split" element={<SplitPage />} />
        <Route path="/future-impact" element={<FutureImpactPage />} />
        <Route path="/ledger" element={<LedgerPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/coach" element={<AiCoachPage />} />
        <Route path="/friends" element={<FriendsModePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* The extension opens this. Signed-out users land on the landing page
            and arrive back here after logging in, same as any other route. */}
        <Route path="/extension/connect" element={<ExtensionConnectPage />} />
      </Route>

      <Route path="*" element={<Navigate to={token ? '/dashboard' : '/'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ScopeProvider>
            <AppRoutes />
          </ScopeProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
