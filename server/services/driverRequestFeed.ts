import { db } from "../db";
import { userPreferences, userProfiles, users } from "../../drizzle/schema";
import { inArray } from "drizzle-orm";

export type DriverFeedMatchLabel = "High Match" | "Medium Match" | "Low Match";
export type DriverFeedRideType = "solo" | "shared" | "group";

export interface DriverFeedRequest {
  requestId: string;
  rideId?: string;
  passengerId: string;
  passengerName: string;
  passengerPhoto?: string;
  passengerRating?: number;
  passengerRideCount?: number;
  isVerified?: boolean;
  isStudentVerified?: boolean;
  school?: string;
  pickupLabel: string;
  dropoffLabel: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  scheduledAt?: string;
  isImmediate: boolean;
  rideType: DriverFeedRideType;
  passengerCount: number;
  seatsRequested: number;
  distanceToPickupKm: number;
  pickupEtaMinutes: number;
  tripDistanceKm: number;
  estimatedTripMinutes: number;
  offeredFare: number;
  estimatedEarnings?: number;
  platformFee?: number;
  paymentType?: "cash" | "card";
  matchScore: number;
  matchLabel: DriverFeedMatchLabel;
  safetyMode?: boolean;
  genderPreference?: string;
  highRating?: boolean;
  status: string;
  createdAt: string;
  expiresAt: string;
  source: "broadcast" | "dispatch";
  /** Legacy aliases for older clients */
  pickupAddress: string;
  dropoffAddress: string;
  offerPrice: number;
  distanceKm: number;
  estimatedMinutes: number;
}

export interface PassengerMeta {
  name: string;
  photo?: string;
  rating?: number;
  rideCount?: number;
  isVerified?: boolean;
  isStudentVerified?: boolean;
  school?: string;
  safetyMode?: string;
}

const DRIVER_SHARE = 0.8;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeMatch(distanceToPickupKm: number): { matchScore: number; matchLabel: DriverFeedMatchLabel } {
  const proximity = Math.max(0, 100 - distanceToPickupKm * 8);
  const matchScore = Math.min(99, Math.round(proximity * 0.6 + 40));
  const matchLabel: DriverFeedMatchLabel =
    matchScore >= 75 ? "High Match" : matchScore >= 50 ? "Medium Match" : "Low Match";
  return { matchScore, matchLabel };
}

export function estimatePickupEtaMinutes(distanceKm: number): number {
  if (distanceKm <= 0) return 0;
  return Math.max(1, Math.round((distanceKm / 30) * 60));
}

export function inferRideType(mode: "solo" | "share" | null | undefined, passengerCount: number): DriverFeedRideType {
  if (passengerCount >= 3) return "group";
  if (mode === "share") return "shared";
  if (passengerCount >= 2) return "shared";
  return "solo";
}

export function isScheduledPickup(departureTime: Date | null | undefined, createdAt: Date): boolean {
  if (!departureTime) return false;
  const depMs = departureTime.getTime();
  const now = Date.now();
  return depMs > now + 30 * 60 * 1000;
}

export async function getPassengerMetaMap(passengerIds: number[]): Promise<Map<number, PassengerMeta>> {
  const map = new Map<number, PassengerMeta>();
  if (passengerIds.length === 0) return map;

  const [userRows, profileRows, prefRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, profilePhotoUrl: users.profilePhotoUrl })
      .from(users)
      .where(inArray(users.id, passengerIds)),
    db.select().from(userProfiles).where(inArray(userProfiles.userId, passengerIds)),
    db.select().from(userPreferences).where(inArray(userPreferences.userId, passengerIds)),
  ]);

  const profileByUser = new Map(profileRows.map((p) => [p.userId, p]));
  const prefByUser = new Map(prefRows.map((p) => [p.userId, p]));

  for (const u of userRows) {
    const profile = profileByUser.get(u.id);
    const pref = prefByUser.get(u.id);
    const rating = profile?.averageRating != null ? Number(profile.averageRating) : undefined;
    map.set(u.id, {
      name: u.name?.trim() || "",
      photo: u.profilePhotoUrl ?? profile?.profilePhoto ?? undefined,
      rating: rating && rating > 0 ? rating : undefined,
      rideCount: profile?.totalRides ?? undefined,
      isVerified: !!(profile?.phoneNumber && profile.phoneNumber.length >= 7),
      isStudentVerified: profile?.isStudentVerified ?? false,
      school: profile?.studentUniversityName ?? undefined,
      safetyMode: pref?.safetyMode ?? undefined,
    });
  }

  return map;
}

