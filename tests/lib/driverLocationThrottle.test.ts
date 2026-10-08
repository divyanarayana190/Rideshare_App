import { describe, expect, it } from "vitest";
import {
  DRIVER_LOCATION_MIN_DISTANCE_M,
  DRIVER_LOCATION_MIN_INTERVAL_MS,
  shouldSendLocationUpdate,
} from "../../lib/driver-location-throttle";

describe("driver location throttle", () => {
  const base = { lat: 37.7749, lng: -122.4194, ts: 1_000_000 };

  it("sends first update when no prior snapshot", () => {
    expect(shouldSendLocationUpdate(null, 37.775, -122.419, base.ts + 1000)).toBe(true);
  });

  it("blocks update when within distance and interval", () => {
    const now = base.ts + 5_000;
    expect(
      shouldSendLocationUpdate(base, base.lat + 0.0001, base.lng, now),
    ).toBe(false);
  });

  it("allows update after min interval even without movement", () => {
    const now = base.ts + DRIVER_LOCATION_MIN_INTERVAL_MS;
    expect(shouldSendLocationUpdate(base, base.lat, base.lng, now)).toBe(true);
  });

  it("allows update when moved beyond min distance before interval", () => {
    const now = base.ts + 1_000;
    const farLat = base.lat + DRIVER_LOCATION_MIN_DISTANCE_M / 111_000;
    expect(shouldSendLocationUpdate(base, farLat, base.lng, now)).toBe(true);
  });
});

describe("updateLocation throttle prevents repeated calls", () => {
  it("simulates polling: only sends when shouldSendLocationUpdate is true", () => {
    let last: { lat: number; lng: number; ts: number } | null = null;
    let sendCount = 0;
    const coords = [
      { lat: 37.7749, lng: -122.4194, ts: 0 },
      { lat: 37.7749, lng: -122.4194, ts: 5_000 },
      { lat: 37.7749, lng: -122.4194, ts: 10_000 },
      { lat: 37.7749, lng: -122.4194, ts: 16_000 },
    ];

    for (const c of coords) {
      if (shouldSendLocationUpdate(last, c.lat, c.lng, c.ts)) {
        sendCount++;
        last = { lat: c.lat, lng: c.lng, ts: c.ts };
      }
    }

    expect(sendCount).toBe(2);
  });
});
