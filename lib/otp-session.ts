// ponytail: module-level singleton — survives in-session navigation, not app restarts.
// OTP sessions are short-lived (60s cooldown, 10min expiry) so no persistence needed.
const COOLDOWN_MS = 60_000; // must match server RESEND_COOLDOWN_MS

type OtpSession = {
  method: "phone" | "email";
  destination: string;
  purpose: "signup" | "login";
  resendAvailableAt: number;
};

let _session: OtpSession | null = null;

export function setOtpSession(input: {
  method: "phone" | "email";
  destination: string;
  purpose: "signup" | "login";
}): void {
  _session = { ...input, resendAvailableAt: Date.now() + COOLDOWN_MS };
}

export function getOtpSession(): OtpSession | null {
  return _session;
}

export function clearOtpSession(): void {
  _session = null;
}

/** Seconds until resend is allowed. 0 means resend is available now. */
export function getResendRemaining(): number {
  if (!_session) return 0;
  return Math.max(0, Math.ceil((_session.resendAvailableAt - Date.now()) / 1000));
}
