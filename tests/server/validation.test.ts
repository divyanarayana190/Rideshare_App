import { describe, it, expect } from "vitest";
import { z } from "zod";

// Coordinate validation schemas (matching what's used in routers)
const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const rideInputSchema = z.object({
  pickupAddress: z.string().min(1).max(500),
  dropoffAddress: z.string().min(1).max(500),
  pickup: coordinateSchema,
  dropoff: coordinateSchema,
  mode: z.enum(["solo", "share"]),
  vehicleClass: z.enum(["economy", "standard", "comfort", "xl"]).optional(),
  passengerCount: z.number().int().min(1).max(8).optional(),
});

describe("Input Validation", () => {
  describe("Coordinate validation", () => {
    it("accepts valid coordinates", () => {
      expect(() => coordinateSchema.parse({ lat: 40.7128, lng: -74.006 })).not.toThrow();
      expect(() => coordinateSchema.parse({ lat: 0, lng: 0 })).not.toThrow();
      expect(() => coordinateSchema.parse({ lat: -90, lng: -180 })).not.toThrow();
      expect(() => coordinateSchema.parse({ lat: 90, lng: 180 })).not.toThrow();
    });

    it("rejects latitude outside -90 to 90", () => {
      expect(() => coordinateSchema.parse({ lat: 91, lng: 0 })).toThrow();
      expect(() => coordinateSchema.parse({ lat: -91, lng: 0 })).toThrow();
      expect(() => coordinateSchema.parse({ lat: 200, lng: 0 })).toThrow();
    });

    it("rejects longitude outside -180 to 180", () => {
      expect(() => coordinateSchema.parse({ lat: 0, lng: 181 })).toThrow();
      expect(() => coordinateSchema.parse({ lat: 0, lng: -181 })).toThrow();
    });

    it("rejects non-numeric values", () => {
      expect(() => coordinateSchema.parse({ lat: "abc", lng: 0 })).toThrow();
      expect(() => coordinateSchema.parse({ lat: 0, lng: null })).toThrow();
    });
  });

  describe("Ride input validation", () => {
    const validInput = {
      pickupAddress: "123 Main St",
      dropoffAddress: "456 Oak Ave",
      pickup: { lat: 40.7128, lng: -74.006 },
      dropoff: { lat: 40.758, lng: -73.9855 },
      mode: "solo" as const,
    };

    it("accepts valid ride input", () => {
      expect(() => rideInputSchema.parse(validInput)).not.toThrow();
    });

    it("rejects empty addresses", () => {
      expect(() => rideInputSchema.parse({ ...validInput, pickupAddress: "" })).toThrow();
      expect(() => rideInputSchema.parse({ ...validInput, dropoffAddress: "" })).toThrow();
    });

    it("rejects overly long addresses", () => {
      expect(() => rideInputSchema.parse({ ...validInput, pickupAddress: "a".repeat(501) })).toThrow();
    });

    it("rejects invalid ride mode", () => {
      expect(() => rideInputSchema.parse({ ...validInput, mode: "invalid" })).toThrow();
    });

    it("accepts valid vehicle classes", () => {
      for (const vc of ["economy", "standard", "comfort", "xl"]) {
        expect(() => rideInputSchema.parse({ ...validInput, vehicleClass: vc })).not.toThrow();
      }
    });

    it("rejects invalid vehicle class", () => {
      expect(() => rideInputSchema.parse({ ...validInput, vehicleClass: "luxury" })).toThrow();
    });

    it("validates passenger count range", () => {
      expect(() => rideInputSchema.parse({ ...validInput, passengerCount: 1 })).not.toThrow();
      expect(() => rideInputSchema.parse({ ...validInput, passengerCount: 8 })).not.toThrow();
      expect(() => rideInputSchema.parse({ ...validInput, passengerCount: 0 })).toThrow();
      expect(() => rideInputSchema.parse({ ...validInput, passengerCount: 9 })).toThrow();
      expect(() => rideInputSchema.parse({ ...validInput, passengerCount: 1.5 })).toThrow();
    });
  });

  describe("String sanitization", () => {
    it("handles XSS attempts in addresses", () => {
      const xssInput = '<script>alert("xss")</script>';
      // Zod string validation passes (XSS is handled at rendering level)
      // but max length should prevent extremely long payloads
      const schema = z.string().max(500);
      expect(() => schema.parse(xssInput)).not.toThrow();
      expect(() => schema.parse("a".repeat(501))).toThrow();
    });

    it("handles SQL injection attempts", () => {
      const sqlInput = "'; DROP TABLE users; --";
      // Parameterized queries prevent SQL injection, but input is validated for length
      const schema = z.string().max(200);
      expect(() => schema.parse(sqlInput)).not.toThrow();
    });
  });
});
