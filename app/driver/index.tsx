import { Redirect } from "expo-router";

/** `/driver` → default driver tab */
export default function DriverIndex() {
  return <Redirect href="/driver/dashboard" />;
}
