import "dotenv/config";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import logger from "./logger";

import * as schema from "../drizzle/schema";
import * as relations from "../drizzle/relations";
import {
  analytics,
  carpoolJoinRequests,
  chatMessages,
  driverSessions,
  emergencyAlerts,
  notifications,
  paymentMethods,
  payments,
  pointsLedger,
  promoCodes,
  promoUsage,
  ratings,
  recurringRides,
  referrals,
  rewardPoints,
  ridePassengers,
  rideRequests,
  rideStops,
  rides,
  transactions,
  userPreferences,
  userProfiles,
  users,
  wallets,
  type Analytics,
  type CarpoolJoinRequest,
  type ChatMessage,
  type DriverSession,
  type EmergencyAlert,
  type InsertAnalytics,
  type InsertCarpoolJoinRequest,
  type InsertChatMessage,
  type InsertDriverSession,
  type InsertEmergencyAlert,
  type InsertNotification,
  type InsertPayment,
  type InsertPaymentMethod,
  type InsertPointsLedgerEntry,
  type InsertRideStop,
  type PaymentMethod,
  type InsertRating,
  type InsertRecurringRide,
  type InsertReferral,
  type InsertRide,
  type InsertRidePassenger,
  type InsertRideRequest,
  type InsertTransaction,
  type InsertUser,
  type InsertUserPreference,
  type InsertUserProfile,
  type Notification,
  type Payment,
  type PointsLedgerEntry,
  type Rating,
  type RecurringRide,
  type Referral,
  type RewardPoint,
  type Ride,
  type RidePassenger,
  type RideRequest,
  type RideStop,
  type Transaction,
  type User,
  type UserPreference,
  type UserProfile,
  type Wallet,
  supportTickets,
  supportMessages,
  faqItems,
  type SupportTicket,
  type InsertSupportTicket,
  type SupportMessage,
  type InsertSupportMessage,
  type FaqItem,
  type InsertFaqItem,
  liveChatSessions,
  liveChatMessages,
  type LiveChatSession,
  type InsertLiveChatSession,
  type LiveChatMessage,
  type InsertLiveChatMessage,
  pushTokens,
  studentVerifications,
  type StudentVerification,
  type InsertStudentVerification,
} from "../drizzle/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = mysql.createPool({
  uri: DATABASE_URL,
  // Connection pool tuning for production
  connectionLimit: parseInt(process.env.DB_POOL_SIZE || "200", 10),
  maxIdle: 50,
  idleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || "60000", 10),
  waitForConnections: true,
  queueLimit: 1000,
  connectTimeout: 5000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
});
export const db = drizzle(pool, { schema: { ...schema, ...relations }, mode: "default" });

function now() {
  return new Date();
}

export async function getDb() {
  return db;
}

/** Gracefully close the DB connection pool (used during shutdown) */
export async function closeDbPool(): Promise<void> {
  try {
    await pool.end();
    logger.info("[db] Connection pool closed");
  } catch (err) {
    logger.error({ err }, "[db] Error closing pool");
  }
}

/** Runtime MySQL pool stats for infra monitoring */
export function getDbPoolStats() {
  const p = pool as mysql.Pool & {
    pool?: {
      _allConnections?: unknown[];
      _freeConnections?: unknown[];
      _connectionQueue?: unknown[];
    };
  };
  const inner = p.pool ?? (p as unknown as { _allConnections?: unknown[]; _freeConnections?: unknown[]; _connectionQueue?: unknown[] });
  const all = inner._allConnections?.length ?? 0;
  const free = inner._freeConnections?.length ?? 0;
  const queued = inner._connectionQueue?.length ?? 0;
  const limit = parseInt(process.env.DB_POOL_SIZE || "200", 10);
  return {
    connectionLimit: limit,
    activeConnections: all - free,
    freeConnections: free,
    totalConnections: all,
    queuedRequests: queued,
    poolUsagePct: limit > 0 ? Math.round(((all - free) / limit) * 1000) / 10 : 0,
  };
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function upsertUser(input: InsertUser): Promise<void> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.openId, input.openId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(users)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.loginMethod !== undefined
          ? { loginMethod: input.loginMethod }
          : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.lastSignedIn !== undefined
          ? { lastSignedIn: input.lastSignedIn }
          : {}),
        ...(input.passwordHash !== undefined
          ? { passwordHash: input.passwordHash }
          : {}),
        ...(input.socialAuthProvider !== undefined
          ? { socialAuthProvider: input.socialAuthProvider }
          : {}),
        ...(input.socialAuthId !== undefined
          ? { socialAuthId: input.socialAuthId }
          : {}),
        ...(input.profilePhotoUrl !== undefined
          ? { profilePhotoUrl: input.profilePhotoUrl }
          : {}),
        updatedAt: now(),
      })
      .where(eq(users.openId, input.openId));
    return;
  }

  await db.insert(users).values({
    openId: input.openId,
    name: input.name ?? null,
    email: input.email ?? null,
    loginMethod: input.loginMethod ?? null,
    role: input.role ?? "user",
    createdAt: input.createdAt ?? now(),
    updatedAt: input.updatedAt ?? now(),
    lastSignedIn: input.lastSignedIn ?? now(),
    passwordHash: input.passwordHash ?? null,
    socialAuthProvider: input.socialAuthProvider ?? null,
    socialAuthId: input.socialAuthId ?? null,
    profilePhotoUrl: input.profilePhotoUrl ?? null,
  });
}

export async function getUserByOpenId(
  openId: string,
): Promise<User | undefined> {
  const row = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return row[0];
}

export async function getUserById(id: number): Promise<User | undefined> {
  const row = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row[0];
}

// Look up a user by phone number stored in their profile (used as fallback for password login)
export async function getUserByPhone(phone: string): Promise<User | undefined> {
  const rows = await db
    .select({ user: users })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(userProfiles.phoneNumber, phone))
    .limit(1);
  return rows[0]?.user;
}

export async function updateUserLastSignedIn(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ lastSignedIn: now(), updatedAt: now() })
    .where(eq(users.id, userId));
}

export async function updateUserName(userId: number, name: string): Promise<void> {
  await db
    .update(users)
    .set({ name: name.trim(), updatedAt: now() })
    .where(eq(users.id, userId));
}

// ── User Profiles ─────────────────────────────────────────────────────────────

export async function getUserProfile(
  userId: number,
): Promise<UserProfile | undefined> {
  const row = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return row[0];
}

export async function getUserProfileByUserId(
  userId: number,
): Promise<UserProfile | undefined> {
  return getUserProfile(userId);
}

export async function createUserProfile(
  input: InsertUserProfile,
): Promise<UserProfile> {
  await db.insert(userProfiles).values({
    userId: input.userId,
    phoneNumber: input.phoneNumber ?? null,
    profilePhoto: input.profilePhoto ?? null,
    isDriver: input.isDriver ?? false,
    gender: input.gender ?? null,
    isStudent: input.isStudent ?? false,
    collegeEmail: input.collegeEmail ?? null,
    studentFreeRidesUsed: input.studentFreeRidesUsed ?? 0,
    studentFreeRidesEarned: input.studentFreeRidesEarned ?? 0,
    driverLicense: input.driverLicense ?? null,
    vehicleType: input.vehicleType ?? null,
    vehicleColor: input.vehicleColor ?? null,
    licensePlate: input.licensePlate ?? null,
    averageRating: input.averageRating ?? "5.00",
    totalRides: input.totalRides ?? 0,
    totalEarnings: input.totalEarnings ?? "0.00",
    stripeConnectId: input.stripeConnectId ?? null,
    emergencyContacts: input.emergencyContacts ?? null,
    createdAt: input.createdAt ?? now(),
    updatedAt: input.updatedAt ?? now(),
  });

  const row = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, input.userId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create user profile");
  return row[0];
}

export async function updateUserProfile(
  userId: number,
  patch: Partial<UserProfile>,
): Promise<UserProfile | undefined> {
  await db
    .update(userProfiles)
    .set({ ...patch, updatedAt: now() })
    .where(eq(userProfiles.userId, userId));
  const row = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return row[0];
}

// ── Rides ─────────────────────────────────────────────────────────────────────

