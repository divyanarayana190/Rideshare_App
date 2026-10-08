export type TabKey = "all" | "pending" | "accepted" | "rejected";

export type RequestItem = {
  joinRequestId: string;
  rideId: string;
  rideTitle: string;
  pickupAddress: string;
  dropoffAddress: string;
  departureTime: string | null;
  pricePerSeat: number;
  status: string;
  seatsRequested: number;
  message: string | null;
  createdAt: string;
  passengerName: string;
  passengerId: number;
  passengerRating: string;
  passengerRides: number;
  passengerGender: string | null;
  passengerAge: number | null;
  isStudentVerified: boolean;
  isMidRideJoin: boolean;
  detourKm: number | null;
  bags: number;
  genderPreference: string | null;
  rideStatus?: string;
  seatsAvailable?: number;
  fareShare?: number;
};

export type RideRequestSection = {
  rideId: string;
  rideTitle: string;
  departureTime: string | null;
  seatsAvailable: number;
  data: RequestItem[];
};

export type RequestListRow =
  | { kind: "header"; key: string; section: RideRequestSection }
  | { kind: "item"; key: string; item: RequestItem };
