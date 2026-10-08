import { Redirect, useLocalSearchParams } from "expo-router";

/** Orphan duplicate — canonical receipt is /trip-receipt. */
export default function RideReceiptRedirect() {
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();
  if (rideId) {
    return <Redirect href={{ pathname: "/trip-receipt", params: { rideId } }} />;
  }
  return <Redirect href="/ride-history" />;
}
