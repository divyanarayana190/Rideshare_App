import { describe, it, expect } from "vitest";
import {
  buildPermissions,
  hasPermission,
  lookupApiPermission,
  canAccessRoute,
} from "@shared/adminRbac";

describe("adminRbac", () => {
  it("support can view users but not export", () => {
    expect(hasPermission("support", "canViewUsers")).toBe(true);
    expect(hasPermission("support", "canExportData")).toBe(false);
  });

  it("ops can view rides and cancel", () => {
    expect(hasPermission("ops", "canViewRides")).toBe(true);
    expect(hasPermission("ops", "canCancelRides")).toBe(true);
    expect(hasPermission("ops", "canViewAuditLogs")).toBe(false);
  });

  it("admin can export and view audit logs", () => {
    expect(hasPermission("admin", "canExportData")).toBe(true);
    expect(hasPermission("admin", "canViewAuditLogs")).toBe(true);
  });

  it("maps export API paths to canExportData", () => {
    expect(lookupApiPermission("/export/rides", "GET")).toBe("canExportData");
    expect(lookupApiPermission("/export/audit-logs", "GET")).toBe("canExportData");
  });

  it("restricts finance route to admin+", () => {
    expect(canAccessRoute("ops", "/finance")).toBe(false);
    expect(canAccessRoute("admin", "/finance")).toBe(true);
  });

  it("buildPermissions is stable for super_admin", () => {
    const p = buildPermissions("super_admin");
    expect(p.canManageAdmins).toBe(true);
    expect(p.canDeleteUsers).toBe(true);
  });
});