export async function createRide(data: InsertRide): Promise<Ride> {
  await db.insert(rides).values({
    rideId: data.rideId,
    driverId: data.driverId,
    mode: data.mode,
    status: data.status ?? "searching",
    rideStep: (data as any).rideStep ?? "finding_driver",
    pickupLat: data.pickupLat,
    pickupLng: data.pickupLng,
    pickupAddress: data.pickupAddress,
    dropoffLat: data.dropoffLat,
    dropoffLng: data.dropoffLng,
    dropoffAddress: data.dropoffAddress,
    distanceKm: data.distanceKm,
    estimatedMinutes: data.estimatedMinutes,
    totalFare: data.totalFare,
    pricePerSeat: (data as any).pricePerSeat ?? null,
    totalSeats: (data as any).totalSeats ?? null,
    // availableSeats must mirror totalSeats — never rely on the schema default (3)
    // Callers that fill one seat on creation (e.g. bookRide passenger) should pass availableSeats explicitly
    availableSeats: (data as any).availableSeats ?? (data as any).totalSeats ?? 3,
    safetyMode: (data as any).safetyMode ?? "none",
    departureTime: (data as any).departureTime ?? null,
    carpoolTitle: (data as any).carpoolTitle ?? null,
    approvalRequired: (data as any).approvalRequired ?? false,
    posterRole: (data as any).posterRole ?? "passenger_organizer",
    recurringRideId: (data as any).recurringRideId ?? null,
    routePolyline: data.routePolyline ?? null,
    createdAt: now(),
  });

  const row = await db
    .select()
    .from(rides)
    .where(eq(rides.rideId, data.rideId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create ride");
  return row[0];
}

export async function getRide(rideId: number): Promise<Ride | undefined> {
  const row = await db
    .select()
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);
  return row[0];
}

export async function getRideByRideId(
  rideId: string,
): Promise<Ride | undefined> {
  const row = await db
    .select()
    .from(rides)
    .where(eq(rides.rideId, rideId))
    .limit(1);
  return row[0];
}

export async function updateRide(
  rideId: number,
  data: Partial<Ride>,
): Promise<Ride | undefined> {
  await db
    .update(rides)
    .set(data as any)
    .where(eq(rides.id, rideId));
  return getRide(rideId);
}

/**
 * Atomically decrement availableSeats by 1 only if seats > 0.
 * Returns true if a seat was claimed, false if ride was already full.
 * Uses a single UPDATE…WHERE to prevent race-condition overbooking.
 */
export async function decrementRideSeat(rideId: number): Promise<boolean> {
  const [result] = await db.execute<import("mysql2").ResultSetHeader>(
    sql`UPDATE rides SET availableSeats = availableSeats - 1
        WHERE id = ${rideId} AND availableSeats > 0`
  );
  return result.affectedRows > 0;
}

/**
 * Atomically increment availableSeats by 1 (used to release a seat on join failure).
 * Capped at totalSeats so we never exceed capacity.
 */
export async function incrementRideSeat(rideId: number): Promise<void> {
  await db.execute(
    sql`UPDATE rides SET availableSeats = LEAST(availableSeats + 1, totalSeats)
        WHERE id = ${rideId}`
  );
}

/**
 * Atomically transition a ride's rideStep + status using a conditional UPDATE.
 *
 * Uses MySQL's row-level lock acquired during the UPDATE statement to guarantee
 * that only one caller can move a ride out of any given source step. If two
 * actors race (e.g. driver completes while rider cancels), exactly one wins and
 * the loser receives `{ updated: false }` and can react accordingly.
 *
 * The function checks `affectedRows`. Drizzle/mysql2 returns this in
 * `result[0].affectedRows` for raw queries; we use the executed SQL approach
 * with `.execute()` to get a precise count.
 */
export async function atomicTransitionRideStep(opts: {
  rideId: string;
  fromSteps: readonly string[]; // allowed current rideStep values
  toStep:
    | "finding_driver"
    | "driver_assigned"
    | "driver_en_route"
    | "driver_arrived"
    | "ride_started"
    | "ride_in_progress"
    | "completed"
    | "cancelled";
  toDbStatus:
    | "searching"
    | "matched"
    | "driver_arrived"
    | "in_progress"
    | "completed"
    | "cancelled";
  expectedDriverId?: number;
  expectedRiderId?: number;
  extraSet?: Record<string, unknown>;
}): Promise<{ updated: boolean; ride: Ride | undefined; reason?: string }> {
  const {
    rideId,
    fromSteps,
    toStep,
    toDbStatus,
    expectedDriverId,
    expectedRiderId,
    extraSet,
  } = opts;

  if (fromSteps.length === 0) {
    return { updated: false, ride: undefined, reason: "no source steps provided" };
  }

  // Build the conditional UPDATE. We use the raw mysql2 pool here so that we
  // can read `affectedRows` precisely (Drizzle's mysql update doesn't surface
  // the count in a typed-friendly way across versions).
  const setFragments: string[] = ["rideStep = ?", "status = ?"];
  const setValues: unknown[] = [toStep, toDbStatus];

  if (extraSet) {
    for (const [key, value] of Object.entries(extraSet)) {
      setFragments.push(`\`${key}\` = ?`);
      setValues.push(value instanceof Date ? value : value ?? null);
    }
  }

  const placeholders = fromSteps.map(() => "?").join(", ");
  const whereFragments: string[] = [
    "rideId = ?",
    `rideStep IN (${placeholders})`,
  ];
  const whereValues: unknown[] = [rideId, ...fromSteps];

  if (expectedDriverId !== undefined) {
    whereFragments.push("driverId = ?");
    whereValues.push(expectedDriverId);
  }
  if (expectedRiderId !== undefined) {
    whereFragments.push("userId = ?");
    whereValues.push(expectedRiderId);
  }

  const sqlText = `UPDATE rides SET ${setFragments.join(", ")} WHERE ${whereFragments.join(" AND ")}`;
  const params = [...setValues, ...whereValues];

  const [result] = (await pool.execute(sqlText, params)) as unknown as [
    { affectedRows: number },
  ];

  if (!result || result.affectedRows === 0) {
    const current = await getRideByRideId(rideId);
    return {
      updated: false,
      ride: current,
      reason: current
        ? `ride is in step "${current.rideStep ?? current.status}", expected one of [${fromSteps.join(", ")}]`
        : "ride not found",
    };
  }

  const ride = await getRideByRideId(rideId);
  return { updated: true, ride };
}

export async function getDriverRides(
  driverId: number,
  status?: string,
): Promise<Ride[]> {
  const condition = status
    ? and(eq(rides.driverId, driverId), eq(rides.status, status as any))
    : eq(rides.driverId, driverId);
  return db
    .select()
    .from(rides)
    .where(condition)
    .orderBy(desc(rides.createdAt));
}

export async function getDriverScheduledRides(driverId: number): Promise<Ride[]> {
  return db
    .select()
    .from(rides)
    .where(
      and(
        eq(rides.driverId, driverId),
        sql`${rides.departureTime} IS NOT NULL`,
        sql`${rides.departureTime} > NOW()`,
        sql`${rides.status} IN ('matched', 'searching')`,
      ),
    )
    .orderBy(rides.departureTime);
}

export async function findMatchingSharedRides(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  radiusKm = 15,
): Promise<Ride[]> {
  // Use wider pickup radius and check dropoff is in same general direction
  const pickupLatDelta = radiusKm / 111;
  const pickupLngDelta = radiusKm / 85;
  const dropoffLatDelta = (radiusKm * 2) / 111; // wider for dropoff
  const dropoffLngDelta = (radiusKm * 2) / 85;
  return db
    .select()
    .from(rides)
    .where(
      and(
        inArray(rides.status, ["searching", "matched", "driver_arrived", "in_progress"]),
        eq(rides.mode, "share"),
        // Pickup is nearby
        sql`${rides.pickupLat} BETWEEN ${pickupLat - pickupLatDelta} AND ${pickupLat + pickupLatDelta}`,
        sql`${rides.pickupLng} BETWEEN ${pickupLng - pickupLngDelta} AND ${pickupLng + pickupLngDelta}`,
        // Dropoff is in a similar direction
        sql`${rides.dropoffLat} BETWEEN ${dropoffLat - dropoffLatDelta} AND ${dropoffLat + dropoffLatDelta}`,
        sql`${rides.dropoffLng} BETWEEN ${dropoffLng - dropoffLngDelta} AND ${dropoffLng + dropoffLngDelta}`,
      ),
    )
    .orderBy(desc(rides.createdAt))
    .limit(10);
}

// ── Ride Passengers ───────────────────────────────────────────────────────────

export async function addRidePassenger(
  data: InsertRidePassenger,
): Promise<RidePassenger> {
  await db.insert(ridePassengers).values({
    rideId: data.rideId,
    passengerId: data.passengerId,
    seatsOccupied: data.seatsOccupied ?? 1,
    isOriginalPassenger: data.isOriginalPassenger ?? false,
    pickupLat: data.pickupLat,
    pickupLng: data.pickupLng,
    pickupAddress: data.pickupAddress,
    dropoffLat: data.dropoffLat,
    dropoffLng: data.dropoffLng,
    dropoffAddress: data.dropoffAddress,
    distanceKm: data.distanceKm,
    fareShare: data.fareShare,
    status: data.status ?? "joined",
    joinedAt: now(),
  });

  const row = await db
    .select()
    .from(ridePassengers)
    .where(
      and(
        eq(ridePassengers.rideId, data.rideId),
        eq(ridePassengers.passengerId, data.passengerId),
      ),
    )
    .limit(1);
  if (!row[0]) throw new Error("Failed to add ride passenger");
  return row[0];
}

export async function getRidePassengers(
  rideId: number,
): Promise<RidePassenger[]> {
  return db
    .select()
    .from(ridePassengers)
    .where(eq(ridePassengers.rideId, rideId))
    .orderBy(asc(ridePassengers.id));
}

export async function getPassengerRides(passengerId: number): Promise<Ride[]> {
  const passengerRows = await db
    .select()
    .from(ridePassengers)
    .where(eq(ridePassengers.passengerId, passengerId));
  if (!passengerRows.length) return [];
  const rideIds = passengerRows.map((p) => p.rideId);
  return db
    .select()
    .from(rides)
    .where(
      sql`${rides.id} IN (${sql.join(
        rideIds.map((id) => sql`${id}`),
        sql`,`,
      )})`,
    )
    .orderBy(desc(rides.createdAt));
}

/**
 * Passenger-mode My Rides: rides where the user is a passenger/requester only.
 * Excludes rides where the user is the assigned driver (driver pickup jobs).
 */
export async function getPassengerRidesForUser(
  userId: number,
): Promise<{ ride: Ride; myFareShare: string | null; isDriver: false }[]> {
  const passengerRows = await db
    .select({ rideId: ridePassengers.rideId, fareShare: ridePassengers.fareShare })
    .from(ridePassengers)
    .where(eq(ridePassengers.passengerId, userId));

  if (!passengerRows.length) return [];

  const rideIds = passengerRows.map((p) => p.rideId);
  const passengerRides = await db
    .select()
    .from(rides)
    .where(
      and(
        inArray(rides.id, rideIds),
        // NULL driverId = passenger-posted ride; still owned by this passenger via ridePassengers
        or(isNull(rides.driverId), ne(rides.driverId, userId)),
      ),
    )
    .orderBy(desc(rides.createdAt));

  const fareMap = new Map(passengerRows.map((p) => [p.rideId, p.fareShare]));

  return passengerRides.map((r) => ({
    ride: r,
    myFareShare: fareMap.get(r.id) ?? null,
    isDriver: false as const,
  }));
}

export async function getUserRides(
  userId: number,
): Promise<{ ride: Ride; myFareShare: string | null; isDriver: boolean }[]> {
  // Rides where user is the driver
  const driverRides = await db
    .select()
    .from(rides)
    .where(eq(rides.driverId, userId))
    .orderBy(desc(rides.createdAt));

  // Rides where user is a passenger (via ridePassengers join table)
  const passengerRows = await db
    .select({ rideId: ridePassengers.rideId, fareShare: ridePassengers.fareShare })
    .from(ridePassengers)
    .where(eq(ridePassengers.passengerId, userId));

  const passengerRideIds = passengerRows.map((p) => p.rideId);
  const passengerRides =
    passengerRideIds.length > 0
      ? await db
          .select()
          .from(rides)
          .where(
            sql`${rides.id} IN (${sql.join(
              passengerRideIds.map((id) => sql`${id}`),
              sql`,`,
            )})`,
          )
          .orderBy(desc(rides.createdAt))
      : [];

  const fareMap = new Map(passengerRows.map((p) => [p.rideId, p.fareShare]));
  const driverRideIds = new Set(driverRides.map((r) => r.id));

  const combined = [
    ...driverRides.map((r) => ({
      ride: r,
      myFareShare: r.totalFare,
      isDriver: true,
    })),
    ...passengerRides
      .filter((r) => !driverRideIds.has(r.id))
      .map((r) => ({
        ride: r,
        myFareShare: fareMap.get(r.id) ?? null,
        isDriver: false,
      })),
  ];

  combined.sort(
    (a, b) => b.ride.createdAt.getTime() - a.ride.createdAt.getTime(),
  );

  return combined;
}

export async function updateRidePassengerStatus(
  rideId: number,
  passengerId: number,
  status: "joined" | "picked_up" | "dropped_off" | "cancelled",
): Promise<void> {
  const extra: any = { status };
  if (status === "picked_up") extra.pickedUpAt = now();
  if (status === "dropped_off") extra.droppedOffAt = now();
  await db
    .update(ridePassengers)
    .set(extra)
    .where(
      and(
        eq(ridePassengers.rideId, rideId),
        eq(ridePassengers.passengerId, passengerId),
      ),
    );
}

/** Update a passenger's fareShare after mid-ride join recalculation */
export async function updateRidePassengerFare(
  rideId: number,
  passengerId: number,
  fareShare: number,
): Promise<void> {
  await db
    .update(ridePassengers)
    .set({ fareShare: String(fareShare) } as any)
    .where(
      and(
        eq(ridePassengers.rideId, rideId),
        eq(ridePassengers.passengerId, passengerId),
      ),
    );
}

// ── Payments ──────────────────────────────────────────────────────────────────

export async function createPayment(data: InsertPayment): Promise<Payment> {
  await db.insert(payments).values({
    paymentId: data.paymentId,
    rideId: data.rideId,
    passengerId: data.passengerId,
    amount: data.amount,
    currency: data.currency ?? "USD",
    status: data.status ?? "pending",
    stripePaymentIntentId: data.stripePaymentIntentId ?? null,
    paymentMethod: data.paymentMethod ?? "card",
    createdAt: now(),
    completedAt: data.completedAt ?? null,
    refundedAt: data.refundedAt ?? null,
  });

  const row = await db
    .select()
    .from(payments)
    .where(eq(payments.paymentId, data.paymentId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create payment");
  return row[0];
}

export async function getPayment(
  paymentId: number,
): Promise<Payment | undefined> {
  const row = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  return row[0];
}

export async function updatePayment(
  paymentId: number,
  data: Partial<Payment>,
): Promise<Payment | undefined> {
  await db
    .update(payments)
    .set(data as any)
    .where(eq(payments.id, paymentId));
  return getPayment(paymentId);
}

export async function getUserPayments(userId: number): Promise<Payment[]> {
  return db
    .select()
    .from(payments)
    .where(eq(payments.passengerId, userId))
    .orderBy(desc(payments.createdAt));
}

// ── Wallet ────────────────────────────────────────────────────────────────────

export async function getWallet(userId: number): Promise<Wallet | undefined> {
  const row = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  return row[0];
}

export async function createWallet(userId: number): Promise<Wallet> {
  await db.insert(wallets).values({
    userId,
    balance: "0.00",
    totalSpent: "0.00",
    totalEarned: "0.00",
    createdAt: now(),
    updatedAt: now(),
  });
  const row = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create wallet");
  return row[0];
}

export async function getOrCreateWallet(userId: number): Promise<Wallet> {
  return (await getWallet(userId)) ?? createWallet(userId);
}

export async function updateWalletBalance(
  userId: number,
  amount: number,
): Promise<Wallet> {
  await db
    .update(wallets)
    .set({
      balance: sql`balance + ${amount}`,
      totalSpent:
        amount < 0 ? sql`totalSpent + ${Math.abs(amount)}` : sql`totalSpent`,
      totalEarned:
        amount > 0 ? sql`totalEarned + ${amount}` : sql`totalEarned`,
      updatedAt: now(),
    })
    .where(eq(wallets.userId, userId));

  const wallet = await getWallet(userId);
  if (!wallet) throw new Error("Wallet not found after balance update");
  return wallet;
}

/**
 * Atomically deduct `amount` from a user's wallet only if balance >= amount.
 * Returns the updated wallet, or throws if the balance is insufficient.
 * Uses a single WHERE-guarded UPDATE to prevent race conditions.
 */
export async function deductWalletBalanceAtomic(
  userId: number,
  amount: number,
): Promise<Wallet> {
  // Use raw execute so we get a precise affectedRows count from mysql2's ResultSetHeader.
  // A Drizzle .update() chains through a typed path that doesn't reliably surface
  // affectedRows across all driver versions — raw SQL avoids that ambiguity.
  const [result] = await db.execute<import("mysql2").ResultSetHeader>(
    sql`UPDATE wallets
        SET balance = balance - ${amount},
            totalSpent = totalSpent + ${amount},
            updatedAt = NOW()
        WHERE userId = ${userId} AND balance >= ${amount}`,
  );

  if (result.affectedRows === 0) {
    throw new Error("Insufficient wallet balance");
  }

  const wallet = await getWallet(userId);
  if (!wallet) throw new Error("Wallet not found after deduction");
  return wallet;
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function createTransaction(
  data: InsertTransaction,
): Promise<Transaction> {
  await db.insert(transactions).values({
    transactionId: data.transactionId,
    userId: data.userId,
    type: data.type,
    amount: data.amount,
    description: data.description ?? null,
    relatedRideId: data.relatedRideId ?? null,
    relatedPaymentId: data.relatedPaymentId ?? null,
    createdAt: now(),
  });

  const row = await db
    .select()
    .from(transactions)
    .where(eq(transactions.transactionId, data.transactionId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create transaction");
  return row[0];
}

export async function getUserTransactions(
  userId: number,
  limit = 50,
): Promise<Transaction[]> {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);
}

// ── Chat Messages ─────────────────────────────────────────────────────────────

export async function sendChatMessage(
  data: InsertChatMessage,
): Promise<ChatMessage> {
  await db.insert(chatMessages).values({
    messageId: data.messageId,
    rideId: data.rideId,
    senderId: data.senderId,
    recipientId: data.recipientId,
    message: data.message,
    isRead: false,
    createdAt: now(),
  });

  const row = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.messageId, data.messageId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to send chat message");
  return row[0];
}

export async function getRideMessages(rideId: number): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.rideId, rideId))
    .orderBy(chatMessages.createdAt)
    .limit(100);
}

export async function markMessagesAsRead(
  rideId: number,
  recipientId: number,
): Promise<void> {
  await db
    .update(chatMessages)
    .set({ isRead: true })
    .where(
      and(
        eq(chatMessages.rideId, rideId),
        eq(chatMessages.recipientId, recipientId),
      ),
    );
}

export async function getUnreadMessageCount(userId: number): Promise<number> {
  const result = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(chatMessages)
    .where(and(eq(chatMessages.recipientId, userId), eq(chatMessages.isRead, false)));
  return parseInt(result[0]?.count ?? "0");
}

export async function getUnreadMessageRides(userId: number) {
  const msgs = await db
    .select({
      rideId: chatMessages.rideId,
      senderId: chatMessages.senderId,
      message: chatMessages.message,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(and(eq(chatMessages.recipientId, userId), eq(chatMessages.isRead, false)))
    .orderBy(desc(chatMessages.createdAt));
  return msgs;
}

// ── Ratings ───────────────────────────────────────────────────────────────────

export async function createRating(data: InsertRating): Promise<Rating> {
  await db.insert(ratings).values({
    ratingId: data.ratingId,
    rideId: data.rideId,
    raterId: data.raterId,
    ratedUserId: data.ratedUserId,
    ratingType: data.ratingType,
    score: data.score,
    comment: data.comment ?? null,
    photos: data.photos ?? null,
    reportedUnsafeBehavior: data.reportedUnsafeBehavior ?? false,
    createdAt: now(),
  });

  const row = await db
    .select()
    .from(ratings)
    .where(eq(ratings.ratingId, data.ratingId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create rating");
  return row[0];
}

export async function getUserRatings(userId: number): Promise<Rating[]> {
  return db
    .select()
    .from(ratings)
    .where(eq(ratings.ratedUserId, userId))
    .orderBy(desc(ratings.createdAt));
}

export async function getAverageRating(userId: number): Promise<number> {
  const result = await db
    .select({ avg: sql<string>`AVG(score)` })
    .from(ratings)
    .where(eq(ratings.ratedUserId, userId));
  return parseFloat(result[0]?.avg ?? "5.0");
}

// ── Promo Codes ───────────────────────────────────────────────────────────────

export async function getPromoCode(code: string) {
  const row = await db
    .select()
    .from(promoCodes)
    .where(eq(promoCodes.code, code.toUpperCase()))
    .limit(1);
  return row[0];
}

export async function validatePromoCode(code: string, rideAmount: number) {
  const promo = await getPromoCode(code);
  if (!promo) return { valid: false, reason: "Code not found" };
  if (!promo.isActive) return { valid: false, reason: "Code is inactive" };
  if (new Date() < promo.validFrom)
    return { valid: false, reason: "Code not yet active" };
  if (new Date() > promo.validUntil)
    return { valid: false, reason: "Code has expired" };
  if (promo.maxUses && (promo.currentUses ?? 0) >= promo.maxUses)
    return { valid: false, reason: "Code usage limit reached" };
  if (parseFloat(promo.minRideAmount ?? "0") > rideAmount)
    return {
      valid: false,
      reason: `Minimum ride amount is $${promo.minRideAmount}`,
    };

  let discount =
    promo.discountType === "percentage"
      ? rideAmount * (parseFloat(promo.discountValue) / 100)
      : parseFloat(promo.discountValue);
  if (promo.maxDiscount)
    discount = Math.min(discount, parseFloat(promo.maxDiscount));

  return { valid: true, discount: Math.round(discount * 100) / 100, promo };
}

export async function applyPromoCode(
  code: string,
  userId: number,
  rideId: number,
  rideAmount: number,
) {
  const validation = await validatePromoCode(code, rideAmount);
  if (!validation.valid || !validation.promo)
    return { success: false, reason: validation.reason };

  await db.insert(promoUsage).values({
    promoCodeId: validation.promo.id,
    userId,
    rideId,
    discountAmount: String(validation.discount),
    usedAt: now(),
  });
  await db
    .update(promoCodes)
    .set({ currentUses: sql`currentUses + 1` })
    .where(eq(promoCodes.id, validation.promo.id));

  return { success: true, discount: validation.discount };
}

// ── Referrals ─────────────────────────────────────────────────────────────────

export async function createReferral(data: InsertReferral): Promise<Referral> {
  await db.insert(referrals).values({
    referralCode: data.referralCode,
    referrerId: data.referrerId,
    referredUserId: data.referredUserId ?? null,
    creditAmount: data.creditAmount,
    status: data.status ?? "pending",
    createdAt: now(),
    completedAt: data.completedAt ?? null,
  });

  const row = await db
    .select()
    .from(referrals)
    .where(eq(referrals.referralCode, data.referralCode))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create referral");
  return row[0];
}

export async function getReferralByCode(
  code: string,
): Promise<Referral | undefined> {
  const row = await db
    .select()
    .from(referrals)
    .where(eq(referrals.referralCode, code))
    .limit(1);
  return row[0];
}

// ── Emergency Alerts ──────────────────────────────────────────────────────────

export async function createEmergencyAlert(
  data: InsertEmergencyAlert,
): Promise<EmergencyAlert> {
  await db.insert(emergencyAlerts).values({
    alertId: data.alertId,
    userId: data.userId,
    rideId: data.rideId ?? null,
    latitude: data.latitude,
    longitude: data.longitude,
    alertType: data.alertType,
    status: data.status ?? "active",
    emergencyContactsNotified: data.emergencyContactsNotified ?? null,
    createdAt: now(),
    resolvedAt: null,
  });

  const row = await db
    .select()
    .from(emergencyAlerts)
    .where(eq(emergencyAlerts.alertId, data.alertId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create emergency alert");
  return row[0];
}

export async function getEmergencyAlert(
  alertId: string,
): Promise<EmergencyAlert | undefined> {
  const row = await db
    .select()
    .from(emergencyAlerts)
    .where(eq(emergencyAlerts.alertId, alertId))
    .limit(1);
  return row[0];
}

export async function updateEmergencyAlert(
  alertId: string,
  data: Partial<EmergencyAlert>,
): Promise<EmergencyAlert | undefined> {
  await db
    .update(emergencyAlerts)
    .set(data as any)
    .where(eq(emergencyAlerts.alertId, alertId));
  return getEmergencyAlert(alertId);
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function recordAnalytics(
  data: InsertAnalytics,
): Promise<Analytics> {
  await db.insert(analytics).values({
    userId: data.userId,
    date: data.date,
    totalRides: data.totalRides ?? 0,
    totalDistance: data.totalDistance ?? "0.00",
    totalSpent: data.totalSpent ?? "0.00",
    totalEarned: data.totalEarned ?? "0.00",
    averageRating: data.averageRating ?? "5.00",
    createdAt: now(),
  });

  const row = await db
    .select()
    .from(analytics)
    .where(
      and(eq(analytics.userId, data.userId), eq(analytics.date, data.date)),
    )
    .limit(1);
  if (!row[0]) throw new Error("Failed to record analytics");
  return row[0];
}

export async function getUserAnalytics(
  userId: number,
  days = 30,
): Promise<Analytics[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(analytics)
    .where(
      and(eq(analytics.userId, userId), sql`${analytics.date} >= ${since}`),
    )
    .orderBy(desc(analytics.date));
}

// ── Driver Sessions ───────────────────────────────────────────────────────────

export async function getDriverSession(
  driverId: number,
): Promise<DriverSession | undefined> {
  const row = await db
    .select()
    .from(driverSessions)
    .where(eq(driverSessions.driverId, driverId))
    .limit(1);
  return row[0];
}

export async function upsertDriverSession(
  driverId: number,
  patch: Partial<Omit<InsertDriverSession, "driverId">>,
): Promise<void> {
  const existing = await getDriverSession(driverId);
  if (existing) {
    await db
      .update(driverSessions)
      .set({ ...patch, updatedAt: now() } as any)
      .where(eq(driverSessions.driverId, driverId));
  } else {
    await db.insert(driverSessions).values({
      driverId,
      status: "offline",
      ...patch,
      createdAt: now(),
      updatedAt: now(),
      lastSeenAt: now(),
    } as any);
  }
}

/** Update driver's GPS location and mark as recently seen */
export async function updateDriverLocation(
  driverId: number,
  lat: number,
  lng: number,
): Promise<void> {
  await db
    .update(driverSessions)
    .set({
      currentLat: String(lat),
      currentLng: String(lng),
      lastSeenAt: now(),
      updatedAt: now(),
    })
    .where(eq(driverSessions.driverId, driverId));
}

/** Get all online drivers within a geographic bounding box */
export async function getOnlineDriversNear(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<Array<DriverSession & { userId: number; averageRating: string | null }>> {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / 85;
  const rows = await db
    .select({ session: driverSessions, averageRating: userProfiles.averageRating })
    .from(driverSessions)
    .leftJoin(userProfiles, eq(driverSessions.driverId, userProfiles.userId))
    .where(
      and(
        eq(driverSessions.status, "online"),
        sql`${driverSessions.currentLat} BETWEEN ${lat - latDelta} AND ${lat + latDelta}`,
        sql`${driverSessions.currentLng} BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}`,
        // Active in last 5 minutes
        sql`${driverSessions.lastSeenAt} >= ${new Date(Date.now() - 300_000)}`,
      ),
    )
    .limit(20);
  return rows.map(({ session, averageRating }) => ({ ...session, userId: session.driverId, averageRating }));
}

// ── Ride Requests ─────────────────────────────────────────────────────────────

export async function createRideRequest(
  data: InsertRideRequest,
): Promise<RideRequest> {
  await db.insert(rideRequests).values({
    requestId: data.requestId,
    rideId: data.rideId,
    driverId: data.driverId,
    status: data.status ?? "pending",
    offeredFare: data.offeredFare,
    etaMinutes: data.etaMinutes ?? null,
    expiresAt: data.expiresAt,
    createdAt: now(),
  });
  const row = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.requestId, data.requestId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create ride request");
  return row[0];
}

export async function updateRideRequest(
  rideId: string,
  driverId: number,
  status: "accepted" | "declined" | "expired",
): Promise<void> {
  await db
    .update(rideRequests)
    .set({ status, respondedAt: now() })
    .where(
      and(
        eq(rideRequests.rideId, rideId),
        eq(rideRequests.driverId, driverId),
        eq(rideRequests.status, "pending"),
      ),
    );
}

export async function getPendingRideRequestForDriver(
  driverId: number,
): Promise<RideRequest | undefined> {
  const row = await db
    .select()
    .from(rideRequests)
    .where(
      and(
        eq(rideRequests.driverId, driverId),
        eq(rideRequests.status, "pending"),
      ),
    )
    .orderBy(desc(rideRequests.createdAt))
    .limit(1);
  return row[0];
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationAudience = "passenger" | "driver";

export async function createNotification(
  data: InsertNotification,
): Promise<Notification> {
  await db.insert(notifications).values({
    notificationId: data.notificationId,
    userId: data.userId,
    recipientRole: data.recipientRole ?? "passenger",
    type: data.type,
    title: data.title,
    body: data.body,
    data: data.data ?? null,
    isRead: false,
    deepLink: data.deepLink ?? null,
    createdAt: now(),
    readAt: null,
  });
  const row = await db
    .select()
    .from(notifications)
    .where(eq(notifications.notificationId, data.notificationId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create notification");
  return row[0];
}

export async function getUserNotifications(
  userId: number,
  limit = 30,
  offset = 0,
  unreadOnly = false,
  role?: NotificationAudience,
): Promise<Notification[]> {
  const conditions = [eq(notifications.userId, userId)];
  if (role) conditions.push(eq(notifications.recipientRole, role));
  if (unreadOnly) conditions.push(eq(notifications.isRead, false));
  const condition = conditions.length === 1 ? conditions[0]! : and(...conditions)!;
  return db
    .select()
    .from(notifications)
    .where(condition)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getUnreadNotificationCount(
  userId: number,
  role?: NotificationAudience,
): Promise<number> {
  const conditions = [eq(notifications.userId, userId), eq(notifications.isRead, false)];
  if (role) conditions.push(eq(notifications.recipientRole, role));
  const result = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(notifications)
    .where(and(...conditions));
  return parseInt(result[0]?.count ?? "0");
}

export async function markNotificationRead(notificationId: string, userId: number): Promise<void> {
  await db
    .update(notifications)
    .set({ isRead: true, readAt: now() })
    .where(and(eq(notifications.notificationId, notificationId), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(
  userId: number,
  role?: NotificationAudience,
): Promise<void> {
  const conditions = [eq(notifications.userId, userId), eq(notifications.isRead, false)];
  if (role) conditions.push(eq(notifications.recipientRole, role));
  await db
    .update(notifications)
    .set({ isRead: true, readAt: now() })
    .where(and(...conditions));
}

export async function deleteNotification(notificationId: string, userId: number): Promise<void> {
  await db
    .delete(notifications)
    .where(and(eq(notifications.notificationId, notificationId), eq(notifications.userId, userId)));
}

export async function deleteAllNotifications(
  userId: number,
  role?: NotificationAudience,
): Promise<void> {
  const conditions = [eq(notifications.userId, userId)];
  if (role) conditions.push(eq(notifications.recipientRole, role));
  await db.delete(notifications).where(and(...conditions));
}

export async function deleteOldNotifications(userId: number, before: Date): Promise<void> {
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        sql`${notifications.createdAt} < ${before}`,
      ),
    );
}

// ── User Preferences ──────────────────────────────────────────────────────────

export async function getUserPreferences(
  userId: number,
): Promise<UserPreference | undefined> {
  const row = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row[0];
}

export async function getOrCreateUserPreferences(userId: number): Promise<UserPreference> {
  const existing = await getUserPreferences(userId);
  if (existing) return existing;

  await db.insert(userPreferences).values({
    userId,
    safetyMode: "none",
    preferredRideMode: "share",
    maxWaitTimeMinutes: 15,
    notifyOnDriverAssigned: true,
    notifyOnDriverArrived: true,
    notifyOnRideStart: true,
    notifyOnRideComplete: true,
    createdAt: now(),
    updatedAt: now(),
  });
  const row = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create user preferences");
  return row[0];
}

export async function updateUserPreferences(
  userId: number,
  patch: Partial<Omit<InsertUserPreference, "userId">>,
): Promise<UserPreference> {
  await getOrCreateUserPreferences(userId); // ensure exists
  await db
    .update(userPreferences)
    .set({ ...patch, updatedAt: now() } as any)
    .where(eq(userPreferences.userId, userId));
  const updated = await getUserPreferences(userId);
  if (!updated) throw new Error("User preferences not found after update");
  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════
// P2P Carpool — Rides (posted carpools)
// ═══════════════════════════════════════════════════════════════════════════

/** List open/posted carpool rides available to join (not completed/cancelled).
 *  Only status controls visibility — departure time is advisory, not a gate.
 *  We exclude rides that departed more than 6 hours ago to avoid stale results.
 */
export async function getOpenCarpoolRides(
  limit = 50,
): Promise<Ride[]> {
  return db
    .select()
    .from(rides)
    .where(
      and(
        eq(rides.mode, "share"),
        sql`${rides.status} IN ('searching','matched')`,
        // Keep ride visible until 6 h after its departure (or if no time set, show it)
        sql`(${rides.departureTime} IS NULL OR ${rides.departureTime} > DATE_SUB(NOW(), INTERVAL 6 HOUR))`,
      ),
    )
    .orderBy(rides.departureTime)
    .limit(limit);
}

/**
 * Spatial carpool search — bounding-box pre-filter in SQL, exact Haversine in the matcher.
 *
 * Default box = 2 km (covers the 1-mile / 1.609 km gate + 25 % buffer so no
 * boundary ride is missed by the box approximation).  The scorer applies the
 * precise gates; the DB box is intentionally wider.
 *
 * Time gate: rides that departed more than 10 minutes ago are excluded.
 * Rides with no departureTime (flexible) are always included.
 */
export async function searchCarpoolRides(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  pickupRadiusKm = 2.0,
  dropoffRadiusKm = 2.0,
): Promise<Ride[]> {
  // 1° lat ≈ 111 km; 1° lng ≈ 111 km × cos(lat)
  const pLatD = pickupRadiusKm / 111;
  const pLngD = pickupRadiusKm / (111 * Math.max(Math.cos((pickupLat * Math.PI) / 180), 0.01));
  const dLatD = dropoffRadiusKm / 111;
  const dLngD = dropoffRadiusKm / (111 * Math.max(Math.cos((dropoffLat * Math.PI) / 180), 0.01));

  return db
    .select()
    .from(rides)
    .where(
      and(
        eq(rides.mode, "share"),
        sql`${rides.status} IN ('searching','matched')`,
        // Only rides that depart in the future or departed < 10 min ago (flexible rides have NULL)
        sql`(${rides.departureTime} IS NULL OR ${rides.departureTime} >= DATE_SUB(NOW(), INTERVAL 10 MINUTE))`,
        // Pickup bounding box
        sql`${rides.pickupLat} BETWEEN ${pickupLat - pLatD} AND ${pickupLat + pLatD}`,
        sql`${rides.pickupLng} BETWEEN ${pickupLng - pLngD} AND ${pickupLng + pLngD}`,
        // Dropoff bounding box
        sql`${rides.dropoffLat} BETWEEN ${dropoffLat - dLatD} AND ${dropoffLat + dLatD}`,
        sql`${rides.dropoffLng} BETWEEN ${dropoffLng - dLngD} AND ${dropoffLng + dLngD}`,
      ),
    )
    .orderBy(rides.departureTime)
    .limit(200);
}

/** Get rides created by a specific user as driver (their posted rides) */
export async function getCreatedRides(userId: number): Promise<Ride[]> {
  return db
    .select()
    .from(rides)
    .where(eq(rides.driverId, userId))
    .orderBy(desc(rides.createdAt));
}

/** Resolve the ride organizer — driver poster or original passenger organizer. */
export async function getRideOrganizerId(
  ride: { id: number; driverId: number | null; fareBreakdown?: unknown | null },
): Promise<number> {
  const meta = (ride.fareBreakdown as Record<string, unknown> | null) ?? {};
  const passengerPosted = meta.passengerPosted === true;

  if (passengerPosted || ride.driverId == null) {
    const passengers = await getRidePassengers(ride.id);
    const original = passengers.find((p) => p.isOriginalPassenger)
      ?? [...passengers].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
    return original?.passengerId ?? 0;
  }

  return ride.driverId!;
}

/** Rides the user organizes (driver-posted or passenger-posted shared rides). */
export async function getOrganizerRides(userId: number): Promise<Ride[]> {
  const asDriver = await db
    .select()
    .from(rides)
    .where(and(eq(rides.driverId, userId), eq(rides.mode, "share")))
    .orderBy(desc(rides.createdAt));

  const asOriginalPassenger = await db
    .select({ ride: rides })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(
      and(
        eq(ridePassengers.passengerId, userId),
        eq(ridePassengers.isOriginalPassenger, true),
        eq(rides.mode, "share"),
      ),
    )
    .orderBy(desc(rides.createdAt));

  const legacyPassengerOrganizer = await db
    .select({ ride: rides })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(
      and(
        eq(ridePassengers.passengerId, userId),
        isNull(rides.driverId),
        eq(rides.mode, "share"),
      ),
    )
    .orderBy(desc(rides.createdAt));

  const byId = new Map<number, Ride>();
  for (const ride of asDriver) byId.set(ride.id, ride);
  for (const { ride } of asOriginalPassenger) byId.set(ride.id, ride);
  for (const { ride } of legacyPassengerOrganizer) byId.set(ride.id, ride);

  return [...byId.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// P2P Carpool — Recurring Rides
// ═══════════════════════════════════════════════════════════════════════════

export async function createRecurringRide(
  data: InsertRecurringRide,
): Promise<RecurringRide> {
  await db.insert(recurringRides).values(data);
  const row = await db
    .select()
    .from(recurringRides)
    .where(eq(recurringRides.recurringId, data.recurringId))
    .limit(1);
  if (!row[0]) throw new Error("RecurringRide not found after insert");
  return row[0];
}

export async function getUserRecurringRides(
  userId: number,
): Promise<RecurringRide[]> {
  return db
    .select()
    .from(recurringRides)
    .where(eq(recurringRides.creatorId, userId))
    .orderBy(desc(recurringRides.createdAt));
}

/**
 * All currently-active recurring schedules across every user.
 * Used by the daily cron job to materialise ride instances.
 */
export async function getActiveRecurringRides(): Promise<RecurringRide[]> {
  return db
    .select()
    .from(recurringRides)
    .where(eq(recurringRides.isActive, true));
}

export async function getRecurringRideById(
  recurringId: string,
): Promise<RecurringRide | undefined> {
  const rows = await db
    .select()
    .from(recurringRides)
    .where(eq(recurringRides.recurringId, recurringId))
    .limit(1);
  return rows[0];
}

export async function updateRecurringRide(
  recurringId: string,
  patch: Partial<InsertRecurringRide>,
): Promise<void> {
  await db
    .update(recurringRides)
    .set(patch as any)
    .where(eq(recurringRides.recurringId, recurringId));
}

export async function deleteRecurringRide(recurringId: string): Promise<void> {
  await db.delete(recurringRides).where(eq(recurringRides.recurringId, recurringId));
}

// ═══════════════════════════════════════════════════════════════════════════
// P2P Carpool — Join Requests
// ═══════════════════════════════════════════════════════════════════════════

export async function createJoinRequest(
  data: InsertCarpoolJoinRequest,
): Promise<CarpoolJoinRequest> {
  await db.insert(carpoolJoinRequests).values(data);
  const row = await db
    .select()
    .from(carpoolJoinRequests)
    .where(eq(carpoolJoinRequests.joinRequestId, data.joinRequestId))
    .limit(1);
  if (!row[0]) throw new Error("JoinRequest not found after insert");
  return row[0];
}

export async function getJoinRequestsForRide(
  rideId: string,
): Promise<CarpoolJoinRequest[]> {
  return db
    .select()
    .from(carpoolJoinRequests)
    .where(eq(carpoolJoinRequests.rideId, rideId))
    .orderBy(desc(carpoolJoinRequests.createdAt));
}

export async function getJoinRequestsByPassenger(
  passengerId: number,
): Promise<CarpoolJoinRequest[]> {
  return db
    .select()
    .from(carpoolJoinRequests)
    .where(eq(carpoolJoinRequests.passengerId, passengerId))
    .orderBy(desc(carpoolJoinRequests.createdAt));
}

export async function getJoinRequest(
  joinRequestId: string,
): Promise<CarpoolJoinRequest | undefined> {
  const rows = await db
    .select()
    .from(carpoolJoinRequests)
    .where(eq(carpoolJoinRequests.joinRequestId, joinRequestId))
    .limit(1);
  return rows[0];
}

export async function updateJoinRequest(
  joinRequestId: string,
  patch: Partial<InsertCarpoolJoinRequest>,
): Promise<void> {
  await db
    .update(carpoolJoinRequests)
    .set(patch as any)
    .where(eq(carpoolJoinRequests.joinRequestId, joinRequestId));
}

/** Check if a passenger already has a pending/approved request for this ride */
export async function getExistingJoinRequest(
  rideId: string,
  passengerId: number,
): Promise<CarpoolJoinRequest | undefined> {
  const rows = await db
    .select()
    .from(carpoolJoinRequests)
    .where(
      and(
        eq(carpoolJoinRequests.rideId, rideId),
        eq(carpoolJoinRequests.passengerId, passengerId),
        sql`${carpoolJoinRequests.status} IN ('pending','approved')`,
      ),
    )
    .limit(1);
  return rows[0];
}

// ── Payment Methods ─────────────────────────────────────────────────────────

export async function getPaymentMethodsByUserId(userId: number): Promise<PaymentMethod[]> {
  return db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, userId))
    .orderBy(desc(paymentMethods.createdAt));
}

export async function getDefaultPaymentMethod(userId: number): Promise<PaymentMethod | undefined> {
  const rows = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.userId, userId), eq(paymentMethods.isDefault, true)))
    .limit(1);
  return rows[0];
}

export async function addPaymentMethod(input: {
  userId: number;
  cardType: "visa" | "mastercard" | "amex" | "discover";
  last4: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  stripePaymentMethodId?: string;
}): Promise<PaymentMethod> {
  // If this is the default card, unset others
  if (input.isDefault) {
    await db
      .update(paymentMethods)
      .set({ isDefault: false })
      .where(eq(paymentMethods.userId, input.userId));
  }

  // Check if user has no cards — make first one default
  const existing = await getPaymentMethodsByUserId(input.userId);
  const makeDefault = input.isDefault || existing.length === 0;

  await db.insert(paymentMethods).values({
    userId: input.userId,
    cardType: input.cardType,
    last4: input.last4,
    holderName: input.holderName,
    expiryMonth: input.expiryMonth,
    expiryYear: input.expiryYear,
    isDefault: makeDefault,
    stripePaymentMethodId: input.stripePaymentMethodId ?? null,
  });

  const rows = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, input.userId))
    .orderBy(desc(paymentMethods.id))
    .limit(1);
  return rows[0]!;
}

export async function setDefaultPaymentMethod(userId: number, paymentMethodId: number): Promise<void> {
  // Unset all defaults for this user
  await db
    .update(paymentMethods)
    .set({ isDefault: false })
    .where(eq(paymentMethods.userId, userId));
  // Set the chosen one as default
  await db
    .update(paymentMethods)
    .set({ isDefault: true })
    .where(and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.userId, userId)));
}

export async function deletePaymentMethod(userId: number, paymentMethodId: number): Promise<void> {
  await db
    .delete(paymentMethods)
    .where(and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.userId, userId)));
}

// ═══════════════════════════════════════════════════════════════════════════
// Ride Stops — Mid-ride join stop management
// ═══════════════════════════════════════════════════════════════════════════

export async function createRideStop(data: {
  rideId: number;
  stopType: "pickup" | "dropoff";
  passengerId: number;
  lat: string;
  lng: string;
  address: string;
  sequence: number;
  status?: "pending" | "approaching" | "reached" | "skipped";
}): Promise<RideStop> {
  // Duplicate guard: skip if this passenger already has this stop type
  const existing = await db
    .select()
    .from(rideStops)
    .where(
      and(
        eq(rideStops.rideId, data.rideId),
        eq(rideStops.passengerId, data.passengerId),
        eq(rideStops.stopType, data.stopType),
      ),
    )
    .limit(1);
  if (existing.length > 0) return existing[0];

  await db.insert(rideStops).values({
    rideId: data.rideId,
    stopType: data.stopType,
    passengerId: data.passengerId,
    lat: data.lat,
    lng: data.lng,
    address: data.address,
    sequence: data.sequence,
    status: data.status ?? "pending",
    createdAt: now(),
  });

  const rows = await db
    .select()
    .from(rideStops)
    .where(
      and(
        eq(rideStops.rideId, data.rideId),
        eq(rideStops.passengerId, data.passengerId),
        eq(rideStops.stopType, data.stopType),
        eq(rideStops.sequence, data.sequence),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("Failed to create ride stop");
  return rows[0];
}

export async function getRideStopsFromDb(rideId: number): Promise<RideStop[]> {
  return db
    .select()
    .from(rideStops)
    .where(eq(rideStops.rideId, rideId))
    .orderBy(rideStops.sequence);
}

export async function updateRideStop(
  stopId: number,
  data: Partial<{ status: string; estimatedArrivalAt: Date; actualArrivalAt: Date }>,
): Promise<void> {
  await db
    .update(rideStops)
    .set(data as any)
    .where(eq(rideStops.id, stopId));
}

export async function deleteRideStopsByPassenger(
  rideId: number,
  passengerId: number,
): Promise<void> {
  await db
    .delete(rideStops)
    .where(
      and(eq(rideStops.rideId, rideId), eq(rideStops.passengerId, passengerId)),
    );
}

export async function resequenceStops(
  _rideId: number,
  updates: { stopId: number; sequence: number }[],
): Promise<void> {
  for (const u of updates) {
    await db
      .update(rideStops)
      .set({ sequence: u.sequence })
      .where(eq(rideStops.id, u.stopId));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Joinable Shared Rides — Includes in-progress rides
// ═══════════════════════════════════════════════════════════════════════════

export async function findJoinableSharedRides(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  radiusKm = 15,
): Promise<Ride[]> {
  const pickupLatDelta = radiusKm / 111;
  const pickupLngDelta = radiusKm / 85;
  const dropoffLatDelta = (radiusKm * 2) / 111;
  const dropoffLngDelta = (radiusKm * 2) / 85;
  return db
    .select()
    .from(rides)
    .where(
      and(
        inArray(rides.status, ["searching", "matched", "driver_arrived", "in_progress"]),
        eq(rides.mode, "share"),
        sql`${rides.availableSeats} > 0`,
        sql`${rides.createdAt} > DATE_SUB(NOW(), INTERVAL 2 HOUR)`,
        sql`${rides.pickupLat} BETWEEN ${pickupLat - pickupLatDelta} AND ${pickupLat + pickupLatDelta}`,
        sql`${rides.pickupLng} BETWEEN ${pickupLng - pickupLngDelta} AND ${pickupLng + pickupLngDelta}`,
        sql`${rides.dropoffLat} BETWEEN ${dropoffLat - dropoffLatDelta} AND ${dropoffLat + dropoffLatDelta}`,
        sql`${rides.dropoffLng} BETWEEN ${dropoffLng - dropoffLngDelta} AND ${dropoffLng + dropoffLngDelta}`,
      ),
    )
    .orderBy(desc(rides.createdAt))
    .limit(20);
}

// ═══════════════════════════════════════════════════════════════════════════
// Reward Points
// ═══════════════════════════════════════════════════════════════════════════

export async function getOrCreateRewardPointsDb(userId: number): Promise<RewardPoint> {
  const existing = await db
    .select()
    .from(rewardPoints)
    .where(eq(rewardPoints.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  await db.insert(rewardPoints).values({
    userId,
    points: 0,
    totalEarned: 0,
    totalRedeemed: 0,
    createdAt: now(),
    updatedAt: now(),
  });
  const row = await db
    .select()
    .from(rewardPoints)
    .where(eq(rewardPoints.userId, userId))
    .limit(1);
  if (!row[0]) throw new Error("Failed to create reward points");
  return row[0];
}

export async function updateRewardPointsDb(userId: number, delta: number): Promise<void> {
  if (delta > 0) {
    await db
      .update(rewardPoints)
      .set({
        points: sql`points + ${delta}`,
        totalEarned: sql`totalEarned + ${delta}`,
        updatedAt: now(),
      })
      .where(eq(rewardPoints.userId, userId));
  } else {
    await db
      .update(rewardPoints)
      .set({
        points: sql`points + ${delta}`,
        totalRedeemed: sql`totalRedeemed + ${Math.abs(delta)}`,
        updatedAt: now(),
      })
      .where(eq(rewardPoints.userId, userId));
  }
}

export async function addPointsLedgerEntryDb(data: {
  userId: number;
  amount: number;
  reason: "mid_ride_join" | "shared_ride_bonus" | "original_passenger_bonus" | "driver_bonus" | "first_shared_ride" | "referral_bonus" | "redeemed";
  relatedRideId: number | null;
}): Promise<void> {
  await db.insert(pointsLedger).values({
    userId: data.userId,
    amount: data.amount,
    reason: data.reason,
    relatedRideId: data.relatedRideId,
    createdAt: now(),
  });
}

export async function getPointsLedgerDb(
  userId: number,
  limit = 20,
  offset = 0,
): Promise<PointsLedgerEntry[]> {
  return db
    .select()
    .from(pointsLedger)
    .where(eq(pointsLedger.userId, userId))
    .orderBy(desc(pointsLedger.createdAt))
    .limit(limit)
    .offset(offset);
}

// ── Driver Earnings ──────────────────────────────────────────────────────────

export async function getDriverEarnings(
  driverId: number,
  period: "today" | "week" | "month",
): Promise<Ride[]> {
  const now_ = new Date();
  let since: Date;
  if (period === "today") {
    since = new Date(now_.getFullYear(), now_.getMonth(), now_.getDate());
  } else if (period === "week") {
    const day = now_.getDay();
    since = new Date(now_.getFullYear(), now_.getMonth(), now_.getDate() - day);
  } else {
    since = new Date(now_.getFullYear(), now_.getMonth(), 1);
  }
  return db
    .select()
    .from(rides)
    .where(
      and(
        eq(rides.driverId, driverId),
        eq(rides.status, "completed"),
        sql`${rides.completedAt} >= ${since}`,
      ),
    )
    .orderBy(desc(rides.completedAt));
}

export async function getDriverEarningsSummary(driverId: number): Promise<{
  todayEarnings: number;
  weekEarnings: number;
  monthEarnings: number;
  todayRides: number;
  weekRides: number;
  monthRides: number;
}> {
  const todayRides = await getDriverEarnings(driverId, "today");
  const weekRides = await getDriverEarnings(driverId, "week");
  const monthRides = await getDriverEarnings(driverId, "month");

  const sum = (r: Ride[]) =>
    r.reduce((acc, ride) => acc + parseFloat(String(ride.totalFare ?? "0")), 0);

  return {
    todayEarnings: sum(todayRides),
    weekEarnings: sum(weekRides),
    monthEarnings: sum(monthRides),
    todayRides: todayRides.length,
    weekRides: weekRides.length,
    monthRides: monthRides.length,
  };
}

// ── Enhanced Ratings ─────────────────────────────────────────────────────────

export async function submitEnhancedRating(data: {
  ratingId: string;
  rideId: number;
  raterId: number;
  ratedUserId: number;
  ratingType: "passenger" | "driver";
  score: number;
  comment?: string | null;
  reportedUnsafeBehavior?: boolean;
  categories?: { driving?: number; cleanliness?: number; communication?: number } | null;
  tags?: string[] | null;
  tipAmount?: number | null;
}): Promise<Rating> {
  const photosData = data.categories
    ? { categories: data.categories, tags: data.tags ?? [], tipAmount: data.tipAmount ?? 0 }
    : null;

  await db.insert(ratings).values({
    ratingId: data.ratingId,
    rideId: data.rideId,
    raterId: data.raterId,
    ratedUserId: data.ratedUserId,
    ratingType: data.ratingType,
    score: data.score,
    comment: data.comment ?? null,
    photos: photosData,
    reportedUnsafeBehavior: data.reportedUnsafeBehavior ?? false,
    createdAt: now(),
  });

  const row = await db
    .select()
    .from(ratings)
    .where(eq(ratings.ratingId, data.ratingId))
    .limit(1);
  return row[0]!;
}

// ── Driver Onboarding ────────────────────────────────────────────────────────

export interface DriverOnboardingInput {
  fullName: string;
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  plateNumber: string;
  vehicleType: string;
  insurancePolicyNumber: string;
  insuranceProvider: string;
  insuranceExpiry: string;
  bankName: string;
  accountLast4: string;
  routingLast4: string;
}

export async function updateDriverOnboarding(
  userId: number,
  input: DriverOnboardingInput,
): Promise<UserProfile | undefined> {
  // Ensure profile exists
  let profile = await getUserProfile(userId);
  if (!profile) {
    await createUserProfile({ userId });
    profile = await getUserProfile(userId);
  }

  // Update the profile with driver information
  return updateUserProfile(userId, {
    isDriver: true,
    driverLicense: input.licenseNumber,
    vehicleType: input.vehicleType,
    vehicleColor: input.vehicleColor,
    licensePlate: input.plateNumber,
  });
}

export async function getDriverOnboardingStatus(
  userId: number,
): Promise<{
  isDriver: boolean;
  hasLicense: boolean;
  hasVehicle: boolean;
  licensePlate: string | null;
  vehicleType: string | null;
  vehicleColor: string | null;
  driverLicense: string | null;
}> {
  const profile = await getUserProfile(userId);
  if (!profile) {
    return {
      isDriver: false,
      hasLicense: false,
      hasVehicle: false,
      licensePlate: null,
      vehicleType: null,
      vehicleColor: null,
      driverLicense: null,
    };
  }
  return {
    isDriver: profile.isDriver,
    hasLicense: !!profile.driverLicense,
    hasVehicle: !!profile.licensePlate,
    licensePlate: profile.licensePlate,
    vehicleType: profile.vehicleType,
    vehicleColor: profile.vehicleColor,
    driverLicense: profile.driverLicense,
  };
}

// ── Push Tokens ───────────────────────────────────────────────────────────────

export async function getUserPushTokens(userId: number): Promise<{ token: string }[]> {
  return db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));
}

export async function removePushTokensByTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.delete(pushTokens).where(inArray(pushTokens.token, tokens));
}

export async function upsertPushToken(
  userId: number,
  token: string,
  platform: "ios" | "android" | "web",
  deviceId?: string,
): Promise<void> {
  await db
    .insert(pushTokens)
    .values({ userId, token, platform, deviceId, isActive: true })
    .onDuplicateKeyUpdate({ set: { userId, platform, isActive: true, deviceId } });
}

// ── Rides departing soon (for reminder cron) ──────────────────────────────────

/**
 * Returns rides with departureTime in [fromNow, toNow] window
 * along with their passenger user IDs so we can send reminders.
 */
export async function getRidesDepartingSoon(
  fromMs: number,
  toMs: number,
): Promise<{
  rideId: string;
  userId: number;
  recipientRole: NotificationAudience;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  departureTime: Date;
}[]> {
  const fromDate = new Date(fromMs);
  const toDate = new Date(toMs);

  // Get rides with a scheduled departure in the window
  const ridesInWindow = await db
    .select({
      id: rides.id,
      rideId: rides.rideId,
      driverId: rides.driverId,
      pickupAddress: rides.pickupAddress,
      dropoffAddress: rides.dropoffAddress,
      departureTime: rides.departureTime,
    })
    .from(rides)
    .where(
      sql`${rides.departureTime} BETWEEN ${fromDate} AND ${toDate}
          AND ${rides.status} IN ('searching', 'matched')`,
    );

  if (ridesInWindow.length === 0) return [];

  const rideDbIds = ridesInWindow.map((r) => r.id);

  // Get all passengers for these rides
  const passengers = await db
    .select({ rideId: ridePassengers.rideId, passengerId: ridePassengers.passengerId })
    .from(ridePassengers)
    .where(
      and(
        inArray(ridePassengers.rideId, rideDbIds),
        sql`${ridePassengers.status} IN ('joined', 'pending')`,
      ),
    );

  const result: {
    rideId: string;
    userId: number;
    recipientRole: NotificationAudience;
    pickupAddress: string | null;
    dropoffAddress: string | null;
    departureTime: Date;
  }[] = [];

  for (const ride of ridesInWindow) {
    const ridePassengerList = passengers.filter((p) => p.rideId === ride.id);
    for (const p of ridePassengerList) {
      result.push({
        rideId: ride.rideId,
        userId: p.passengerId,
        recipientRole: "passenger",
        pickupAddress: ride.pickupAddress,
        dropoffAddress: ride.dropoffAddress,
        departureTime: ride.departureTime!,
      });
    }
    if (ride.driverId != null) {
      result.push({
        rideId: ride.rideId,
        userId: ride.driverId,
        recipientRole: "driver",
        pickupAddress: ride.pickupAddress,
        dropoffAddress: ride.dropoffAddress,
        departureTime: ride.departureTime!,
      });
    }
  }

  return result;
}

// ============================================================================
// Student Verification Helpers
// ============================================================================

/** Insert a new student verification record (OTP session). */
export async function createStudentVerification(
  data: InsertStudentVerification,
): Promise<void> {
  await db.insert(studentVerifications).values(data);
}

/**
 * Return the most-recent verification record for a user, regardless of status.
 * Used to enforce resend cooldowns and display current state.
 */
export async function getLatestStudentVerification(
  userId: number,
): Promise<StudentVerification | null> {
  const [row] = await db
    .select()
    .from(studentVerifications)
    .where(eq(studentVerifications.userId, userId))
    .orderBy(desc(studentVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Return the active pending/verified record for a specific .edu email.
 * Used to prevent the same address from being claimed by two accounts.
 */
export async function getStudentVerificationByEmail(
  email: string,
): Promise<StudentVerification | null> {
  const [row] = await db
    .select()
    .from(studentVerifications)
    .where(
      and(
        eq(studentVerifications.email, email.trim().toLowerCase()),
        inArray(studentVerifications.status, ["pending", "verified"]),
      ),
    )
    .orderBy(desc(studentVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

/** Increment the failed-attempt counter on a verification record. */
export async function incrementStudentVerificationAttempts(
  id: number,
): Promise<void> {
  await db
    .update(studentVerifications)
    .set({ attempts: sql`${studentVerifications.attempts} + 1` })
    .where(eq(studentVerifications.id, id));
}

/** Update arbitrary fields on a verification record. */
export async function updateStudentVerification(
  id: number,
  data: Partial<Pick<StudentVerification, "status" | "verifiedAt" | "otpHash" | "expiresAt" | "lastSentAt" | "attempts">>,
): Promise<void> {
  await db
    .update(studentVerifications)
    .set(data as any)
    .where(eq(studentVerifications.id, id));
}

/**
 * Atomically mark a user as student-verified:
 *  1. Flip the verification record to "verified"
 *  2. Write isStudentVerified + metadata onto userProfiles
 */
export async function markUserStudentVerified(
  userId: number,
  verificationId: number,
  email: string,
  universityName: string,
  universityDomain: string,
): Promise<void> {
  const now = new Date();
  await Promise.all([
    db
      .update(studentVerifications)
      .set({ status: "verified", verifiedAt: now })
      .where(eq(studentVerifications.id, verificationId)),
    db
      .update(userProfiles)
      .set({
        isStudentVerified: true,
        isStudent: true,
        collegeEmail: email,
        studentVerifiedAt: now,
        studentUniversityName: universityName,
        studentUniversityDomain: universityDomain,
      })
      .where(eq(userProfiles.userId, userId)),
  ]);
}

/**
 * Revoke any existing verified/pending student records for a user and
 * clear the verification status from their profile. Used when the user
 * changes their verified email address.
 */
/**
 * On server startup: cancel any rides stuck in "searching" (finding_driver) status
 * from a previous server process. Returns the rideIds of cancelled rides so the
 * caller can notify affected passengers.
 */
export async function cancelStrandedRides(): Promise<{ rideId: string; id: number }[]> {
  const stranded = await db
    .select({ id: rides.id, rideId: rides.rideId })
    .from(rides)
    .where(eq(rides.status, "searching" as any));
  if (stranded.length === 0) return [];
  const ids = stranded.map(r => r.id);
  await db
    .update(rides)
    .set({ status: "cancelled" as any, rideStep: "cancelled" as any })
    .where(inArray(rides.id, ids));
  return stranded;
}

export async function revokeStudentVerification(userId: number): Promise<void> {
  await Promise.all([
    db
      .update(studentVerifications)
      .set({ status: "revoked" })
      .where(
        and(
          eq(studentVerifications.userId, userId),
          inArray(studentVerifications.status, ["pending", "verified"]),
        ),
      ),
    db
      .update(userProfiles)
      .set({
        isStudentVerified: false,
        studentVerifiedAt: null,
        studentUniversityName: null,
        studentUniversityDomain: null,
      })
      .where(eq(userProfiles.userId, userId)),
  ]);
}

export async function getRecentDestinations(userId: number, limit = 10) {
  const rows = await db
    .select({
      address: ridePassengers.dropoffAddress,
      lat: ridePassengers.dropoffLat,
      lng: ridePassengers.dropoffLng,
    })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(
      and(
        eq(ridePassengers.passengerId, userId),
        eq(rides.status, "completed"),
        isNotNull(ridePassengers.dropoffAddress),
      )
    )
    .orderBy(desc(rides.createdAt))
    .limit(limit * 3);

  const seen = new Set<string>();
  return rows
    .filter((r) => r.address && !seen.has(r.address) && seen.add(r.address))
    .slice(0, limit)
    .map((r) => ({
      address: r.address,
      lat: Number(r.lat),
      lng: Number(r.lng),
      shortName: r.address.split(",")[0] ?? r.address,
    }));
}
