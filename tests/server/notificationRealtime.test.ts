import { describe, expect, it } from "vitest";
import { notificationBus, pushRideStatusUpdate } from "../../server/services/notificationService";

function parseLastSse(userId: number, fn: () => void): Record<string, unknown> {
  let captured = "";
  notificationBus.registerSseClient(userId, (data) => { captured = data; });
  fn();
  const json = captured.replace(/^data:\s*/, "").trim();
  return JSON.parse(json) as Record<string, unknown>;
}

describe("pushRideStatusUpdate", () => {
  it("emits location_update SSE event (not ride_update wrapper)", () => {
    const payload = parseLastSse(42, () => {
      pushRideStatusUpdate("ride_abc", "location_update", [42], {
        driverId: 7,
        driverLat: 40.7128,
        driverLng: -74.006,
      });
    });
    expect(payload.type).toBe("location_update");
    expect(payload.driverId).toBe(7);
    expect(payload.lat).toBe(40.7128);
    expect(payload.lng).toBe(-74.006);
    expect(payload.rideId).toBe("ride_abc");
  });

  it("emits ride_update for non-location steps", () => {
    const payload = parseLastSse(99, () => {
      pushRideStatusUpdate("ride_xyz", "driver_arrived", [99], { driverId: 3 });
    });
    expect(payload.type).toBe("ride_update");
    expect(payload.step).toBe("driver_arrived");
    expect(payload.rideId).toBe("ride_xyz");
  });
});
