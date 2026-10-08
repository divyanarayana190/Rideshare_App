// RideShare App — Core Types

/**
 * Frontend ride status superset.
 *
 * DB-level statuses (from rides.status column):
 *   searching | matched | driver_arrived | in_progress | completed | cancelled
 *
 * Frontend-only statuses used for SSE-based optimistic updates:
 *   driver_assigned — rideStep "driver_assigned" or "driver_en_route" (DB: "matched")
 *   active          — rideStep "ride_in_progress" (DB: "in_progress")
 *
 * Never send frontend-only values to the server; the server only understands DB-level statuses.
 */
export type RideStatus =
  | "searching"
  | "matched"
  | "driver_assigned"   // frontend-only optimistic state
  | "driver_arrived"
  | "in_progress"
  | "active"            // frontend-only optimistic state
  | "completed"
  | "cancelled";

export type RideMode = "solo" | "share";

/** Status of the background passenger-matching window for shared rides. */
export type SharedMatchStatus =
  | "SEARCHING_FOR_MATCH"
  | "MATCHED_SOLO"
  | "MATCHED_SHARED";

/**
 * UI-level safety filter used in the booking draft.
 * This is NOT the same as the server-side safetyMode enum
 * ("none" | "women_drivers_only" | "women_companions_only" | "women_only").
 * The booking draft's SafetyMode is never sent directly to the server;
 * safety preferences are stored server-side via the user.preferences tRPC procedures.
 */
export type SafetyMode = "standard" | "women_only" | "campus_verified";

export interface RideLocation {
  address: string;
  lat: number;
  lng: number;
  shortName: string;
}

export interface Passenger {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  pickup: RideLocation;
  dropoff: RideLocation;
  fareShare: number;
  distanceKm: number;
}

export interface Driver {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  vehicle: string;
  vehicleColor: string;
  licensePlate: string;
  totalTrips: number;
  phone?: string;
}

export interface Ride {
  id: string;
  mode: RideMode;
  status: RideStatus;
  pickup: RideLocation;
  dropoff: RideLocation;
  driver?: Driver;
  passengers: Passenger[];
  totalFare: number;
  myFare: number;
  distanceKm: number;
  estimatedMinutes: number;
  createdAt: string;
  completedAt?: string;
  myPassengerId: string;
  rideStartedAt?: number;
  sharedMatchStatus?: SharedMatchStatus;
  safetyMode?: SafetyMode;
}

export interface AvailableSharedRide {
  id: string;
  driver: Driver;
  pickup: RideLocation;
  dropoff: RideLocation;
  passengers: Passenger[];
  seatsAvailable: number;
  routeOverlapPercent: number;
  estimatedFareShare: number;
  fullFare: number;
  departureMinutes: number;
  distanceKm: number;
}

/** A live carpool match returned by searchCarpools. */
export interface RideMatch {
  rideId: string;
  driverName: string;
  driverAvatar: string;
  driverRating: number;
  driverTotalRides: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupDistKm: number;
  routeOverlapPercent: number;
  fareShare: number;
  seatsAvailable: number;
  departureMinutes: number;
  score: number;
  approvalRequired: boolean;
  detourKm?: number;
  detourMinutes?: number;
  compatibilityScore?: number;
}

export type RequestStatusValue = "IDLE" | "SENT" | "ACCEPTED" | "REJECTED" | "TIMEOUT";

export interface RequestState {
  status: RequestStatusValue;
  targetRideId: string | null;
  joinRequestId: string | null;
  expiresAt: number | null;
  fareShare: number | null;
}
