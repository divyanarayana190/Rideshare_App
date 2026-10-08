/** Shared admin department roles and permissions (client + server). */

export type AdminRole = "super_admin" | "admin" | "ops" | "support";

export const ADMIN_ROLES: AdminRole[] = ["super_admin", "admin", "ops", "support"];

export const ROLE_RANK: Record<AdminRole, number> = {
  support: 1,
  ops: 2,
  admin: 3,
  super_admin: 4,
};

export type PermissionKey =
  | "canViewUsers"
  | "canEditUsers"
  | "canBanUsers"
  | "canDeleteUsers"
  | "canViewDrivers"
  | "canSuspendDrivers"
  | "canPayoutDrivers"
  | "canViewRides"
  | "canCancelRides"
  | "canBulkCancelRides"
  | "canViewPayments"
  | "canRefundPayments"
  | "canInitiatePayouts"
  | "canViewRatings"
  | "canViewAnalytics"
  | "canViewAuditLogs"
  | "canExportData"
  | "canManageOperations"
  | "canManageSurgeZones"
  | "canManageConfig"
  | "canManageAlertRules"
  | "canDismissAlerts"
  | "canSendNotifications"
  | "canManageSafety"
  | "canManageAdmins"
  | "canChangeRoles";

export type Permissions = Record<PermissionKey, boolean>;

export function buildPermissions(role: AdminRole | undefined): Permissions {
  const rank = ROLE_RANK[role ?? "support"] ?? 1;
  const atLeast = (r: AdminRole) => rank >= ROLE_RANK[r];

  return {
    canViewUsers: atLeast("support"),
    canEditUsers: atLeast("admin"),
    canBanUsers: atLeast("admin"),
    canDeleteUsers: atLeast("super_admin"),
    canViewDrivers: atLeast("ops"),
    canSuspendDrivers: atLeast("admin"),
    canPayoutDrivers: atLeast("admin"),
    canViewRides: atLeast("ops"),
    canCancelRides: atLeast("ops"),
    canBulkCancelRides: atLeast("admin"),
    canViewPayments: atLeast("ops"),
    canRefundPayments: atLeast("admin"),
    canInitiatePayouts: atLeast("admin"),
    canViewRatings: atLeast("ops"),
    canViewAnalytics: atLeast("ops"),
    canViewAuditLogs: atLeast("admin"),
    canExportData: atLeast("admin"),
    canManageOperations: atLeast("ops"),
    canManageSurgeZones: atLeast("ops"),
    canManageConfig: atLeast("admin"),
    canManageAlertRules: atLeast("admin"),
    canDismissAlerts: atLeast("ops"),
    canSendNotifications: atLeast("ops"),
    canManageSafety: atLeast("ops"),
    canManageAdmins: atLeast("super_admin"),
    canChangeRoles: atLeast("super_admin"),
  };
}

export function hasRole(userRole: AdminRole | undefined, required: AdminRole): boolean {
  return (ROLE_RANK[userRole ?? "support"] ?? 0) >= ROLE_RANK[required];
}

export function hasPermission(role: AdminRole | undefined, key: PermissionKey): boolean {
  return buildPermissions(role)[key];
}

/** Minimum role required to access an admin panel route. */
export const ROUTE_MIN_ROLE: Record<string, AdminRole> = {
  "/dashboard": "support",
  "/support": "support",
  "/messages": "support",
  "/users": "support",
  "/passengers": "support",
  "/marketplace": "ops",
  "/universities": "ops",
  "/corporate": "ops",
  "/live-map": "ops",
  "/incidents": "ops",
  "/drivers": "ops",
  "/driver-applications": "ops",
  "/driver-intelligence": "ops",
  "/user-intelligence": "ops",
  "/ratings": "ops",
  "/rides": "ops",
  "/payments": "ops",
  "/finance": "admin",
  "/pricing-rules": "admin",
  "/fraud": "admin",
  "/safety": "ops",
  "/promos": "admin",
  "/feature-flags": "admin",
  "/ab-tests": "admin",
  "/webhooks": "admin",
  "/infra-health": "admin",
  "/notifications": "ops",
  "/operations": "ops",
  "/analytics": "ops",
  "/alert-rules": "admin",
  "/audit-logs": "admin",
  "/legal-compliance": "admin",
  "/admin-roles": "super_admin",
};

/** Express path → permission for API enforcement (path without /admin prefix). */
export function lookupApiPermission(path: string, method: string): PermissionKey | null {
  const p = path.split("?")[0]!;
  const m = method.toUpperCase();

  if (p.startsWith("/auth/")) return null;
  if (p.startsWith("/preferences/")) return null;
  if (p.startsWith("/rbac/")) return "canManageAdmins";

  if (p.startsWith("/export/")) return "canExportData";
  if (p.startsWith("/audit-logs")) return "canViewAuditLogs";

  if (p.startsWith("/users") && m === "DELETE") return "canDeleteUsers";
  if (p.includes("/ban") || p.includes("/unban")) return "canBanUsers";
  if (p.startsWith("/users") && (m === "PATCH" || m === "POST")) return "canEditUsers";
  if (p.startsWith("/users")) return "canViewUsers";

  if (p.startsWith("/payments") && p.includes("/refund")) return "canRefundPayments";
  if (p.startsWith("/payments") || p.startsWith("/transactions") || p.startsWith("/finance")) {
    return "canViewPayments";
  }

  if (p.startsWith("/rides") && m === "POST") return "canCancelRides";
  if (p.startsWith("/rides")) return "canViewRides";

  if (p.startsWith("/drivers") || p.startsWith("/driver-applications") || p.startsWith("/driver-intelligence")) {
    return "canViewDrivers";
  }
  if (p.startsWith("/passengers")) return "canViewUsers";

  if (p.startsWith("/analytics") || p.startsWith("/executive-metrics") || p.startsWith("/stats")) {
    return "canViewAnalytics";
  }

  if (p.startsWith("/feature-flags") || p.startsWith("/ab-tests") || p.startsWith("/webhooks") || p.startsWith("/platform-config")) {
    return "canManageConfig";
  }

  if (p.startsWith("/alert-rules")) return "canManageAlertRules";
  if (p.startsWith("/system-alerts")) return "canDismissAlerts";

  if (p.startsWith("/safety") || p.startsWith("/incidents") || p.startsWith("/emergency")) return "canManageSafety";
  if (p.startsWith("/fraud")) return "canManageConfig";
  if (p.startsWith("/notifications")) return "canSendNotifications";
  if (p.startsWith("/marketplace") || p.startsWith("/operations") || p.startsWith("/surge")) {
    return "canManageOperations";
  }
  if (p.startsWith("/ratings")) return "canViewRatings";
  if (p.startsWith("/compliance") || p.startsWith("/legal")) return "canManageConfig";
  if (p.startsWith("/support")) return "canViewUsers";

  return null;
}

export function canAccessRoute(role: AdminRole | undefined, routePath: string): boolean {
  const minRole = ROUTE_MIN_ROLE[routePath];
  if (!minRole) return true;
  return hasRole(role, minRole);
}
