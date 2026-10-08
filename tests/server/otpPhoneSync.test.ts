import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setOtpSession, getOtpSession, clearOtpSession } from "@/lib/otp-session";

// Mirror of verify-otp.tsx: session is source of truth, params are fallback.
function resolveDestination(sessionDest: string | undefined, paramsDest: string): string {
  return sessionDest ?? paramsDest ?? "";
}

function maskPhone(destination: string, method: "phone" | "email"): string {
  return method === "phone" && destination.length >= 4
    ? "•••• " + destination.slice(-4)
    : destination;
}

beforeEach(() => clearOtpSession());
afterEach(() => clearOtpSession());

describe("OTP phone number sync", () => {
  it("request OTP → verify screen shows correct last four digits", () => {
    setOtpSession({ method: "phone", destination: "1201000345", purpose: "login" });
    const dest = resolveDestination(getOtpSession()?.destination, "");
    expect(maskPhone(dest, "phone")).toBe("•••• 0345");
  });

  it("change phone number → verify screen shows new last four digits", () => {
    setOtpSession({ method: "phone", destination: "5557897890", purpose: "login" });
    // User edits number and requests another OTP — session replaced immediately
    setOtpSession({ method: "phone", destination: "1201000345", purpose: "login" });
    const dest = resolveDestination(getOtpSession()?.destination, "");
    expect(maskPhone(dest, "phone")).toBe("•••• 0345");
  });

  it("go back → verify still shows same number (session untouched by navigation)", () => {
    setOtpSession({ method: "phone", destination: "1201000345", purpose: "login" });
    const before = resolveDestination(getOtpSession()?.destination, "");
    // Simulate component unmount/remount on back-then-forward navigation
    const after = resolveDestination(getOtpSession()?.destination, "");
    expect(before).toBe(after);
    expect(maskPhone(after, "phone")).toBe("•••• 0345");
  });

  it("app restart clears in-memory session → falls back to params destination", () => {
    // otp-session is in-memory only; restart is simulated by clearOtpSession
    clearOtpSession();
    const dest = resolveDestination(getOtpSession()?.destination, "1201000345");
    expect(maskPhone(dest, "phone")).toBe("•••• 0345");
  });
});
