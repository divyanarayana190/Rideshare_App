/**
 * My Rides — Real-time State-Driven System
 *
 * Tabs: Upcoming | Active (Live) | History ▾ (Dropdown)
 * Auto-transitions via SSE ride_update events.
 * Contextual default: Active > Upcoming > History.
 */
import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useIsFocused } from "@/hooks/use-is-focused";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRideEvents } from "@/lib/use-ride-events";
import type { RideStatus } from "@/lib/types";

// ─── Palette ──────────────────────────────────────────────────────────────────
const P = "#1E88FF";
const G = "#16A34A";
const R = "#EF4444";
const A = "#F59E0B";
const V = "#8B5CF6";

// ─── Status buckets ───────────────────────────────────────────────────────────
const UPCOMING: RideStatus[] = ["searching", "matched", "driver_assigned"];
type ActiveRequest = {
  requestId: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  offerPrice: number;
  driversNotified: number;
  driversViewed: number;
  matchedRideId: string | null;
  matchProbability: number;
  expiresAt: string;
  createdAt: string;
};
const ACTIVE: RideStatus[] = ["driver_arrived", "in_progress", "active"];
const HISTORY: RideStatus[] = ["completed", "cancelled"];

// SSE rideStep → RideStatus (for optimistic updates before server re-fetch)
const STEP_TO_STATUS: Record<string, RideStatus> = {
  finding_driver: "searching",
  driver_assigned: "driver_assigned",
  driver_en_route: "matched",
  driver_arrived: "driver_arrived",
  ride_started: "in_progress",
  ride_in_progress: "active",
  completed: "completed",
  cancelled: "cancelled",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type RideItem = {
  id: string;
  mode: "solo" | "share";
  status: string;
  pickup: { address: string; lat: number; lng: number; shortName: string };
  dropoff: { address: string; lat: number; lng: number; shortName: string };
  driver: { name: string; avatar: string } | null;
  totalFare: number;
  myFare: number;
  distanceKm: number;
  estimatedMinutes: number;
  durationMin: number;
  isDriver: boolean;
  createdAt: string;
  completedAt?: string;
  cancelReason?: string;
  rideType?: string;
  rideStep?: string;
  posterRole?: string;
  departureTime?: string;
};

type MainTab = "upcoming" | "active" | "history";
type HistoryFilter = "all" | "completed" | "cancelled";
type DateSection =
  | { type: "header"; date: string; count: number }
  | { type: "ride"; ride: RideItem };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getActiveStatusInfo(status: string): { text: string; icon: IconSymbolName } {
  if (status === "driver_arrived") return { text: "Your driver has arrived!", icon: "car.fill" };
  return { text: "Ride in progress", icon: "location.fill" };
}

function getUpcomingStatusInfo(status: string): {
  text: string;
  color: string;
  spinning: boolean;
} {
  if (status === "searching") return { text: "Finding your driver...", color: A, spinning: true };
  if (status === "matched") return { text: "Driver on the way", color: "#0EA5E9", spinning: false };
  return { text: "Driver assigned", color: P, spinning: false };
}

function probColor(p: number) {
  return p >= 80 ? G : p >= 60 ? "#22C55E" : p >= 40 ? A : R;
}

function calcMatchProbability(req: { driversNotified: number; driversViewed: number; createdAt: string; status: string }): number {
  if (req.status === "matched") return 100;
  const ageMin = (Date.now() - new Date(req.createdAt).getTime()) / 60_000;
  const base = Math.min(80, (req.driversNotified / 5) * 25);
  const timeFactor = Math.min(20, ageMin * 3);
  const viewBonus = Math.min(15, req.driversViewed * 5);
  return Math.round(Math.min(95, base + timeFactor + viewBonus));
}

function getMissedReasonLabel(cancelReason?: string): string {
  if (cancelReason === "NO_DRIVER_FOUND") return "No driver found";
  if (cancelReason === "DRIVER_NO_SHOW") return "Driver no-show";
  return "Missed";
}

/** Post-a-Ride (rides table) searching → active-ride; matched share → carpool-detail. */
function getUpcomingRideHref(ride: RideItem): Href {
  if (ride.status === "searching" || ride.rideStep === "finding_driver") {
    return `/active-ride?rideId=${ride.id}` as Href;
  }
  if (ride.mode === "share") {
    return `/carpool-detail?rideId=${ride.id}` as Href;
  }
  return `/ride-history?id=${ride.id}` as Href;
}

function groupByDate(rides: RideItem[]): DateSection[] {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const sections: DateSection[] = [];
  let lastLabel = "";

  for (const ride of rides) {
    const d = new Date(ride.createdAt);
    let label: string;
    if (d.toDateString() === now.toDateString()) label = "Today";
    else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    if (label !== lastLabel) {
      const count = rides.filter((r) => {
        const rd = new Date(r.createdAt);
        if (label === "Today") return rd.toDateString() === now.toDateString();
        if (label === "Yesterday") return rd.toDateString() === yesterday.toDateString();
        return (
          rd.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }) === label
        );
      }).length;
      sections.push({ type: "header", date: label, count });
      lastLabel = label;
    }
    sections.push({ type: "ride", ride });
  }
  return sections;
}

