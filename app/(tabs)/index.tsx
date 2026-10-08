// app/(tabs)/index.tsx — YOO home: full-screen interactive map + premium bottom sheet
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GoogleMapView, { type DriverMarker } from "@/components/GoogleMapViewLazy";
import type { MapViewCommands } from "@/components/GoogleMapView";
import YooIcon from "@/components/YooIcon";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context-v2";
import { useRides } from "@/lib/rides-store";
import { trpc } from "@/lib/trpc";
import { useRoleNotificationCount } from "@/lib/use-role-notification-count";
import { useDriverAccess } from "@/lib/use-driver-access";
import { driverAccessFallbackRoute } from "@/lib/driver-access";
import { useIsFocused } from "@/hooks/use-is-focused";

// ── Color roles ───────────────────────────────────────────────────────────────
const C = {
  blue:   "#1E88FF",
  green:  "#22C55E",
  amber:  "#F59E0B",
  purple: "#8B5CF6",
  red:    "#EF4444",
} as const;

const DEFAULT_LAT = 0;
const DEFAULT_LNG = 0;
const { height: SH } = Dimensions.get("window");

// ── Sheet snap points (sheet height, grows upward from bottom) ────────────────
// MAP_PEEK_H: map fullscreen — sheet shows only drag handle
// SHEET_MIN:  default home — roughly half screen
// SHEET_MAX:  sheet nearly full — scrolling content
const MAP_PEEK_H = 90;
const SHEET_MIN  = SH * 0.47;
const SHEET_MAX  = SH * 0.80;
const SNAPS      = [MAP_PEEK_H, SHEET_MIN, SHEET_MAX] as const;
const SPRING_CFG = { tension: 80, friction: 13, useNativeDriver: false } as const;
const MAP_CTRL_SIZE = 46;
const MAP_CTRL_RIGHT = 16;
const MAP_CTRL_TOP_BAR_PAD = 6;
const MAP_CTRL_TOP_BAR_BOTTOM = 8;
const MAP_CTRL_NOTIF_TO_RECENTER_GAP = 24;
const MAP_CTRL_RECENTER_TO_ZOOM_GAP = 12;
const MAP_CTRL_SHEET_CLEARANCE = 12;
const MAP_CTRL_HIDE_SHEET_H = SH * 0.55;
const ZOOM_GROUP_H = 80;
const ZOOM_HALF_H = 40;
const SHEET_EXPAND_THRESHOLD = SH * 0.25;
const SHEET_MID_SNAP_INDEX = 1;
const SHEET_EXPANDED_SNAP_INDEX = 2;

type GS = { dx: number; dy: number; vx: number; vy: number };

// ── Promo slides ──────────────────────────────────────────────────────────────
const PROMO_SLIDES = [
  { emoji: "🎉", title: "Save up to 60% sharing rides",        sub: "Carpool with commuters heading your way",        color: C.blue   },
  { emoji: "🚌", title: "Share Rides, Split Fares",             sub: "Book shared and pay less than solo",             color: C.green  },
  { emoji: "📅", title: "Schedule Recurring Commutes",          sub: "Set once, ride daily — never miss your commute", color: C.purple },
  { emoji: "💰", title: "Earn up to $120/week driving",         sub: "Go online in Driver Mode and accept rides",      color: C.amber  },
  { emoji: "🌱", title: "Go Green, Earn Badges",                sub: "Every shared ride earns eco-reward points",      color: C.green  },
  { emoji: "🛡️", title: "Safety First, Always",                 sub: "Real-time tracking, SOS & verified drivers",    color: C.red    },
];

// ── Pulse animation ───────────────────────────────────────────────────────────
function usePulse() {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- anim is a stable Animated.Value ref
  return anim;
}

// ── Primary action card with press-spring ────────────────────────────────────
function PrimaryAction({ icon, label, sub, bg, onPress }: {
  icon: string; label: string; sub: string; bg: string; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 100 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 100 }).start();
  return (
    <Animated.View style={[st.primaryAction, { backgroundColor: bg, transform: [{ scale }] }]}>
      <TouchableOpacity
        style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 14, alignItems: "flex-start" }}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={1}
      >
        <View style={st.primaryActionIcon}>
          <IconSymbol name={icon as any} size={22} color="#fff" />
        </View>
        <Text style={st.primaryActionLabel}>{label}</Text>
        <Text style={st.primaryActionSub}>{sub}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Secondary action chip with press-spring ───────────────────────────────────
