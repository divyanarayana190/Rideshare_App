import { Stack } from "expo-router";

export default function LegalLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0A" } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="driver-terms" />
      <Stack.Screen name="community-guidelines" />
      <Stack.Screen name="safety-policy" />
      <Stack.Screen name="[slug]" />
    </Stack>
  );
}
