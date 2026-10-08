import { describe, expect, it, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// Inline mirror of the in-process brute-force logic in server/routers.ts
// (checkLoginAttempts / recordFailedLogin / clearLoginAttempts)
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type AttemptEntry = { count: number; lockedUntil: number };
let store: Map<string, AttemptEntry>;

function checkLoginAttempts(key: string): void {
  const entry = store.get(key);
  if (entry && Date.now() < entry.lockedUntil && entry.count >= MAX_ATTEMPTS) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many failed attempts." });
  }
}

function recordFailedLogin(key: string): void {
  const entry = store.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = Date.now() + LOCKOUT_MS;
  store.set(key, entry);
}

function clearLoginAttempts(key: string): void {
  store.delete(key);
}

describe("OTP brute force protection", () => {
  beforeEach(() => {
    store = new Map();
  });

  it("allows login when no previous failures exist", () => {
    expect(() => checkLoginAttempts("user@state.edu")).not.toThrow();
  });

  it("allows login after fewer than 5 failures", () => {
    for (let i = 0; i < 4; i++) recordFailedLogin("user@state.edu");
    expect(() => checkLoginAttempts("user@state.edu")).not.toThrow();
  });

  it("blocks login after exactly 5 failures", () => {
    for (let i = 0; i < 5; i++) recordFailedLogin("user@state.edu");
    expect(() => checkLoginAttempts("user@state.edu")).toThrowError(
      expect.objectContaining({ code: "TOO_MANY_REQUESTS" }),
    );
  });

  it("clears the lock after a successful login", () => {
    for (let i = 0; i < 5; i++) recordFailedLogin("user@state.edu");
    clearLoginAttempts("user@state.edu");
    expect(() => checkLoginAttempts("user@state.edu")).not.toThrow();
  });

  it("tracks different identifiers independently", () => {
    for (let i = 0; i < 5; i++) recordFailedLogin("attacker@evil.com");
    // Legitimate user should still be allowed
    expect(() => checkLoginAttempts("innocent@state.edu")).not.toThrow();
  });
});