// ─── PulsingDot (Reanimated) ─────────────────────────────────────────────────
function PulsingDot({ color = G, size = 7 }: { color?: string; size?: number }) {
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.7);

  useEffect(() => {
    ringScale.value = withRepeat(
      withSequence(
        withTiming(2.4, { duration: 950, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 0 }),
      ),
      -1, false,
    );
    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 950, easing: Easing.out(Easing.ease) }),
        withTiming(0.7, { duration: 0 }),
      ),
      -1, false,
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Reanimated shared values are stable refs

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  return (
    <View style={{ width: size * 3, height: size * 3, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          {
            position: "absolute",
            width: size * 3,
            height: size * 3,
            borderRadius: (size * 3) / 2,
            backgroundColor: color,
          },
          ringStyle,
        ]}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Screen width constant (used in glassmorphism positioning) ────────────────
const SW = Dimensions.get("window").width;

// ─── StatPanel ────────────────────────────────────────────────────────────────
function StatPanel({
  icon, value, label, color,
}: { icon: IconSymbolName; value: string; label: string; color: string }) {
  return (
    <View style={hst.statPanel}>
      <View style={[hst.statIconBg, { backgroundColor: color + "22" }]}>
        <IconSymbol name={icon} size={13} color={color} />
      </View>
      <Text style={hst.statValue}>{value}</Text>
      <Text style={hst.statLabel}>{label}</Text>
    </View>
  );
}

// ─── ActiveContext ────────────────────────────────────────────────────────────
function ActiveContext({ ride, router }: { ride: RideItem; router: any }) {
  const isArrived = ride.status === "driver_arrived";
  const accent = isArrived ? A : G;
  const driverName = ride.driver?.name ?? "Driver";

  return (
    <View>
      <View style={hst.ctxStatusRow}>
        <PulsingDot color={accent} size={4} />
        <Text style={[hst.ctxBadge, { color: accent }]}>
          {isArrived ? "DRIVER WAITING" : "LIVE"}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={hst.ctxMeta}>
          {isArrived ? "Your driver has arrived" : "Ride in progress"}
        </Text>
      </View>

      <View style={hst.ctxRouteRow}>
        <View style={{ flex: 1 }}>
          <View style={hst.ctxRouteItem}>
            <View style={[hst.ctxDot, { backgroundColor: G }]} />
            <Text style={hst.ctxAddr} numberOfLines={1}>
              {ride.pickup.shortName || ride.pickup.address}
            </Text>
          </View>
          <View style={hst.ctxRouteLine} />
          <View style={hst.ctxRouteItem}>
            <View style={[hst.ctxDot, { backgroundColor: R }]} />
            <Text style={hst.ctxAddr} numberOfLines={1}>
              {ride.dropoff.shortName || ride.dropoff.address}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[hst.ctxCta, { backgroundColor: accent }]}
          onPress={() => router.push("/active-ride" as Href)}
        >
          <Text style={hst.ctxCtaText}>{isArrived ? "Go" : "Track"}</Text>
          <IconSymbol name="chevron.right" size={10} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={hst.ctxDriverRow}>
        <View style={[hst.ctxDriverDot, { backgroundColor: accent }]}>
          <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>
            {driverName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={hst.ctxDriverName}>{driverName}</Text>
        <View style={{ flex: 1 }} />
        <Text style={hst.ctxMeta}>{ride.mode === "share" ? "Shared" : "Solo"} ride</Text>
      </View>
    </View>
  );
}

// ─── UpcomingContext ──────────────────────────────────────────────────────────
function UpcomingContext({ ride }: { ride: RideItem }) {
  const isSearching = ride.status === "searching";
  const si = getUpcomingStatusInfo(ride.status);

  const [elapsed, setElapsed] = useState(
    Math.floor((Date.now() - new Date(ride.createdAt).getTime()) / 1000),
  );
  useEffect(() => {
    if (!isSearching) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(ride.createdAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isSearching, ride.createdAt]);

  const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  return (
    <View>
      <View style={hst.ctxStatusRow}>
        {isSearching
          ? <ActivityIndicator size="small" color={A} style={{ width: 14, height: 14 }} />
          : <View style={[hst.ctxDot, { backgroundColor: si.color, width: 8, height: 8 }]} />
        }
        <Text style={[hst.ctxBadge, { color: si.color, marginLeft: isSearching ? 6 : 6 }]}>
          {si.text}
        </Text>
        {isSearching && (
          <View style={[hst.elapsedBadge, { backgroundColor: A + "28" }]}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: A }}>{elapsedLabel}</Text>
          </View>
        )}
      </View>

      <View style={{ marginTop: 8 }}>
        <View style={hst.ctxRouteItem}>
          <View style={[hst.ctxDot, { backgroundColor: G }]} />
          <Text style={hst.ctxAddr} numberOfLines={1}>
            {ride.pickup.shortName || ride.pickup.address}
          </Text>
        </View>
        <View style={hst.ctxRouteLine} />
        <View style={hst.ctxRouteItem}>
          <View style={[hst.ctxDot, { backgroundColor: R }]} />
          <Text style={hst.ctxAddr} numberOfLines={1}>
            {ride.dropoff.shortName || ride.dropoff.address}
          </Text>
        </View>
      </View>

      <Text style={hst.ctxSubText}>
        {isSearching ? "Scanning for drivers nearby..." : "Driver confirmed · On the way"}
      </Text>
    </View>
  );
}

