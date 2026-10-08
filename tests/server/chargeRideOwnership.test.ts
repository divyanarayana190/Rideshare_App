import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";

// Business logic extracted from the chargeRide procedure in server/routers.ts
// myPassenger = passengers.find(p => p.passengerId === userId)
// if (!myPassenger) throw TRPCError({ code: "FORBIDDEN" })
// fareCents = Math.round(Number(myPassenger.fareShare) * 100) + 150

function resolveChargeRide(
  passengers: Array<{ passengerId: number; fareShare: string | number }>,
  userId: number,
): { fareCents: number } {
  const myPassenger = passengers.find((p) => p.passengerId === userId);
  if (!myPassenger) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not a passenger on this ride." });
  }
  const fareCents = Math.round(Number(myPassenger.fareShare) * 100) + 150;
  return { fareCents };
}

describe("chargeRide ownership", () => {
  const passengers = [
    { passengerId: 1, fareShare: "12.50" },
    { passengerId: 2, fareShare: "8.00" },
  ];

  it("throws FORBIDDEN when user is not on the ride", () => {
    expect(() => resolveChargeRide(passengers, 99)).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("allows a legitimate passenger and calculates fareCents correctly", () => {
    const result = resolveChargeRide(passengers, 1);
    // Math.round(12.50 * 100) + 150 = 1250 + 150 = 1400
    expect(result.fareCents).toBe(1400);
  });

  it("adds the 150-cent platform fee to every fare", () => {
    const result = resolveChargeRide(passengers, 2);
    // Math.round(8.00 * 100) + 150 = 800 + 150 = 950
    expect(result.fareCents).toBe(950);
  });

  it("throws FORBIDDEN for an empty passenger list", () => {
    expect(() => resolveChargeRide([], 1)).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("rounds fractional fareShare correctly before adding platform fee", () => {
    const result = resolveChargeRide([{ passengerId: 5, fareShare: "7.555" }], 5);
    // Math.round(7.555 * 100) = Math.round(755.5) = 756; + 150 = 906
    expect(result.fareCents).toBe(906);
  });
});
