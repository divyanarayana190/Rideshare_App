// Push Notifications Hook - Register/handle Expo push notifications
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context-v2";

// Configure notification handler (foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const { isSignedIn } = useAuth();

  const registerMutation = trpc.auth.registerPushToken.useMutation();

  useEffect(() => {
    if (Platform.OS === "web" || !isSignedIn) return;

    let mounted = true;

    (async () => {
      // Request permission
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        if (__DEV__) console.log("[Push] Permission not granted");
        return;
      }

      if (mounted) setPermissionGranted(true);

      // Get push token
      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        const token = tokenData.data;
        if (mounted) setExpoPushToken(token);

        // Register with server
        registerMutation.mutate({
          token,
          platform: Platform.OS as "ios" | "android",
        });
      } catch (error) {
        console.error("[Push] Failed to get token:", error);
      }

      // Android notification channel
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#7c3aed",
        });
        await Notifications.setNotificationChannelAsync("ride-requests", {
          name: "Ride Requests",
          importance: Notifications.AndroidImportance.MAX,
          sound: "default",
        });
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isSignedIn]);

  return { expoPushToken, permissionGranted };
}
