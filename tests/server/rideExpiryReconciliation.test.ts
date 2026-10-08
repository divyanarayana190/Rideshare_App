import { describe, expect, it } from "vitest";
import {
  DRIVER_NO_SHOW_GRACE_MIN,
  getExpiredMissedReason,
  ON_DEMAND_SEARCH_TIMEOUT_MS,
} from "@/server/services/rideExpiryReconciliation";
import type { Ride } from "@/drizzle/schema";

function baseRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 1,
    rideId: "ride_test",
    driverId: 0,
    mode: "share",
    status: "searching",
    rideStep: "finding_driver",
    pickupLat: "0",
    pickupLng: "0",
    pickupAddress: "A",
    dropoffLat: "0",
    dropoffLng: "0",
    dropoffAddress: "B",
    distanceKm: "5",
    estimatedMinutes: 20,
    totalFare: "20",
    surgeMultiplier: "1",
    fareBreakdown: null,
    safetyMode: "none",
    stripePaymentIntentId: null,
    departureTime: null,
    pricePerSeat: "20",
    totalSeats: 3,
    availableSeats: 3,
    originalFare: null,
    approvalRequired: false,
    arrivalTargetPassengerId: null,
    carpoolTitle: null,
    recurringRideId: null,
    routePolyline: null,
    createdAt: new Date("2026-06-09T10:00:00Z"),
    driverAssignedAt: null,
    driverArrivedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    ...overrides,
  } as Ride;
}

describe("getExpiredMissedReason", () => {
  const now = new Date("2026-06-09T12:00:00Z");

  it("returns NO_DRIVER_FOUND when scheduled departure passed while searching", () => {
    const reason = getExpiredMissedReason(
      baseRide({ departureTime: new Date("2026-06-09T11:00:00Z") }),
      now,
    );
    expect(reason).toBe("NO_DRIVER_FOUND");
  });

  it("returns NO_DRIVER_FOUND for on-demand search older than 2 hours", () => {
    const reason = getExpiredMissedReason(
      baseRide({ createdAt: new Date(now.getTime() - ON_DEMAND_SEARCH_TIMEOUT_MS - 60_000) }),
      now,
    );
    expect(reason).toBe("NO_DRIVER_FOUND");
  });

  it("returns DRIVER_NO_SHOW when accepted ride not started after grace", () => {
    const dep = new Date(now.getTime() - (DRIVER_NO_SHOW_GRACE_MIN + 5) * 60_000);
    const reason = getExpiredMissedReason(
      baseRide({
        status: "matched",
        rideStep: "driver_en_route",
        driverId: 42,
        departureTime: dep,
        startedAt: null,
      }),
      now,
    );
    expect(reason).toBe("DRIVER_NO_SHOW");
  });

  it("returns null for future scheduled searching ride", () => {
    const reason = getExpiredMissedReason(
      baseRide({ departureTime: new Date("2026-06-09T14:00:00Z") }),
      now,
    );
    expect(reason).toBeNull();
  });

  it("returns null for already missed rides", () => {
    const reason = getExpiredMissedReason(
      baseRide({ status: "missed", cancelReason: "NO_DRIVER_FOUND" }),
      now,
    );
    expect(reason).toBeNull();
  });
});
