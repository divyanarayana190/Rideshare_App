/**
 * useRideManager — React hook wrapper for RideManager singleton.
 * Provides reactive state and alert handling.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import RideManager from "@/lib/ride-manager";
import type { RideState, RideAlert } from "@/lib/ride-manager";

export function useRideManager(rideId: string | null) {
  const managerRef = useRef(RideManager.getInstance());
  const [state, setState] = useState<RideState>(managerRef.current.getState());

  useEffect(() => {
    const manager = managerRef.current;

    // Subscribe to state changes
    const unsubState = manager.subscribe(setState);

    // Subscribe to alerts
    const unsubAlerts = manager.subscribeAlerts((alert: RideAlert) => {
      // Web: log to console
      if (Platform.OS === "web") {
        console.log(`[RideAlert] ${alert.title}: ${alert.message}`);
      }
      // Native: show Alert dialog for critical alerts
      if (
        alert.type === "driver_cancelled" ||
        alert.type === "no_show_warning" ||
        alert.type === "search_timeout" ||
        alert.type === "payment_failed"
      ) {
        Alert.alert(alert.title, alert.message);
      }
    });

    return () => {
      unsubState();
      unsubAlerts();
    };
  }, []);

  // Start/stop tracking based on rideId
  useEffect(() => {
    const manager = managerRef.current;
    if (rideId) {
      manager.startTracking(rideId);
    } else {
      manager.stopTracking();
    }
    return () => {
      if (rideId) manager.stopTracking();
    };
  }, [rideId]);

  const dispatchAction = useCallback(
    (key: string, action: () => Promise<unknown>) =>
      managerRef.current.dispatchAction(key, action),
    [],
  );

  const isActionPending = useCallback(
    (key: string) => managerRef.current.isActionPending(key),
    [],
  );

  const updateState = useCallback(
    (patch: Partial<RideState>) => managerRef.current.updateState(patch),
    [],
  );

  return {
    ...state,
    dispatchAction,
    isActionPending,
    updateState,
    manager: managerRef.current,
  };
}
