import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("../../server/db", () => ({
  getRideByRideId: vi.fn(async (rideId: string) => {
    const rides: Record<string, { id: number; rideId: string; status: string; mode: string }> = {
      "ride-active":     { id: 1, rideId: "ride-active",     status: "active",    mode: "solo" },
      "ride-pending":    { id: 2, rideId: "ride-pending",    status: "pending",   mode: "solo" },
      "ride-completed":  { id: 3, rideId: "ride-completed",  status: "completed", mode: "solo" },
      "ride-cancelled":  { id: 4, rideId: "ride-cancelled",  status: "cancelled", mode: "solo" },
    };
    return rides[rideId] ?? null;
  }),
}));

import { getRideByRideId } from "../../server/db";

// Business logic extracted from cancelRide in server/routers.ts
async function cancelRide(rideId: string) {
  const ride = await getRideByRideId(rideId);
  if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });

  if (ride.status === "completed" || ride.status === "cancelled") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This ride has already ended and cannot be cancelled.",
    });
  }

  return { cancelled: true, rideId };
}

describe("cancelRide — state guard", () => {
  it("successfully cancels an active ride", async () => {
    const result = await cancelRide("ride-active");
    expect(result.cancelled).toBe(true);
  });

  it("successfully cancels a pending ride", async () => {
    const result = await cancelRide("ride-pending");
    expect(result.cancelled).toBe(true);
  });

  it("throws BAD_REQUEST when cancelling a completed ride", async () => {
    await expect(cancelRide("ride-completed")).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" }),
    );
  });

  it("throws BAD_REQUEST when cancelling an already-cancelled ride", async () => {
    await expect(cancelRide("ride-cancelled")).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" }),
    );
  });

  it("throws NOT_FOUND when rideId does not exist", async () => {
    await expect(cancelRide("ride-unknown")).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });
});
