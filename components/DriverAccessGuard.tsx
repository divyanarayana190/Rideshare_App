import FuturisticLoader from "@/components/FuturisticLoader";
import { driverAccessFallbackRoute } from "@/lib/driver-access";
import { useDriverAccess } from "@/lib/use-driver-access";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

/**
 * Wraps driver routes — approved drivers pass through;
 * others redirect to onboarding / status screens.
 */
export function DriverAccessGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { canAccessDriverMode, isLoading, access, driverStatus } = useDriverAccess(true);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (isLoading || canAccessDriverMode) {
      redirectedRef.current = false;
      return;
    }
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(driverAccessFallbackRoute(access) as any);
  }, [isLoading, canAccessDriverMode, access, router]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <FuturisticLoader />
      </View>
    );
  }

  if (!canAccessDriverMode) {
    const message =
      driverStatus === "suspended" || driverStatus === "rejected"
        ? "Driver access is not active. Please contact support or update your documents."
        : driverStatus === "pending"
          ? "Your driver application is under review."
          : "Complete driver onboarding to access Driver Mode.";

    return (
      <View style={styles.center}>
        <Text style={styles.message}>{message}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0A0A0A",
    paddingHorizontal: 32,
  },
  message: {
    color: "#9CA3AF",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
