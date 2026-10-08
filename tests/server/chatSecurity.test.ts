import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertCanAccessRide,
  isRideParticipantFromLists,
} from "../../server/services/rideAccessService";

vi.mock("../../server/db", () => ({
  getRidePassengers: vi.fn(async (rideId: number) => {
    // Ride 10: passenger 42 is aboard
    if (rideId === 10) return [{ passengerId: 42 }];
    // Ride 20: no passengers (driver-only at pickup)
    return [];
  }),
}));

describe("chat security — ride access enforcement", () => {
  describe("non-participant cannot send or receive chat", () => {
    it("rejects a stranger on an active ride", async () => {
      const ride = { id: 10, driverId: 7 };
      await expect(assertCanAccessRide(ride, 99, "user")).rejects.toThrow(TRPCError);
    });

    it("rejects a stranger even when the ride has no passengers yet", async () => {
      const ride = { id: 20, driverId: 7 };
      await expect(assertCanAccessRide(ride, 55, "user")).rejects.toThrow(TRPCError);
    });
  });

  describe("ride participant can access chat", () => {
    it("allows the assigned driver", async () => {
      const ride = { id: 10, driverId: 7 };
      await expect(assertCanAccessRide(ride, 7, "user")).resolves.toBeUndefined();
    });

    it("allows a listed passenger", async () => {
      const ride = { id: 10, driverId: 7 };
      await expect(assertCanAccessRide(ride, 42, "user")).resolves.toBeUndefined();
    });
  });

  describe("admin can access any ride chat", () => {
    it("admin bypasses participant check on active ride", async () => {
      const ride = { id: 10, driverId: 7 };
      await expect(assertCanAccessRide(ride, 999, "admin")).resolves.toBeUndefined();
    });

    it("admin bypasses participant check on a ride they are not part of", async () => {
      const ride = { id: 20, driverId: 7 };
      await expect(assertCanAccessRide(ride, 1, "admin")).resolves.toBeUndefined();
    });
  });

  describe("pure membership helper with different ride states", () => {
    it("correctly identifies driver on a ride_in_progress ride", () => {
      const ride = { id: 30, driverId: 5 };
      expect(isRideParticipantFromLists(ride, 5, [])).toBe(true);
    });

    it("rejects user who was never on the ride", () => {
      const ride = { id: 30, driverId: 5 };
      expect(isRideParticipantFromLists(ride, 8, [1, 2, 3])).toBe(false);
    });
  });
});
