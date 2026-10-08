import { useDriverStore } from '@/lib/stores';
import {
  DRIVER_LOCATION_MIN_INTERVAL_MS,
  DRIVER_LOCATION_RATE_LIMIT_BACKOFF_MS,
  shouldSendLocationUpdate,
  type LocationSnapshot,
} from '@/lib/driver-location-throttle';
import { trpc } from '@/lib/trpc';
import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { data?: { httpStatus?: number }; message?: string };
  return e.data?.httpStatus === 429 || (e.message?.includes('429') ?? false);
}

/** Polls GPS and sends driver.updateLocation while online (throttled). */
export function useDriverOnlineLocation(enabled: boolean) {
  const updateLoc = trpc.driver.updateLocation.useMutation();
  const setLocation = useDriverStore((s) => s.setLocation);
  const session = useDriverStore((s) => s.session);
  const rideId = session?.currentRideId ?? undefined;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef<LocationSnapshot | null>(null);
  const backoffUntilRef = useRef(0);
  const appActiveRef = useRef(true);
  const tickingRef = useRef(false);
  const updateLocRef = useRef(updateLoc);
  updateLocRef.current = updateLoc;

  useEffect(() => {
    if (Platform.OS === 'web') {
      appActiveRef.current = typeof document !== 'undefined' ? !document.hidden : true;
      return;
    }

    const RN = require('react-native') as {
      AppState: {
        currentState: string;
        addEventListener: (event: 'change', handler: (state: string) => void) => { remove: () => void };
      };
    };
    const { AppState } = RN;

    const onChange = (state: string) => {
      appActiveRef.current = state === 'active';
    };
    appActiveRef.current = AppState.currentState === 'active';
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const tick = async () => {
      if (!enabled || !appActiveRef.current || tickingRef.current) return;
      if (Date.now() < backoffUntilRef.current) return;

      tickingRef.current = true;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude: lat, longitude: lng } = loc.coords;
        const now = Date.now();

        if (!shouldSendLocationUpdate(lastSentRef.current, lat, lng, now)) return;

        setLocation({ lat, lng });
        await updateLocRef.current.mutateAsync({ lat, lng, rideId });
        lastSentRef.current = { lat, lng, ts: now };
      } catch (err) {
        if (isRateLimitError(err)) {
          backoffUntilRef.current = Date.now() + DRIVER_LOCATION_RATE_LIMIT_BACKOFF_MS;
        }
      } finally {
        tickingRef.current = false;
      }
    };

    void tick();
    timerRef.current = setInterval(tick, DRIVER_LOCATION_MIN_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, rideId, setLocation]);
}
