// Offline banner - shows when user loses network connection
import { useEffect, useRef } from "react";
import { Animated, Text, StyleSheet, Platform } from "react-native";
import { useNetworkStatus } from "@/hooks/use-network-status";

export function OfflineBanner() {
  const { isOffline } = useNetworkStatus();
  const slideAnim = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOffline ? 0 : -50,
      duration: 300,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [isOffline]); // eslint-disable-line react-hooks/exhaustive-deps -- slideAnim is a stable Animated.Value ref

  if (!isOffline) return null;

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.text}>{"You're offline. Some features may be limited."}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#d97706",
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    zIndex: 1000,
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