// ─── EmptyContext ─────────────────────────────────────────────────────────────
function EmptyContext({ router }: { router: any }) {
  return (
    <View style={hst.emptyCtx}>
      <View style={hst.emptyCtxIcon}>
        <IconSymbol name="car.fill" size={20} color="rgba(255,255,255,0.45)" />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={hst.emptyCtxTitle}>Ready for your next ride?</Text>
        <Text style={hst.emptyCtxSub}>No active or upcoming rides</Text>
      </View>
      <TouchableOpacity style={hst.bookBtn} onPress={() => router.push("/book-ride" as Href)}>
        <IconSymbol name="plus" size={11} color="#1E88FF" />
        <Text style={hst.bookBtnText}>Book</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── ControlPanelHeader ───────────────────────────────────────────────────────
function ControlPanelHeader({
  allRides, activeRides, upcomingRides, completedRides,
  totalSpent, totalKm, isConnected, router,
}: {
  allRides: RideItem[]; activeRides: RideItem[]; upcomingRides: RideItem[];
  completedRides: RideItem[]; totalSpent: number; totalKm: number;
  isConnected: boolean; router: any;
}) {
  // ── Shared animation values ──────────────────────────────────────────────
  const glowScale  = useSharedValue(1);
  const glowOpacity = useSharedValue(0.35);
  const accentDrift = useSharedValue(0);
  const ringScale  = useSharedValue(1);
  const ringOpacity = useSharedValue(0.9);
  const cardEntry  = useSharedValue(0);

  useEffect(() => {
    // Breathing radial glow
    glowScale.value = withRepeat(withSequence(
      withTiming(1.55, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
      withTiming(1,    { duration: 3800, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    glowOpacity.value = withRepeat(withSequence(
      withTiming(0.60, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.20, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    // Accent glow slow drift
    accentDrift.value = withRepeat(withSequence(
      withTiming(22, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
      withTiming(-22, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    // Connection ring pulse
    ringScale.value = withRepeat(withSequence(
      withTiming(2.8, { duration: 1100, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 0 }),
      withDelay(1400, withTiming(1, { duration: 0 })),
    ), -1, false);
    ringOpacity.value = withRepeat(withSequence(
      withTiming(0, { duration: 1100, easing: Easing.out(Easing.ease) }),
      withTiming(0.9, { duration: 0 }),
      withDelay(1400, withTiming(0.9, { duration: 0 })),
    ), -1, false);
    // Glass card fade-in on mount
    cardEntry.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Reanimated shared values are stable refs

  const glowStyle   = useAnimatedStyle(() => ({ transform: [{ scale: glowScale.value }], opacity: glowOpacity.value }));
  const accentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: accentDrift.value }] }));
  const ringStyle   = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }], opacity: ringOpacity.value }));
  const cardStyle   = useAnimatedStyle(() => ({
    opacity: cardEntry.value,
    transform: [{ translateY: interpolate(cardEntry.value, [0, 1], [6, 0]) }],
  }));

  const activeRide   = activeRides[0] ?? null;
  const upcomingRide = upcomingRides[0] ?? null;

  return (
    <View style={hst.container}>
      {/* ── Gradient layers (dark deep-space blue) ── */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1e3a8a" }]} />
      <View style={[StyleSheet.absoluteFill, hst.gradMid]} />
      <View style={[StyleSheet.absoluteFill, hst.gradBottom]} />

      {/* ── Radial glow (animated breathing light) ── */}
      <View style={hst.glowWrap} pointerEvents="none">
        <Animated.View style={[hst.radialGlow, glowStyle]} />
        <View style={hst.radialGlowCore} />
      </View>

      {/* ── Accent glow (drifting violet — bottom left) ── */}
      <Animated.View style={[hst.accentGlow, accentStyle]} pointerEvents="none" />

      {/* ── Decorative star-dots ── */}
      <View style={[hst.star, { top: 16, right: 72,  width: 2,   height: 2   }]} />
      <View style={[hst.star, { top: 32, right: 138, width: 1.5, height: 1.5 }]} />
      <View style={[hst.star, { top: 10, right: 195, width: 1,   height: 1   }]} />
      <View style={[hst.star, { top: 48, right: 56,  width: 1,   height: 1   }]} />

      {/* ── Top row: title · connection dot · export ── */}
      <View style={hst.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={hst.title}>My Rides</Text>
          <View style={hst.statusLine}>
            {/* Animated connection ring */}
            <View style={hst.dotWrap}>
              {isConnected && (
                <Animated.View style={[hst.dotRing, { borderColor: G }, ringStyle]} />
              )}
              <View style={[hst.dotCore, { backgroundColor: isConnected ? G : A }]} />
            </View>
            <Text style={hst.statusTxt}>{isConnected ? "Live" : "Connecting"}</Text>
            <Text style={hst.statusSep}>·</Text>
            <Text style={hst.statusTxt}>{allRides.length} rides</Text>
          </View>
        </View>
        <TouchableOpacity
          style={hst.exportBtn}
          onPress={() => {
            const csv = allRides.map((r) => `${r.id},${r.status},${r.pickup.address},${r.dropoff.address}`).join("\n");
            if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
              navigator.clipboard.writeText(`rideId,status,pickup,dropoff\n${csv}`);
            }
          }}
          accessibilityLabel="Copy ride list"
        >
          <IconSymbol name="square.and.arrow.up" size={13} color="rgba(255,255,255,0.85)" />
          <Text style={hst.exportTxt}>Export</Text>
        </TouchableOpacity>
      </View>

      {/* ── Glassmorphism context card ── */}
      <Animated.View style={[hst.glassCard, cardStyle]}>
        {activeRide   ? <ActiveContext   ride={activeRide}   router={router} /> :
         upcomingRide ? <UpcomingContext ride={upcomingRide} /> :
                        <EmptyContext   router={router} />}
      </Animated.View>

      {/* ── Stats bar ── */}
      <View style={hst.statsBar}>
        <StatPanel icon="checkmark.circle.fill" value={String(completedRides.length)} label="Completed" color={G} />
        <View style={hst.statSep} />
        <StatPanel icon="creditcard.fill"       value={`$${totalSpent.toFixed(0)}`}   label="Spent"     color="#60A5FA" />
        <View style={hst.statSep} />
        <StatPanel icon="road.lanes"            value={`${totalKm.toFixed(0)} km`}    label="Distance"  color="#A78BFA" />
      </View>
    </View>
  );
}

// ─── StatChip ────────────────────────────────────────────────────────────────
function StatChip({ icon, label, color }: { icon: IconSymbolName; label: string; color: string }) {
  return (
    <View style={[st.statChip, { backgroundColor: color + "12" }]}>
      <IconSymbol name={icon} size={9} color={color} />
      <Text style={{ fontSize: 10, fontWeight: "700", color, marginLeft: 3 }}>{label}</Text>
    </View>
  );
}

// ─── ActiveRideCard ───────────────────────────────────────────────────────────
function ActiveRideCard({ ride, onPress, colors }: { ride: RideItem; onPress: () => void; colors: any }) {
  const isArrived = ride.status === "driver_arrived";
  const accent = isArrived ? A : G;
  const info = getActiveStatusInfo(ride.status);
  const driverName = ride.driver?.name ?? (ride.isDriver ? "You (Driver)" : "Driver");
  const duration = ride.durationMin > 0 ? ride.durationMin : ride.estimatedMinutes;
  const time = new Date(ride.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <TouchableOpacity
      style={[st.rideCard, { backgroundColor: colors.surface, borderColor: accent + "45" }]}
      onPress={onPress}
      activeOpacity={0.92}
    >
      {/* Left accent strip */}
      <View style={[st.leftStrip, { backgroundColor: accent }]} />

      {/* LIVE / WAITING header */}
      <View style={[st.liveBar, { backgroundColor: accent + "14" }]}>
        <PulsingDot color={accent} size={4} />
        <Text style={[st.liveLabel, { color: accent }]}>{isArrived ? "WAITING" : "LIVE"}</Text>
        <View style={{ flex: 1 }} />
        <IconSymbol name={info.icon} size={11} color={accent} />
        <Text style={{ fontSize: 11, color: accent, fontWeight: "600", marginLeft: 4 }}>{info.text}</Text>
      </View>

      <View style={st.cardBody}>
        {/* Row 1: avatar + name + track btn */}
        <View style={st.cardTopRow}>
          <View style={[st.avatar, { backgroundColor: accent }]}>
            <Text style={st.avatarText}>{driverName.charAt(0).toUpperCase()}</Text>
            {/* Live badge */}
            <View style={[st.liveBadge, { backgroundColor: accent, borderColor: colors.surface }]}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#fff" }} />
            </View>
          </View>
          <View style={{ flex: 1, marginLeft: 11 }}>
            <Text style={[st.cardName, { color: colors.foreground }]} numberOfLines={1}>
              {ride.isDriver ? "You drove" : driverName}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <IconSymbol name="clock" size={10} color={colors.muted} />
              <Text style={{ fontSize: 11, color: colors.muted }}>{time}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>·</Text>
              {ride.mode === "share" && (
                <>
                  <IconSymbol name="person.2.fill" size={10} color="#0EA5E9" />
                  <Text style={{ fontSize: 11, color: "#0EA5E9", fontWeight: "600" }}>Shared</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>·</Text>
                </>
              )}
              <Text style={{ fontSize: 11, color: colors.muted }}>{duration} min</Text>
            </View>
          </View>
          <TouchableOpacity style={[st.trackBtn, { backgroundColor: accent }]} onPress={onPress}>
            <IconSymbol name={isArrived ? "figure.walk" : "location.fill"} size={11} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff", marginLeft: 4 }}>
              {isArrived ? "Go now" : "Track"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Route */}
        <View style={[st.routeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: G }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {ride.pickup.shortName || ride.pickup.address}
            </Text>
          </View>
          <View style={{ width: 1, height: 6, backgroundColor: colors.border, marginLeft: 3.5, marginVertical: 3 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: R }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {ride.dropoff.shortName || ride.dropoff.address}
            </Text>
          </View>
        </View>

        {/* Row 3: stats + fare */}
        <View style={st.cardFooter}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <StatChip icon="road.lanes" label={`${Number(ride.distanceKm).toFixed(1)} km`} color={P} />
            <StatChip icon="clock.fill" label={`${duration} min`} color={A} />
            {ride.isDriver && <StatChip icon="steeringwheel" label="Driver" color={V} />}
          </View>
          <Text style={{ fontSize: 17, fontWeight: "900", color: accent }}>${ride.myFare.toFixed(2)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── UpcomingRideCard ─────────────────────────────────────────────────────────
function UpcomingRideCard({
  ride, onPress, onCancel, isCancelling, colors,
}: {
  ride: RideItem; onPress: () => void; onCancel?: () => void; isCancelling?: boolean; colors: any;
}) {
  const si = getUpcomingStatusInfo(ride.status);
  const driverName = ride.driver?.name;
  const isSearching = ride.status === "searching";
  const isOrganizerRide = ride.posterRole === "passenger_organizer";
  const duration = ride.durationMin > 0 ? ride.durationMin : ride.estimatedMinutes;
  const _schedRef = ride.departureTime ? new Date(ride.departureTime) : new Date(ride.createdAt);
  const _today = new Date(); const _tomorrow = new Date(_today.getTime() + 86_400_000);
  const _dateLabel = _schedRef.toDateString() === _today.toDateString() ? "Today"
    : _schedRef.toDateString() === _tomorrow.toDateString() ? "Tomorrow"
    : _schedRef.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = `${_dateLabel} · ${_schedRef.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

  const [elapsed, setElapsed] = useState(
    Math.floor((Date.now() - new Date(ride.createdAt).getTime()) / 1000),
  );
  useEffect(() => {
    if (!isSearching) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(ride.createdAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isSearching, ride.createdAt]);

  const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  return (
    <TouchableOpacity
      style={[st.rideCard, { backgroundColor: colors.surface, borderColor: si.color + "35" }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Left accent strip */}
      <View style={[st.leftStrip, { backgroundColor: si.color }]} />

      <View style={st.cardBody}>
        {/* Row 1: avatar + name + status chip */}
        <View style={st.cardTopRow}>
          <View style={[st.avatar, { backgroundColor: isOrganizerRide ? "#1E88FF" : isSearching ? A : si.color }]}>
            {isSearching && !isOrganizerRide ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : isOrganizerRide ? (
              <IconSymbol name="person.2.fill" size={18} color="#fff" />
            ) : (
              <Text style={st.avatarText}>{(driverName ?? "?").charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 11 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[st.cardName, { color: colors.foreground }]} numberOfLines={1}>
                {isOrganizerRide ? "My Group Ride" : isSearching ? "Finding driver..." : (driverName ?? "Driver assigned")}
              </Text>
              {isOrganizerRide && (
                <View style={{ backgroundColor: "#1E88FF20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#1E88FF40" }}>
                  <Text style={{ fontSize: 8, fontWeight: "800", color: "#1E88FF" }}>ORGANIZER</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <IconSymbol name="clock" size={10} color={colors.muted} />
              <Text style={{ fontSize: 11, color: colors.muted }}>{time}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>·</Text>
              {ride.mode === "share" && (
                <>
                  <IconSymbol name="person.2.fill" size={10} color="#0EA5E9" />
                  <Text style={{ fontSize: 11, color: "#0EA5E9", fontWeight: "600" }}>
                    {isOrganizerRide ? "Posted" : "Shared"}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>·</Text>
                </>
              )}
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {isSearching && !isOrganizerRide ? elapsedLabel : `${duration} min`}
              </Text>
            </View>
          </View>
          {/* Status chip top-right */}
          <View style={[st.statusChip, { backgroundColor: si.color + "15" }]}>
            {si.spinning
              ? <ActivityIndicator size="small" color={si.color} style={{ width: 9, height: 9 }} />
              : <IconSymbol name={isSearching ? "magnifyingglass" : "car.fill"} size={9} color={si.color} />
            }
            <Text style={{ fontSize: 9, fontWeight: "700", color: si.color, marginLeft: 3 }}>{si.text.split(" ")[0]}</Text>
          </View>
        </View>

        {/* Route */}
        <View style={[st.routeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: G }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {ride.pickup.shortName || ride.pickup.address}
            </Text>
          </View>
          <View style={{ width: 1, height: 6, backgroundColor: colors.border, marginLeft: 3.5, marginVertical: 3 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: R }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {ride.dropoff.shortName || ride.dropoff.address}
            </Text>
          </View>
        </View>

        {/* Row 3: stats + fare + CTAs */}
        <View style={st.cardFooter}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <StatChip icon="road.lanes" label={`${Number(ride.distanceKm).toFixed(1)} km`} color={P} />
            <StatChip icon="clock.fill" label={`${duration} min`} color={A} />
            {ride.mode === "share" && <StatChip icon="person.2.fill" label="Shared" color="#0EA5E9" />}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>
              ${ride.myFare.toFixed(2)}
            </Text>
            {isSearching && onCancel && (
              <TouchableOpacity
                style={[st.ctaBtn, { backgroundColor: R + "12", opacity: isCancelling ? 0.5 : 1 }]}
                onPress={onCancel}
                disabled={isCancelling}
              >
                {isCancelling
                  ? <ActivityIndicator size="small" color={R} style={{ width: 36, height: 13 }} />
                  : <Text style={{ fontSize: 11, fontWeight: "700", color: R }}>Cancel</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[st.ctaBtn, { backgroundColor: P + "12" }]} onPress={onPress}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: P }}>Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── MissedRideCard ───────────────────────────────────────────────────────────
function MissedRideCard({ ride, onPress, colors }: { ride: RideItem; onPress: () => void; colors: any }) {
  const _mRef = ride.departureTime ? new Date(ride.departureTime) : new Date(ride.createdAt);
  const missedLabel = `${_mRef.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${_mRef.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;

  return (
    <TouchableOpacity
      style={[st.rideCard, { backgroundColor: colors.surface, borderColor: R + "30", opacity: 0.82 }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[st.leftStrip, { backgroundColor: R }]} />
      <View style={st.cardBody}>
        <View style={st.cardTopRow}>
          <View style={[st.avatar, { backgroundColor: R + "18" }]}>
            <IconSymbol name="exclamationmark.circle.fill" size={18} color={R} />
          </View>
          <View style={{ flex: 1, marginLeft: 11 }}>
            <Text style={[st.cardName, { color: colors.foreground }]} numberOfLines={1}>
              {getMissedReasonLabel(ride.cancelReason)}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <IconSymbol name="clock" size={10} color={colors.muted} />
              <Text style={{ fontSize: 11, color: colors.muted }}>{missedLabel}</Text>
            </View>
          </View>
          <View style={[st.statusChip, { backgroundColor: R + "15" }]}>
            <IconSymbol name="xmark.circle.fill" size={9} color={R} />
            <Text style={{ fontSize: 9, fontWeight: "700", color: R, marginLeft: 3 }}>MISSED</Text>
          </View>
        </View>

        <View style={[st.routeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: G }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {ride.pickup.shortName || ride.pickup.address}
            </Text>
          </View>
          <View style={{ width: 1, height: 6, backgroundColor: colors.border, marginLeft: 3.5, marginVertical: 3 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: R }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {ride.dropoff.shortName || ride.dropoff.address}
            </Text>
          </View>
        </View>

        <View style={st.cardFooter}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <StatChip icon="road.lanes" label={`${Number(ride.distanceKm).toFixed(1)} km`} color={colors.muted} />
            <StatChip icon="person.2.fill" label={ride.mode === "share" ? "Shared" : "Solo"} color={colors.muted} />
          </View>
          <TouchableOpacity style={[st.ctaBtn, { backgroundColor: P + "12" }]} onPress={onPress}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: P }}>Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── BroadcastRequestCard ─────────────────────────────────────────────────────
function BroadcastRequestCard({
  req, colors, onPress, onCancel, isCancelling,
}: {
  req: ActiveRequest; colors: any; onPress: () => void; onCancel: () => void; isCancelling: boolean;
}) {
  const isMatched = req.status === "matched";
  const accent = isMatched ? G : V;

  // Countdown timer to expiration
  const [secsLeft, setSecsLeft] = useState(
    Math.max(0, Math.floor((new Date(req.expiresAt).getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    if (isMatched) return;
    const id = setInterval(() => {
      setSecsLeft(Math.max(0, Math.floor((new Date(req.expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [isMatched, req.expiresAt]);

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  const timerLabel = `${mins}:${secs < 10 ? "0" : ""}${secs}`;

  const matchProb = calcMatchProbability(req);
  const pColor = probColor(matchProb);

  const pickupShort = req.pickupAddress.split(",")[0].trim();
  const dropoffShort = req.dropoffAddress.split(",")[0].trim();

  return (
    <TouchableOpacity
      style={[st.rideCard, { backgroundColor: colors.surface, borderColor: accent + "45" }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      {/* Left accent strip */}
      <View style={[st.leftStrip, { backgroundColor: accent }]} />

      <View style={st.cardBody}>
        {/* Header row */}
        <View style={st.cardTopRow}>
          <View style={[st.avatar, { backgroundColor: accent + "18", borderWidth: 1.5, borderColor: accent + "40" }]}>
            {isMatched
              ? <IconSymbol name="checkmark.circle.fill" size={20} color={accent} />
              : <ActivityIndicator size="small" color={accent} />}
          </View>
          <View style={{ flex: 1, marginLeft: 11 }}>
            <Text style={[st.cardName, { color: colors.foreground }]}>
              {isMatched ? "Driver Found!" : "Finding Your Driver"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <IconSymbol name="person.2.fill" size={10} color={accent} />
              <Text style={{ fontSize: 11, color: accent, fontWeight: "600" }}>
                {req.driversNotified} notified
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>·</Text>
              <IconSymbol name="eye.fill" size={9} color={colors.muted} />
              <Text style={{ fontSize: 11, color: colors.muted }}>{req.driversViewed} views</Text>
            </View>
          </View>
          <View style={[st.statusChip, { backgroundColor: accent + "15" }]}>
            {!isMatched && (
              <ActivityIndicator size="small" color={accent} style={{ width: 9, height: 9 }} />
            )}
            <Text style={{ fontSize: 9, fontWeight: "800", color: accent, marginLeft: isMatched ? 0 : 3, textTransform: "uppercase" }}>
              {isMatched ? "Matched" : "Live"}
            </Text>
          </View>
        </View>

        {/* Route */}
        <View style={[st.routeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: G }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {pickupShort}
            </Text>
          </View>
          <View style={{ width: 1, height: 6, backgroundColor: colors.border, marginLeft: 3.5, marginVertical: 3 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: R }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {dropoffShort}
            </Text>
          </View>
        </View>

        {/* Match probability bar */}
        {!isMatched && (
          <View style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Match Probability
              </Text>
              <Text style={{ fontSize: 10, fontWeight: "800", color: pColor }}>{matchProb}%</Text>
            </View>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" }}>
              <View style={{ width: `${matchProb}%` as any, height: "100%", borderRadius: 2, backgroundColor: pColor }} />
            </View>
          </View>
        )}

        {/* Footer: price + timer + actions */}
        <View style={st.cardFooter}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <StatChip icon="dollarsign.circle.fill" label={`$${req.offerPrice.toFixed(2)} offer`} color={G} />
            {!isMatched && secsLeft > 0 && (
              <View style={[st.statChip, { backgroundColor: A + "12" }]}>
                <IconSymbol name="timer" size={9} color={A} />
                <Text style={{ fontSize: 10, fontWeight: "700", color: A, marginLeft: 3 }}>{timerLabel}</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {!isMatched && (
              <TouchableOpacity
                style={[st.ctaBtn, { backgroundColor: R + "12", opacity: isCancelling ? 0.5 : 1 }]}
                onPress={onCancel}
                disabled={isCancelling}
              >
                {isCancelling
                  ? <ActivityIndicator size="small" color={R} style={{ width: 36, height: 13 }} />
                  : <Text style={{ fontSize: 11, fontWeight: "700", color: R }}>Cancel</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[st.ctaBtn, { backgroundColor: accent + "15" }]} onPress={onPress}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: accent }}>
                {isMatched ? "View" : "Details"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── HistoryRideCard ──────────────────────────────────────────────────────────
function HistoryRideCard({ ride, onPress, colors }: { ride: RideItem; onPress: () => void; colors: any }) {
  const done = ride.status === "completed";
  const driverName = ride.driver?.name ?? (ride.isDriver ? "You (Driver)" : "Driver");
  const duration = ride.durationMin > 0 ? ride.durationMin : ride.estimatedMinutes;
  const time = new Date(ride.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const avatarColor = done ? V : "#9CA3AF";
  const fareColor = done ? G : colors.muted;

  return (
    <TouchableOpacity
      style={[st.rideCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: done ? 1 : 0.75 }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={st.cardBody}>
        {/* Row 1: avatar + name + status chip */}
        <View style={st.cardTopRow}>
          <View style={[st.avatar, { backgroundColor: avatarColor }]}>
            <Text style={st.avatarText}>{driverName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 11 }}>
            <Text style={[st.cardName, { color: colors.foreground }]} numberOfLines={1}>
              {ride.isDriver ? "You drove" : driverName}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <IconSymbol name="clock" size={10} color={colors.muted} />
              <Text style={{ fontSize: 11, color: colors.muted }}>{time}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>·</Text>
              {ride.mode === "share" && (
                <>
                  <IconSymbol name="person.2.fill" size={10} color="#0EA5E9" />
                  <Text style={{ fontSize: 11, color: "#0EA5E9", fontWeight: "600" }}>Shared</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>·</Text>
                </>
              )}
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {done ? `${duration} min` : (ride.cancelReason ?? "Cancelled")}
              </Text>
            </View>
          </View>
          <View style={[st.statusChip, { backgroundColor: done ? G + "15" : R + "12" }]}>
            <IconSymbol
              name={done ? "checkmark.circle.fill" : "xmark.circle.fill"}
              size={9}
              color={done ? G : R}
            />
            <Text style={{ fontSize: 9, fontWeight: "700", color: done ? G : R, marginLeft: 3 }}>
              {done ? "Completed" : "Cancelled"}
            </Text>
          </View>
        </View>

        {/* Route */}
        <View style={[st.routeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: G }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {ride.pickup.shortName || ride.pickup.address}
            </Text>
          </View>
          <View style={{ width: 1, height: 6, backgroundColor: colors.border, marginLeft: 3.5, marginVertical: 3 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: R }} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {ride.dropoff.shortName || ride.dropoff.address}
            </Text>
          </View>
        </View>

        {/* Stats + fare */}
        <View style={st.cardFooter}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {done && <StatChip icon="road.lanes" label={`${Number(ride.distanceKm).toFixed(1)} km`} color={P} />}
            {done && <StatChip icon="clock.fill" label={`${duration} min`} color={A} />}
            {ride.isDriver && <StatChip icon="steeringwheel" label="Driver" color={V} />}
          </View>
          <Text style={{ fontSize: 17, fontWeight: "900", color: fareColor }}>
            ${ride.myFare.toFixed(2)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── SmartEmptyState ──────────────────────────────────────────────────────────
function SmartEmptyState({
  tab,
  upcomingCount,
  nextDropoff,
  colors,
  router,
}: {
  tab: MainTab;
  upcomingCount: number;
  nextDropoff: string | null;
  colors: any;
  router: any;
}) {
  if (tab === "active") {
    return (
      <View style={st.empty}>
        <View style={[st.emptyIcon, { backgroundColor: G + "12" }]}>
          <IconSymbol name="location.fill" size={26} color={G} />
        </View>
        <Text style={[st.emptyTitle, { color: colors.foreground }]}>No active rides</Text>
        <Text style={[st.emptySub, { color: colors.muted }]}>
          {upcomingCount > 0
            ? `Your ride to ${nextDropoff ?? "your destination"} is being set up`
            : "Book a ride and your live trip will appear here automatically"}
        </Text>
      </View>
    );
  }

  if (tab === "upcoming") {
    return (
      <View style={st.empty}>
        <View style={[st.emptyIcon, { backgroundColor: A + "12" }]}>
          <IconSymbol name="calendar" size={26} color={A} />
        </View>
        <Text style={[st.emptyTitle, { color: colors.foreground }]}>No upcoming rides</Text>
        <Text style={[st.emptySub, { color: colors.muted }]}>
          Book a ride — your driver request will appear here instantly
        </Text>
        <TouchableOpacity
          style={[st.bookBtn, { backgroundColor: P }]}
          onPress={() => router.push("/book-ride" as Href)}
        >
          <IconSymbol name="plus" size={13} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14, marginLeft: 5 }}>
            Book a Ride
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={st.empty}>
      <View style={[st.emptyIcon, { backgroundColor: P + "10" }]}>
        <IconSymbol name="clock.fill" size={26} color={P} />
      </View>
      <Text style={[st.emptyTitle, { color: colors.foreground }]}>No ride history</Text>
      <Text style={[st.emptySub, { color: colors.muted }]}>
        Completed and cancelled rides will appear here
      </Text>
    </View>
  );
}

// ─── RidesScreen ─────────────────────────────────────────────────────────────
export default function RidesScreen() {
  const colors = useColors();
  const router = useRouter();
  const utils = trpc.useUtils();
  const isFocused = useIsFocused();

  const [mainTab, setMainTab] = useState<MainTab>("upcoming");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historyDropOpen, setHistoryDropOpen] = useState(false);
  const [didAutoSelect, setDidAutoSelect] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, string>>({});
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const cancelMutation = trpc.rides.cancelRide.useMutation({
    onSettled: () => {
      setCancellingId(null);
      utils.rides.myRides.invalidate();
    },
    onSuccess: (_data: any, variables: { rideId: string }) => {
      setOptimisticStatus((prev) => ({ ...prev, [variables.rideId]: "cancelled" }));
    },
  } as any);

  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const cancelRequestMutation = trpc.passengerRequest.cancel.useMutation({
    onSettled: () => {
      setCancellingRequestId(null);
      utils.passengerRequest.getMyActiveRequests.invalidate();
    },
  } as any);

  const { lastRideUpdate, isConnected, lastRequestMatched } = useRideEvents(isFocused);

  const { data: activeRequests } = trpc.passengerRequest.getMyActiveRequests.useQuery(
    undefined,
    {
      enabled: isFocused,
      staleTime: 10_000,
      refetchInterval: isFocused ? 15_000 : false,
    },
  );

  const { data: serverRides, isLoading, isError, refetch } = trpc.rides.myRides.useQuery(
    undefined,
    {
      enabled: isFocused,
      staleTime: 15_000,
      refetchOnWindowFocus: isFocused,
      refetchInterval: isFocused && !isConnected ? 15_000 : false,
    },
  );

  // Passenger My Rides only — never show driver pickup jobs
  const allRides: RideItem[] = useMemo(() => {
    const base = ((serverRides as RideItem[] | undefined) ?? []).filter((r) => !r.isDriver);
    return base.map((r) =>
      optimisticStatus[r.id] ? { ...r, status: optimisticStatus[r.id] } : r,
    );
  }, [serverRides, optimisticStatus]);

  // ── Real-time auto-transition (regular rides) ─────────────────────────────
  useEffect(() => {
    if (!lastRideUpdate) return;
    const newStatus = STEP_TO_STATUS[lastRideUpdate.step];
    if (!newStatus) return;

    // Instant optimistic update — ride moves tab immediately
    setOptimisticStatus((prev) => ({
      ...prev,
      [lastRideUpdate.rideId]: newStatus,
    }));

    // Follow up with a server re-fetch to sync truth
    utils.rides.myRides.invalidate();

    // Auto-focus the relevant tab when a ride transitions
    if (ACTIVE.includes(newStatus)) setMainTab("active");
    else if (UPCOMING.includes(newStatus)) setMainTab("upcoming");
  }, [lastRideUpdate, utils.rides.myRides]);

  // ── Driver accepted → flip passenger request card to "matched" instantly ──
  useEffect(() => {
    if (!lastRequestMatched) return;
    // Refresh the active requests list so the BroadcastRequestCard immediately
    // flips from "Searching" spinner to the green "Driver Found!" checkmark.
    utils.passengerRequest.getMyActiveRequests.invalidate();
    setMainTab("upcoming");
  }, [lastRequestMatched, utils.passengerRequest.getMyActiveRequests]);

  // ── Contextual default tab (once, after first load) ───────────────────────
  useEffect(() => {
    if (didAutoSelect || allRides.length === 0) return;
    const hasActive = allRides.some((r) => ACTIVE.includes(r.status as RideStatus));
    const hasUpcoming = allUpcomingRides.length > 0;
    setMainTab(hasActive ? "active" : hasUpcoming ? "upcoming" : "history");
    setDidAutoSelect(true);
  }, [allRides, didAutoSelect]); // eslint-disable-line react-hooks/exhaustive-deps -- allUpcomingRides is derived from allRides (already a dep)

  // ── Derived buckets ───────────────────────────────────────────────────────
  const allUpcomingRides = allRides.filter((r) => UPCOMING.includes(r.status as RideStatus));
  const upcomingRides = allUpcomingRides;
  const missedRides = allRides.filter((r) => r.status === "missed");
  const activeRides = allRides.filter((r) => ACTIVE.includes(r.status as RideStatus));
  const historyRides = allRides.filter((r) => {
    if (!HISTORY.includes(r.status as RideStatus)) return false;
    if (historyFilter === "completed") return r.status === "completed";
    if (historyFilter === "cancelled") return r.status === "cancelled";
    return true;
  });

  const completedRides = allRides.filter((r) => r.status === "completed");
  const totalSpent = completedRides.reduce((s, r) => s + r.myFare, 0);
  const totalKm = completedRides.reduce((s, r) => s + Number(r.distanceKm), 0);
  const historySections = groupByDate(historyRides);

  const handleTabPress = (tab: MainTab) => {
    if (tab === "history") {
      if (mainTab === "history") {
        setHistoryDropOpen((o) => !o);
      } else {
        setMainTab("history");
        setHistoryDropOpen(true);
      }
    } else {
      setMainTab(tab);
      setHistoryDropOpen(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      {/* ── Header ──────────────────────────────────────────────── */}
      <ControlPanelHeader
        allRides={allRides}
        activeRides={activeRides}
        upcomingRides={upcomingRides}
        completedRides={completedRides}
        totalSpent={totalSpent}
        totalKm={totalKm}
        isConnected={isConnected}
        router={router}
      />

      {/* ── Tab Bar ─────────────────────────────────────────────── */}
      <View
        style={[
          st.tabBar,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        {/* Upcoming tab */}
        <TouchableOpacity
          style={[st.tab, mainTab === "upcoming" && { borderBottomColor: A, borderBottomWidth: 2.5 }]}
          onPress={() => handleTabPress("upcoming")}
        >
          <IconSymbol
            name="calendar"
            size={13}
            color={mainTab === "upcoming" ? A : colors.muted}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: mainTab === "upcoming" ? "700" : "500",
              color: mainTab === "upcoming" ? A : colors.muted,
              marginLeft: 4,
            }}
          >
            Upcoming
          </Text>
          {allUpcomingRides.length > 0 && (
            <View style={[st.badge, { backgroundColor: A }]}>
              <Text style={{ fontSize: 9, fontWeight: "800", color: "#fff" }}>
                {allUpcomingRides.length}
              </Text>
            </View>
          )}
          {missedRides.length > 0 && (
            <View style={[st.badge, { backgroundColor: R, marginLeft: 2 }]}>
              <Text style={{ fontSize: 9, fontWeight: "800", color: "#fff" }}>
                {missedRides.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Active tab */}
        <TouchableOpacity
          style={[st.tab, mainTab === "active" && { borderBottomColor: G, borderBottomWidth: 2.5 }]}
          onPress={() => handleTabPress("active")}
        >
          {activeRides.length > 0 ? (
            <PulsingDot color={G} size={4} />
          ) : (
            <IconSymbol
              name="location.fill"
              size={13}
              color={mainTab === "active" ? G : colors.muted}
            />
          )}
          <Text
            style={{
              fontSize: 12,
              fontWeight: mainTab === "active" ? "700" : "500",
              color: mainTab === "active" ? G : colors.muted,
              marginLeft: 4,
            }}
          >
            Active
          </Text>
          {activeRides.length > 0 && (
            <View style={[st.badge, { backgroundColor: G }]}>
              <Text style={{ fontSize: 9, fontWeight: "800", color: "#fff" }}>
                {activeRides.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* History tab */}
        <TouchableOpacity
          style={[st.tab, mainTab === "history" && { borderBottomColor: P, borderBottomWidth: 2.5 }]}
          onPress={() => handleTabPress("history")}
        >
          <IconSymbol
            name="clock.fill"
            size={13}
            color={mainTab === "history" ? P : colors.muted}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: mainTab === "history" ? "700" : "500",
              color: mainTab === "history" ? P : colors.muted,
              marginLeft: 4,
            }}
          >
            History
          </Text>
          <View style={{ marginLeft: 3, transform: [{ rotate: historyDropOpen ? "180deg" : "0deg" }] }}>
            <IconSymbol
              name="chevron.down"
              size={10}
              color={mainTab === "history" ? P : colors.muted}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── History sub-filter dropdown ──────────────────────────── */}
      {mainTab === "history" && historyDropOpen && (
        <View
          style={[
            st.subBar,
            { backgroundColor: colors.background, borderBottomColor: colors.border },
          ]}
        >
          {(["all", "completed", "cancelled"] as HistoryFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                st.subBtn,
                historyFilter === f && {
                  backgroundColor: P + "15",
                  borderColor: P + "40",
                },
                { borderColor: colors.border },
              ]}
              onPress={() => {
                setHistoryFilter(f);
                setHistoryDropOpen(false);
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: historyFilter === f ? "700" : "500",
                  color: historyFilter === f ? P : colors.muted,
                  textTransform: "capitalize",
                }}
              >
                {f === "all" ? "All Rides" : f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Loading ──────────────────────────────────────────────── */}
      {isLoading && (
        <View style={st.center}>
          <ActivityIndicator size="large" color={P} />
          <Text style={{ color: colors.muted, marginTop: 12, fontSize: 13 }}>
            Loading your rides...
          </Text>
        </View>
      )}

      {/* ── Error ────────────────────────────────────────────────── */}
      {isError && !isLoading && (
        <View style={st.center}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: R + "12",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconSymbol name="wifi.slash" size={24} color={R} />
          </View>
          <Text
            style={{ color: colors.foreground, fontWeight: "700", fontSize: 16, marginTop: 12 }}
          >
            {"Couldn't load rides"}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
            Check your connection and try again
          </Text>
          <TouchableOpacity
            style={[st.retryBtn, { backgroundColor: P }]}
            onPress={() => refetch()}
          >
            <IconSymbol name="arrow.clockwise" size={14} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", marginLeft: 6 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Tab content ──────────────────────────────────────────── */}
      {!isLoading && !isError && (
        <>
          {/* UPCOMING */}
          {mainTab === "upcoming" && (
            <FlatList
              data={upcomingRides}
              keyExtractor={(r: RideItem) => r.id}
              ListHeaderComponent={(() => {
                const hasPassengerReqs = activeRequests && activeRequests.length > 0;
                if (!hasPassengerReqs) return null;
                return (
                  <View style={{ marginBottom: 4 }}>
                    {/* Passenger broadcast requests (Find a Driver only) */}
                    {hasPassengerReqs && activeRequests!.map((req: ActiveRequest) => (
                      <BroadcastRequestCard
                        key={req.requestId}
                        req={req}
                        colors={colors}
                        onPress={() =>
                          router.push(`/ride-requested?requestId=${req.requestId}` as Href)
                        }
                        onCancel={() => {
                          setCancellingRequestId(req.requestId);
                          cancelRequestMutation.mutate({ requestId: req.requestId });
                        }}
                        isCancelling={cancellingRequestId === req.requestId}
                      />
                    ))}
                  </View>
                );
              })()}
              renderItem={({ item }: { item: RideItem }) => (
                <UpcomingRideCard
                  ride={item}
                  colors={colors}
                  onPress={() => router.push(getUpcomingRideHref(item))}
                  onCancel={
                    item.status === "searching"
                      ? () => {
                          setCancellingId(item.id);
                          cancelMutation.mutate({ rideId: item.id });
                        }
                      : undefined
                  }
                  isCancelling={cancellingId === item.id}
                />
              )}
              ListEmptyComponent={
                (activeRequests?.length ?? 0) > 0 || missedRides.length > 0 ? null : (
                  <SmartEmptyState
                    tab="upcoming"
                    upcomingCount={upcomingRides.length}
                    nextDropoff={null}
                    colors={colors}
                    router={router}
                  />
                )
              }
              ListFooterComponent={missedRides.length > 0 ? (
                <View style={{ marginTop: upcomingRides.length > 0 ? 8 : 0 }}>
                  {/* Missed Rides section header */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 4 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: R + "30" }} />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: R + "12", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <IconSymbol name="exclamationmark.circle.fill" size={11} color={R} />
                      <Text style={{ fontSize: 11, fontWeight: "700", color: R, letterSpacing: 0.5 }}>
                        MISSED RIDES · {missedRides.length}
                      </Text>
                    </View>
                    <View style={{ flex: 1, height: 1, backgroundColor: R + "30" }} />
                  </View>
                  {missedRides.map((ride) => (
                    <MissedRideCard
                      key={ride.id}
                      ride={ride}
                      colors={colors}
                      onPress={() =>
                        ride.mode === "share"
                          ? router.push(`/carpool-detail?rideId=${ride.id}` as Href)
                          : router.push(`/ride-history?id=${ride.id}` as Href)
                      }
                    />
                  ))}
                </View>
              ) : null}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 32 }}
            />
          )}

          {/* ACTIVE */}
          {mainTab === "active" && (
            <FlatList
              data={activeRides}
              keyExtractor={(r: RideItem) => r.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
              renderItem={({ item }: { item: RideItem }) => (
                <ActiveRideCard
                  ride={item}
                  colors={colors}
                  onPress={() => router.push("/active-ride" as Href)}
                />
              )}
              ListEmptyComponent={
                <SmartEmptyState
                  tab="active"
                  upcomingCount={upcomingRides.length}
                  nextDropoff={
                    upcomingRides[0]
                      ? upcomingRides[0].dropoff.shortName ||
                        upcomingRides[0].dropoff.address
                      : null
                  }
                  colors={colors}
                  router={router}
                />
              }
            />
          )}

          {/* HISTORY */}
          {mainTab === "history" && (
            <FlatList
              data={historySections}
              keyExtractor={(item: DateSection, i: number) =>
                item.type === "header"
                  ? `h-${item.date}`
                  : `r-${(item as { type: "ride"; ride: RideItem }).ride.id}-${i}`
              }
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 32,
                paddingTop: 8,
              }}
              renderItem={({ item }: { item: DateSection }) => {
                if (item.type === "header") {
                  return (
                    <View style={st.dateRow}>
                      <Text style={[st.dateText, { color: colors.foreground }]}>
                        {item.date}
                      </Text>
                      <View
                        style={[
                          st.dateCount,
                          { backgroundColor: colors.border + "40" },
                        ]}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted }}>
                          {item.count} ride{item.count !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    </View>
                  );
                }
                const r = (item as { type: "ride"; ride: RideItem }).ride;
                return (
                  <HistoryRideCard
                    ride={r}
                    colors={colors}
                    onPress={() =>
                      router.push(`/ride-history?id=${r.id}` as Href)
                    }
                  />
                );
              }}
              ListEmptyComponent={
                <SmartEmptyState
                  tab="history"
                  upcomingCount={0}
                  nextDropoff={null}
                  colors={colors}
                  router={router}
                />
              }
            />
          )}
        </>
      )}
    </ScreenContainer>
  );
}

// ─── Premium header styles ────────────────────────────────────────────────────
const hst = StyleSheet.create({
  container: {
    paddingTop: 12,
    paddingBottom: 18,
    paddingHorizontal: 18,
    overflow: "hidden",
  },
  // Gradient overlay layers
  gradMid: {
    backgroundColor: "rgba(10,26,90,0.55)",
    top: "30%",
  },
  gradBottom: {
    backgroundColor: "rgba(2,14,46,0.85)",
    top: "65%",
  },
  // Radial glow
  glowWrap: {
    position: "absolute",
    top: -SW * 0.4,
    left: SW * 0.1,
    width: SW * 0.8,
    height: SW * 0.8,
    alignItems: "center",
    justifyContent: "center",
  },
  radialGlow: {
    position: "absolute",
    width: SW * 0.8,
    height: SW * 0.8,
    borderRadius: SW * 0.4,
    backgroundColor: "rgba(37,99,235,0.28)",
  },
  radialGlowCore: {
    width: SW * 0.35,
    height: SW * 0.35,
    borderRadius: SW * 0.175,
    backgroundColor: "rgba(96,165,250,0.18)",
  },
  // Accent glow
  accentGlow: {
    position: "absolute",
    bottom: 10,
    left: -40,
    width: SW * 0.55,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(139,92,246,0.18)",
  },
  // Star dots
  star: {
    position: "absolute",
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  // Top row
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -0.5,
  },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 5,
  },
  dotWrap: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dotRing: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  dotCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusTxt: {
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    fontWeight: "500",
  },
  statusSep: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 5,
  },
  exportTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
  },
  // Glass context card
  glassCard: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    padding: 14,
    marginBottom: 14,
  },
  ctxStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 6,
  },
  ctxBadge: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  ctxMeta: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "500",
  },
  ctxRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  ctxRouteItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 4,
  },
  ctxRouteLine: {
    width: 1,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginLeft: 3.5,
    marginBottom: 4,
  },
  ctxDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  ctxAddr: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
  },
  ctxCta: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  ctxCtaText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
  ctxDriverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 9,
  },
  ctxDriverDot: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  ctxDriverName: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
  },
  elapsedBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 4,
  },
  ctxSubText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    marginTop: 6,
    fontStyle: "italic",
  },
  // Empty context
  emptyCtx: {
    flexDirection: "row",
    alignItems: "center",
  },
  emptyCtxIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCtxTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
  },
  emptyCtxSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 7,
    gap: 4,
  },
  bookBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1E88FF",
  },
  // Stats bar
  statsBar: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    paddingVertical: 10,
  },
  statPanel: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statIconBg: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#fff",
  },
  statLabel: {
    fontSize: 9,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statSep: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 4,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    gap: 2,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 4,
    minWidth: 16,
    alignItems: "center",
  },
  subBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  subBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  // ── Shared card system ────────────────────────────────────────────────────
  rideCard: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
  },
  leftStrip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  liveBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  liveLabel: {
    fontSize: 10,
    fontWeight: "800",
    marginLeft: 6,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  liveBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: {
    fontSize: 14,
    fontWeight: "700",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  routeBlock: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  trackBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ctaBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  center: {
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 32,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 8,
  },
  dateText: { fontSize: 15, fontWeight: "800" },
  dateCount: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  empty: {
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", marginTop: 16 },
  emptySub: {
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 19,
  },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
    marginTop: 18,
    gap: 5,
  },
});
