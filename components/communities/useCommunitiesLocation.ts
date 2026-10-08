import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";

export type LocationPermissionState = "loading" | "granted" | "denied";

export function useCommunitiesLocation() {
  const [permission, setPermission] = useState<LocationPermissionState>("loading");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const refresh = useCallback(async () => {
    setPermission("loading");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermission("denied");
        setCoords(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setPermission("granted");
    } catch {
      setPermission("denied");
      setCoords(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openSettings = useCallback(() => {
    if (Platform.OS === "ios") {
      void Linking.openURL("app-settings:");
    } else {
      void Linking.openSettings();
    }
  }, []);

  return { permission, coords, refresh, openSettings };
}
