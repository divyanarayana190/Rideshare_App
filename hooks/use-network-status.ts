// Network status hook - cross-platform online/offline detection
import { useEffect, useState } from "react";
import { Platform } from "react-native";

interface NetworkStatus {
  isOnline: boolean;
  isOffline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS === "web") {
      // Web: use navigator.onLine + event listeners
      if (typeof window !== "undefined") {
        setIsOnline(navigator.onLine);
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
          window.removeEventListener("online", handleOnline);
          window.removeEventListener("offline", handleOffline);
        };
      }
    } else {
      // Native: use @react-native-community/netinfo
      let unsubscribe: (() => void) | undefined;
      (async () => {
        try {
          const NetInfo = await import("@react-native-community/netinfo");
          unsubscribe = NetInfo.default.addEventListener((state) => {
            setIsOnline(state.isConnected ?? true);
          });
        } catch {
          // NetInfo not available, assume online
          setIsOnline(true);
        }
      })();
      return () => { unsubscribe?.(); };
    }
  }, []);

  return { isOnline, isOffline: !isOnline };
}
