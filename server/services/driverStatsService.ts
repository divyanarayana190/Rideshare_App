import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { driverApplications, fileUploads, rideRequests, rides, stripePayments } from "../../drizzle/schema";
import type { DriverRideTab, DriverStatRange } from "../../shared/driver/constants";
import { db } from "../db";
import {
  getDriverSession,
  getRidePassengers,
  getUserById,
  getUserProfileByUserId,
} from "../db";

const DRIVER_SHARE = 0.8;

const SEATS_BY_TYPE: Record<string, number> = {
  sedan: 5,
  suv: 5,
  van: 7,
  truck: 3,
  luxury: 4,
};

function inferFuelType(
  make?: string | null,
  model?: string | null,
  stored?: "electric" | "hybrid" | "gasoline" | null,
): "electric" | "hybrid" | "gasoline" {
  if (stored) return stored;
  const haystack = `${make ?? ""} ${model ?? ""}`.toLowerCase();
  if (["tesla", "rivian", "lucid", "polestar"].some((m) => haystack.includes(m))) return "electric";
  if (haystack.includes("hybrid") || haystack.includes("prius")) return "hybrid";
  return "gasoline";
}

async function getLatestVehiclePhotoUrl(userId: number): Promise<string | null> {
  const [row] = await db
    .select({ publicUrl: fileUploads.publicUrl })
    .from(fileUploads)
    .where(and(eq(fileUploads.userId, userId), eq(fileUploads.purpose, "vehicle_photo")))
    .orderBy(desc(fileUploads.createdAt))
    .limit(1);
  return row?.publicUrl ?? null;
}

