import { describe, expect, it } from "vitest";
import { computeExpiryAction } from "@/server/services/driverExpiryCron";

function daysFromNow(days: number, base = new Date()): string {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

describe("computeExpiryAction — driver document expiry logic", () => {
  // ── Auto-suspend ──────────────────────────────────────────────────────────

  it("suspends when license is expired", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(-1),
      insuranceExpiry: daysFromNow(90),
      now: TODAY,
    });
    expect(result.action).toBe("suspend");
    expect(result.docs).toContain("Driver license has expired");
  });

  it("suspends when insurance is expired", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(90),
      insuranceExpiry: daysFromNow(-5),
      now: TODAY,
    });
    expect(result.action).toBe("suspend");
    expect(result.docs).toContain("Insurance policy has expired");
  });

  it("suspends with both docs in reason when both are expired", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(-3),
      insuranceExpiry: daysFromNow(-10),
      now: TODAY,
    });
    expect(result.action).toBe("suspend");
    expect(result.docs).toHaveLength(2);
    expect(result.reason).toContain("Driver license has expired");
    expect(result.reason).toContain("Insurance policy has expired");
  });

  // ── 30-day warning ────────────────────────────────────────────────────────

  it("warns at 30 days when license expires in exactly 30 days", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(30),
      insuranceExpiry: daysFromNow(90),
      now: TODAY,
    });
    expect(result.action).toBe("warn_30");
    expect(result.docs).toContain("driver license");
  });

  it("warns at 30 days when insurance expires in 15 days", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(90),
      insuranceExpiry: daysFromNow(15),
      now: TODAY,
    });
    expect(result.action).toBe("warn_30");
    expect(result.docs).toContain("insurance policy");
  });

  it("warns at 30 days and includes both docs when both expire within 30 days", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(10),
      insuranceExpiry: daysFromNow(25),
      now: TODAY,
    });
    expect(result.action).toBe("warn_30");
    expect(result.docs).toHaveLength(2);
  });

  // ── 60-day warning ────────────────────────────────────────────────────────

  it("warns at 60 days when license expires in 45 days", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(45),
      insuranceExpiry: daysFromNow(90),
      now: TODAY,
    });
    expect(result.action).toBe("warn_60");
    expect(result.docs).toContain("driver license");
  });

  it("warns at 60 days when license expires in exactly 60 days", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(60),
      insuranceExpiry: daysFromNow(120),
      now: TODAY,
    });
    expect(result.action).toBe("warn_60");
  });

  it("30d warning takes priority over 60d warning when one doc is in each band", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(20),
      insuranceExpiry: daysFromNow(50),
      now: TODAY,
    });
    expect(result.action).toBe("warn_30");
  });

  // ── OK ────────────────────────────────────────────────────────────────────

  it("returns ok when all docs expire beyond 60 days", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(180),
      insuranceExpiry: daysFromNow(90),
      now: TODAY,
    });
    expect(result.action).toBe("ok");
    expect(result.docs).toHaveLength(0);
  });

  it("returns ok when both expiry dates are null (no data yet)", () => {
    const result = computeExpiryAction({
      licenseExpiry: null,
      insuranceExpiry: null,
      now: TODAY,
    });
    expect(result.action).toBe("ok");
  });

  // ── Boundary: suspend takes priority over warning ─────────────────────────

  it("suspends (not warns) when license is expired even if insurance is in warn zone", () => {
    const result = computeExpiryAction({
      licenseExpiry: daysFromNow(-1),
      insuranceExpiry: daysFromNow(20),
      now: TODAY,
    });
    expect(result.action).toBe("suspend");
  });
});
