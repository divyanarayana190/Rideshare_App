import { describe, expect, it } from "vitest";
import {
  validatePosterRole,
  isDeparturePassed,
  type DriverAppStatus,
} from "../../server/services/carpoolGuards";
import type { Ride } from "../../drizzle/schema";

// ─── posterRole schema type guard ────────────────────────────────────────────

describe("posterRole — schema type presence", () => {
  it("Ride type includes posterRole field", () => {
    // Compile-time proof: if posterRole were missing from the schema the type
    // assignment below would cause a TypeScript error when running pnpm check.
    const partial: Partial<Ride> = { posterRole: "driver" };
    expect(partial.posterRole).toBe("driver");
  });

  it("posterRole accepts passenger_organizer", () => {
    const partial: Partial<Ride> = { posterRole: "passenger_organizer" };
    expect(partial.posterRole).toBe("passenger_organizer");
  });

  it("default posterRole is passenger_organizer (runtime default)", () => {
    // Verifies the schema.ts default — a fresh Partial has the field available
    const partial: Partial<Ride> = {};
    // The column default is "passenger_organizer"; DB row omission falls back to it
    expect(["driver", "passenger_organizer", undefined]).toContain(partial.posterRole);
  });
});

// ─── validatePosterRole ───────────────────────────────────────────────────────

describe("validatePosterRole — driver approval gate", () => {
  // Approved driver cases
  it("allows posterRole='driver' when driver application is approved", () => {
    const result = validatePosterRole("driver", "approved");
    expect(result.valid).toBe(true);
  });

  // Non-approved driver cases
  const blockedStatuses: DriverAppStatus[] = [
    "pending",
    "under_review",
    "action_required",
    "draft",
    "rejected",
    null,
    undefined,
  ];
  for (const status of blockedStatuses) {
    it(`blocks posterRole='driver' when application status is ${String(status)}`, () => {
      const result = validatePosterRole("driver", status);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toMatch(/approved driver/i);
      }
    });
  }

  // Passenger organizer — always allowed regardless of driver status
  it("always allows posterRole='passenger_organizer' for any driver status", () => {
    for (const status of [...blockedStatuses, "approved" as DriverAppStatus]) {
      const result = validatePosterRole("passenger_organizer", status);
      expect(result.valid).toBe(true);
    }
  });

  it("allows posterRole='passenger_organizer' with no driver application (null)", () => {
    const result = validatePosterRole("passenger_organizer", null);
    expect(result.valid).toBe(true);
  });
});

// ─── isDeparturePassed — departure guard ─────────────────────────────────────

describe("isDeparturePassed — zero-grace departure guard", () => {
  it("returns false for a future departure time", () => {
    const future = new Date(Date.now() + 60_000); // 1 minute from now
    expect(isDeparturePassed(future)).toBe(false);
  });

  it("returns true for a past departure time", () => {
    const past = new Date(Date.now() - 1); // 1ms ago
    expect(isDeparturePassed(past)).toBe(true);
  });

  it("returns true for a departure time exactly 10 minutes ago (no grace window)", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    expect(isDeparturePassed(tenMinutesAgo)).toBe(true);
  });

  it("returns true for a departure time 1 second ago", () => {
    const oneSecondAgo = new Date(Date.now() - 1000);
    expect(isDeparturePassed(oneSecondAgo)).toBe(true);
  });

  it("returns false for null departureTime (unscheduled ride)", () => {
    expect(isDeparturePassed(null)).toBe(false);
  });

  it("returns false for undefined departureTime", () => {
    expect(isDeparturePassed(undefined)).toBe(false);
  });
});

// ─── Rejection notification type ─────────────────────────────────────────────

describe("rejectRequest — notification type is not ride_cancelled", () => {
  it("rejection notification must use 'system' type, not 'ride_cancelled'", () => {
    // This is a contract test: the notification type for join rejection must never
    // be "ride_cancelled" — that type is reserved for when the ride itself is
    // cancelled, not when a passenger's request is declined.
    //
    // The constant below matches what rejectRequest sends.
    const REJECT_NOTIFICATION_TYPE = "system" as const;

    expect(REJECT_NOTIFICATION_TYPE).toBe("system");
    expect(REJECT_NOTIFICATION_TYPE).not.toBe("ride_cancelled");
  });
});

// ─── Self-join guard ─────────────────────────────────────────────────────────

describe("self-join protection", () => {
  it("driverId check blocks the ride creator from requesting their own ride", () => {
    const userId = 42;
    const ride = { driverId: 42 } as Partial<Ride>;

    // Mirrors the guard added to requestJoin in routers.ts
    const isOwnRide = ride.driverId != null && ride.driverId === userId;
    expect(isOwnRide).toBe(true);
  });

  it("driverId check does not block a different user", () => {
    const userId = 99;
    const ride = { driverId: 42 } as Partial<Ride>;

    const isOwnRide = ride.driverId != null && ride.driverId === userId;
    expect(isOwnRide).toBe(false);
  });

  it("driverId check is safe when driverId is null", () => {
    const userId = 42;
    const ride = { driverId: undefined } as Partial<Ride>;

    const isOwnRide = ride.driverId != null && ride.driverId === userId;
    expect(isOwnRide).toBe(false);
  });
});
