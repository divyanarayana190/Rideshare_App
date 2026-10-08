/**
 * Book a Ride — Map-first location picker with confirm-gate flow
 *
 * selectionMode drives a two-step flow:
 *   PICKUP  → user positions the pin → "Confirm Pickup"  → switches to DESTINATION
 *   DESTINATION → user repositions pin → "Confirm Destination" → navigates
 *
 * Camera-sync:
 *   The center pin never moves — the MAP moves beneath it (the "pin trick").
 *   onCenterChange fires as tiles shift; a 400 ms debounce calls reverse-geocode
 *   and writes the result to pendingAddress. The user taps Confirm to save it.
 *
 * GPS recenter:
 *   handleGPS gets the device position and writes to recenterTo state.
 *   PinMapView reads recenterTo and posts a flyTo message into the iframe / WebView.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSessionToken } from "@/lib/_core/auth";
import { useAuth } from "@/lib/auth-context-v2";
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import PinMapView from "@/components/PinMapView";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRides } from "@/lib/rides-store";
import { trpc } from "@/lib/trpc";
import type { RideLocation, RideMode } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlaceSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
  distanceKm?: number;
  placeType?: "transit" | "airport" | "restaurant" | "hotel" | "hospital" | "gas" | "address" | "poi" | "city";
};

type SelectionMode = "PICKUP" | "DESTINATION";
type PlaceType = PlaceSuggestion["placeType"];
type GS = { dy: number; vy: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const P    = "#1E88FF";
const G    = "#16A34A";
const R    = "#EF4444";
const V    = "#8B5CF6";
const T    = "#0EA5E9";
const DARK = "#111827";

const API_BASE      = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001";
const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS   = 220;
const GEOCODE_DELAY = 400;
const MAX_HISTORY   = 6;

// Authenticated fetch for map API endpoints — attaches JWT so server requireAuth passes
async function mapFetch(url: string, opts?: RequestInit): Promise<Response> {
  const token = await getSessionToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const existing = (opts?.headers ?? {}) as Record<string, string>;
  return fetch(url, { ...opts, headers: { ...headers, ...existing } });
}

// ─── Sheet snap points ────────────────────────────────────────────────────────

const { height: SH } = Dimensions.get("window");
// 22% / 50% / 95% visible — 22% is enough to always show the Confirm button
const SNAP = [SH * 0.78, SH * 0.50, SH * 0.10] as const;
const SPRING = { tension: 72, friction: 11, useNativeDriver: false } as const;

// ─── Session history ──────────────────────────────────────────────────────────

let _history: RideLocation[] = [];
function addHistory(loc: RideLocation) {
  _history = [loc, ..._history.filter(h => h.address !== loc.address)].slice(0, MAX_HISTORY);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function placeIconData(type: PlaceType): { name: string; color: string; bg: string } {
  switch (type) {
    case "airport":    return { name: "airplane",           color: "#6366F1", bg: "#6366F115" };
    case "transit":    return { name: "tram.fill",          color: T,          bg: T + "15"   };
    case "restaurant": return { name: "fork.knife",         color: "#F59E0B",  bg: "#F59E0B15" };
    case "hotel":      return { name: "bed.double.fill",    color: V,          bg: V + "15"   };
    case "hospital":   return { name: "cross.fill",         color: R,          bg: R + "15"   };
    case "city":       return { name: "building.2.fill",    color: "#6B7280",  bg: "#6B728015" };
    case "address":    return { name: "house.fill",         color: G,          bg: G + "15"   };
    default:           return { name: "mappin.and.ellipse", color: P,          bg: P + "15"   };
  }
}

function formatDist(km: number) {
  const mi = km * 0.621371;
  return mi < 0.1 ? `${Math.round(km * 1000)} m`
       : mi < 10  ? `${mi.toFixed(1)} mi`
       :             `${Math.round(mi)} mi`;
}

async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<RideLocation | null> {
  try {
    const res = await mapFetch(`${API_BASE}/api/maps/reverse-geocode?lat=${lat}&lng=${lng}`, { signal });
    if (!res.ok) return null;
    const d = await res.json();
    return { shortName: d.shortName, address: d.address, lat: d.lat, lng: d.lng };
  } catch { return null; }
}

function HighlightText({ text, query, style, boldStyle, lines = 1 }: {
  text: string; query: string; style: any; boldStyle: any; lines?: number;
}) {
  const q = query.trim().toLowerCase();
  const idx = q ? text.toLowerCase().indexOf(q) : -1;
  if (idx === -1) return <Text style={style} numberOfLines={lines}>{text}</Text>;
  return (
    <Text style={style} numberOfLines={lines}>
      {text.slice(0, idx)}
      <Text style={boldStyle}>{text.slice(idx, idx + q.length)}</Text>
      {text.slice(idx + q.length)}
    </Text>
  );
}

const QUICK = [
  { id: "home",  label: "Home",  icon: "house.fill",      color: G         },
  { id: "work",  label: "Work",  icon: "building.2.fill", color: "#6366F1" },
  { id: "saved", label: "Saved", icon: "bookmark.fill",   color: V         },
] as const;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BookRideScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const { state, setBookingDraft } = useRides();

  // ── Location state ─────────────────────────────────────────────────────────
  const [pickup,  setPickup]  = useState<RideLocation | null>(state.bookingDraft.pickup  ?? null);
  const [dropoff, setDropoff] = useState<RideLocation | null>(state.bookingDraft.dropoff ?? null);
  const [mode] = useState<RideMode>(state.bookingDraft.mode ?? "solo");

  // pendingAddress = the address under the pin that has NOT been confirmed yet
  const [pendingAddress, setPendingAddress] = useState<RideLocation | null>(null);

  // ── Map state ──────────────────────────────────────────────────────────────
  const [mapLat, setMapLat] = useState(pickup?.lat ?? 40.7128);
  const [mapLng, setMapLng] = useState(pickup?.lng ?? -74.006);
  const [geocoding, setGeocoding] = useState(false);

  // recenterTo: changing .t triggers PinMapView to fly the camera to lat/lng
  const [recenterTo, setRecenterTo] = useState<{ lat: number; lng: number; t: number; zoom?: number; isMyLocation?: boolean } | null>(null);

  // ── UI state ───────────────────────────────────────────────────────────────
  // selectionMode drives the two-step confirm flow
  const [selectionMode,  setSelectionMode]  = useState<SelectionMode>("PICKUP");
  const [searchText,     setSearchText]     = useState("");
  const [suggestions,    setSuggestions]    = useState<PlaceSuggestion[]>([]);
  const [loadingSug,     setLoadingSug]     = useState(false);
  const [gpsBusy,        setGpsBusy]        = useState(false);
  const [zoomCmd,        setZoomCmd]        = useState<{ delta: number; t: number } | null>(null);

  const handleZoomIn  = useCallback(() => setZoomCmd({ delta:  1, t: Date.now() }), []);
  const handleZoomOut = useCallback(() => setZoomCmd({ delta: -1, t: Date.now() }), []);

  // ── Pin animation (native driver: transforms only) ─────────────────────────
  const pinLifted     = useRef(new Animated.Value(0)).current;
  const pinTranslateY = pinLifted.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
  const pinScaleAnim  = pinLifted.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const shadowScale   = pinLifted.interpolate({ inputRange: [0, 1], outputRange: [1, 0.42] });
  const shadowOpac    = pinLifted.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.07] });

  // ── Bottom-sheet animation (JS driver: layout props) ──────────────────────
  const sheetY    = useRef(new Animated.Value(SNAP[0])).current;
  const pinPad    = useRef(new Animated.Value(SH - SNAP[0])).current;
  const gpsBtnBot = sheetY.interpolate({
    inputRange:  [SNAP[2], SNAP[0]],
    outputRange: [SH - SNAP[2] + 24, SH - SNAP[0] + 24],
    extrapolate: "clamp",
  });
  // Zoom buttons stacked above GPS: zOut(−) sits 58px above GPS bottom, zIn(+) 110px above
  const zOutBot = sheetY.interpolate({
    inputRange:  [SNAP[2], SNAP[0]],
    outputRange: [SH - SNAP[2] + 82, SH - SNAP[0] + 82],
    extrapolate: "clamp",
  });
  const zInBot = sheetY.interpolate({
    inputRange:  [SNAP[2], SNAP[0]],
    outputRange: [SH - SNAP[2] + 134, SH - SNAP[0] + 134],
    extrapolate: "clamp",
  });

  const snapIdxRef = useRef(0);
  const snapYRef   = useRef(SNAP[0]);

  const snapTo = useCallback((idx: number, velocity = 0) => {
    const target = SNAP[idx];
    snapIdxRef.current = idx;
    snapYRef.current   = target;
    const cfg = { ...SPRING, velocity };
    Animated.parallel([
      Animated.spring(sheetY, { toValue: target,      ...cfg }),
      Animated.spring(pinPad, { toValue: SH - target, ...cfg }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- sheetY and pinPad are stable Animated.Value refs

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_: any, gs: GS) => Math.abs(gs.dy) > 5,
      onPanResponderMove: (_: any, gs: GS) => {
        const next = Math.max(SNAP[2], Math.min(SNAP[0], snapYRef.current + gs.dy));
        sheetY.setValue(next);
        pinPad.setValue(SH - next);
      },
      onPanResponderRelease: (_: any, gs: GS) => {
        const pos = snapYRef.current + gs.dy;
        const vy  = gs.vy;
        let target: number;
        if      (vy >  0.4) target = Math.max(0, snapIdxRef.current - 1);
        else if (vy < -0.4) target = Math.min(SNAP.length - 1, snapIdxRef.current + 1);
        else {
          const dists = SNAP.map(s => Math.abs(s - pos));
          target = dists.indexOf(Math.min(...dists));
        }
        snapTo(target, vy);
      },
    })
  ).current;

  // ── Geocode timer ──────────────────────────────────────────────────────────
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (geocodeTimer.current) clearTimeout(geocodeTimer.current); }, []);

  // ── Initial location permission + auto-center ──────────────────────────────
  // Requests permission once, gets current position, centers the map, and
  // reverse-geocodes the starting point into pendingAddress.
  useEffect(() => {
    (async () => {
      try {
        let lat: number, lng: number;
        if (Platform.OS === "web") {
          if (!navigator?.geolocation) return;
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
          );
          lat = pos.coords.latitude; lng = pos.coords.longitude;
        } else {
          const m = await import("expo-location");
          const { status } = await m.requestForegroundPermissionsAsync();
          if (status !== "granted") return;
          const pos = await m.getCurrentPositionAsync({ accuracy: 4 });
          lat = pos.coords.latitude; lng = pos.coords.longitude;
        }
        setMapLat(lat); setMapLng(lng);
        setRecenterTo({ lat, lng, t: Date.now(), zoom: 15, isMyLocation: true });
        // Reverse-geocode the starting position as initial pending address
        if (!pickup) {
          const rev = await reverseGeocode(lat, lng);
          if (rev) setPendingAddress(rev);
        }
      } catch { /* permission denied or timeout — stay at default coords */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- pickup intentionally omitted; adding it re-geocodes on every location state change

  // ── GPS recenter button ────────────────────────────────────────────────────
  // Gets fresh device location and posts a flyTo into PinMapView.
  const handleGPS = async () => {
    setGpsBusy(true);
    try {
      let lat: number, lng: number;
      if (Platform.OS === "web") {
        if (!navigator?.geolocation) { setGpsBusy(false); return; }
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, {
            enableHighAccuracy: true, timeout: 8000,
          })
        );
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } else {
        const m = await import("expo-location");
        const { status } = await m.requestForegroundPermissionsAsync();
        if (status !== "granted") { setGpsBusy(false); return; }
        const pos = await m.getCurrentPositionAsync({ accuracy: 6 });
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      }
      // Trigger smooth camera pan + update the My-Location dot
      setRecenterTo({ lat, lng, t: Date.now(), zoom: 16, isMyLocation: true });
    } catch { /* silent */ }
    setGpsBusy(false);
  };

  // ── Recent rides ───────────────────────────────────────────────────────────
  const { data: myRides = [] } = trpc.rides.myRides.useQuery(undefined, { staleTime: 60000 });
  const recentDests = useMemo<RideLocation[]>(() => {
    const seen = new Set<string>();
    const result: RideLocation[] = [];
    for (const r of myRides as any[]) {
      const d = r.dropoff;
      if (!d?.address || !d?.lat || !d?.lng) continue;
      const key = `${Math.round(d.lat * 1000)},${Math.round(d.lng * 1000)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ shortName: d.shortName || (d.address as string).split(",")[0], address: d.address, lat: Number(d.lat), lng: Number(d.lng) });
      if (result.length >= 3) break;
    }
    return result;
  }, [myRides]);

  // ── Camera-sync: map center → reverse-geocode → pendingAddress ─────────────
  // The pin is static; this callback fires as map tiles shift beneath it.
  // We debounce GEOCODE_DELAY ms so the API only runs once the map settles.
  const handleMapCenter = useCallback((lat: number, lng: number) => {
    if (searchText.trim().length > 0) return; // don't override while typing
    setMapLat(lat); setMapLng(lng);
    setGeocoding(true);
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      const loc = await reverseGeocode(lat, lng);
      setGeocoding(false);
      if (loc) setPendingAddress(loc);
    }, GEOCODE_DELAY);
  }, [searchText]);

  // ── Pin drag animation ─────────────────────────────────────────────────────
  const handleDragStart = useCallback(() => {
    Animated.spring(pinLifted, { toValue: 1, useNativeDriver: true, tension: 320, friction: 18 }).start();
  }, [pinLifted]);
  const handleDragEnd = useCallback(() => {
    Animated.spring(pinLifted, { toValue: 0, useNativeDriver: true, tension: 200, friction: 14 }).start();
  }, [pinLifted]);

  // ── handleConfirm: the state-gate between PICKUP and DESTINATION ───────────
  // On PICKUP: saves pendingAddress as pickup, switches mode, optionally pans to dropoff.
  // On DESTINATION: saves pendingAddress as dropoff and navigates to ride options.
  const handleConfirm = () => {
    const addr = pendingAddress ?? (selectionMode === "PICKUP" ? pickup : dropoff);
    if (!addr) return;

    if (selectionMode === "PICKUP") {
      setPickup(addr);
      addHistory(addr);
      setPendingAddress(null);
      setSelectionMode("DESTINATION");
      setSearchText(""); setSuggestions([]);
      // If dropoff already exists, pan to it so user can verify
      if (dropoff) {
        setMapLat(dropoff.lat); setMapLng(dropoff.lng);
        setRecenterTo({ lat: dropoff.lat, lng: dropoff.lng, t: Date.now(), zoom: 14 });
      }
      snapTo(0); // collapse to 22% — just enough to show the Confirm Destination button
    } else {
      // Guard: pickup and dropoff must not be the same location
      const isSamePlace = pickup && addr && (
        (pickup.lat === addr.lat && pickup.lng === addr.lng) ||
        Math.abs(pickup.lat - addr.lat) < 0.0001 && Math.abs(pickup.lng - addr.lng) < 0.0001
      );
      if (isSamePlace) {
        // Reset pending so user must move the map
        setPendingAddress(null);
        return;
      }
      setDropoff(addr);
      addHistory(addr);
      setBookingDraft({ pickup: pickup!, dropoff: addr, mode });
      router.push("/ride-options" as Href);
    }
  };

  // ── Autocomplete ──────────────────────────────────────────────────────────
  const fetchSuggestions = useCallback(async (query: string, signal: AbortSignal) => {
    if (query.length < MIN_QUERY_LEN) { setSuggestions([]); setLoadingSug(false); return; }
    try {
      setLoadingSug(true);
      const bias = selectionMode === "DESTINATION" ? pickup : dropoff;
      let url = `${API_BASE}/api/maps/autocomplete?q=${encodeURIComponent(query)}`;
      if (bias?.lat) url += `&lat=${bias.lat}&lng=${bias.lng}`;
      const res = await mapFetch(url, { signal });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!signal.aborted) setSuggestions(Array.isArray(data) ? data : []);
    } catch {
      if (!signal.aborted) setSuggestions([]);
    } finally { if (!signal.aborted) setLoadingSug(false); }
  }, [selectionMode, pickup, dropoff]);

  useEffect(() => {
    const q = searchText.trim();
    if (!q) { setSuggestions([]); setLoadingSug(false); return; }
    setLoadingSug(true); // show skeleton immediately during debounce, prevents "No results" flash
    const ctrl = new AbortController();
    const t = setTimeout(() => fetchSuggestions(q, ctrl.signal), DEBOUNCE_MS);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [searchText, fetchSuggestions]);

  // When user selects from search: bypass confirm step, directly set and advance
  const selectPlace = async (placeId: string) => {
    try {
      const res = await mapFetch(`${API_BASE}/api/maps/place-details?placeId=${encodeURIComponent(placeId)}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      applyFromSearch({ shortName: d.shortName, address: d.address, lat: d.lat, lng: d.lng });
    } catch { /* silent */ }
  };

  const [savedHome, setSavedHome] = useState<RideLocation | null>(null);
  const [savedWork, setSavedWork] = useState<RideLocation | null>(null);

  useEffect(() => {
    setSavedHome(null);
    setSavedWork(null);
    if (!user?.id) return;
    (async () => {
      try {
        const [h, w] = await Promise.all([
          AsyncStorage.getItem(`saved_place_home:${user.id}`),
          AsyncStorage.getItem(`saved_place_work:${user.id}`),
        ]);
        if (h) setSavedHome(JSON.parse(h));
        if (w) setSavedWork(JSON.parse(w));
      } catch { /* ignore */ }
    })();
  }, [user?.id]);

  const applyFromSearch = (loc: RideLocation) => {
    addHistory(loc);
    setPendingAddress(null);
    setSearchText(""); setSuggestions([]);

    if (selectionMode === "PICKUP") {
      setPickup(loc);
      setMapLat(loc.lat); setMapLng(loc.lng);
      setRecenterTo({ lat: loc.lat, lng: loc.lng, t: Date.now(), zoom: 16 });
      setSelectionMode("DESTINATION");
      snapTo(0);
    } else {
      // Guard: dropoff must differ from pickup
      const isSamePlace = pickup && (
        (pickup.lat === loc.lat && pickup.lng === loc.lng) ||
        Math.abs(pickup.lat - loc.lat) < 0.0001 && Math.abs(pickup.lng - loc.lng) < 0.0001
      );
      if (isSamePlace) return;
      setDropoff(loc);
      setBookingDraft({ pickup: pickup!, dropoff: loc, mode });
      router.push("/ride-options" as Href);
    }
  };

  const handleQuickSelect = (kind: "home" | "work" | "saved") => {
    if (kind === "saved") {
      snapTo(1);
      return;
    }
    const loc = kind === "home" ? savedHome : savedWork;
    if (!loc?.lat || !loc?.lng) {
      router.push("/(tabs)" as Href);
      return;
    }
    applyFromSearch(loc);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const pinColor   = selectionMode === "PICKUP" ? P : R;
  const showSearch = searchText.trim().length >= MIN_QUERY_LEN;
  const showRecents = !showSearch && (recentDests.length > 0 || _history.length > 0);
  // The confirm button is active when we have a pending or already-confirmed address
  const confirmAddr = pendingAddress ?? (selectionMode === "PICKUP" ? pickup : dropoff);
  const canConfirm  = !geocoding && confirmAddr !== null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={st.root}>

      {/* ══ LAYER 1: Full-screen map ══════════════════════════════════════════ */}
      <View style={StyleSheet.absoluteFillObject}>
        <PinMapView
          lat={mapLat}
          lng={mapLng}
          zoom={15}
          height="100%"
          onCenterChange={handleMapCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onMyLocation={(lat, lng) => { setMapLat(lat); setMapLng(lng); }}
          recenterTo={recenterTo}
          zoomCmd={zoomCmd}
        />
      </View>

      {/* ══ LAYER 2: Static center pin ════════════════════════════════════════
          Camera-sync: the pin never moves. onCenterChange captures the
          map's new center and reverse-geocodes it to pendingAddress.        */}
      <Animated.View style={[StyleSheet.absoluteFillObject, st.pinLayer]} pointerEvents="none">
        <Animated.View style={st.pinCenter}>
          <Animated.View style={{
            alignItems: "center",
            transform: [{ translateY: pinTranslateY }, { scale: pinScaleAnim }],
          }}>
            <View style={[st.pinCircle, { backgroundColor: pinColor, borderColor: "#fff" }]}>
              <View style={st.pinDot} />
            </View>
            <View style={[st.pinStem, { backgroundColor: pinColor }]} />
          </Animated.View>
          <Animated.View style={[st.pinShadow, {
            transform: [{ scale: shadowScale }],
            opacity: shadowOpac,
          }]} />
        </Animated.View>
      </Animated.View>

      {/* ── Back button ─────────────────────────────────────────────────────── */}
      <TouchableOpacity style={st.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <IconSymbol name="chevron.left" size={20} color={DARK} />
      </TouchableOpacity>

      {/* ── Zoom controls — stacked above GPS, track sheet position ─────────── */}
      <Animated.View style={[st.zoomWrap, { bottom: zInBot }]}>
        <TouchableOpacity style={[st.zoomBtn, { backgroundColor: colors.surface }]} onPress={handleZoomIn} activeOpacity={0.8}>
          <Text style={[st.zoomText, { color: colors.foreground }]}>+</Text>
        </TouchableOpacity>
      </Animated.View>
      <Animated.View style={[st.zoomWrap, { bottom: zOutBot }]}>
        <TouchableOpacity style={[st.zoomBtn, { backgroundColor: colors.surface }]} onPress={handleZoomOut} activeOpacity={0.8}>
          <Text style={[st.zoomText, { color: colors.foreground }]}>−</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── GPS recenter button ────────────────────────────────────────────────
          Calls handleGPS → gets device coords → updates recenterTo →
          PinMapView.flyTo() smoothly pans the camera.                       */}
      <Animated.View style={[st.gpsWrap, { bottom: gpsBtnBot }]}>
        <TouchableOpacity
          style={[st.gpsBtn, { backgroundColor: colors.surface }]}
          onPress={handleGPS}
          activeOpacity={0.8}
          disabled={gpsBusy}
        >
          {gpsBusy
            ? <ActivityIndicator size="small" color={P} />
            : <IconSymbol name="location.fill" size={20} color={P} />
          }
        </TouchableOpacity>
      </Animated.View>

      {/* ══ LAYER 3: Draggable bottom sheet ══════════════════════════════════ */}
      <Animated.View style={[st.sheet, {
        backgroundColor: colors.surface,
        transform: [{ translateY: sheetY }],
      }]}>

        {/* ── Handle + Confirm button (always visible at 22% snap) ──────────── */}
        <View {...panResponder.panHandlers} style={st.handleArea}>
          <View style={[st.handle, { backgroundColor: colors.border }]} />

          {/* Mode header row */}
          <View style={st.modeRow}>
            <View style={[st.modeDot, {
              backgroundColor: pinColor,
              borderRadius: selectionMode === "PICKUP" ? 6 : 2,
            }]} />
            <Text style={[st.modeLabel, { color: colors.foreground }]}>
              {selectionMode === "PICKUP" ? "Set Pickup Location" : "Set Destination"}
            </Text>
            {/* Edit Pickup shortcut when in DESTINATION mode */}
            {selectionMode === "DESTINATION" && pickup && (
              <TouchableOpacity
                onPress={() => {
                  setSelectionMode("PICKUP");
                  setPendingAddress(pickup);
                  setMapLat(pickup.lat); setMapLng(pickup.lng);
                  setRecenterTo({ lat: pickup.lat, lng: pickup.lng, t: Date.now(), zoom: 16 });
                }}
              >
                <Text style={[st.editLink, { color: P }]}>Edit Pickup</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Address display — shows the geocoded address under the pin */}
          <View style={[st.addressBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[st.addrDot, { backgroundColor: pinColor, borderRadius: selectionMode === "PICKUP" ? 5 : 1.5 }]} />
            {geocoding ? (
              <View style={st.addrLoading}>
                <ActivityIndicator size="small" color={pinColor} />
                <Text style={[st.addrLoadingText, { color: colors.muted }]}>Getting address…</Text>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <Text style={[st.addrMain, { color: confirmAddr ? colors.foreground : colors.muted }]} numberOfLines={1}>
                  {confirmAddr?.shortName ?? "Drag the map to pin your location"}
                </Text>
                {confirmAddr?.address && confirmAddr.address !== confirmAddr.shortName && (
                  <Text style={[st.addrSub, { color: colors.muted }]} numberOfLines={1}>
                    {confirmAddr.address}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* ── Confirm button ──────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[st.confirmBtn, {
              backgroundColor: canConfirm ? (selectionMode === "PICKUP" ? P : R) : colors.border,
              opacity: canConfirm ? 1 : 0.55,
            }]}
            onPress={handleConfirm}
            disabled={!canConfirm}
            activeOpacity={0.8}
          >
            <IconSymbol
              name={selectionMode === "PICKUP" ? "mappin.circle.fill" : "flag.fill"}
              size={18}
              color={canConfirm ? "#fff" : colors.muted}
            />
            <Text style={[st.confirmBtnText, { color: canConfirm ? "#fff" : colors.muted }]}>
              {selectionMode === "PICKUP" ? "Confirm Pickup" : "Confirm Destination"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Route summary card (shows confirmed fields) ───────────────────── */}
        <View style={[st.routeCard, { backgroundColor: colors.background, borderColor: colors.border }]}>

          {/* Dashed connector line between dots */}
          <View style={st.connectorWrap} pointerEvents="none">
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={[st.dash, { backgroundColor: colors.border }]} />
            ))}
          </View>

          {/* Pickup row */}
          <TouchableOpacity
            style={[st.inputRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
            onPress={() => {
              setSelectionMode("PICKUP");
              setPendingAddress(pickup);
              if (pickup) { setMapLat(pickup.lat); setMapLng(pickup.lng); setRecenterTo({ lat: pickup.lat, lng: pickup.lng, t: Date.now(), zoom: 16 }); }
              snapTo(1);
            }}
            activeOpacity={0.75}
          >
            <View style={st.dotBlue} />
            {selectionMode === "PICKUP" ? (
              <TextInput
                value={searchText}
                onChangeText={(t: string) => { setSearchText(t); snapTo(2); }}
                onFocus={() => snapTo(2)}
                placeholder={pickup?.shortName || "Search pickup…"}
                placeholderTextColor={colors.muted}
                style={[st.inputText, { color: colors.foreground }]}
                autoFocus
                returnKeyType="search"
              />
            ) : (
              <Text style={[st.inputText, { color: pickup ? colors.foreground : colors.muted, fontWeight: pickup ? "600" : "400" }]} numberOfLines={1}>
                {pickup?.shortName || "Tap to set pickup"}
              </Text>
            )}
            {selectionMode === "PICKUP" && (
              <View style={[st.activeBadge, { backgroundColor: P + "18" }]}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: P }}>ACTIVE</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Dropoff row */}
          <TouchableOpacity
            style={st.inputRow}
            onPress={() => {
              if (!pickup) return; // must confirm pickup first
              setSelectionMode("DESTINATION");
              setPendingAddress(dropoff);
              if (dropoff) { setMapLat(dropoff.lat); setMapLng(dropoff.lng); setRecenterTo({ lat: dropoff.lat, lng: dropoff.lng, t: Date.now(), zoom: 16 }); }
              snapTo(1);
            }}
            activeOpacity={0.75}
          >
            <View style={st.dotRed} />
            {selectionMode === "DESTINATION" ? (
              <TextInput
                value={searchText}
                onChangeText={(t: string) => { setSearchText(t); snapTo(2); }}
                onFocus={() => snapTo(2)}
                placeholder={dropoff?.shortName || "Search destination…"}
                placeholderTextColor={colors.muted}
                style={[st.inputText, { color: colors.foreground }]}
                autoFocus
                returnKeyType="search"
              />
            ) : (
              <Text style={[st.inputText, { color: dropoff ? colors.foreground : colors.muted, fontWeight: dropoff ? "600" : "400" }]} numberOfLines={1}>
                {dropoff?.shortName || (pickup ? "Where to?" : "Confirm pickup first")}
              </Text>
            )}
            {selectionMode === "DESTINATION" && (
              <View style={[st.activeBadge, { backgroundColor: R + "18" }]}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: R }}>ACTIVE</Text>
              </View>
            )}
          </TouchableOpacity>

        </View>

        {/* ── Scrollable content ────────────────────────────────────────────── */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 280 }}
        >

          {/* Skeleton */}
          {loadingSug && (
            <>{[1, 2, 3].map(i => (
              <View key={i} style={[st.row, { borderBottomColor: colors.border }]}>
                <View style={[st.rowIcon, { backgroundColor: colors.border + "60" }]} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.border + "80", width: "60%" }} />
                  <View style={{ height: 10, borderRadius: 6, backgroundColor: colors.border + "50", width: "40%" }} />
                </View>
              </View>
            ))}</>
          )}

          {/* Search results */}
          {!loadingSug && showSearch && (
            suggestions.length > 0 ? suggestions.map(item => {
              const icon = placeIconData(item.placeType);
              return (
                <TouchableOpacity
                  key={item.placeId}
                  style={[st.row, { borderBottomColor: colors.border }]}
                  onPress={() => selectPlace(item.placeId)}
                  activeOpacity={0.65}
                >
                  <View style={[st.rowIcon, { backgroundColor: icon.bg }]}>
                    <IconSymbol name={icon.name as any} size={16} color={icon.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <HighlightText
                      text={item.primaryText}
                      query={searchText}
                      style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
                      boldStyle={{ fontSize: 14, fontWeight: "800", color: P }}
                    />
                    {!!item.secondaryText && (
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                        {item.secondaryText}
                      </Text>
                    )}
                  </View>
                  {!!item.distanceKm && item.distanceKm > 0 && (
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, marginLeft: 8 }}>
                      {formatDist(item.distanceKm)}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            }) : (
              <View style={{ alignItems: "center", paddingVertical: 36 }}>
                <IconSymbol name="magnifyingglass" size={24} color={colors.muted} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginTop: 10 }}>
                  {`No results for "${searchText}"`}
                </Text>
              </View>
            )
          )}

          {/* Quick chips */}
          {!loadingSug && !showSearch && (
            <>
              <View style={[st.sectionHeader, { backgroundColor: colors.background }]}>
                <Text style={[st.sectionLabel, { color: colors.muted }]}>QUICK SELECT</Text>
              </View>
              <View style={st.chipRow}>
                {QUICK.map(q => (
                  <TouchableOpacity
                    key={q.id}
                    style={[st.chip, { backgroundColor: q.color + "12", borderColor: q.color + "35" }]}
                    activeOpacity={0.7}
                    onPress={() => handleQuickSelect(q.id as "home" | "work" | "saved")}
                  >
                    <IconSymbol name={q.icon as any} size={18} color={q.color} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: q.color, marginTop: 5 }}>
                      {q.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Recent history */}
          {showRecents && _history.length > 0 && (
            <>
              <View style={[st.sectionHeader, { backgroundColor: colors.background }]}>
                <Text style={[st.sectionLabel, { color: colors.muted }]}>RECENT</Text>
              </View>
              {_history.slice(0, 3).map((loc, i) => (
                <TouchableOpacity
                  key={`h${i}`}
                  style={[st.row, { borderBottomColor: colors.border }]}
                  onPress={() => applyFromSearch(loc)}
                  activeOpacity={0.65}
                >
                  <View style={[st.rowIcon, { backgroundColor: "#6366F115" }]}>
                    <IconSymbol name="clock.arrow.circlepath" size={16} color="#6366F1" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                      {loc.shortName}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                      {loc.address}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Past destinations */}
          {showRecents && recentDests.length > 0 && (
            <>
              <View style={[st.sectionHeader, { backgroundColor: colors.background }]}>
                <Text style={[st.sectionLabel, { color: colors.muted }]}>PAST DESTINATIONS</Text>
              </View>
              {recentDests.map((loc, i) => (
                <TouchableOpacity
                  key={`r${i}`}
                  style={[st.row, { borderBottomColor: colors.border }]}
                  onPress={() => applyFromSearch(loc)}
                  activeOpacity={0.65}
                >
                  <View style={[st.rowIcon, { backgroundColor: V + "12" }]}>
                    <IconSymbol name="mappin.and.ellipse" size={16} color={V} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                      {loc.shortName}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                      {loc.address}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {!loadingSug && !showSearch && !showRecents && (
            <View style={{ alignItems: "center", paddingTop: 32, paddingHorizontal: 32 }}>
              <IconSymbol name="map" size={30} color={colors.border} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginTop: 14 }}>
                Drag the map or search above
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: "center" }}>
                The pin stays fixed — the map moves beneath it
              </Text>
            </View>
          )}

          <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center", marginTop: 20 }}>
            Powered by Google Maps
          </Text>
        </ScrollView>
        </KeyboardAvoidingView>

      </Animated.View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1a1a1a" },

  // ── Pin layer ──
  pinLayer:  { zIndex: 5 },
  pinCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  pinCircle: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 2.5,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38, shadowRadius: 12, elevation: 12,
  },
  pinDot:    { width: 11, height: 11, borderRadius: 5.5, backgroundColor: "#fff" },
  pinStem:   { width: 3, height: 20, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  pinShadow: { width: 26, height: 9, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.28)", marginTop: 1 },

  // ── Floating buttons ──
  backBtn: {
    position: "absolute", top: 52, left: 16, zIndex: 20,
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 6,
  },
  zoomWrap: { position: "absolute", right: 16, zIndex: 20 },
  zoomBtn: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 6,
  },
  zoomText: { fontSize: 22, fontWeight: "700", includeFontPadding: false },
  gpsWrap: { position: "absolute", right: 16, zIndex: 20 },
  gpsBtn:  {
    width: 50, height: 50, borderRadius: 25,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
  },

  // ── Sheet ──
  sheet: {
    position: "absolute", top: 0, left: 0, right: 0, height: SH,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14, shadowRadius: 16, elevation: 16, zIndex: 10,
  },
  handleArea: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 0 },
  handle:     { width: 36, height: 4, borderRadius: 2, opacity: 0.35, alignSelf: "center", marginBottom: 14 },

  // Mode row + address + confirm
  modeRow:  { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  modeDot:  { width: 10, height: 10, flexShrink: 0 },
  modeLabel:{ flex: 1, fontSize: 15, fontWeight: "800" },
  editLink: { fontSize: 13, fontWeight: "700" },

  addressBox: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, gap: 10,
  },
  addrDot:      { width: 8, height: 8, flexShrink: 0 },
  addrLoading:  { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  addrLoadingText: { fontSize: 13 },
  addrMain:  { fontSize: 15, fontWeight: "600" },
  addrSub:   { fontSize: 12, marginTop: 2 },

  confirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 14,
  },
  confirmBtnText: { fontSize: 16, fontWeight: "800" },

  // ── Route card ──
  routeCard: {
    marginHorizontal: 16, marginBottom: 4,
    borderRadius: 14, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  connectorWrap: {
    position: "absolute", left: 28, top: 52, alignItems: "center", gap: 3,
  },
  dash: { width: 1.5, height: 4, borderRadius: 1, opacity: 0.45 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 13, paddingHorizontal: 14, gap: 10,
  },
  inputText: { flex: 1, fontSize: 15, padding: 0, margin: 0 },
  dotBlue:   { width: 10, height: 10, borderRadius: 5,  backgroundColor: P, flexShrink: 0 },
  dotRed:    { width: 10, height: 10, borderRadius: 2,  backgroundColor: R, flexShrink: 0 },
  activeBadge: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, flexShrink: 0,
  },

  // ── Chips ──
  chipRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  chip: {
    flex: 1, alignItems: "center", paddingVertical: 14,
    borderRadius: 14, borderWidth: 1,
  },

  // ── Rows ──
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 8 },
  sectionLabel:  { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, gap: 12,
  },
  rowIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
});
