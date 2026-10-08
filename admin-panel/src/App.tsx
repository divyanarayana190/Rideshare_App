import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useThemeStore } from '@/store/theme';

import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UsersPage from '@/pages/UsersPage';
import DriversPage from '@/pages/DriversPage';
import RidesPage from '@/pages/RidesPage';
import PaymentsPage from '@/pages/PaymentsPage';
import SafetyPage from '@/pages/SafetyPage';
import PromosPage from '@/pages/PromosPage';
import NotificationsPage from '@/pages/NotificationsPage';
import OperationsPage from '@/pages/OperationsPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import AuditLogsPage from '@/pages/AuditLogsPage';
import DriverApplicationsPage from '@/pages/DriverApplicationsPage';
import SupportPage from '@/pages/SupportPage';
import MessagesPage from '@/pages/MessagesPage';
import RatingsPage from '@/pages/RatingsPage';
import AlertRulesPage from '@/pages/AlertRulesPage';
import LiveMapPage from '@/pages/LiveMapPage';
import IncidentCommandPage from '@/pages/IncidentCommandPage';
import ErrorBoundary from '@/components/ErrorBoundary';
import FinancePage from '@/pages/FinancePage';
import PricingRulesPage from '@/pages/PricingRulesPage';
import FraudPage from '@/pages/FraudPage';
import DriverIntelligencePage from '@/pages/DriverIntelligencePage';
import UserIntelligencePage from '@/pages/UserIntelligencePage';
import FeatureFlagsPage from '@/pages/FeatureFlagsPage';
import ABTestsPage from '@/pages/ABTestsPage';
import InfraHealthPage from '@/pages/InfraHealthPage';
import WebhooksPage from '@/pages/WebhooksPage';
import LegalCompliancePage from '@/pages/LegalCompliancePage';
import PassengersPage from '@/pages/PassengersPage';
import PassengerDetailPage from '@/pages/PassengerDetailPage';
import DriverDetailPage from '@/pages/DriverDetailPage';
import UniversityDashboardPage from '@/pages/UniversityDashboardPage';
import CorporateDashboardPage from '@/pages/CorporateDashboardPage';
import MarketplaceCommandPage from '@/pages/MarketplaceCommandPage';
import AdminRolesPage from '@/pages/AdminRolesPage';
import AdminLayout from '@/components/layout/AdminLayout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore();
  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="passengers" element={<PassengersPage />} />
              <Route path="passengers/:id" element={<PassengerDetailPage />} />
              <Route path="drivers" element={<DriversPage />} />
              <Route path="drivers/:id" element={<DriverDetailPage />} />
              <Route path="marketplace" element={<MarketplaceCommandPage />} />
              <Route path="universities" element={<UniversityDashboardPage />} />
              <Route path="corporate" element={<CorporateDashboardPage />} />
              <Route path="rides" element={<RidesPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="ratings" element={<RatingsPage />} />
              <Route path="safety" element={<SafetyPage />} />
              <Route path="promos" element={<PromosPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="operations" element={<OperationsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="alert-rules" element={<AlertRulesPage />} />
              <Route path="live-map" element={<LiveMapPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              <Route path="driver-applications" element={<DriverApplicationsPage />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="incidents" element={
                <ErrorBoundary fallbackTitle="Incident Command failed to load">
                  <IncidentCommandPage />
                </ErrorBoundary>
              } />
              <Route path="finance" element={<FinancePage />} />
              <Route path="pricing-rules" element={<PricingRulesPage />} />
              <Route path="fraud" element={<FraudPage />} />
              <Route path="driver-intelligence" element={<DriverIntelligencePage />} />
              <Route path="user-intelligence" element={<UserIntelligencePage />} />
              <Route path="feature-flags" element={<FeatureFlagsPage />} />
              <Route path="ab-tests" element={<ABTestsPage />} />
              <Route path="infra-health" element={<InfraHealthPage />} />
              <Route path="webhooks" element={<WebhooksPage />} />
              <Route path="legal-compliance" element={<LegalCompliancePage />} />
              <Route path="admin-roles" element={<AdminRolesPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