export function rangeToSince(range: DriverStatRange): Date | null {
  const now = new Date();
  if (range === "all_time") return null;
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === "week") {
    const day = now.getDay();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function getPrimaryPassengerForRide(rideNumericId: number) {
  const passengers = await getRidePassengers(rideNumericId);
  const primary = passengers.find((p) => p.isOriginalPassenger) ?? passengers[0];
  if (!primary) return null;
  const [user, profile] = await Promise.all([
    getUserById(primary.passengerId),
    getUserProfileByUserId(primary.passengerId),
  ]);
  return {
    passengerId: primary.passengerId,
    passengerName: user?.name ?? "Passenger",
    passengerRating: profile?.averageRating ? Number(profile.averageRating) : 0,
    isVerified: !!profile?.isStudentVerified,
    seats: primary.seatsOccupied ?? 1,
    paymentMethod: "Card",
  };
}

function mapRideTabStatus(ride: {
  status: string;
  rideStep: string | null;
  departureTime: Date | null;
  driverAssignedAt: Date | null;
}): DriverRideTab {
  if (ride.status === "completed") return "completed";
  if (ride.status === "cancelled") return "cancelled";
  if (ride.status === "missed") return "missed";
  const activeSteps = ["ride_started", "ride_in_progress", "driver_arrived", "driver_en_route"];
  if (
    ride.status === "in_progress" ||
    ride.status === "driver_arrived" ||
    (ride.rideStep && activeSteps.includes(ride.rideStep))
  ) {
    return "active";
  }
  return "upcoming";
}

function inferRideType(mode: string, departureTime: Date | null): "instant" | "scheduled" | "shared" {
  if (mode === "share") return "shared";
  if (departureTime && new Date(departureTime).getTime() > Date.now() + 5 * 60_000) {
    return "scheduled";
  }
  return "instant";
}

export async function computeAcceptanceRate(driverId: number, range: DriverStatRange): Promise<number> {
  const since = rangeToSince(range);
  const conditions = [eq(rideRequests.driverId, driverId)];
  if (since) {
    conditions.push(sql`${rideRequests.createdAt} >= ${since}`);
  }
  const rows = await db
    .select({ status: rideRequests.status })
    .from(rideRequests)
    .where(and(...conditions));

  if (rows.length === 0) return 100;
  const responded = rows.filter((r) => r.status !== "pending" && r.status !== "expired");
  if (responded.length === 0) return 100;
  const accepted = responded.filter((r) => r.status === "accepted").length;
  return Math.round((accepted / responded.length) * 100);
}

export async function getDriverDashboardStats(driverId: number, range: DriverStatRange) {
  const since = rangeToSince(range);
  const session = await getDriverSession(driverId);
  const profile = await getUserProfileByUserId(driverId);

  const rideConditions = [eq(rides.driverId, driverId)];
  if (since) {
    rideConditions.push(
      or(
        sql`${rides.completedAt} >= ${since}`,
        sql`${rides.cancelledAt} >= ${since}`,
        sql`${rides.createdAt} >= ${since}`,
      )!,
    );
  }

  const driverRides = await db
    .select()
    .from(rides)
    .where(and(...rideConditions))
    .orderBy(desc(rides.createdAt))
    .limit(500);

  const completed = driverRides.filter((r) => r.status === "completed");
  const cancelled = driverRides.filter((r) => r.status === "cancelled");
  const missed = driverRides.filter((r) => r.status === "missed");
  const accepted = driverRides.filter(
    (r) => r.driverId === driverId && r.status !== "searching" && r.rideStep !== "finding_driver",
  );

  const earnings = completed.reduce(
    (sum, r) => sum + parseFloat(String(r.totalFare ?? "0")) * DRIVER_SHARE,
    0,
  );

  let onlineMinutes = session?.totalOnlineMinutes ?? 0;
  if (
    session &&
    (session.status === "online" || session.status === "on_ride") &&
    session.goOnlineAt
  ) {
    const goOnline = new Date(session.goOnlineAt);
    const rangeStart = since ?? new Date(0);
    if (goOnline >= rangeStart || range === "today" || range === "week" || range === "month") {
      onlineMinutes += Math.max(
        0,
        Math.floor((Date.now() - Math.max(goOnline.getTime(), rangeStart.getTime())) / 60_000),
      );
    }
  }

  const acceptanceRate = await computeAcceptanceRate(driverId, range);
  const totalResponded = accepted.length + cancelled.length + missed.length;
  const cancellationRate =
    totalResponded > 0 ? Math.round((cancelled.length / totalResponded) * 100) : 0;
  const completionRate =
    accepted.length > 0 ? Math.round((completed.length / accepted.length) * 100) : 100;

  const activeRide = driverRides.find((r) => mapRideTabStatus(r) === "active") ?? null;
  const upcomingRide =
    driverRides.find(
      (r) =>
        mapRideTabStatus(r) === "upcoming" &&
        (!activeRide || r.rideId !== activeRide.rideId),
    ) ?? null;

  const pendingRequestsCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(rideRequests)
    .where(
      and(
        eq(rideRequests.driverId, driverId),
        eq(rideRequests.status, "pending"),
        sql`${rideRequests.expiresAt} > NOW()`,
      ),
    )
    .then((rows) => Number(rows[0]?.count ?? 0));

  async function enrichRidePreview(ride: (typeof driverRides)[0] | null) {
    if (!ride) return null;
    const pax = await getPrimaryPassengerForRide(ride.id);
    return {
      rideId: ride.rideId,
      pickupAddress: ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
      fare: parseFloat(String(ride.totalFare ?? "0")),
      scheduledAt: (ride.departureTime ?? ride.driverAssignedAt ?? ride.createdAt)?.toISOString?.() ??
        String(ride.departureTime ?? ride.createdAt),
      rideStep: ride.rideStep,
      status: ride.status,
      passengerName: pax?.passengerName ?? "Passenger",
    };
  }

  return {
    range,
    earnings: Math.round(earnings * 100) / 100,
    completedRides: completed.length,
    acceptedRides: accepted.length,
    cancelledRides: cancelled.length,
    missedRides: missed.length,
    onlineMinutes,
    rating: profile?.averageRating ? Number(profile.averageRating) : 0,
    acceptanceRate,
    cancellationRate,
    completionRate,
    activeRide: await enrichRidePreview(activeRide),
    upcomingRide: await enrichRidePreview(upcomingRide),
    pendingRequestsCount,
    isOnline: session?.status === "online" || session?.status === "on_ride",
  };
}

export async function getEnrichedDriverRides(
  driverId: number,
  tab: DriverRideTab,
  range: DriverStatRange,
) {
  const since = rangeToSince(range);
  const allRides = await db
    .select()
    .from(rides)
    .where(eq(rides.driverId, driverId))
    .orderBy(desc(rides.createdAt))
    .limit(200);

  const filtered = allRides.filter((r) => {
    if (mapRideTabStatus(r) !== tab) return false;
    if (!since) return true;
    const ref = r.completedAt ?? r.cancelledAt ?? r.departureTime ?? r.createdAt;
    return ref && new Date(ref) >= since;
  });

  const enriched = await Promise.all(
    filtered.map(async (r) => {
      const pax = await getPrimaryPassengerForRide(r.id);
      return {
        rideId: r.rideId,
        pickupAddress: r.pickupAddress,
        dropoffAddress: r.dropoffAddress,
        scheduledAt: (r.departureTime ?? r.driverAssignedAt ?? r.createdAt)?.toISOString?.() ??
          String(r.createdAt),
        fare: parseFloat(String(r.totalFare ?? "0")),
        distanceKm: parseFloat(String(r.distanceKm ?? "0")),
        estimatedMinutes: r.estimatedMinutes ?? 0,
        rideType: inferRideType(r.mode, r.departureTime),
        status: mapRideTabStatus(r),
        dbStatus: r.status,
        rideStep: r.rideStep,
        passengerName: pax?.passengerName ?? "Passenger",
        passengerRating: pax?.passengerRating ?? 0,
        isVerified: pax?.isVerified ?? false,
        passengerCount: pax?.seats ?? r.totalSeats ?? 1,
        paymentMethod: pax?.paymentMethod ?? "Card",
        pickupLat: Number(r.pickupLat),
        pickupLng: Number(r.pickupLng),
        dropoffLat: Number(r.dropoffLat),
        dropoffLng: Number(r.dropoffLng),
      };
    }),
  );

  return enriched;
}

export async function getDriverEarningsDetail(driverId: number, range: DriverStatRange) {
  const since = rangeToSince(range);
  const conditions = [eq(rides.driverId, driverId), eq(rides.status, "completed")];
  if (since) {
    conditions.push(sql`${rides.completedAt} >= ${since}`);
  }

  const completedRides = await db
    .select()
    .from(rides)
    .where(and(...conditions))
    .orderBy(desc(rides.completedAt));

  const gross = completedRides.reduce(
    (sum, r) => sum + parseFloat(String(r.totalFare ?? "0")),
    0,
  );
  const net = gross * DRIVER_SHARE;
  const platformFees = gross - net;

  const session = await getDriverSession(driverId);
  const profile = await getUserProfileByUserId(driverId);

  const [app] = await db
    .select()
    .from(driverApplications)
    .where(eq(driverApplications.userId, driverId))
    .orderBy(desc(driverApplications.createdAt))
    .limit(1);

  const payoutReady = !!profile?.stripeConnectId || !!app?.accountLast4;

  const tipConditions = [
    eq(stripePayments.driverId, driverId),
    eq(stripePayments.status, "succeeded"),
    sql`${stripePayments.tipCents} > 0`,
  ];
  if (since) tipConditions.push(sql`${stripePayments.paidAt} >= ${since}`);
  const tipRows = await db
    .select({ tipCents: stripePayments.tipCents })
    .from(stripePayments)
    .where(and(...tipConditions));
  const tipsTotal = tipRows.reduce((s, r) => s + Number(r.tipCents ?? 0), 0) / 100;

  const { getOrCreateWallet } = await import("../db");
  const wallet = await getOrCreateWallet(driverId);

  return {
    range,
    grossEarnings: Math.round(gross * 100) / 100,
    platformFees: Math.round(platformFees * 100) / 100,
    netEarnings: Math.round((net + tipsTotal) * 100) / 100,
    tips: Math.round(tipsTotal * 100) / 100,
    rideFares: Math.round(net * 100) / 100,
    pendingPayout: Math.round(Number(wallet.balance ?? 0) * 100) / 100,
    completedRides: completedRides.length,
    payoutStatus: payoutReady ? ("ready" as const) : ("setup_required" as const),
    recentTransactions: completedRides.slice(0, 30).map((r) => ({
      rideId: r.rideId,
      pickupAddress: r.pickupAddress,
      dropoffAddress: r.dropoffAddress,
      grossFare: parseFloat(String(r.totalFare ?? "0")),
      netEarnings: Math.round(parseFloat(String(r.totalFare ?? "0")) * DRIVER_SHARE * 100) / 100,
      completedAt: r.completedAt?.toISOString() ?? null,
      distanceKm: parseFloat(String(r.distanceKm ?? "0")),
    })),
    onlineMinutes: session?.totalOnlineMinutes ?? 0,
  };
}

export async function getDriverProfileBundle(driverId: number) {
  const [user, profile, session, app] = await Promise.all([
    getUserById(driverId),
    getUserProfileByUserId(driverId),
    getDriverSession(driverId),
    db
      .select()
      .from(driverApplications)
      .where(eq(driverApplications.userId, driverId))
      .orderBy(desc(driverApplications.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const acceptanceRate = await computeAcceptanceRate(driverId, "all_time");
  const vehiclePhotoFromUpload = await getLatestVehiclePhotoUrl(driverId);

  const buildVehicle = (source: {
    make: string | null;
    model: string | null;
    year: number | null;
    color: string | null;
    plate: string | null;
    type: string | null;
    photoUrl?: string | null;
    fuelType?: "electric" | "hybrid" | "gasoline" | null;
    seatCount?: number | null;
  } | null) => {
    if (!source) return null;
    const fuelType = inferFuelType(source.make, source.model, source.fuelType ?? null);
    const seatCount =
      source.seatCount && source.seatCount > 0
        ? source.seatCount
        : source.type
          ? SEATS_BY_TYPE[source.type] ?? null
          : null;
    return {
      make: source.make,
      model: source.model,
      year: source.year,
      color: source.color,
      plate: source.plate,
      type: source.type,
      photoUrl: source.photoUrl ?? vehiclePhotoFromUpload,
      fuelType,
      seatCount,
      isPrimary: true,
    };
  };

  return {
    user: {
      id: user?.id,
      name: user?.name ?? "Driver",
      email: user?.email,
      createdAt: user?.createdAt?.toISOString() ?? null,
      averageRating: profile?.averageRating ? Number(profile.averageRating) : null,
      totalRides: profile?.totalRides ?? 0,
    },
    verification: {
      isDriver: profile?.isDriver ?? false,
      applicationStatus: app?.status ?? (profile?.isDriver ? "approved" : "pending"),
      rejectionReason: app?.rejectionReason ?? null,
      approvedAt: app?.approvedAt?.toISOString() ?? null,
    },
    vehicle: buildVehicle(
      app
        ? {
            make: app.vehicleMake,
            model: app.vehicleModel,
            year: app.vehicleYear,
            color: app.vehicleColor,
            plate: app.plateNumber,
            type: app.vehicleType,
            photoUrl: app.vehiclePhotoUrl,
            fuelType: app.fuelType,
            seatCount: app.seatCount,
          }
        : profile?.vehicleType
          ? {
              make: profile.vehicleType,
              model: null,
              year: null,
              color: profile.vehicleColor,
              plate: profile.licensePlate,
              type: profile.vehicleType,
              photoUrl: vehiclePhotoFromUpload,
              fuelType: null,
              seatCount: null,
            }
          : null,
    ),
    documents: app
      ? {
          licenseFrontUrl: app.licenseFrontUrl,
          licenseBackUrl: app.licenseBackUrl,
          insuranceDocUrl: app.insuranceDocUrl,
          licenseNumber: app.licenseNumber,
          licenseExpiry: app.licenseExpiry,
          insuranceExpiry: app.insuranceExpiry,
        }
      : null,
    payout: app
      ? {
          bankName: app.bankName,
          accountLast4: app.accountLast4,
          routingLast4: app.routingLast4,
          stripeConnectId: profile?.stripeConnectId ?? null,
        }
      : { bankName: null, accountLast4: null, routingLast4: null, stripeConnectId: profile?.stripeConnectId ?? null },
    session: {
      status: session?.status ?? "offline",
      acceptanceRate,
      todayRides: session?.todayRides ?? 0,
      todayEarnings: session?.todayEarnings ? Number(session.todayEarnings) : 0,
    },
  };
}
