import { Redirect, useLocalSearchParams } from "expo-router";

/** Legacy route — canonical rating screen is /rate-ride-v2. */
export default function RateRideRedirect() {
  const params = useLocalSearchParams<{
    rideId?: string;
    ratedUserId?: string;
    ratedUserName?: string;
    driverId?: string;
    driverName?: string;
    fare?: string;
    pickupAddress?: string;
    dropoffAddress?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: "/rate-ride-v2",
        params: {
          rideId: params.rideId ?? "",
          driverId: params.driverId ?? params.ratedUserId ?? "",
          driverName: params.driverName ?? params.ratedUserName ?? "",
          fare: params.fare ?? "",
          pickupAddress: params.pickupAddress ?? "",
          dropoffAddress: params.dropoffAddress ?? "",
        },
      }}
    />
  );
}
