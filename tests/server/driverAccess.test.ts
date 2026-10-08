import { describe, expect, it, vi } from "vitest";
import { computeDriverAccessStatus } from "@/server/services/driverAccessService";
import { resolveDriverAccess } from "@/lib/driver-access";

describe("computeDriverAccessStatus — core access gate", () => {
  // ── APPROVED ────────────────────────────────────────────────────────────────

  it("grants driver mode when application is approved", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "approved",
      applicationId: "app-1",
    });
    expect(result.canAccessDriverMode).toBe(true);
    expect(result.driverStatus).toBe("approved");
    expect(result.isDriver).toBe(true);
  });

  it("grants driver mode even if profileIsDriver is stale false (approved app is enough)", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "approved",
      applicationId: "app-2",
    });
    expect(result.canAccessDriverMode).toBe(true);
    expect(result.driverStatus).toBe("approved");
  });

  // ── CRITICAL: isDriver=true alone must NOT grant access ─────────────────────

  it("BLOCKS driver mode when profileIsDriver=true but no application exists", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: false,
      appStatus: null,
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("not_applied");
    expect(result.isDriver).toBe(false);
  });

  it("BLOCKS driver mode when profileIsDriver=true but application is pending", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: false,
      appStatus: "pending",
      applicationId: "app-3",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("under_review");
  });

  it("BLOCKS driver mode when profileIsDriver=true but application is rejected", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: false,
      appStatus: "rejected",
      rejectionReason: "Bad license photo",
      applicationId: "app-4",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("rejected");
  });

  it("BLOCKS driver mode when profileIsDriver=true but application is draft", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: false,
      appStatus: "draft",
      applicationId: "app-5",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("draft");
  });

  it("BLOCKS driver mode when profileIsDriver=true but application is action_required", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: false,
      appStatus: "action_required",
      actionRequiredReason: "Re-upload license",
      applicationId: "app-6",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("action_required");
    expect(result.actionRequiredReason).toBe("Re-upload license");
  });

  // ── SUSPENSION ──────────────────────────────────────────────────────────────

  it("suspends banned drivers even when application is approved", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: true,
      banReason: "Policy violation",
      appStatus: "approved",
      applicationId: "app-7",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("suspended");
    expect(result.banReason).toBe("Policy violation");
  });

  it("suspends banned drivers with no application", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: true,
      banReason: "Expired documents",
      appStatus: null,
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("suspended");
  });

  // ── UNDER REVIEW ────────────────────────────────────────────────────────────

  it("blocks under_review applications from driver mode", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "under_review",
      applicationId: "app-8",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("under_review");
  });

  it("blocks pending applications (legacy status) from driver mode", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "pending",
      applicationId: "app-9",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("under_review");
  });

  // ── DRAFT ───────────────────────────────────────────────────────────────────

  it("blocks draft applications from driver mode", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "draft",
      applicationId: "app-10",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("draft");
  });

  // ── ACTION REQUIRED ─────────────────────────────────────────────────────────

  it("blocks action_required applications from driver mode and returns reason", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "action_required",
      actionRequiredReason: "Insurance document is blurry",
      applicationId: "app-11",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("action_required");
    expect(result.actionRequiredReason).toBe("Insurance document is blurry");
  });

  // ── REJECTED ────────────────────────────────────────────────────────────────

  it("blocks rejected drivers and returns rejection reason", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "rejected",
      rejectionReason: "Invalid license",
      applicationId: "app-12",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("rejected");
    expect(result.rejectionReason).toBe("Invalid license");
  });

  // ── NOT APPLIED ─────────────────────────────────────────────────────────────

  it("returns not_applied for a plain passenger with no application", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: null,
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("not_applied");
    expect(result.applicationId).toBeNull();
  });

  // ── PASSENGER SAFETY ────────────────────────────────────────────────────────

  it("passenger with isDriver=true AND no app cannot access driver mode (seed data protection)", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: false,
      appStatus: null,
    });
    expect(result.canAccessDriverMode).toBe(false);
  });
});

// ── getAccessStatus endpoint safe fallback ─────────────────────────────────────
describe("driver.getAccessStatus — endpoint never crashes", () => {
  it("no application returns not_applied with canAccessDriverMode false", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: null,
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("not_applied");
    expect(result.applicationId).toBeNull();
  });

  it("approved application returns canAccessDriverMode true", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "approved",
      applicationId: "app-approved",
    });
    expect(result.canAccessDriverMode).toBe(true);
    expect(result.driverStatus).toBe("approved");
  });

  it("rejected application returns canAccessDriverMode false", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      appStatus: "rejected",
      rejectionReason: "Invalid documents",
      applicationId: "app-rejected",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("rejected");
  });

  it("suspended (banned) user returns canAccessDriverMode false", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: true,
      isBanned: true,
      banReason: "Terms violation",
      appStatus: "approved",
      applicationId: "app-suspended",
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("suspended");
  });

  it("null profile fields (no userProfile row) still compute safely", () => {
    const result = computeDriverAccessStatus({
      profileIsDriver: false,
      isBanned: false,
      banReason: null,
      appStatus: null,
      applicationId: null,
      rejectionReason: null,
      actionRequiredReason: null,
    });
    expect(result.canAccessDriverMode).toBe(false);
    expect(result.driverStatus).toBe("not_applied");
  });
});

// ── resolveDriverAccess client helper ─────────────────────────────────────────
describe("resolveDriverAccess — client-side helper", () => {
  it("null access resolves to safe not_applied defaults", () => {
    const r = resolveDriverAccess(null);
    expect(r.canAccessDriverMode).toBe(false);
    expect(r.isDriver).toBe(false);
    expect(r.driverStatus).toBe("not_applied");
    expect(r.isApproved).toBe(false);
    expect(r.isPending).toBe(false);
    expect(r.isActionRequired).toBe(false);
    expect(r.isRejected).toBe(false);
    expect(r.isSuspended).toBe(false);
    expect(r.isError).toBe(false);
  });

  it("approved status sets canAccessDriverMode and isApproved true", () => {
    const r = resolveDriverAccess({ canAccessDriverMode: true, isDriver: true, driverStatus: "approved", applicationId: "a" });
    expect(r.canAccessDriverMode).toBe(true);
    expect(r.isApproved).toBe(true);
    expect(r.isPending).toBe(false);
  });

  it("under_review status sets isPending true (backend uses under_review for both pending+under_review)", () => {
    const r = resolveDriverAccess({ canAccessDriverMode: false, isDriver: false, driverStatus: "under_review", applicationId: "a" });
    expect(r.isPending).toBe(true);
    expect(r.isApproved).toBe(false);
  });

  it("action_required sets isActionRequired true", () => {
    const r = resolveDriverAccess({ canAccessDriverMode: false, isDriver: false, driverStatus: "action_required", actionRequiredReason: "Re-upload license", applicationId: "a" });
    expect(r.isActionRequired).toBe(true);
    expect(r.actionRequiredReason).toBe("Re-upload license");
  });

  it("isError flag propagates from access object", () => {
    const r = resolveDriverAccess({ canAccessDriverMode: false, isDriver: false, driverStatus: "not_applied", applicationId: null, isError: true });
    expect(r.isError).toBe(true);
    expect(r.canAccessDriverMode).toBe(false);
  });

  it("isError is false when flag absent", () => {
    const r = resolveDriverAccess({ canAccessDriverMode: false, isDriver: false, driverStatus: "not_applied", applicationId: null });
    expect(r.isError).toBe(false);
  });
});
