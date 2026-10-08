import { describe, it, expect } from "vitest";
import { calculateFareSplit, estimateFare, estimateTime } from "../lib/mock-data";
import type { Passenger } from "../lib/types";

// Helper to create a minimal passenger for tests
function makePassenger(id: string, distanceKm: number, fareShare = 0): Passenger {
  return {
    id,
    name: `Passenger ${id}`,
    avatar: id.toUpperCase(),
    rating: 4.8,
    pickup: { address: "Pickup", lat: 40.758, lng: -73.985, shortName: "Pickup" },
    dropoff: { address: "Dropoff", lat: 40.718, lng: -74.043, shortName: "Dropoff" },
    fareShare,
    distanceKm,
  };
}

describe("calculateFareSplit", () => {
  it("splits fare proportionally by distance", () => {
    const passengers = [
      makePassenger("a", 10),
      makePassenger("b", 20),
    ];
    const splits = calculateFareSplit(passengers);
    expect(splits).toHaveLength(2);
    // Passenger b travels twice as far, so should pay roughly twice as much
    expect(splits[1]).toBeGreaterThan(splits[0]);
    expect(splits[1] / splits[0]).toBeCloseTo(2, 0);
  });

  it("returns equal splits when all passengers travel the same distance", () => {
    const passengers = [
      makePassenger("a", 15),
      makePassenger("b", 15),
      makePassenger("c", 15),
    ];
    const splits = calculateFareSplit(passengers);
    expect(splits[0]).toBeCloseTo(splits[1], 1);
    expect(splits[1]).toBeCloseTo(splits[2], 1);
  });

  it("handles single passenger (no split)", () => {
    const passengers = [makePassenger("a", 20)];
    const splits = calculateFareSplit(passengers);
    expect(splits).toHaveLength(1);
    expect(splits[0]).toBeGreaterThan(0);
  });

  it("all fare shares are positive", () => {
    const passengers = [
      makePassenger("a", 5),
      makePassenger("b", 30),
      makePassenger("c", 12),
    ];
    const splits = calculateFareSplit(passengers);
    splits.forEach((s) => expect(s).toBeGreaterThan(0));
  });
});

describe("estimateFare", () => {
  it("returns a positive fare for any distance", () => {
    expect(estimateFare(10, "share")).toBeGreaterThan(0);
    expect(estimateFare(10, "solo")).toBeGreaterThan(0);
  });

  it("shared fare is less than solo fare for same distance", () => {
    const shared = estimateFare(20, "share");
    const solo = estimateFare(20, "solo");
    expect(shared).toBeLessThan(solo);
  });

  it("longer distance costs more", () => {
    const short = estimateFare(5, "solo");
    const long = estimateFare(50, "solo");
    expect(long).toBeGreaterThan(short);
  });

  it("returns a number rounded to 2 decimal places", () => {
    const fare = estimateFare(15, "share");
    expect(Number(fare.toFixed(2))).toBe(fare);
  });
});

describe("estimateTime", () => {
  it("returns a positive integer for any distance", () => {
    expect(estimateTime(10)).toBeGreaterThan(0);
    expect(Number.isInteger(estimateTime(10))).toBe(true);
  });

  it("longer distance takes more time", () => {
    expect(estimateTime(50)).toBeGreaterThan(estimateTime(5));
  });
});
