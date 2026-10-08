/**
 * useDriverTracking — production-grade GPS tracking hook for driver mode.
 *
 * Responsibilities:
 *  - Continuous GPS subscription via expo-location (BestForNavigation accuracy)
 *  - Weighted GPS smoothing to eliminate jitter
 *  - Heading calculation from movement when device heading unavailable
 *  - WebSocket emission (socket.io) at throttled 2-second intervals
 *  - Client-side geofence detection for pickup arrival (50 m) and destination arrival (80 m)
 *  - Updates driver store location for downstream components
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { useDriverStore } from '@/lib/stores';
import { getSessionToken } from '@/lib/_core/auth';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const EMIT_THROTTLE_MS = 2000;
const SMOOTHING_ALPHA = 0.72; // weight for new reading

export interface DriverPosition {
  lat: number;
  lng: number;
  heading: number;   // degrees 0-360
  speed: number;     // m/s
  accuracy: number;  // meters
  timestamp: number;
}

export interface GeofenceEvent {
  type: 'pickup_arrived' | 'destination_arrived';
  distanceMeters: number;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface UseDriverTrackingOptions {
  rideId: string | null;
  enabled?: boolean;
  pickupLat?: number | null;
  pickupLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  pickupGeofenceRadius?: number;
  destGeofenceRadius?: number;
  onGeofenceEnter?: (event: GeofenceEvent) => void;
}

interface UseDriverTrackingResult {
  position: DriverPosition | null;
  isTracking: boolean;
  connectionStatus: ConnectionStatus;
}

// ── Haversine distance (meters) ──────────────────────────────────────────────
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Bearing from point A → B (degrees) ──────────────────────────────────────
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function useDriverTracking({
  rideId,
  enabled = true,
  pickupLat,
  pickupLng,
  destLat,
  destLng,
  pickupGeofenceRadius = 50,
  destGeofenceRadius = 80,
  onGeofenceEnter,
}: UseDriverTrackingOptions): UseDriverTrackingResult {
  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  const socketRef = useRef<Socket | null>(null);
  const lastEmitRef = useRef(0);
  const prevRawRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevSmoothedRef = useRef<{ lat: number; lng: number } | null>(null);
  const geofenceFiredRef = useRef<Set<string>>(new Set());
  const onGeofenceRef = useRef(onGeofenceEnter);
  onGeofenceRef.current = onGeofenceEnter;

  const setLocation = useDriverStore((s) => s.setLocation);

  // ── WebSocket connection ─────────────────────────────────────────────────
  const connectSocket = useCallback(async (rid: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join_ride', rid);
      return;
    }
    try {
      const token = await getSessionToken();
      const socket = io(API_BASE, {
        auth: { token: token ?? '' },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 30000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnectionStatus('connected');
        socket.emit('join_ride', rid);
      });
      socket.on('disconnect', () => setConnectionStatus('disconnected'));
      socket.on('reconnect_attempt', () => setConnectionStatus('reconnecting'));
      socket.on('connect_error', () => setConnectionStatus('disconnected'));
    } catch {
      setConnectionStatus('disconnected');
    }
  }, []);

  // ── Throttled WebSocket emit ─────────────────────────────────────────────
  const emitLocation = useCallback((pos: DriverPosition, rid: string) => {
    const now = Date.now();
    if (now - lastEmitRef.current < EMIT_THROTTLE_MS) return;
    const socket = socketRef.current;
    if (!socket?.connected) return;
    lastEmitRef.current = now;
    socket.emit('driver_location', {
      rideId: rid,
      latitude: pos.lat,
      longitude: pos.lng,
      heading: pos.heading,
      speed: pos.speed,
    });
  }, []);

  // ── Geofence check ───────────────────────────────────────────────────────
  const checkGeofences = useCallback((lat: number, lng: number) => {
    if (pickupLat != null && pickupLng != null && !geofenceFiredRef.current.has('pickup')) {
      const d = haversineM(lat, lng, pickupLat, pickupLng);
      if (d <= pickupGeofenceRadius) {
        geofenceFiredRef.current.add('pickup');
        onGeofenceRef.current?.({ type: 'pickup_arrived', distanceMeters: d });
      }
    }
    if (destLat != null && destLng != null && !geofenceFiredRef.current.has('dest')) {
      const d = haversineM(lat, lng, destLat, destLng);
      if (d <= destGeofenceRadius) {
        geofenceFiredRef.current.add('dest');
        onGeofenceRef.current?.({ type: 'destination_arrived', distanceMeters: d });
      }
    }
  }, [pickupLat, pickupLng, destLat, destLng, pickupGeofenceRadius, destGeofenceRadius]);

  // ── Reset geofences when ride changes ────────────────────────────────────
  useEffect(() => {
    geofenceFiredRef.current = new Set();
  }, [rideId]);

  // ── Shared position handler (used by both native and web paths) ─────────────
  const handleRawPosition = useCallback((
    rawLat: number, rawLng: number,
    deviceHeading: number | null, rawSpeed: number | null,
    accuracy: number, timestamp: number,
    rid: string,
  ) => {
    const prev = prevSmoothedRef.current;
    const smoothLat = prev ? prev.lat * (1 - SMOOTHING_ALPHA) + rawLat * SMOOTHING_ALPHA : rawLat;
    const smoothLng = prev ? prev.lng * (1 - SMOOTHING_ALPHA) + rawLng * SMOOTHING_ALPHA : rawLng;

    let heading = 0;
    if (deviceHeading != null && deviceHeading >= 0) {
      heading = deviceHeading;
    } else if (prevRawRef.current) {
      const d = haversineM(prevRawRef.current.lat, prevRawRef.current.lng, rawLat, rawLng);
      if (d > 2) {
        heading = bearingDeg(prevRawRef.current.lat, prevRawRef.current.lng, rawLat, rawLng);
      }
    }

    prevRawRef.current     = { lat: rawLat, lng: rawLng };
    prevSmoothedRef.current = { lat: smoothLat, lng: smoothLng };

    const newPos: DriverPosition = {
      lat: smoothLat, lng: smoothLng,
      heading,
      speed:    Math.max(0, rawSpeed ?? 0),
      accuracy: accuracy ?? 999,
      timestamp,
    };

    setPosition(newPos);
    setLocation({ lat: smoothLat, lng: smoothLng });
    emitLocation(newPos, rid);
    checkGeofences(smoothLat, smoothLng);
  }, [setLocation, emitLocation, checkGeofences]);

  // ── Main tracking subscription ────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !rideId) return;

    let mounted = true;

    // ── Web path: use native browser Geolocation API ────────────────────────
    if (Platform.OS === 'web') {
      if (!navigator?.geolocation) return;

      connectSocket(rideId);
      setIsTracking(true);

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!mounted) return;
          handleRawPosition(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.heading,
            pos.coords.speed,
            pos.coords.accuracy,
            pos.timestamp,
            rideId,
          );
        },
        () => { if (mounted) setIsTracking(false); },
        { enableHighAccuracy: true, maximumAge: 1500, timeout: 10000 },
      );

      return () => {
        mounted = false;
        navigator.geolocation.clearWatch(watchId);
        setIsTracking(false);
        prevRawRef.current     = null;
        prevSmoothedRef.current = null;
        if (socketRef.current) {
          socketRef.current.emit('leave_ride', rideId);
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        setConnectionStatus('disconnected');
      };
    }

    // ── Native path: use expo-location ─────────────────────────────────────
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || !mounted) return;

        setIsTracking(true);
        await connectSocket(rideId);

        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1500, distanceInterval: 4 },
          (loc) => {
            if (!mounted) return;
            handleRawPosition(
              loc.coords.latitude,
              loc.coords.longitude,
              loc.coords.heading,
              loc.coords.speed,
              loc.coords.accuracy ?? 999,
              loc.timestamp,
              rideId,
            );
          },
        );
      } catch {
        if (mounted) setIsTracking(false);
      }
    })();

    return () => {
      mounted = false;
      // Wrap remove() in try-catch — expo-location web shim throws here
      try { sub?.remove(); } catch { /* expo-location web compat */ }
      setIsTracking(false);
      prevRawRef.current     = null;
      prevSmoothedRef.current = null;
      if (socketRef.current) {
        socketRef.current.emit('leave_ride', rideId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnectionStatus('disconnected');
    };
  }, [enabled, rideId]);

  return { position, isTracking, connectionStatus };
}
