import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { LandingPage } from './pages/LandingPage';
import { Dashboard } from './pages/Dashboard';
import { GoalsPage } from './pages/GoalsPage';
import { InsightsPage } from './pages/InsightsPage';
import { AiCoachPage } from './pages/AiCoachPage';
import { AiCreditsPage } from './pages/AiCreditsPage';
import { FriendsModePage } from './pages/FriendsModePage';
import { SplitPage } from './pages/SplitPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { FutureImpactPage } from './pages/FutureImpactPage';
import { ExtensionConnectPage } from './pages/ExtensionConnectPage';
import { LedgerPage } from './pages/LedgerPage';
import { WrappedPage } from './pages/WrappedPage';
import { ImportPage } from './pages/ImportPage';
import { JoinTripPage } from './pages/JoinTripPage';
import { AppShell } from './components/AppShell';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/authStore';
import { ScopeProvider } from './context/ScopeContext';
import { ToastProvider } from './context/ToastContext';
import { PaywallProvider } from './context/PaywallContext';

function AppRoutes() {
  const { token } = useAuth();

  return (
    <Routes>
      <Route path="/" element={token ? <Navigate to="/dashboard" replace /> : <LandingPage />} />

      {/* Public: the trip preview has to work before anyone has an account. */}
      <Route path="/join/:previewToken" element={<JoinTripPage />} />

      <Route element={token ? <AppShell /> : <Navigate to="/" replace />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/split" element={<SplitPage />} />
        <Route path="/future-impact" element={<FutureImpactPage />} />
        <Route path="/ledger" element={<LedgerPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/wrapped" element={<WrappedPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/coach" element={<AiCoachPage />} />
        <Route path="/ai-credits" element={<AiCreditsPage />} />
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
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <ScopeProvider>
              {/* Inside Auth and Scope: the sheet needs the user, and a Trip Pass
                  needs to know which group was being used. */}
              <PaywallProvider>
                <AppRoutes />
              </PaywallProvider>
            </ScopeProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