export function isValidFeedRequest(item: DriverFeedRequest): boolean {
  if (!item.requestId?.trim()) return false;
  if (!item.pickupLabel?.trim() || !item.dropoffLabel?.trim()) return false;
  if (!Number.isFinite(item.pickupLat) || !Number.isFinite(item.pickupLng)) return false;
  if (item.pickupLat === 0 && item.pickupLng === 0) return false;
  if (!Number.isFinite(item.offeredFare) || item.offeredFare <= 0) return false;
  if (new Date(item.expiresAt).getTime() <= Date.now()) return false;
  if (["cancelled", "completed", "expired", "matched"].includes(item.status)) return false;
  if (item.passengerId === "0" || item.passengerId === "") return false;
  return true;
}

export function buildDriverFeedRequest(input: {
  requestId: string;
  rideId?: string;
  passengerId: number;
  meta?: PassengerMeta;
  pickupLabel: string;
  dropoffLabel: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  passengerCount: number;
  tripDistanceKm: number;
  estimatedTripMinutes: number;
  offeredFare: number;
  distanceToPickupKm: number;
  scheduledAt?: Date | null;
  isImmediate: boolean;
  rideType: DriverFeedRideType;
  rideSafetyMode?: string | null;
  paymentType?: "cash" | "card";
  status: string;
  createdAt: Date;
  expiresAt: Date;
  source: "broadcast" | "dispatch";
}): DriverFeedRequest {
  const { matchScore, matchLabel } = computeMatch(input.distanceToPickupKm);
  const offeredFare = Math.round(input.offeredFare * 100) / 100;
  const estimatedEarnings = Math.round(offeredFare * DRIVER_SHARE * 100) / 100;
  const platformFee = Math.round((offeredFare - estimatedEarnings) * 100) / 100;
  const meta = input.meta;
  const displayName = meta?.name?.trim() || "";

  const genderPreference =
    input.rideSafetyMode && input.rideSafetyMode !== "none"
      ? input.rideSafetyMode
      : meta?.safetyMode && meta.safetyMode !== "none"
        ? meta.safetyMode
        : undefined;

  return {
    requestId: input.requestId,
    rideId: input.rideId,
    passengerId: String(input.passengerId),
    passengerName: displayName,
    passengerPhoto: meta?.photo,
    passengerRating: meta?.rating,
    passengerRideCount: meta?.rideCount,
    isVerified: meta?.isVerified,
    isStudentVerified: meta?.isStudentVerified,
    school: meta?.school,
    pickupLabel: input.pickupLabel,
    dropoffLabel: input.dropoffLabel,
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    dropoffLat: input.dropoffLat,
    dropoffLng: input.dropoffLng,
    scheduledAt: input.scheduledAt ? input.scheduledAt.toISOString() : undefined,
    isImmediate: input.isImmediate,
    rideType: input.rideType,
    passengerCount: input.passengerCount,
    seatsRequested: input.passengerCount,
    distanceToPickupKm: input.distanceToPickupKm,
    pickupEtaMinutes: estimatePickupEtaMinutes(input.distanceToPickupKm),
    tripDistanceKm: input.tripDistanceKm,
    estimatedTripMinutes: input.estimatedTripMinutes,
    offeredFare,
    estimatedEarnings,
    platformFee,
    paymentType: input.paymentType,
    matchScore,
    matchLabel,
    safetyMode: !!(genderPreference && genderPreference !== "none"),
    genderPreference,
    highRating: meta?.rating != null && meta.rating >= 4.5,
    status: input.status,
    createdAt: input.createdAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    source: input.source,
    pickupAddress: input.pickupLabel,
    dropoffAddress: input.dropoffLabel,
    offerPrice: offeredFare,
    distanceKm: input.tripDistanceKm,
    estimatedMinutes: input.estimatedTripMinutes,
  };
}
