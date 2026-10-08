import { describe, expect, it } from "vitest";
import {
  normalizePayoutHistory,
  normalizeTransactions,
  normalizeTips,
  normalizePayoutMethods,
} from "../../lib/driver-earnings-normalize";

describe("driver earnings normalize", () => {
  it("normalizePayoutHistory returns empty array for null/undefined", () => {
    expect(normalizePayoutHistory(null)).toEqual([]);
    expect(normalizePayoutHistory(undefined)).toEqual([]);
  });

  it("normalizePayoutHistory handles items array shape", () => {
    const items = [
      { id: "p1", amountCents: 500, status: "paid", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    expect(normalizePayoutHistory({ items, totalCount: 1 })).toEqual(items);
  });

  it("normalizePayoutHistory handles legacy walletPayouts + stripeTransfers object", () => {
    const result = normalizePayoutHistory({
      walletPayouts: [
        { id: "w1", amountCents: 100, status: "paid", createdAt: "2026-01-02T00:00:00.000Z" },
      ],
      stripeTransfers: [
        { id: "s1", amountCents: 200, status: "paid", createdAt: "2026-01-03T00:00:00.000Z" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("s1");
    expect(result[1]?.id).toBe("w1");
  });

  it("normalizePayoutHistory handles plain array", () => {
    const arr = [{ id: "a", amountCents: 1, status: "paid", createdAt: null }];
    expect(normalizePayoutHistory(arr)).toEqual(arr);
  });

  it("normalizeTransactions extracts rides from earnings detail", () => {
    const rides = [{ id: 1, pickupAddress: "A", dropoffAddress: "B", totalFare: 10, completedAt: "2026-01-01" }];
    expect(normalizeTransactions({ rides })).toEqual(rides);
    expect(normalizeTransactions({ items: rides })).toEqual(rides);
    expect(normalizeTransactions(null)).toEqual([]);
  });

  it("normalizeTips extracts items array", () => {
    const items = [{ rideDbId: 1, tipCents: 500, paidAt: null }];
    expect(normalizeTips({ items, totalCount: 1 })).toEqual(items);
    expect(normalizeTips([])).toEqual([]);
  });

  it("normalizePayoutMethods extracts items or methods", () => {
    const methods = [{ type: "stripe_connect", label: "Stripe", status: "active" }];
    expect(normalizePayoutMethods({ items: methods })).toEqual(methods);
    expect(normalizePayoutMethods({ methods })).toEqual(methods);
  });
});

describe("earnings screen payout list safety", () => {
  it("never throws when mapping normalized payout history", () => {
    const shapes = [null, undefined, {}, { payouts: "not-array" }, { items: [] }];
    for (const shape of shapes) {
      const items = normalizePayoutHistory(shape);
      expect(Array.isArray(items)).toBe(true);
      expect(() => items.map((p) => p.id)).not.toThrow();
    }
  });
});
