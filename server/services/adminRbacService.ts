/**
 * Department RBAC — admin sub-roles stored in platform_config (no schema migration).
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { platformConfig, users } from "../../drizzle/schema";
import {
  type AdminRole,
  ADMIN_ROLES,
  buildPermissions,
  hasPermission,
  lookupApiPermission,
} from "../../shared/adminRbac";

export type { AdminRole, PermissionKey } from "../../shared/adminRbac";
export { buildPermissions, hasPermission, lookupApiPermission, ADMIN_ROLES };

function roleKey(adminId: number) {
  return `admin_department_role_${adminId}`;
}

export async function getAdminRole(adminId: number): Promise<AdminRole> {
  const [row] = await db.select().from(platformConfig).where(eq(platformConfig.key, roleKey(adminId))).limit(1);
  if (!row?.value) return "super_admin";
  const role = row.value as AdminRole;
  return ADMIN_ROLES.includes(role) ? role : "super_admin";
}

export async function setAdminRole(adminId: number, role: AdminRole): Promise<void> {
  if (!ADMIN_ROLES.includes(role)) throw new Error("Invalid admin role");
  const [existing] = await db.select().from(platformConfig).where(eq(platformConfig.key, roleKey(adminId))).limit(1);
  if (existing) {
    await db.update(platformConfig).set({ value: role, type: "string" }).where(eq(platformConfig.key, roleKey(adminId)));
  } else {
    await db.insert(platformConfig).values({
      key: roleKey(adminId),
      value: role,
      description: "Admin panel department role",
      type: "string",
    });
  }
}

export async function listAdminRoles(): Promise<Array<{ id: number; name: string | null; email: string | null; role: AdminRole }>> {
  const admins = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "admin"));

  const keys = admins.map((a) => roleKey(a.id));
  const configs = keys.length
    ? await db.select().from(platformConfig).where(inArray(platformConfig.key, keys))
    : [];
  const roleMap = Object.fromEntries(
    configs.map((c) => {
      const id = parseInt(c.key.replace("admin_department_role_", ""), 10);
      const role = c.value as AdminRole;
      return [id, ADMIN_ROLES.includes(role) ? role : "super_admin"];
    }),
  );

  return admins.map((a) => ({
    ...a,
    role: roleMap[a.id] ?? ("super_admin" as AdminRole),
  }));
}

export function assertApiPermission(adminRole: AdminRole, path: string, method: string): string | null {
  const perm = lookupApiPermission(path, method);
  if (!perm) return null;
  if (!hasPermission(adminRole, perm)) {
    return `Requires permission: ${perm}`;
  }
  return null;
}
