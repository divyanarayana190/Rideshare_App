import { describe, it, expect } from "vitest";
import {
  isSafetyCompatible,
  scoreCarpool,
  type CarpoolRideRow,
  type CarpoolSearchInput,
} from "../../server/services/carpoolMatcher";

// ─── isSafetyCompatible unit tests ───────────────────────────────────────────

describe("isSafetyCompatible", () => {
  describe('mode = "none"', () => {
    it("allows any gender combination", () => {
      expect(isSafetyCompatible("none", "male", "male")).toBe(true);
      expect(isSafetyCompatible("none", "female", "male")).toBe(true);
      expect(isSafetyCompatible("none", null, null)).toBe(true);
      expect(isSafetyCompatible(null, "male", "male")).toBe(true);
    });
  });

  describe('mode = "women_drivers_only"', () => {
    it("allows female driver regardless of passenger gender", () => {
      expect(isSafetyCompatible("women_drivers_only", "female", "female")).toBe(true);
      expect(isSafetyCompatible("women_drivers_only", "male", "female")).toBe(true);
      expect(isSafetyCompatible("women_drivers_only", null, "female")).toBe(true);
    });

    it("blocks male driver", () => {
      expect(isSafetyCompatible("women_drivers_only", "female", "male")).toBe(false);
      expect(isSafetyCompatible("women_drivers_only", null, "male")).toBe(false);
      expect(isSafetyCompatible("women_drivers_only", "male", null)).toBe(false);
    });
  });

  describe('mode = "women_companions_only"', () => {
    it("allows female passenger regardless of driver gender", () => {
      expect(isSafetyCompatible("women_companions_only", "female", "female")).toBe(true);
      expect(isSafetyCompatible("women_companions_only", "female", "male")).toBe(true);
      expect(isSafetyCompatible("women_companions_only", "female", null)).toBe(true);
    });

    it("blocks male or unknown passenger", () => {
      expect(isSafetyCompatible("women_companions_only", "male", "female")).toBe(false);
      expect(isSafetyCompatible("women_companions_only", null, "female")).toBe(false);
      expect(isSafetyCompatible("women_companions_only", "non_binary", "female")).toBe(false);
    });
  });

  describe('mode = "women_only"', () => {
    it("allows female passenger + female driver only", () => {
      expect(isSafetyCompatible("women_only", "female", "female")).toBe(true);
    });

    it("blocks male passenger even with female driver", () => {
      expect(isSafetyCompatible("women_only", "male", "female")).toBe(false);
    });

    it("blocks male driver even with female passenger", () => {
      expect(isSafetyCompatible("women_only", "female", "male")).toBe(false);
    });

    it("blocks both genders being unknown", () => {
      expect(isSafetyCompatible("women_only", null, null)).toBe(false);
    });
  });
});

// ─── scoreCarpool integration tests ──────────────────────────────────────────

/** Minimal CarpoolRideRow fixture — all required fields present */
function makeRide(overrides: Partial<CarpoolRideRow> = {}): CarpoolRideRow {
  return {
    id: 1,
    rideId: "ride_test_001",
    driverId: 42,
    mode: "carpool",
    status: "searching",
    pickupLat: "37.7749",
    pickupLng: "-122.4194",
    pickupAddress: "SF Pickup",
    dropoffLat: "37.3382",
    dropoffLng: "-121.8863",
    dropoffAddress: "SJ Dropoff",
    distanceKm: "80",
    estimatedMinutes: 60,
    totalFare: "20",
    pricePerSeat: "8",
    totalSeats: 3,
    departureTime: null,
    safetyMode: "none",
    approvalRequired: false,
    carpoolTitle: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Minimal CarpoolSearchInput for a requester near SF → SJ */
function makeInput(overrides: Partial<CarpoolSearchInput> = {}): CarpoolSearchInput {
  return {
    pickupLat: 37.775,
    pickupLng: -122.419,
    dropoffLat: 37.338,
    dropoffLng: -121.886,
    passengerGender: "female",
    safetyMode: "none",
    ...overrides,
  };
}

describe("scoreCarpool — safety gate", () => {
  it("scores a ride with no safety mode for any requester", () => {
    const ride = makeRide({ safetyMode: "none" });
    const result = scoreCarpool(ride, makeInput({ passengerGender: "male" }));
    expect(result).not.toBeNull();
  });

  describe("women_drivers_only ride", () => {
    it("allows female passenger when driver is female", () => {
      const ride = makeRide({ safetyMode: "women_drivers_only" });
      const result = scoreCarpool(ride, makeInput({ passengerGender: "female" }), "female");
      expect(result).not.toBeNull();
    });

    it("blocks any passenger when driver is male", () => {
      const ride = makeRide({ safetyMode: "women_drivers_only" });
      const result = scoreCarpool(ride, makeInput({ passengerGender: "female" }), "male");
      expect(result).toBeNull();
    });

    it("allows male passenger when driver is female (women_drivers_only only gates on driver)", () => {
      const ride = makeRide({ safetyMode: "women_drivers_only" });
      const result = scoreCarpool(ride, makeInput({ passengerGender: "male" }), "female");
      expect(result).not.toBeNull();
    });
  });

  describe("women_companions_only ride", () => {
    it("allows female passenger", () => {
      const ride = makeRide({ safetyMode: "women_companions_only" });
      const result = scoreCarpool(ride, makeInput({ passengerGender: "female" }), "male");
      expect(result).not.toBeNull();
    });

    it("blocks male passenger", () => {
      const ride = makeRide({ safetyMode: "women_companions_only" });
      const result = scoreCarpool(ride, makeInput({ passengerGender: "male" }), "female");
      expect(result).toBeNull();
    });

    it("blocks passenger with unknown gender", () => {
      const ride = makeRide({ safetyMode: "women_companions_only" });
      const result = scoreCarpool(ride, makeInput({ passengerGender: null }), "female");
      expect(result).toBeNull();
    });
  });

  describe("women_only ride", () => {
    it("allows female passenger + female driver", () => {
      const ride = makeRide({ safetyMode: "women_only" });
      const result = scoreCarpool(ride, makeInput({ passengerGender: "female" }), "female");
      expect(result).not.toBeNull();
    });

    it("blocks male passenger even with female driver", () => {
      const ride = makeRide({ safetyMode: "women_only" });
      const result = scoreCarpool(ride, makeInput({ passengerGender: "male" }), "female");
      expect(result).toBeNull();
    });

    it("blocks female passenger with male driver", () => {
      const ride = makeRide({ safetyMode: "women_only" });
      const result = scoreCarpool(ride, makeInput({ passengerGender: "female" }), "male");
      expect(result).toBeNull();
    });
  });

  it("previously broken bug: safetyMode filter tab must NOT be passed as passengerGender", () => {
    // Old bug: scoreCarpool was called with input.safetyMode as passengerGender arg.
    // e.g., input.safetyMode = "women_drivers_only", passengerGender = undefined
    // This would cause isSafetyCompatible("women_companions_only", "women_drivers_only", driverGender)
    // → passengerGender !== "female" → blocked (false negative).
    const ride = makeRide({ safetyMode: "women_companions_only" });
    // Correct: passengerGender = "female" should pass
    const correctResult = scoreCarpool(
      ride,
      makeInput({ passengerGender: "female", safetyMode: "women_companions_only" }),
      "female",
    );
    expect(correctResult).not.toBeNull(); // was incorrectly null before the fix
  });
});
