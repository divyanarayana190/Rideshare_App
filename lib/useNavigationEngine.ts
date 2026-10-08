/**
 * useNavigationEngine — production navigation logic.
 *
 * Fetches OSRM driving route, parses turn-by-turn steps,
 * tracks progress as the driver moves, dynamically updates ETA,
 * and detects route deviation for automatic rerouting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const DEVIATION_M = 90;          // meters off-route before reroute
const REROUTE_COOLDOWN_MS = 8000; // min time between consecutive reroutes
const FETCH_TIMEOUT_MS = 10000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoutePoint { lat: number; lng: number }

export interface TurnInstruction {
  text: string;          // "Turn right"
  subText: string;       // "onto Main St"
  distanceM: number;     // distance until the turn
  type: string;          // 'turn-right' | 'turn-left' | 'continue' | 'arrive' | …
}

export interface NavigationState {
  routePoints: RoutePoint[];
  completedPoints: RoutePoint[];
  remainingPoints: RoutePoint[];
  currentInstruction: TurnInstruction | null;
  nextInstruction: TurnInstruction | null;
  distanceToDestM: number;
  etaSeconds: number;
  routeProgress: number;      // 0–1
  speedMs: number;
  isRerouting: boolean;
  isOffRoute: boolean;
  rerouteReason: string | null;
  totalDistanceM: number;
  connectionLost: boolean;
}

interface OsrmStep {
  maneuver: { type: string; modifier?: string };
  name: string;
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stepInstruction(type: string, modifier?: string): string {
  if (type === 'arrive') return 'Arrive at destination';
  if (type === 'depart') return 'Head';
  if (type === 'roundabout' || type === 'rotary')
    return modifier ? `Take the ${modifier} exit` : 'Enter roundabout';
  if (type === 'merge') return modifier?.includes('left') ? 'Merge left' : 'Merge right';
  if (type === 'fork') return modifier?.includes('left') ? 'Keep left' : 'Keep right';
  if (type === 'on ramp') return 'Take the on-ramp';
  if (type === 'off ramp') return 'Take the exit';
  if (type === 'end of road')
    return modifier?.includes('left') ? 'Turn left at end of road' : 'Turn right at end of road';
  if (type === 'use lane') return 'Use the correct lane';
  if (type === 'continue' || type === 'new name') {
    if (modifier === 'left') return 'Turn left';
    if (modifier === 'right') return 'Turn right';
    if (modifier === 'slight left') return 'Keep left';
    if (modifier === 'slight right') return 'Keep right';
    if (modifier === 'sharp left') return 'Sharp left turn';
    if (modifier === 'sharp right') return 'Sharp right turn';
    if (modifier === 'uturn') return 'Make a U-turn';
    return 'Continue';
  }
  if (type === 'turn') {
    if (modifier === 'left') return 'Turn left';
    if (modifier === 'right') return 'Turn right';
    if (modifier === 'slight left') return 'Keep left';
    if (modifier === 'slight right') return 'Keep right';
    if (modifier === 'sharp left') return 'Sharp left turn';
    if (modifier === 'sharp right') return 'Sharp right turn';
    if (modifier === 'uturn') return 'Make a U-turn';
    return 'Continue';
  }
  return 'Continue';
}

function stepType(type: string, modifier?: string): string {
  if (type === 'arrive') return 'arrive';
  if (type === 'depart') return 'depart';
  if (type === 'roundabout' || type === 'rotary') return 'roundabout';
  if (modifier === 'left' || modifier === 'sharp left') return 'turn-left';
  if (modifier === 'right' || modifier === 'sharp right') return 'turn-right';
  if (modifier === 'slight left') return 'slight-left';
  if (modifier === 'slight right') return 'slight-right';
  if (modifier === 'uturn') return 'uturn';
  return 'continue';
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseNavigationEngineOptions {
  driverLat: number | null;
  driverLng: number | null;
  targetLat: number | null;
  targetLng: number | null;
  speedMs?: number;
  enabled?: boolean;
}

const INITIAL_STATE: NavigationState = {
  routePoints: [],
  completedPoints: [],
  remainingPoints: [],
  currentInstruction: null,
  nextInstruction: null,
  distanceToDestM: 0,
  etaSeconds: 0,
  routeProgress: 0,
  speedMs: 0,
  isRerouting: false,
  isOffRoute: false,
  rerouteReason: null,
  totalDistanceM: 0,
  connectionLost: false,
};

export function useNavigationEngine({
  driverLat,
  driverLng,
  targetLat,
  targetLng,
  speedMs = 0,
  enabled = true,
}: UseNavigationEngineOptions): NavigationState {
  const [state, setState] = useState<NavigationState>(INITIAL_STATE);

  const routePointsRef = useRef<RoutePoint[]>([]);
  const stepsRef = useRef<OsrmStep[]>([]);
  const totalDistRef = useRef(0);
  const lastRerouteRef = useRef(0);
  const fetchingRef = useRef(false);
  const lastTargetRef = useRef<{ lat: number; lng: number } | null>(null);

  // ── Fetch route from OSRM ─────────────────────────────────────────────────
  const fetchRoute = useCallback(
    async (fromLat: number, fromLng: number, toLat: number, toLng: number, reason: string | null = null) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      setState((s) => ({ ...s, isRerouting: true, rerouteReason: reason }));

      try {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;

        const url = `${OSRM}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url, ctrl ? { signal: ctrl.signal } : {});
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const route = data.routes?.[0];
        if (!route) throw new Error('No route returned');

        const coords: RoutePoint[] = (route.geometry.coordinates as [number, number][]).map(
          ([lng, lat]) => ({ lat, lng }),
        );
        const steps: OsrmStep[] = route.legs?.[0]?.steps ?? [];

        routePointsRef.current = coords;
        stepsRef.current = steps;
        totalDistRef.current = route.distance;

        setState((s) => ({
          ...s,
          routePoints: coords,
          totalDistanceM: route.distance,
          isRerouting: false,
          isOffRoute: false,
          rerouteReason: null,
          connectionLost: false,
        }));
      } catch {
        setState((s) => ({
          ...s,
          isRerouting: false,
          connectionLost: true,
        }));
      } finally {
        fetchingRef.current = false;
      }
    },
    [],
  );

  // ── Re-fetch when target changes ─────────────────────────────────────────
  useEffect(() => {
    if (!enabled || driverLat == null || driverLng == null || targetLat == null || targetLng == null)
      return;

    const prev = lastTargetRef.current;
    const targetChanged = !prev || haversineM(prev.lat, prev.lng, targetLat, targetLng) > 50;
    if (targetChanged) {
      lastTargetRef.current = { lat: targetLat, lng: targetLng };

      // ── Immediate haversine estimate while OSRM loads ─────────────────
      // Prevents "0 m remaining" / "ETA —" flash before route arrives.
      const quickDist = haversineM(driverLat, driverLng, targetLat, targetLng);
      const quickEta  = quickDist / Math.max(speedMs, 8); // 8 m/s ≈ 29 km/h default
      if (quickDist > 0) {
        setState((s) => ({
          ...s,
          distanceToDestM: quickDist,
          totalDistanceM: quickDist,
          etaSeconds: quickEta,
        }));
        totalDistRef.current = quickDist;
      }

      fetchRoute(driverLat, driverLng, targetLat, targetLng);
    }
  }, [enabled, targetLat, targetLng]);

  // ── Update progress as driver moves ──────────────────────────────────────
  useEffect(() => {
    if (!enabled || driverLat == null || driverLng == null) return;
    if (routePointsRef.current.length < 2) return;

    const points = routePointsRef.current;

    // Find nearest route point
    let minDist = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < points.length; i++) {
      const d = haversineM(driverLat, driverLng, points[i].lat, points[i].lng);
      if (d < minDist) { minDist = d; closestIdx = i; }
    }

    const isOffRoute = minDist > DEVIATION_M;

    // Trigger reroute if off route
    if (isOffRoute && targetLat != null && targetLng != null) {
      const now = Date.now();
      if (now - lastRerouteRef.current > REROUTE_COOLDOWN_MS) {
        lastRerouteRef.current = now;
        fetchRoute(driverLat, driverLng, targetLat, targetLng, 'Route updated');
        return;
      }
    }

    // Remaining distance from closest point → end
    let remainingDist = 0;
    for (let i = closestIdx; i < points.length - 1; i++) {
      remainingDist += haversineM(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
    }

    const progress =
      totalDistRef.current > 0
        ? Math.min(1, Math.max(0, 1 - remainingDist / totalDistRef.current))
        : 0;

    // ETA: use actual speed, floor at slow driving pace to avoid huge numbers
    const effectiveSpeed = Math.max(speedMs, 4.5); // ~16 km/h minimum
    const etaSec = effectiveSpeed > 0 ? remainingDist / effectiveSpeed : 0;

    const completedPoints = points.slice(0, closestIdx + 1);
    const remainingPoints = points.slice(closestIdx);

    // ── Parse turn instructions from steps ──────────────────────────────
    let currentInstruction: TurnInstruction | null = null;
    let nextInstruction: TurnInstruction | null = null;
    let instrIdx = 0;

    for (const step of stepsRef.current) {
      const stepCoords: RoutePoint[] = (step.geometry?.coordinates ?? []).map(
        ([lng, lat]: [number, number]) => ({ lat, lng }),
      );
      if (stepCoords.length === 0) { instrIdx++; continue; }

      const distDriverToStepStart = haversineM(driverLat, driverLng, stepCoords[0].lat, stepCoords[0].lng);

      if (distDriverToStepStart < remainingDist + 30) {
        const text = stepInstruction(step.maneuver.type, step.maneuver.modifier);
        const type = stepType(step.maneuver.type, step.maneuver.modifier);
        const roadName = step.name?.trim() ?? '';

        if (!currentInstruction) {
          currentInstruction = {
            text,
            subText: roadName ? `onto ${roadName}` : '',
            distanceM: distDriverToStepStart,
            type,
          };
        } else if (!nextInstruction) {
          nextInstruction = {
            text,
            subText: roadName ? `onto ${roadName}` : '',
            distanceM: distDriverToStepStart,
            type,
          };
          break;
        }
      }
      instrIdx++;
    }

    setState((s) => ({
      ...s,
      completedPoints,
      remainingPoints,
      currentInstruction,
      nextInstruction,
      distanceToDestM: remainingDist,
      etaSeconds: etaSec,
      routeProgress: progress,
      speedMs,
      isOffRoute,
      isRerouting: s.isRerouting,
    }));
  }, [driverLat, driverLng, speedMs, enabled]);

  return state;
}
