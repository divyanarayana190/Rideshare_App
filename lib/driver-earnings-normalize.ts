/** Normalize driver earnings API payloads that may be arrays or wrapped objects. */

type PayoutItem = {
  id: string;
  amountCents: number;
  status: string;
  createdAt: string | null;
  description?: string | null;
};

function sortByCreatedAtDesc<T extends { createdAt: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

/** Merge legacy `{ walletPayouts, stripeTransfers }` into a single payout list. */
function mergeLegacyPayoutHistory(data: Record<string, unknown>): PayoutItem[] {
  const wallet = Array.isArray(data.walletPayouts) ? (data.walletPayouts as PayoutItem[]) : [];
  const stripe = Array.isArray(data.stripeTransfers) ? (data.stripeTransfers as PayoutItem[]) : [];
  return sortByCreatedAtDesc([...wallet, ...stripe]);
}

/** Return a safe array from list-like API responses. */
export function normalizeList<T>(data: unknown, keys: string[] = ["items", "payouts", "methods"]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }

  if ("walletPayouts" in record || "stripeTransfers" in record) {
    return mergeLegacyPayoutHistory(record) as T[];
  }

  return [];
}

export function normalizePayoutHistory(data: unknown): PayoutItem[] {
  const items = normalizeList<PayoutItem>(data, ["items", "payouts"]);
  if (items.length > 0) return items;
  if (data && typeof data === "object") {
    return mergeLegacyPayoutHistory(data as Record<string, unknown>);
  }
  return [];
}

export function normalizeTransactions(data: unknown): Array<{
  id: number;
  pickupAddress: string;
  dropoffAddress: string;
  totalFare: unknown;
  completedAt: unknown;
}> {
  return normalizeList(data, ["items", "rides", "recentTransactions", "transactions"]);
}

export function normalizeTips(data: unknown): Array<{
  rideDbId: number;
  tipCents: number;
  paidAt: string | null;
}> {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)) {
    return (data as { items: Array<{ rideDbId: number; tipCents: number; paidAt: string | null }> }).items;
  }
  return [];
}

export function normalizePayoutMethods(data: unknown): Array<{ type: string; label: string; status: string }> {
  return normalizeList(data, ["items", "methods"]);
}
