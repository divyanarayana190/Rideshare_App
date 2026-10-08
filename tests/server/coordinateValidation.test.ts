import { describe, expect, it } from "vitest";
import { z } from "zod";

// Schema mirrors coordinate inputs used in tRPC procedures throughout routers.ts
const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

describe("coordinate input validation", () => {
  it("accepts a valid coordinate pair", () => {
    const result = coordinateSchema.safeParse({ lat: 40.7128, lng: -74.006 });
    expect(result.success).toBe(true);
  });

  it("rejects latitude above 90", () => {
    const result = coordinateSchema.safeParse({ lat: 200, lng: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects longitude below -180", () => {
    const result = coordinateSchema.safeParse({ lat: 0, lng: -999 });
    expect(result.success).toBe(false);
  });

  it("rejects both invalid lat and lng simultaneously", () => {
    const result = coordinateSchema.safeParse({ lat: 200, lng: -999 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("accepts boundary values: lat=90, lng=180", () => {
    const result = coordinateSchema.safeParse({ lat: 90, lng: 180 });
    expect(result.success).toBe(true);
  });

  it("accepts boundary values: lat=-90, lng=-180", () => {
    const result = coordinateSchema.safeParse({ lat: -90, lng: -180 });
    expect(result.success).toBe(true);
  });

  it("rejects non-numeric coordinates", () => {
    const result = coordinateSchema.safeParse({ lat: "north", lng: "east" });
    expect(result.success).toBe(false);
  });
});
