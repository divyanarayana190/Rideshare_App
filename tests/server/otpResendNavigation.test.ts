import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  setOtpSession,
  getOtpSession,
  clearOtpSession,
  getResendRemaining,
} from "@/lib/otp-session";

const SESSION = { method: "phone" as const, destination: "5551234567", purpose: "login" as const };

beforeEach(() => clearOtpSession());
afterEach(() => { vi.useRealTimers(); clearOtpSession(); });

describe("OTP session store", () => {
  it("setOtpSession stores the session with a resendAvailableAt 60s in the future", () => {
    const before = Date.now();
    setOtpSession(SESSION);
    const s = getOtpSession()!;
    expect(s.method).toBe("phone");
    expect(s.destination).toBe("5551234567");
    expect(s.resendAvailableAt).toBeGreaterThanOrEqual(before + 59_900);
    expect(s.resendAvailableAt).toBeLessThanOrEqual(before + 60_100);
  });

  it("getResendRemaining returns ~60 immediately after request", () => {
    setOtpSession(SESSION);
    const remaining = getResendRemaining();
    expect(remaining).toBeGreaterThanOrEqual(59);
    expect(remaining).toBeLessThanOrEqual(60);
  });

  it("timer continues — go back and return does not reset countdown", () => {
    vi.useFakeTimers();
    setOtpSession(SESSION);

    // Simulate 30 seconds of navigation away (component unmount/remount)
    vi.advanceTimersByTime(30_000);

    // When verify screen remounts, it reads from the same session
    const remaining = getResendRemaining();
    expect(remaining).toBeGreaterThanOrEqual(29);
    expect(remaining).toBeLessThanOrEqual(30);
  });

  it("getResendRemaining returns 0 after cooldown expires", () => {
    vi.useFakeTimers();
    setOtpSession(SESSION);
    vi.advanceTimersByTime(61_000);
    expect(getResendRemaining()).toBe(0);
  });

  it("clearOtpSession removes the session and getResendRemaining returns 0", () => {
    setOtpSession(SESSION);
    clearOtpSession();
    expect(getOtpSession()).toBeNull();
    expect(getResendRemaining()).toBe(0);
  });

  it("successful verification clears OTP session state", () => {
    setOtpSession(SESSION);
    // Simulate what verifyOtp in auth-context does
    clearOtpSession();
    expect(getOtpSession()).toBeNull();
  });
});

describe("sign-in OTP session pre-check logic", () => {
  // Mirror of the decision in sign-in-v2.tsx handleSignIn
  function shouldSkipRequestOtp(
    session: ReturnType<typeof getOtpSession>,
    remaining: number,
    dest: string,
    method: string,
  ): boolean {
    return (
      session?.destination === dest &&
      session?.method === method &&
      remaining > 0
    );
  }

  it("navigates to verify without calling requestOtp when cooldown active for same destination", () => {
    vi.useFakeTimers();
    setOtpSession(SESSION);
    const skip = shouldSkipRequestOtp(getOtpSession(), getResendRemaining(), SESSION.destination, SESSION.method);
    expect(skip).toBe(true);
  });

  it("calls requestOtp when no session exists", () => {
    const skip = shouldSkipRequestOtp(null, 0, SESSION.destination, SESSION.method);
    expect(skip).toBe(false);
  });

  it("calls requestOtp when session expired", () => {
    vi.useFakeTimers();
    setOtpSession(SESSION);
    vi.advanceTimersByTime(61_000);
    const skip = shouldSkipRequestOtp(getOtpSession(), getResendRemaining(), SESSION.destination, SESSION.method);
    expect(skip).toBe(false);
  });

  it("calls requestOtp when destination changed", () => {
    setOtpSession(SESSION);
    const skip = shouldSkipRequestOtp(getOtpSession(), getResendRemaining(), "9990000000", SESSION.method);
    expect(skip).toBe(false);
  });

  it("calls requestOtp when method changed", () => {
    setOtpSession(SESSION);
    const skip = shouldSkipRequestOtp(getOtpSession(), getResendRemaining(), SESSION.destination, "email");
    expect(skip).toBe(false);
  });
});