function SecondaryAction({ icon, label, color, onPress }: {
  icon: string; label: string; color: string; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[st.secondaryAction, { borderColor: color + "30", backgroundColor: color + "0A", transform: [{ scale }] }]}>
      <TouchableOpacity
        style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, paddingHorizontal: 10 }}
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 100 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 100 }).start()}
        activeOpacity={1}
      >
        <IconSymbol name={icon as any} size={15} color={color} />
        <Text style={[st.secondaryActionLabel, { color }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Saved place chip ──────────────────────────────────────────────────────────
function SavedChip({ icon, iconBg, iconColor, label, sub, onPress, colors }: {
  icon: string; iconBg: string; iconColor: string; label: string;
  sub: string; onPress: () => void; colors: any;
}) {
  return (
    <TouchableOpacity
      style={[st.savedChip, { backgroundColor: colors.background, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.72}
    >
      <View style={[st.savedChipIcon, { backgroundColor: iconBg }]}>
        <IconSymbol name={icon as any} size={14} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>{label}</Text>
        <Text numberOfLines={1} style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const colors     = useColors();
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const { state, setBookingDraft } = useRides();
  const { user }   = useAuth();
  const pulseAnim  = usePulse();
  const isFocused  = useIsFocused();
  const [hasRealLocation, setHasRealLocation] = useState(false);
  const [mapZoom, setMapZoom] = useState(15);
  const mapApiRef = useRef<MapViewCommands | null>(null);

  // Map fullscreen state — true when sheet is in MAP_PEEK_H snap
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(SHEET_MIN);

  // ── Saved places ────────────────────────────────────────────────────────────
  const [savedHome, setSavedHome] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [savedWork, setSavedWork] = useState<{ label: string; lat: number; lng: number } | null>(null);

  useEffect(() => {
    setSavedHome(null);
    setSavedWork(null);
    if (!user?.id) return;
    (async () => {
      try {
        const h = await AsyncStorage.getItem(`saved_place_home:${user.id}`);
        if (h) setSavedHome(JSON.parse(h));
        const w = await AsyncStorage.getItem(`saved_place_work:${user.id}`);
        if (w) setSavedWork(JSON.parse(w));
      } catch {}
    })();
  }, [user?.id]);

  // ── Location modal ──────────────────────────────────────────────────────────
  const [locationModalType, setLocationModalType] = useState<"home" | "work" | null>(null);
  const [locationSearch, setLocationSearch]       = useState("");
  const [geocodeResults, setGeocodeResults]       = useState<{ address: string; lat: number; lng: number; shortName: string }[]>([]);
  const [isSearching, setIsSearching]             = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const geocodeSearchRef = useRef<(q: string) => Promise<void>>(async () => {});
  geocodeSearchRef.current = async (query: string) => {
    if (query.trim().length < 2) { setGeocodeResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&addressdetails=1`,
        { headers: { "User-Agent": "YOOApp/1.0" } },
      );
      const data = await res.json();
      setGeocodeResults(data.map((item: any) => ({
        address:   item.display_name || query,
        lat:       parseFloat(item.lat),
        lng:       parseFloat(item.lon),
        shortName: item.display_name?.split(",")[0] || query,
      })));
    } catch { setGeocodeResults([]); }
    finally  { setIsSearching(false); }
  };

  const handleLocationSearchChange = useCallback((text: string) => {
    setLocationSearch(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (text.trim().length < 2) { setGeocodeResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(() => geocodeSearchRef.current?.(text), 400);
  }, []);

  // ── Recent destinations (replaces hardcoded popular locations) ──────────────
  const { data: recentDestData } = trpc.rides.getRecentDestinations.useQuery(
    { limit: 10 },
    { enabled: isFocused, staleTime: 60_000 }
  );
  type RecentDest = NonNullable<typeof recentDestData>[number];
  type DestItem = RecentDest & { icon: string; iconColor: string };
  const popularLocations: DestItem[] =
    (recentDestData ?? []).map((d: RecentDest) => ({
      ...d,
      icon: "mappin.circle.fill",
      iconColor: C.purple,
    }));

  const filteredLocations = locationSearch.trim().length >= 2 ? geocodeResults : popularLocations;

  const handleSavePlace = async (loc: { address: string; lat: number; lng: number; shortName: string }) => {
    const data = { label: loc.address, lat: loc.lat, lng: loc.lng };
    if (locationModalType === "home") { setSavedHome(data); await AsyncStorage.setItem(`saved_place_home:${user?.id ?? "anon"}`, JSON.stringify(data)); }
    else if (locationModalType === "work") { setSavedWork(data); await AsyncStorage.setItem(`saved_place_work:${user?.id ?? "anon"}`, JSON.stringify(data)); }
    setLocationModalType(null);
    setLocationSearch("");
    setGeocodeResults([]);
  };

  // ── Popular destinations (reshuffled every 30 s) ────────────────────────────
  const shuffled = (arr: typeof popularLocations) => {
    const s = [...arr];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j]!, s[i]!];
    }
    return s.slice(0, 6);
  };
  const [displayedDestinations, setDisplayedDestinations] = useState<typeof popularLocations>([]);
  useEffect(() => {
    setDisplayedDestinations(shuffled(popularLocations));
  }, [popularLocations.length]); // eslint-disable-line react-hooks/exhaustive-deps -- shuffled defined in component; .length dep intentional to avoid shuffle on every render
  useEffect(() => {
    if (popularLocations.length === 0) return;
    const id = setInterval(() => setDisplayedDestinations(shuffled(popularLocations)), 30_000);
    return () => clearInterval(id);
  }, [popularLocations.length]); // eslint-disable-line react-hooks/exhaustive-deps -- shuffled defined in component; .length dep intentional

  // ── Promo banner ────────────────────────────────────────────────────────────
  const [promoIndex, setPromoIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setPromoIndex((p) => (p + 1) % PROMO_SLIDES.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- fadeAnim is a stable Animated.Value ref
  const currentPromo = PROMO_SLIDES[promoIndex];

  // ── GPS ─────────────────────────────────────────────────────────────────────
  const [userLat, setUserLat]             = useState(DEFAULT_LAT);
  const [userLng, setUserLng]             = useState(DEFAULT_LNG);
  const [locationLabel, setLocationLabel] = useState("Locating…");
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    if (!isFocused) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    const timer = setTimeout(() => {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;
          if (status !== "granted") { setLocationError(true); setLocationLabel("Location unavailable"); return; }
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (cancelled) return;
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
          setHasRealLocation(true);
          try {
            const [place] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            const label = place
              ? [place.street, place.city].filter(Boolean).join(", ") || "Current location"
              : "Current location";
            if (!cancelled) setLocationLabel(label);
          } catch { if (!cancelled) setLocationLabel("Current location"); }
          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, distanceInterval: 30 },
            (p) => { setUserLat(p.coords.latitude); setUserLng(p.coords.longitude); },
          );
        } catch {
          if (!cancelled) { setLocationError(true); setLocationLabel("Current location"); }
        }
      })();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      try { if (typeof sub?.remove === "function") sub.remove(); } catch {}
    };
  }, [isFocused]);

  // ── Nearby drivers (polled) ─────────────────────────────────────────────────
  const { data: nearbyDriversData } = trpc.driver.getOnlineDriversNear.useQuery(
    { lat: userLat, lng: userLng, radiusKm: 5 },
    {
      enabled: isFocused && hasRealLocation,
      staleTime: 15_000,
      refetchInterval: isFocused && hasRealLocation ? 20_000 : false,
    },
  );
  const drivers: DriverMarker[] = useMemo(() =>
    (nearbyDriversData ?? []).map((d: any) => ({
      id:  String(d.id ?? d.sessionId ?? Math.random()),
      lat: Number(d.lat ?? d.currentLat),
      lng: Number(d.lng ?? d.currentLng),
    })),
    [nearbyDriversData],
  );

  // ── Notifications + messages ────────────────────────────────────────────────
  const { data: notifCountData } = useRoleNotificationCount("passenger", isFocused, 30_000);
  const notifCount = notifCountData?.count ?? 0;
  const { data: msgCountData } = trpc.chat.unreadCount.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 30_000,
    refetchInterval: isFocused ? 30_000 : false,
  });
  const msgCount   = msgCountData?.count ?? 0;
  const { data: unreadChats } = trpc.chat.getUnreadChats.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 60_000,
    refetchInterval: isFocused ? 60_000 : false,
  });

  // ── CO₂ stats ───────────────────────────────────────────────────────────────
  const { data: co2Stats } = trpc.rides.getCO2Stats.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 5 * 60_000,
  });
  const co2Saved = co2Stats?.co2SavedKg ?? 0;

  // ── Driver access ───────────────────────────────────────────────────────────
  const {
    canAccessDriverMode,
    isLoading: driverStatusLoading,
    access: driverAccess,
  } = useDriverAccess(isFocused);
  const driverStatusReady = !driverStatusLoading;

  // ── Bottom sheet — 3-snap height system ────────────────────────────────────
  const sheetH        = useRef(new Animated.Value(SHEET_MIN)).current;
  const snapHRef      = useRef(SHEET_MIN);
  const scrollOffsetRef   = useRef(0);
  const touchStartYRef    = useRef(0);
  const sheetHAtTouchRef  = useRef(SHEET_MIN);

  const snapTo = useCallback((target: number, velocity = 0) => {
    const clamped = Math.max(MAP_PEEK_H, Math.min(SHEET_MAX, target));
    snapHRef.current = clamped;
    setSheetHeight(clamped);
    setMapFullscreen(clamped <= MAP_PEEK_H + 20);
    Animated.spring(sheetH, { toValue: clamped, ...SPRING_CFG, velocity }).start();
  }, [sheetH]);

  useEffect(() => {
    const id = sheetH.addListener(({ value }: { value: number }) => {
      setSheetHeight(value);
      setMapFullscreen(value <= MAP_PEEK_H + 20);
    });
    return () => { sheetH.removeListener(id); };
  }, [sheetH]);

  const showExpandMap = Platform.OS === "web" && sheetHeight > SHEET_EXPAND_THRESHOLD;
  const headerBottom = insets.top + MAP_CTRL_TOP_BAR_PAD + MAP_CTRL_SIZE + MAP_CTRL_TOP_BAR_BOTTOM;
  const mapVisibleBottom = SH - sheetHeight - MAP_CTRL_SHEET_CLEARANCE;
  const minRecenterTop = headerBottom + MAP_CTRL_NOTIF_TO_RECENTER_GAP;
  let recenterTop = minRecenterTop;
  let zoomGroupTop = recenterTop + MAP_CTRL_SIZE + MAP_CTRL_RECENTER_TO_ZOOM_GAP;
  if (zoomGroupTop + ZOOM_GROUP_H > mapVisibleBottom) {
    zoomGroupTop = mapVisibleBottom - ZOOM_GROUP_H;
    recenterTop = zoomGroupTop - MAP_CTRL_RECENTER_TO_ZOOM_GAP - MAP_CTRL_SIZE;
  }
  recenterTop = Math.max(headerBottom, recenterTop);
  if (recenterTop + MAP_CTRL_SIZE + MAP_CTRL_RECENTER_TO_ZOOM_GAP + ZOOM_GROUP_H > mapVisibleBottom) {
    zoomGroupTop = mapVisibleBottom - ZOOM_GROUP_H;
    recenterTop = Math.max(headerBottom, zoomGroupTop - MAP_CTRL_RECENTER_TO_ZOOM_GAP - MAP_CTRL_SIZE);
  }

  const sheetSnapIndex =
    sheetHeight <= MAP_PEEK_H + 20 ? 0
    : sheetHeight >= SHEET_MAX - 20 ? SHEET_EXPANDED_SNAP_INDEX
    : sheetHeight <= SHEET_MIN + 20 ? SHEET_MID_SNAP_INDEX
    : sheetHeight > MAP_CTRL_HIDE_SHEET_H ? SHEET_EXPANDED_SNAP_INDEX
    : SHEET_MID_SNAP_INDEX;
  const mapControlsVisible = sheetSnapIndex < SHEET_EXPANDED_SNAP_INDEX && sheetHeight <= MAP_CTRL_HIDE_SHEET_H;
  const mapCtrlOpacity = sheetH.interpolate({
    inputRange: [SHEET_MIN, MAP_CTRL_HIDE_SHEET_H],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const expandMap   = useCallback(() => snapTo(MAP_PEEK_H), [snapTo]);
  const collapseMap = useCallback(() => snapTo(SHEET_MIN),  [snapTo]);

  const handleLocateMe = useCallback(async () => {
    if (Platform.OS === "web" && mapApiRef.current) {
      mapApiRef.current.recenter();
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLat(pos.coords.latitude);
      setUserLng(pos.coords.longitude);
      setHasRealLocation(true);
    } catch {}
  }, []);

  const handleZoomIn = useCallback(() => {
    if (Platform.OS === "web" && mapApiRef.current) {
      mapApiRef.current.zoomIn();
      return;
    }
    setMapZoom((z) => Math.min(18, z + 1));
  }, []);

  const handleZoomOut = useCallback(() => {
    if (Platform.OS === "web" && mapApiRef.current) {
      mapApiRef.current.zoomOut();
      return;
    }
    setMapZoom((z) => Math.max(10, z - 1));
  }, []);

  const handleMapReady = useCallback((api: MapViewCommands) => {
    mapApiRef.current = api;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e: any) => {
        touchStartYRef.current   = e.nativeEvent.pageY;
        sheetHAtTouchRef.current = snapHRef.current;
        return false; // don't steal on touch start — only on move
      },
      onMoveShouldSetPanResponder: (_: any, gs: GS) => {
        const isVertical = Math.abs(gs.dy) > 6 && Math.abs(gs.dy) > Math.abs(gs.dx);
        if (!isVertical) return false;
        // Dragging down: capture only when scroll content is already at top
        if (gs.dy > 0) return scrollOffsetRef.current <= 0;
        // Dragging up: capture only when touch started within the handle+header zone
        const sheetTopY    = SH - sheetHAtTouchRef.current;
        const touchInSheet = touchStartYRef.current - sheetTopY;
        return touchInSheet < 90; // ~90px covers handle + header
      },
      onPanResponderGrant: () => {
        (sheetH as any).stopAnimation((val: number) => { snapHRef.current = val; });
      },
      onPanResponderMove: (_: any, gs: GS) => {
        const next = Math.max(MAP_PEEK_H, Math.min(SHEET_MAX, snapHRef.current - gs.dy));
        sheetH.setValue(next);
      },
      onPanResponderRelease: (_: any, gs: GS) => {
        const pos = snapHRef.current - gs.dy;
        let target: number;
        if (gs.vy > 0.45) {
          // Fast downward flick
          target = pos > SHEET_MIN ? SHEET_MIN : MAP_PEEK_H;
        } else if (gs.vy < -0.45) {
          // Fast upward flick
          target = pos < SHEET_MIN ? SHEET_MIN : SHEET_MAX;
        } else {
          // Nearest snap point
          target = SNAPS.reduce((a, b) => Math.abs(b - pos) < Math.abs(a - pos) ? b : a);
        }
        snapHRef.current = target;
        setMapFullscreen(target <= MAP_PEEK_H + 20);
        Animated.spring(sheetH, { toValue: target, ...SPRING_CFG, velocity: -gs.vy }).start();
      },
    })
  ).current;

  // ── User info ───────────────────────────────────────────────────────────────
  const userName      = user ? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "U") : "U";
  const firstName     = userName.split(" ")[0] ?? "U";
  const avatarInitial = firstName[0]?.toUpperCase() ?? "U";

  // ── Time-based greeting ─────────────────────────────────────────────────────
  const [greeting, setGreeting] = useState("Good morning");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);

  const driverCountLabel = drivers.length === 0
    ? "No drivers nearby"
    : `${drivers.length} driver${drivers.length === 1 ? "" : "s"} nearby`;

  return (
    <View style={st.root}>

      {/* ══ LAYER 1: Map fills the entire screen ══════════════════════════════ */}
      <GoogleMapView
        userLat={userLat}
        userLng={userLng}
        drivers={drivers}
        zoom={mapZoom}
        style={StyleSheet.absoluteFill}
        onMyLocation={(lat: number, lng: number) => { setUserLat(lat); setUserLng(lng); setHasRealLocation(true); }}
        onMapReady={handleMapReady}
      />

      {/* ══ LAYER 2: Top floating bar — avatar + logo only ═══════════════════ */}
      <View style={[st.topBar, { paddingTop: insets.top + MAP_CTRL_TOP_BAR_PAD }]}>
        <TouchableOpacity
          style={st.avatarBtn}
          onPress={() => router.push("/(tabs)/profile" as Href)}
          activeOpacity={0.8}
        >
          <Text style={st.avatarText}>{avatarInitial}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center" }}>
          <YooIcon size={26} />
        </View>

        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {showExpandMap && (
            <TouchableOpacity
              style={st.topBarIconBtn}
              onPress={expandMap}
              accessibilityLabel="Expand map to fullscreen"
            >
              <IconSymbol name="arrow.up.left.and.arrow.down.right" size={16} color="#374151" />
            </TouchableOpacity>
          )}
          {msgCount > 0 && (unreadChats as any[])?.[0]?.rideStringId && (
            <TouchableOpacity
              style={st.topBarIconBtn}
              onPress={() => {
                router.push(`/chat-screen?rideId=${(unreadChats as any[])[0].rideStringId}` as Href);
              }}
              accessibilityLabel="Messages"
            >
              <IconSymbol name="message.fill" size={16} color={C.green} />
              <View style={[st.badge, { backgroundColor: C.green }]}>
                <Text style={st.badgeText}>{msgCount > 99 ? "99+" : msgCount}</Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={st.topBarIconBtn}
            onPress={() => router.push("/notifications" as Href)}
            accessibilityLabel="Notifications"
          >
            <IconSymbol name="bell.fill" size={17} color={notifCount > 0 ? C.blue : "#374151"} />
            {notifCount > 0 && (
              <View style={[st.badge, { backgroundColor: C.blue }]}>
                <Text style={st.badgeText}>{notifCount > 99 ? "99+" : notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ══ Active ride banner ════════════════════════════════════════════════ */}
      {state.activeRide && (
        <TouchableOpacity
          style={[st.activeRideBanner, { top: insets.top + 62 }]}
          onPress={() => router.push("/active-ride" as Href)}
          activeOpacity={0.85}
        >
          <Animated.View style={[st.activeDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={st.activeRideText}>Ride in progress · Tap to track</Text>
          <IconSymbol name="chevron.right" size={12} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ══ Map controls — recenter + zoom (hide when sheet expands past mid) ══ */}
      <Animated.View
        pointerEvents={mapControlsVisible ? "box-none" : "none"}
        style={[
          st.mapControlsLayer,
          { opacity: mapCtrlOpacity, zIndex: mapControlsVisible ? 25 : 8 },
        ]}
      >
        <TouchableOpacity
          style={[st.mapControlBtn, st.mapControlFloat, { top: recenterTop }]}
          onPress={handleLocateMe}
          activeOpacity={0.88}
          accessibilityLabel="Center on my location"
          disabled={!mapControlsVisible}
        >
          <IconSymbol name="location.fill" size={19} color={C.blue} />
        </TouchableOpacity>

        <View style={[st.zoomGroup, st.mapControlFloat, { top: zoomGroupTop }]}>
          <TouchableOpacity
            style={st.zoomHalf}
            onPress={handleZoomIn}
            activeOpacity={0.88}
            accessibilityLabel="Zoom in"
            disabled={!mapControlsVisible}
          >
            <Text style={st.mapZoomText}>+</Text>
          </TouchableOpacity>
          <View style={st.zoomDivider} />
          <TouchableOpacity
            style={st.zoomHalf}
            onPress={handleZoomOut}
            activeOpacity={0.88}
            accessibilityLabel="Zoom out"
            disabled={!mapControlsVisible}
          >
            <Text style={st.mapZoomText}>−</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ══ Map collapse pill — web only, when sheet is peeked ════════════════ */}
      {Platform.OS === "web" && mapFullscreen && (
        <TouchableOpacity
          style={[st.mapCollapsePill, { top: insets.top + 62 }]}
          onPress={collapseMap}
          activeOpacity={0.88}
          accessibilityLabel="Collapse map"
        >
          <IconSymbol name="arrow.down.right.and.arrow.up.left" size={13} color="#374151" />
          <Text style={st.mapCollapsePillText}>Done</Text>
        </TouchableOpacity>
      )}

      {/* ══ LAYER 3: Bottom sheet — floats over map ═══════════════════════════ */}
      <Animated.View
        style={[st.sheet, {
          backgroundColor: colors.surface,
          height: sheetH,
          position: "absolute", bottom: 0, left: 0, right: 0,
        }]}
        {...panResponder.panHandlers}
      >

        {/* Drag handle */}
        <View style={st.handleArea}>
          <View style={[st.handle, { backgroundColor: colors.border }]} />
        </View>

          {/* Header: greeting + live badges */}
          <View style={st.sheetHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[st.greetingLabel, { color: colors.muted }]}>
                {greeting}
              </Text>
              <Text style={[st.greetingName, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {firstName !== "U" ? firstName : "Welcome back"}
              </Text>
              <Text style={[st.greetingLocation, { color: colors.muted }]} numberOfLines={1}>
                {locationLabel}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexShrink: 0 }}>
              {/* Live driver count */}
              <View style={[st.liveBadge, { backgroundColor: drivers.length > 0 ? C.green + "15" : "#9CA3AF14" }]}>
                <Animated.View style={[
                  st.liveDot,
                  { backgroundColor: drivers.length > 0 ? C.green : "#9CA3AF",
                    transform: [{ scale: drivers.length > 0 ? pulseAnim : 1 }] },
                ]} />
                <Text style={[st.liveBadgeText, { color: drivers.length > 0 ? C.green : "#9CA3AF" }]}>
                  {driverCountLabel}
                </Text>
              </View>
              {/* CO₂ saved — only if user has data */}
              {co2Saved > 0 && (
                <View style={[st.liveBadge, { backgroundColor: C.green + "15" }]}>
                  <Text style={[st.liveBadgeText, { color: C.green }]}>
                    🌱 {co2Saved.toFixed(0)}kg CO₂
                  </Text>
                </View>
              )}
            </View>
          </View>

        {/* ── Search bar ───────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[st.searchBar, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => {
            if (mapFullscreen) collapseMap();
            router.push("/book-ride" as Href);
          }}
          activeOpacity={0.85}
          accessibilityLabel="Search destination"
          accessibilityRole="button"
        >
          <View style={st.searchIcon}>
            <IconSymbol name="magnifyingglass" size={14} color="#fff" />
          </View>
          <Text style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: "600", color: colors.muted }}>
            Where to?
          </Text>
          <View style={[st.searchBadge, { backgroundColor: "#F3F4F6" }]}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#6B7280" }}>Book</Text>
          </View>
        </TouchableOpacity>

        {/* ── Saved places ─────────────────────────────────────────────────── */}
        <View style={st.savedChipsRow}>
          <SavedChip
            icon="house.fill" iconBg={C.blue + "18"} iconColor={C.blue}
            label="Home"
            sub={savedHome?.label?.split(",")[0] || "Set address"}
            onPress={() => {
              if (savedHome) {
                setBookingDraft({ dropoff: { address: savedHome.label, lat: savedHome.lat, lng: savedHome.lng, shortName: savedHome.label.split(",")[0] } });
                router.push("/book-ride" as Href);
              } else {
                setLocationModalType("home");
              }
            }}
            colors={colors}
          />
          <SavedChip
            icon="briefcase.fill" iconBg={C.amber + "18"} iconColor={C.amber}
            label="Work"
            sub={savedWork?.label?.split(",")[0] || "Set address"}
            onPress={() => {
              if (savedWork) {
                setBookingDraft({ dropoff: { address: savedWork.label, lat: savedWork.lat, lng: savedWork.lng, shortName: savedWork.label.split(",")[0] } });
                router.push("/book-ride" as Href);
              } else {
                setLocationModalType("work");
              }
            }}
            colors={colors}
          />
        </View>

        {/* ── Scrollable content ───────────────────────────────────────────── */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 60) }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          scrollEventThrottle={16}
          onScroll={(e: any) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        >

          {/* Primary ride actions */}
          <View style={st.primaryActionsRow}>
            <PrimaryAction
              icon="person.2.fill" label="Share Ride" sub="Split fare · Eco"
              bg={C.blue}
              onPress={() => { setBookingDraft({ mode: "share" }); router.push("/book-ride" as Href); }}
            />
            <PrimaryAction
              icon="car.fill" label="Solo Ride" sub="Private · Direct"
              bg={C.amber}
              onPress={() => { setBookingDraft({ mode: "solo" }); router.push("/book-ride" as Href); }}
            />
          </View>

          {/* Secondary actions */}
          <View style={st.secondaryActionsRow}>
            <SecondaryAction
              icon="magnifyingglass" label="Find Carpool" color={C.green}
              onPress={() => router.push("/find-shared" as Href)}
            />
            <SecondaryAction
              icon="plus.circle.fill" label="Post a Ride" color={C.purple}
              onPress={() => router.push("/create-ride?flow=post" as Href)}
            />
          </View>

          {/* Popular destinations */}
          <View style={{ marginBottom: 14 }}>
            <Text style={[st.sectionLabel, { color: colors.muted, paddingHorizontal: 16 }]}>
              POPULAR DESTINATIONS
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {displayedDestinations.map((loc) => (
                <TouchableOpacity
                  key={loc.address}
                  style={[st.destCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => { setBookingDraft({ dropoff: { address: loc.address, lat: loc.lat, lng: loc.lng, shortName: loc.shortName } }); router.push("/book-ride" as Href); }}
                  activeOpacity={0.75}
                >
                  <View style={[st.destCardIcon, { backgroundColor: loc.iconColor }]}>
                    <IconSymbol name={loc.icon as any} size={20} color="#fff" />
                  </View>
                  <Text style={[st.destCardName, { color: colors.foreground }]} numberOfLines={1}>{loc.shortName}</Text>
                  <Text style={[st.destCardSub, { color: colors.muted }]}>Popular destination</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Feature pills */}
          <View style={[st.pillRow, { paddingHorizontal: 16, marginBottom: 14 }]}>
            {([
              { icon: "calendar",     label: "Schedule", color: colors.foreground, route: "/recurring-rides"  },
              { icon: "shield.fill",  label: "Safety",   color: colors.foreground, route: "/safety-preferences" },
              { icon: "star.fill",    label: "Rewards",  color: C.amber,           route: "/loyalty-rewards"  },
              { icon: "car.fill",       label: "Drive",    color: colors.foreground, route: null                },
            ] as const).map(({ icon, label, color, route }) => (
              <TouchableOpacity
                key={label}
                style={[st.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.75}
                onPress={() => {
                  if (label === "Drive") {
                    if (!driverStatusReady) return;
                    if (canAccessDriverMode) router.push("/driver/dashboard" as Href);
                    else router.push(driverAccessFallbackRoute(driverAccess) as Href);
                  } else if (route) {
                    router.push(route as Href);
                  }
                }}
              >
                <IconSymbol name={icon as any} size={12} color={color as string} />
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, marginLeft: 4 }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Rotating promo banner */}
          <Animated.View style={{ opacity: fadeAnim, paddingHorizontal: 16, marginBottom: 14 }}>
            <TouchableOpacity
              style={[st.promoBanner, { backgroundColor: currentPromo.color + "0E", borderColor: currentPromo.color + "22" }]}
              activeOpacity={0.8}
              onPress={() => {
                if (promoIndex === 2) router.push("/recurring-rides" as Href);
                else if (promoIndex === 3) {
                  if (!driverStatusReady) return;
                  if (canAccessDriverMode) router.push("/driver/dashboard" as Href);
                  else router.push(driverAccessFallbackRoute(driverAccess) as Href);
                } else {
                  router.push("/book-ride" as Href);
                }
              }}
            >
              <View style={[st.promoIconWrap, { backgroundColor: currentPromo.color + "18" }]}>
                <Text style={{ fontSize: 18 }}>{currentPromo.emoji}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: "800", color: currentPromo.color }}>{currentPromo.title}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2, lineHeight: 15 }}>{currentPromo.sub}</Text>
              </View>
              <View style={{ gap: 3, alignSelf: "flex-end", flexDirection: "row" }}>
                {PROMO_SLIDES.map((_, i) => (
                  <View key={i} style={{
                    width: i === promoIndex ? 14 : 4, height: 4, borderRadius: 2,
                    backgroundColor: i === promoIndex ? currentPromo.color : colors.border,
                  }} />
                ))}
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Gamified rewards */}
          <View style={[st.rewardSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Earn as you ride</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>Level 6 · 2,840 pts</Text>
              </View>
              <TouchableOpacity onPress={() => router.push("/loyalty-rewards" as Href)}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.blue }}>View all →</Text>
              </TouchableOpacity>
            </View>
            <View style={[st.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[st.progressFill, { width: "94%", backgroundColor: C.purple }]} />
            </View>
            <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4, marginBottom: 12 }}>160 pts to Level 7</Text>
            <TouchableOpacity style={st.rewardRow} onPress={() => router.push("/loyalty-rewards" as Href)}>
              <Text style={{ fontSize: 17 }}>🚗</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>Carpool Rewards</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>Earn points for every shared ride</Text>
              </View>
              <IconSymbol name="chevron.right" size={13} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity style={[st.rewardRow, { borderBottomWidth: 0, marginBottom: 0 }]} onPress={() => router.push("/referral" as Href)}>
              <Text style={{ fontSize: 17 }}>🎁</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>Refer & Earn</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>Credits for each friend you invite</Text>
              </View>
              <IconSymbol name="chevron.right" size={13} color={colors.muted} />
            </TouchableOpacity>
          </View>

        </ScrollView>
      </Animated.View>

      {/* ══ Set Location Modal ════════════════════════════════════════════════ */}
      <Modal
        visible={locationModalType !== null}
        animationType="slide"
        transparent
        onRequestClose={() => { setLocationModalType(null); setLocationSearch(""); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            maxHeight: "80%", paddingBottom: 30,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
              <Text style={{ fontSize: 19, fontWeight: "800", color: colors.foreground }}>
                Set {locationModalType === "home" ? "Home" : "Work"} Address
              </Text>
              <TouchableOpacity
                onPress={() => { setLocationModalType(null); setLocationSearch(""); setGeocodeResults([]); }}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontSize: 15, color: "#6B7280", fontWeight: "700" }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: "#E5E7EB" }}>
                <IconSymbol name="magnifyingglass" size={15} color="#94A3B8" />
                <TextInput
                  placeholder="Search for an address..."
                  value={locationSearch}
                  onChangeText={handleLocationSearchChange}
                  style={{ flex: 1, marginLeft: 10, fontSize: 14, color: colors.foreground }}
                  placeholderTextColor="#94A3B8"
                  autoFocus
                />
                {locationSearch.length > 0 && (
                  <TouchableOpacity onPress={() => { setLocationSearch(""); setGeocodeResults([]); setIsSearching(false); }}>
                    <Text style={{ fontSize: 13, color: "#94A3B8" }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {!locationError && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F9FAFB" }}
                onPress={() => handleSavePlace({ address: locationLabel || "Current Location", lat: userLat, lng: userLng, shortName: locationLabel?.split(",")[0] || "Current Location" })}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.blue + "15", alignItems: "center", justifyContent: "center" }}>
                  <IconSymbol name="location.fill" size={15} color={C.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.blue }}>Use current location</Text>
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{locationLabel}</Text>
                </View>
              </TouchableOpacity>
            )}

            <ScrollView style={{ maxHeight: 350 }} keyboardShouldPersistTaps="handled">
              {filteredLocations.map((loc, i) => (
                <TouchableOpacity
                  key={loc.address + i}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#0F2244" }}
                  onPress={() => handleSavePlace(loc)}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}>
                    <IconSymbol name="mappin.and.ellipse" size={14} color="#6B7280" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{loc.shortName}</Text>
                    <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }} numberOfLines={1}>{loc.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {isSearching && (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color={C.blue} />
                  <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 6 }}>Searching...</Text>
                </View>
              )}
              {!isSearching && filteredLocations.length === 0 && locationSearch.trim().length >= 2 && (
                <View style={{ padding: 28, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: "#94A3B8" }}>No locations found</Text>
                </View>
              )}
            </ScrollView>

            {((locationModalType === "home" && savedHome) || (locationModalType === "work" && savedWork)) && (
              <TouchableOpacity
                style={{ marginHorizontal: 20, marginTop: 10, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#FCA5A5", backgroundColor: "#FEF2F2", alignItems: "center" }}
                onPress={async () => {
                  if (locationModalType === "home") { setSavedHome(null); await AsyncStorage.removeItem(`saved_place_home:${user?.id ?? "anon"}`); }
                  else { setSavedWork(null); await AsyncStorage.removeItem(`saved_place_work:${user?.id ?? "anon"}`); }
                  setLocationModalType(null);
                  setLocationSearch("");
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#DC2626" }}>
                  Remove saved {locationModalType} address
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  // ── Top bar — sits on map with frosted-white buttons ──
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 10, zIndex: 40,
  },
  avatarBtn: {
    width: MAP_CTRL_SIZE, height: MAP_CTRL_SIZE, borderRadius: MAP_CTRL_SIZE / 2,
    backgroundColor: "#1F2937",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.32, shadowRadius: 8, elevation: 8,
  },
  avatarText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  topBarIconBtn: {
    width: MAP_CTRL_SIZE,
    height: MAP_CTRL_SIZE,
    borderRadius: MAP_CTRL_SIZE / 2,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  mapControlsLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  mapControlFloat: {
    position: "absolute",
    right: MAP_CTRL_RIGHT,
  },
  mapControlBtn: {
    width: MAP_CTRL_SIZE,
    height: MAP_CTRL_SIZE,
    borderRadius: MAP_CTRL_SIZE / 2,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },
  zoomGroup: {
    width: MAP_CTRL_SIZE,
    height: ZOOM_GROUP_H,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },
  zoomHalf: {
    height: ZOOM_HALF_H,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 8,
  },
  mapZoomText: {
    fontSize: 22,
    fontWeight: "300",
    color: "#1F2937",
    lineHeight: 24,
  },
  badge: {
    position: "absolute", top: -2, right: -2,
    borderRadius: 8, minWidth: 17, height: 17,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 3, borderWidth: 2, borderColor: "#fff",
  },
  badgeText: { fontSize: 8, fontWeight: "800", color: "#fff" },

  // ── Active ride banner ──
  activeRideBanner: {
    position: "absolute", left: 16, right: 16,
    backgroundColor: C.green, borderRadius: 14,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10, zIndex: 15,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
  },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff", marginRight: 8 },
  activeRideText: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 13 },
  mapCollapsePill: {
    position: "absolute", left: 14, zIndex: 10,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, height: 44,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  mapCollapsePillText: { fontSize: 13, fontWeight: "700", color: "#374151" },

  // ── Sheet ──
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    zIndex: 30,
    shadowColor: "#000", shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.13, shadowRadius: 20, elevation: 22,
    overflow: "hidden",
  },
  // Handle area — tall for easy grab, prominent pill
  handleArea: { paddingTop: 14, paddingBottom: 8, alignItems: "center", minHeight: 48 },
  handle: { width: 56, height: 5, borderRadius: 2.5, opacity: 0.45 },

  // ── Sheet header ──
  sheetHeader: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2, gap: 8,
  },
  greetingLabel:    { fontSize: 10, fontWeight: "600", letterSpacing: 0.2, marginBottom: 1 },
  greetingName:     { fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  greetingLocation: { fontSize: 11, fontWeight: "500", marginTop: 3 },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12,
  },
  liveDot:      { width: 6, height: 6, borderRadius: 3 },
  liveBadgeText: { fontSize: 10, fontWeight: "700" },

  // ── Search bar ──
  searchBar: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 16, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 12, minHeight: 50,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  searchIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "#1F2937",
    alignItems: "center", justifyContent: "center",
  },
  searchBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },

  // ── Saved chips ──
  savedChipsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  savedChip: {
    flex: 1, flexDirection: "row", alignItems: "center",
    borderRadius: 14, borderWidth: 1, padding: 10, gap: 8, minHeight: 52,
  },
  savedChipIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },

  // ── Primary action cards ──
  primaryActionsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  primaryAction: {
    flex: 1, borderRadius: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 10, elevation: 8,
    overflow: "hidden",
  },
  primaryActionIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  primaryActionLabel: { fontSize: 13, fontWeight: "800", color: "#fff", marginBottom: 2 },
  primaryActionSub:   { fontSize: 10, fontWeight: "500", color: "rgba(255,255,255,0.8)" },

  // ── Secondary action chips ──
  secondaryActionsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  secondaryAction: {
    flex: 1, borderRadius: 12, borderWidth: 1, overflow: "hidden", minHeight: 44,
  },
  secondaryActionLabel: { fontSize: 12, fontWeight: "700" },

  // ── Section label ──
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: 10 },

  // ── Destination cards ──
  destCard: {
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    minWidth: 112, gap: 5,
  },
  destCardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  destCardName: { fontSize: 12, fontWeight: "700" },
  destCardSub:  { fontSize: 10, fontWeight: "500" },

  // ── Feature pills ──
  pillRow: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  pill: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 30, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 36,
  },

  // ── Promo banner ──
  promoBanner: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 16, borderWidth: 1, padding: 12,
  },
  promoIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },

  // ── Rewards ──
  rewardSection: { marginHorizontal: 16, borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 14 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill:  { height: 6, borderRadius: 3 },
  rewardRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, minHeight: 44,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.04)",
  },
});
