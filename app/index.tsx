import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth-context-v2";
import { View } from "react-native";

// Root index — gives Expo Router a concrete entry point on Android so it never
// lands on an "Unmatched Route" screen. Redirects based on auth state once the
// session check completes; renders nothing while loading (root layout covers it).
export default function Index() {
  const { isSignedIn, isLoading } = useAuth();
  if (isLoading) return <View style={{ flex: 1 }} />;
  return <Redirect href={isSignedIn ? "/(tabs)" : "/auth/sign-in-v2"} />;
}
