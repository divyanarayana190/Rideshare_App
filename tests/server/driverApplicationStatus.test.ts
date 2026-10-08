import { describe, expect, it } from "vitest";
import { computeDriverAccessStatus } from "@/server/services/driverAccessService";

/**
 * Tests for admin workflow states and status edge cases in the driver
 * application lifecycle: draft → under_review → approved/rejected/action_required
 */

describe("driver application status → access control integration", () => {
  // ── Draft ─────────────────────────────────────────────────────────────────

  it("draft application does not grant driver access", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "draft",
      applicationId: "app-draft-1",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("draft");
  });

  it("draft application returns applicationId for deep-linking", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "draft",
      applicationId: "app-draft-2",
    });
    expect(result.applicationId).toBe("app-draft-2");
  });

  // ── Under Review ──────────────────────────────────────────────────────────

  it("under_review application does not grant driver access", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "under_review",
      applicationId: "app-ur-1",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("under_review");
  });

  // ── Action Required ────────────────────────────────────────────────────────

  it("action_required application blocks driver access", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "action_required",
      applicationId: "app-ar-1",
      actionRequiredReason: "License photo is unreadable. Please re-upload.",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("action_required");
  });

  it("action_required exposes actionRequiredReason to the client", () => {
    const reason = "Insurance document is expired. Please upload a current policy.";
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "action_required",
      applicationId: "app-ar-2",
      actionRequiredReason: reason,
    });
    expect(result.actionRequiredReason).toBe(reason);
  });

  it("action_required with isDriver=true still blocks access", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: false,
      appStatus: "action_required",
      applicationId: "app-ar-3",
    });
    expect(result.canAccessDriverMode).toBe(false);
  });

  // ── Approved ──────────────────────────────────────────────────────────────

  it("approved application grants driver access and sets isDriver=true", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "approved",
      applicationId: "app-ok-1",
    });
    expect(result.canAccessDriverMode).toBe(true);
    expect(result.isDriver).toBe(true);
    expect(result.driverStatus).toBe("approved");
  });

  // ── Rejected ──────────────────────────────────────────────────────────────

  it("rejected application blocks driver access and exposes rejectionReason", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "rejected",
      applicationId: "app-rej-1",
      rejectionReason: "Application did not meet minimum requirements.",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("rejected");
    expect(result.rejectionReason).toBe("Application did not meet minimum requirements.");
  });

  it("rejected application with isDriver=true still blocks access (stale flag)", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: false,
      appStatus: "rejected",
      applicationId: "app-rej-2",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.isDriver).toBe(false);
  });

  // ── Suspended ─────────────────────────────────────────────────────────────

  it("suspended (isBanned=true) user cannot access driver mode regardless of approval", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: true,
      banReason: "Auto-suspended: Driver license has expired",
      appStatus: "approved",
      applicationId: "app-ban-1",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("suspended");
    expect(result.banReason).toBe("Auto-suspended: Driver license has expired");
  });

  // ── No Application ────────────────────────────────────────────────────────

  it("user with no application and no profile flag is not_applied", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: undefined,
      applicationId: null,
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("not_applied");
  });

  it("user with isDriver=true but no application is treated as not_applied (seed data scenario)", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: false,
      appStatus: undefined,
      applicationId: null,
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("not_applied");
  });
});
