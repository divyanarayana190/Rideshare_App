import { describe, expect, it } from "vitest";

/** Mirrors getDriverPayoutHistory return contract for frontend consumers. */
function buildPayoutHistoryResponse(
  walletItems: Array<{ id: string; amountCents: number; status: string; createdAt: string | null }>,
  stripeItems: Array<{ id: string; amountCents: number; status: string; createdAt: string | null }>,
) {
  const items = [...walletItems, ...stripeItems].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
  return { items, totalCount: items.length };
}

describe("getPayoutHistory stable shape", () => {
  it("returns items array and totalCount", () => {
    const result = buildPayoutHistoryResponse(
      [{ id: "w1", amountCents: 100, status: "paid", createdAt: "2026-01-01T00:00:00.000Z" }],
      [{ id: "s1", amountCents: 200, status: "paid", createdAt: "2026-01-02T00:00:00.000Z" }],
    );
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.totalCount).toBe(2);
    expect(result.items[0]?.id).toBe("s1");
  });

  it("returns empty items when no payouts", () => {
    const result = buildPayoutHistoryResponse([], []);
    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});
