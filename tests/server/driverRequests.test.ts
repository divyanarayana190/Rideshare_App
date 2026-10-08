import { describe, expect, it, vi, beforeEach } from "vitest";

const mockDbUpdate = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
const mockDb = {
  update: vi.fn(() => ({ set: mockDbUpdate })),
};

vi.mock("../../server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/db")>();
  return {
    ...actual,
    db: mockDb,
    updateRideRequest: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../server/services/driverRequestActions", () => ({
  acceptPassengerBroadcastRequest: vi.fn().mockResolvedValue({ rideId: "ride_broadcast_1" }),
}));

vi.mock("../../server/services/driverMatcher", () => ({
  dispatchQueue: { declineRide: vi.fn() },
}));

describe("driverRequestsService unified actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acceptDriverRequestUnified returns normalized broadcast response", async () => {
    const { acceptDriverRequestUnified } = await import("../../server/services/driverRequestsService");
    const result = await acceptDriverRequestUnified(1, "req_broadcast_1", "broadcast");
    expect(result).toEqual({
      success: true,
      rideId: "ride_broadcast_1",
      requestId: "req_broadcast_1",
      status: "accepted",
      message: "Ride accepted — head to pickup",
    });
  });

  it("rejectDriverRequestUnified returns normalized broadcast response", async () => {
    const { rejectDriverRequestUnified } = await import("../../server/services/driverRequestsService");
    const result = await rejectDriverRequestUnified(1, "req_broadcast_2", "broadcast", "Too far");
    expect(result.success).toBe(true);
    expect(result.requestId).toBe("req_broadcast_2");
    expect(result.status).toBe("rejected");
    expect(result.message).toBe("Too far");
  });

  it("rejectDriverRequestUnified returns normalized dispatch response", async () => {
    const { rejectDriverRequestUnified } = await import("../../server/services/driverRequestsService");
    const { dispatchQueue } = await import("../../server/services/driverMatcher");
    const result = await rejectDriverRequestUnified(1, "ride_dispatch_1", "dispatch");
    expect(dispatchQueue.declineRide).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({
      success: true,
      rideId: "ride_dispatch_1",
      requestId: "ride_dispatch_1",
      status: "rejected",
    });
  });
});

describe("schemaHealth", () => {
  it("checkDriverSchemaHealth returns ok=false when tables missing", async () => {
    const { checkDriverSchemaHealth } = await import("../../server/services/schemaHealth");
    const result = await checkDriverSchemaHealth();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("missingTables");
    expect(Array.isArray(result.missingTables)).toBe(true);
  });
});
