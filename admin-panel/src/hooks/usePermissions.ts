export {
  type AdminRole,
  type PermissionKey,
  type Permissions,
  ADMIN_ROLES,
  ROLE_RANK,
  buildPermissions,
  hasRole,
  hasPermission,
  canAccessRoute,
  ROUTE_MIN_ROLE,
} from "@shared/adminRbac";

import { useAuthStore } from "@/store/auth";
import { buildPermissions, type AdminRole, type Permissions } from "@shared/adminRbac";

export function usePermissions(): Permissions {
  const user = useAuthStore((s) => s.user);
  return buildPermissions(user?.role as AdminRole | undefined);
}

export function useRole(): AdminRole | null {
  const user = useAuthStore((s) => s.user);
  return (user?.role as AdminRole) ?? null;
}
