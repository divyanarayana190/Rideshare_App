import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertCanAccessRide,
  isRideParticipantFromLists,
} from "../../server/services/rideAccessService";

vi.mock("../../server/db", () => ({
  getRidePassengers: vi.fn(async () => [{ passengerId: 20 }]),
}));

describe("isRideParticipantFromLists", () => {
  const ride = { id: 1, driverId: 10 };

  it("allows assigned driver", () => {
    expect(isRideParticipantFromLists(ride, 10, [20, 30])).toBe(true);
  });

  it("allows listed passenger", () => {
    expect(isRideParticipantFromLists(ride, 20, [20, 30])).toBe(true);
  });

  it("denies non-participant", () => {
    expect(isRideParticipantFromLists(ride, 99, [20, 30])).toBe(false);
  });

  it("ignores sentinel driverId 0", () => {
    expect(isRideParticipantFromLists({ id: 1, driverId: 0 }, 10, [20])).toBe(false);
    expect(isRideParticipantFromLists({ id: 1, driverId: 0 }, 20, [20])).toBe(true);
  });
});

describe("assertCanAccessRide", () => {
  const ride = { id: 1, driverId: 10 };

  it("allows admin without participant check", async () => {
    await expect(assertCanAccessRide(ride, 99, "admin")).resolves.toBeUndefined();
  });

  it("denies non-participant non-admin", async () => {
    await expect(assertCanAccessRide(ride, 99, "user")).rejects.toThrow(TRPCError);
  });

  it("allows driver participant", async () => {
    await expect(assertCanAccessRide(ride, 10, "user")).resolves.toBeUndefined();
  });
});
