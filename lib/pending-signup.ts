// Transient in-memory store for sensitive signup data that must not appear in
// navigation params (which become URL query strings on web builds).
// Cleared immediately after consumption — never persisted to disk or storage.

type PendingSignup = { password: string };

let pending: PendingSignup | null = null;

export function setPendingSignup(data: PendingSignup): void {
  pending = data;
}

export function consumePendingSignup(): PendingSignup | null {
  const data = pending;
  pending = null;
  return data;
}
