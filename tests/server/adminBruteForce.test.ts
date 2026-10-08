import { describe, expect, it, beforeEach } from "vitest";

// Inline mirror of the admin login rate-limit logic from server/routes/admin.ts
// (checkAdminLoginRateLimit / recordAdminLoginFailure / clearAdminLoginAttempts)
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type AdminLoginEntry = { count: number; lockedUntil: number };
let adminStore: Map<string, AdminLoginEntry>;

function checkAdminLoginRateLimit(ip: string): { blocked: boolean; remainingAttempts: number } {
  const entry = adminStore.get(ip);
  if (entry && Date.now() < entry.lockedUntil && entry.count >= MAX_ATTEMPTS) {
    return { blocked: true, remainingAttempts: 0 };
  }
  const used = entry?.count ?? 0;
  return { blocked: false, remainingAttempts: MAX_ATTEMPTS - used };
}

function recordAdminLoginFailure(ip: string): void {
  const entry = adminStore.get(ip) ?? { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = Date.now() + LOCKOUT_MS;
  adminStore.set(ip, entry);
}

function clearAdminLoginAttempts(ip: string): void {
  adminStore.delete(ip);
}

describe("admin login brute force protection", () => {
  beforeEach(() => {
    adminStore = new Map();
  });

  it("allows login from a fresh IP with full remaining attempts", () => {
    const result = checkAdminLoginRateLimit("1.2.3.4");
    expect(result.blocked).toBe(false);
    expect(result.remainingAttempts).toBe(5);
  });

  it("decrements remaining attempts on each failure", () => {
    recordAdminLoginFailure("1.2.3.4");
    recordAdminLoginFailure("1.2.3.4");
    const result = checkAdminLoginRateLimit("1.2.3.4");
    expect(result.blocked).toBe(false);
    expect(result.remainingAttempts).toBe(3);
  });

  it("blocks the IP after 5 failures", () => {
    for (let i = 0; i < 5; i++) recordAdminLoginFailure("1.2.3.4");
    const result = checkAdminLoginRateLimit("1.2.3.4");
    expect(result.blocked).toBe(true);
    expect(result.remainingAttempts).toBe(0);
  });

  it("unblocks the IP after clearing attempts", () => {
    for (let i = 0; i < 5; i++) recordAdminLoginFailure("1.2.3.4");
    clearAdminLoginAttempts("1.2.3.4");
    const result = checkAdminLoginRateLimit("1.2.3.4");
    expect(result.blocked).toBe(false);
  });

  it("does not affect a different IP", () => {
    for (let i = 0; i < 5; i++) recordAdminLoginFailure("9.9.9.9");
    const result = checkAdminLoginRateLimit("5.5.5.5");
    expect(result.blocked).toBe(false);
    expect(result.remainingAttempts).toBe(5);
  });
});
