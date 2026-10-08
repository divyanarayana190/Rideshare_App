import { Outlet, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useThemeStore } from '@/store/theme';
import Sidebar from './Sidebar';
import RouteGuard from '@/components/RouteGuard';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function AdminLayout() {
  const { isAuthenticated, checkAuth, token } = useAuthStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    if (token) checkAuth();
  }, []);

  if (!token && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={`flex min-h-screen ${theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-900'}`}>
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        <ErrorBoundary>
          <RouteGuard>
            <Outlet />
          </RouteGuard>
        </ErrorBoundary>
      </main>
    </div>
  );
}
