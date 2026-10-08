import { type AdminRole, hasRole, useRole } from '@/hooks/usePermissions';
import { ShieldOff } from 'lucide-react';

interface RequireRoleProps {
  role: AdminRole;
  children: React.ReactNode;
  /** When true renders nothing instead of the access-denied message */
  silent?: boolean;
  /** Custom fallback UI */
  fallback?: React.ReactNode;
}

/**
 * Renders children only when the authenticated admin has at least the required role.
 * Usage:
 *   <RequireRole role="admin">  — only admin / super_admin see this
 *   <RequireRole role="ops">    — ops, admin, super_admin see this
 */
export default function RequireRole({ role, children, silent = false, fallback }: RequireRoleProps) {
  const userRole = useRole();

  if (hasRole(userRole ?? undefined, role)) {
    return <>{children}</>;
  }

  if (silent) return null;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <div className="p-4 bg-slate-800 rounded-2xl mb-3">
        <ShieldOff size={28} className="text-slate-500" />
      </div>
      <p className="text-sm font-medium text-slate-400">Access Restricted</p>
      <p className="text-xs text-slate-600 mt-1">
        Requires <span className="text-slate-400 capitalize">{role.replace('_', ' ')}</span> role or higher
      </p>
    </div>
  );
}

/**
 * Lightweight wrapper that just hides/shows inline UI elements.
 * No fallback rendered.
 */
export function IfRole({ role, children }: { role: AdminRole; children: React.ReactNode }) {
  const userRole = useRole();
  if (!hasRole(userRole ?? undefined, role)) return null;
  return <>{children}</>;
}
