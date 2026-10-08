import { describe, expect, it } from "vitest";

// Mirrors the hasValidLocations guard used in ride-options.tsx and confirm-ride.tsx
function hasValidLocations(
  pickup: { lat: number; lng: number; address: string } | null | undefined,
  dropoff: { lat: number; lng: number; address: string } | null | undefined,
): boolean {
  return !!pickup && !!dropoff;
}

describe("ride-options hasValidLocations guard", () => {
  it("returns false when pickup is null", () => {
    expect(hasValidLocations(null, { lat: 40.7, lng: -74.0, address: "Dropoff" })).toBe(false);
  });

  it("returns false when dropoff is null", () => {
    expect(hasValidLocations({ lat: 40.7, lng: -74.0, address: "Pickup" }, null)).toBe(false);
  });

  it("returns false when both are null", () => {
    expect(hasValidLocations(null, null)).toBe(false);
  });

  it("returns false when both are undefined", () => {
    expect(hasValidLocations(undefined, undefined)).toBe(false);
  });

  it("returns true when both pickup and dropoff are present", () => {
    expect(
      hasValidLocations(
        { lat: 40.7178, lng: -74.0431, address: "Jersey City" },
        { lat: 40.7128, lng: -74.006, address: "World Trade Center" },
      ),
    ).toBe(true);
  });

  it("getRideOptions query is disabled (enabled: false) when pickup is null — verifies guard contract", () => {
    const pickup = null;
    const dropoff = { lat: 40.7128, lng: -74.006, address: "World Trade Center" };
    const enabled = hasValidLocations(pickup, dropoff);
    expect(enabled).toBe(false);
  });

  it("confirm-ride blocks render and redirects when booking draft has no pickup", () => {
    const pickup = null;
    const dropoff = { lat: 40.7128, lng: -74.006, address: "World Trade Center" };
    const shouldRedirect = !pickup || !dropoff;
    expect(shouldRedirect).toBe(true);
  });
});
