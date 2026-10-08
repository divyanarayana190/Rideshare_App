import { AUTH } from "@/constants/design";
import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: AUTH.bg },
      }}
      initialRouteName="sign-in-v2"
    >
      <Stack.Screen name="sign-in-v2" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="enroll-password" />
    </Stack>
  );
}
