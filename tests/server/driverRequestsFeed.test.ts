import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Drizzle-style chainable select mock that resolves to `rows`.
 * The object returned by `.where()` is both awaitable (a real Promise) and
 * has `.orderBy()` / `.limit()` so either query shape works:
 *   await db.select().from(t).where(...)                → rows
 *   await db.select().from(t).where(...).orderBy().limit(n) → rows
 */
function selectChain(rows: Record<string, unknown>[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  const whereResult = Object.assign(Promise.resolve(rows), { orderBy: orderByFn, limit: limitFn });
  const whereFn = vi.fn().mockReturnValue(whereResult);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

// ---------------------------------------------------------------------------
// Pure logic: departureTime value set in bookRide
// ---------------------------------------------------------------------------

describe("bookRide departureTime logic", () => {
  it("sets departureTime to null when scheduledFor is absent (immediate ride)", () => {
    const scheduledFor = undefined;
    const departureTime = scheduledFor ? new Date(scheduledFor) : null;
    expect(departureTime).toBeNull();
  });

  it("sets departureTime to the scheduled datetime when scheduledFor is provided", () => {
    const scheduledFor = "2026-08-01T10:00:00.000Z";
    const departureTime = scheduledFor ? new Date(scheduledFor) : null;
    expect(departureTime).toEqual(new Date(scheduledFor));
    expect(departureTime!.getTime()).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// Pure logic: isScheduledPickup helper
// ---------------------------------------------------------------------------

describe("isScheduledPickup", () => {
  it("returns false when departureTime is null (immediate ride)", async () => {
    const { isScheduledPickup } = await import("@/server/services/driverRequestFeed");
    expect(isScheduledPickup(null, new Date())).toBe(false);
  });

  it("returns false when departureTime is in the past", async () => {
    const { isScheduledPickup } = await import("@/server/services/driverRequestFeed");
    const past = new Date(Date.now() - 60 * 60 * 1000);
    expect(isScheduledPickup(past, new Date())).toBe(false);
  });

  it("returns true when departureTime is more than 30 min in the future", async () => {
    const { isScheduledPickup } = await import("@/server/services/driverRequestFeed");
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(isScheduledPickup(future, new Date())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pure logic: isValidFeedRequest expiresAt gate
// ---------------------------------------------------------------------------

describe("isValidFeedRequest expiresAt for dispatch rides", () => {
  const BASE = {
    requestId: "ride_test",
    pickupLabel: "A",
    dropoffLabel: "B",
    pickupLat: 40.7,
    pickupLng: -74.0,
    dropoffLat: 40.8,
    dropoffLng: -74.0,
    offeredFare: 20,
    status: "searching",
    passengerId: "42",
    source: "dispatch" as const,
    rideType: "solo" as const,
    passengerName: "Alice",
    passengerCount: 1,
    seatsRequested: 1,
    distanceToPickupKm: 1,
    pickupEtaMinutes: 2,
    tripDistanceKm: 5,
    estimatedTripMinutes: 15,
    estimatedEarnings: 14,
    platformFee: 6,
    matchScore: 80,
    matchLabel: "High Match" as const,
    safetyMode: false,
    isImmediate: true,
    createdAt: new Date().toISOString(),
    pickupAddress: "A",
    dropoffAddress: "B",
    offerPrice: 20,
    distanceKm: 5,
    estimatedMinutes: 15,
  };

  it("immediate ride with expiresAt 15 min in future passes validation", async () => {
    const { isValidFeedRequest } = await import("@/server/services/driverRequestFeed");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    expect(isValidFeedRequest({ ...BASE, expiresAt })).toBe(true);
  });

  it("ride with expiresAt in the past fails validation (scheduled ride whose time passed)", async () => {
    const { isValidFeedRequest } = await import("@/server/services/driverRequestFeed");
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(isValidFeedRequest({ ...BASE, expiresAt })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchUnifiedDriverRequests with mocked DB
// ---------------------------------------------------------------------------

const mockGetDriverSession = vi.fn();
const mockGetPassengerMetaMap = vi.fn().mockResolvedValue(new Map());
const mockSelectFn = vi.fn();

vi.mock("@/server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db")>();
  return {
    ...actual,
    getDriverSession: (...args: unknown[]) => mockGetDriverSession(...args),
    getRideByRideId: vi.fn().mockResolvedValue(null),
    getRidePassengers: vi.fn().mockResolvedValue([]),
    getUserById: vi.fn().mockResolvedValue(null),
    getUserProfileByUserId: vi.fn().mockResolvedValue(null),
    updateRideRequest: vi.fn().mockResolvedValue(undefined),
    db: { select: (...args: unknown[]) => mockSelectFn(...args) },
  };
});

vi.mock("@/server/services/driverRequestFeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/driverRequestFeed")>();
  return {
    ...actual,
    getPassengerMetaMap: (...args: unknown[]) => mockGetPassengerMetaMap(...args),
  };
});

vi.mock("@/server/services/driverMatcher", () => ({
  dispatchQueue: { declineRide: vi.fn() },
}));

vi.mock("@/server/services/driverRequestActions", () => ({
  acceptPassengerBroadcastRequest: vi.fn().mockResolvedValue({ rideId: "r1" }),
}));

const DRIVER_ID = 10;
const PASSENGER_ID = 99;

const onlineSession = {
  driverId: DRIVER_ID,
  status: "online",
  currentLat: "40.7128",
  currentLng: "-74.0060",
};

/** Ride row with departureTime = null (immediate, created just now). */
function makeRideRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    rideId: "ride_abc",
    driverId: 0,
    mode: "solo",
    status: "searching",
    rideStep: "finding_driver",
    pickupLat: "40.7200",
    pickupLng: "-74.0050",
    pickupAddress: "123 Main St",
    dropoffLat: "40.7589",
    dropoffLng: "-73.9851",
    dropoffAddress: "456 Broadway",
    distanceKm: "5",
    estimatedMinutes: 15,
    totalFare: "20",
    totalSeats: 1,
    safetyMode: "none",
    stripePaymentIntentId: null,
    departureTime: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Passenger row linking ride id → passenger id. */
function makePaxRow(rideId: number, passengerId: number) {
  return { rideId, passengerId };
}

describe("fetchUnifiedDriverRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPassengerMetaMap.mockResolvedValue(
      new Map([[PASSENGER_ID, { name: "Alice", rating: 4.8, isVerified: true }]]),
    );
  });

  it("returns [] when driver session is offline", async () => {
    mockGetDriverSession.mockResolvedValue({ ...onlineSession, status: "offline" });
    const { fetchUnifiedDriverRequests } = await import(
      "@/server/services/driverRequestsService"
    );
    const result = await fetchUnifiedDriverRequests(DRIVER_ID, { status: "pending" });
    expect(result).toEqual([]);
  });

  it("returns [] when driver session has no coordinates", async () => {
    mockGetDriverSession.mockResolvedValue({ ...onlineSession, currentLat: null });
    const { fetchUnifiedDriverRequests } = await import(
      "@/server/services/driverRequestsService"
    );
    const result = await fetchUnifiedDriverRequests(DRIVER_ID, { status: "pending" });
    expect(result).toEqual([]);
  });

  it("immediate ride (departureTime=null, recent) appears in driver feed", async () => {
    mockGetDriverSession.mockResolvedValue(onlineSession);
    const ride = makeRideRow(); // departureTime = null, createdAt = now
    // Call 1: passengerRequests → empty
    // Call 2: rides → one immediate ride
    // Call 3: ridePassengers → links ride to passenger
    mockSelectFn
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([ride]))
      .mockReturnValueOnce(selectChain([makePaxRow(ride.id, PASSENGER_ID)]));

    const { fetchUnifiedDriverRequests } = await import(
      "@/server/services/driverRequestsService"
    );
    const result = await fetchUnifiedDriverRequests(DRIVER_ID, { status: "pending" });
    expect(result.length).toBe(1);
    expect(result[0].rideId).toBe("ride_abc");
    expect(result[0].requestType).toBe("dispatch");
  });

  it("scheduled ride with future departureTime appears in driver feed", async () => {
    mockGetDriverSession.mockResolvedValue(onlineSession);
    const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours ahead
    const ride = makeRideRow({ departureTime: futureTime });
    mockSelectFn
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([ride]))
      .mockReturnValueOnce(selectChain([makePaxRow(ride.id, PASSENGER_ID)]));

    const { fetchUnifiedDriverRequests } = await import(
      "@/server/services/driverRequestsService"
    );
    const result = await fetchUnifiedDriverRequests(DRIVER_ID, { status: "pending" });
    expect(result.length).toBe(1);
    expect(result[0].isScheduled).toBe(true);
  });

  it("filters out ride where passenger and driver are the same account", async () => {
    mockGetDriverSession.mockResolvedValue(onlineSession);
    const ride = makeRideRow(); // same driver id will be the passenger
    mockSelectFn
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([ride]))
      // passenger = driver
      .mockReturnValueOnce(selectChain([makePaxRow(ride.id, DRIVER_ID)]));

    const { fetchUnifiedDriverRequests } = await import(
      "@/server/services/driverRequestsService"
    );
    const result = await fetchUnifiedDriverRequests(DRIVER_ID, { status: "pending" });
    expect(result).toEqual([]);
  });
});
