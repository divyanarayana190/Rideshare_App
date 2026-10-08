import { Navigate, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useRole } from '@/hooks/usePermissions';
import { canAccessRoute } from '@shared/adminRbac';

interface Props {
  children: React.ReactNode;
}

/** Blocks admin panel routes the signed-in department role cannot access. */
export default function RouteGuard({ children }: Props) {
  const role = useRole();
  const { pathname } = useLocation();
  const routePath = pathname.replace(/\/$/, '') || '/dashboard';

  if (!canAccessRoute(role ?? undefined, routePath)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <div className="p-4 bg-slate-800 rounded-2xl mb-3">
          <ShieldOff size={28} className="text-slate-500" />
        </div>
        <p className="text-sm font-medium text-slate-400">Access Restricted</p>
        <p className="text-xs text-slate-600 mt-1">Your department role cannot access this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export function SuperAdminRoute({ children }: Props) {
  const role = useRole();
  if (role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
