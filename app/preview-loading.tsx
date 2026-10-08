import { Redirect } from "expo-router";
import FuturisticLoader from "@/components/FuturisticLoader";

/** Dev-only loader preview — not routable in production builds. */
export default function PreviewLoading() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return <FuturisticLoader />;
}
