export type DriverRequestType = "dispatch" | "broadcast" | "scheduled" | "carpool_join";

export type DriverRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "matched"
  | "broadcasting"
  | "searching";

export interface DriverRequestCard {
  id: string;
  requestType: DriverRequestType;
  rideId: string | null;
  passengerId: number;
  passengerName: string;
  passengerRating: number;
  passengerPhotoUrl: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  scheduledAt: string | null;
  requestedAt: string;
  fareCents: number;
  distanceMiles: number;
  durationMinutes: number;
  pickupDistanceMiles: number;
  matchScore: number;
  passengerCount: number;
  rideType: "instant" | "scheduled" | "shared" | "solo" | "group";
  status: DriverRequestStatus;
  notes: string | null;
  safetyPreferences: string | null;
  isScheduled: boolean;
  isSharedRide: boolean;
  expiresAt: string | null;
  matchLabel: string;
}

export interface DriverRequestActionResult {
  success: boolean;
  rideId: string | null;
  requestId: string;
  status: "accepted" | "rejected";
  message: string;
}
