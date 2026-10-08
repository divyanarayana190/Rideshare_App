import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../server/db", () => ({
  getOnlineDriversNear: vi.fn(async () => [{ driverId: 1 }, { driverId: 2 }, { driverId: 3 }]),
  findMatchingSharedRides: vi.fn(async () => []),
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ count: 1 }]),
      })),
    })),
  },
}));

vi.mock("../../server/services/googleMaps", () => ({
  getRouteWithPolyline: vi.fn(async () => ({
    distanceKm: 20,
    durationMin: 28,
    polyline: "abc123",
  })),
}));

import { getRideOptionsForTrip } from "../../server/services/rideOptionsService";

describe("getRideOptionsForTrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns route and dynamic ride options", async () => {
    const result = await getRideOptionsForTrip({
      pickupLat: 40.7178,
      pickupLng: -74.0431,
      dropoffLat: 40.7128,
      dropoffLng: -74.006,
      pickupAddress: "Jersey City",
      dropoffAddress: "World Trade Center",
    });

    expect(result.route.distanceMiles).toBeGreaterThan(0);
    expect(result.route.durationMinutes).toBeGreaterThan(0);
    expect(result.options.length).toBeGreaterThanOrEqual(4);
    expect(result.pricingInsight.title).toBeTruthy();
    expect(result.options.some((o) => o.type === "solo")).toBe(true);
    expect(result.options.every((o) => o.fareCents > 0)).toBe(true);
  });

  it("marks share ride with comparison fare", async () => {
    const result = await getRideOptionsForTrip({
      pickupLat: 40.7178,
      pickupLng: -74.0431,
      dropoffLat: 40.7128,
      dropoffLng: -74.006,
    });
    const share = result.options.find((o) => o.type === "share");
    expect(share).toBeDefined();
    expect(share!.comparisonFareCents).toBeGreaterThan(share!.fareCents);
  });
});
