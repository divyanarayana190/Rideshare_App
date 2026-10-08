import { describe, expect, it } from "vitest";
import { getStripeDiagnostics } from "../../server/services/stripeDiagnosticsService";
import { resolveNotificationHref } from "../../lib/notification-routing";

describe("stripeDiagnosticsService", () => {
  it("returns diagnostics without secret values", () => {
    const d = getStripeDiagnostics();
    expect(d).toHaveProperty("publishableKeyConfigured");
    expect(d).toHaveProperty("secretKeyConfigured");
    expect(d).toHaveProperty("webhookConfigured");
    expect(JSON.stringify(d)).not.toMatch(/sk_live|sk_test_[a-zA-Z0-9]{10,}/);
  });
});

describe("resolveNotificationHref", () => {
  it("routes driver ride_request to requests tab", () => {
    const href = resolveNotificationHref({ type: "ride_request" }, true);
    expect(href).toBe("/driver/(tabs)/requests");
  });

  it("routes passenger ride_request to requests tab", () => {
    const href = resolveNotificationHref({ type: "ride_request" }, false);
    expect(href).toBe("/(tabs)/requests");
  });

  it("routes ride_completed to rating screen", () => {
    const href = resolveNotificationHref({ type: "ride_completed", data: { rideId: "ride_1" } }, false);
    expect(href).toEqual({ pathname: "/rate-ride-v2", params: { rideId: "ride_1" } });
  });

  it("routes payment_received for driver to earnings", () => {
    const href = resolveNotificationHref({ type: "payment_received", data: { tipCents: 500 } }, true);
    expect(href).toBe("/driver/(tabs)/earnings");
  });
});
