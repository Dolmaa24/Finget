import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/" />;
  return <>{children}</>;
}

function AppContent() {
  const { token } = useAuth();

  return (
    <Routes>
      {/* Public Route */}
      <Route path="/" element={!token ? <LandingPage /> : <Navigate to="/dashboard" />} />

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
    </Routes>
  );
}

import { ScopeProvider } from './context/ScopeContext';

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
