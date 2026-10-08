/**
 * Ride Requested — Premium scheduled/broadcast ride search screen.
 *
 * Used for the passenger-broadcast flow (passengerRequests table).
 * Shows real driversNotified/driversViewed from DB, map, timeline, and all
 * lifecycle states: searching → matched → expired/cancelled.
 */

import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DriverTrackingMapView from "@/components/DriverTrackingMapView";
import { DefaultPaymentMethodSummary } from "@/components/payments/DefaultPaymentMethodSummary";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG  = "#F9FAFB";
const P   = "#7C3AED";
const G   = "#16A34A";
const R   = "#EF4444";
const A   = "#F59E0B";
const V   = "#8B5CF6";

// ─── Timeline steps ───────────────────────────────────────────────────────────
const TIMELINE_STEPS = [
  { key: "requested",       label: "Request Posted" },
  { key: "searching",       label: "Searching Drivers" },
  { key: "driver_accepted", label: "Driver Accepted" },
  { key: "pickup",          label: "Pickup" },
  { key: "completed",       label: "Trip Completed" },
];

function getTimelineIndex(status: string, matched: boolean): number {
  if (matched)                                    return 2;
  if (status === "broadcasting")                  return 1;
  return 0;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shortAddr(addr: string): string { return addr.split(",")[0] ?? addr; }

function fmtCountdown(expiresAt: string): string {
  const rem = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const m   = Math.floor(rem / 60);
  const s   = rem % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── PulsingDot ───────────────────────────────────────────────────────────────
function PulsingDot({ color = G, size = 7 }: { color?: string; size?: number }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(scale,   { toValue: 2.4, duration: 950, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale,   { toValue: 1,   duration: 0,   useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0,   duration: 950, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.7, duration: 0,   useNativeDriver: true }),
      ]),
    ])).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- scale and opacity are stable Animated.Value refs
  return (
    <View style={{ width: size * 3, height: size * 3, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: size * 3, height: size * 3, borderRadius: (size * 3) / 2, backgroundColor: color }, { transform: [{ scale }], opacity }]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── StatusTimeline ───────────────────────────────────────────────────────────
function StatusTimeline({ currentIndex }: { currentIndex: number }) {
  return (
    <View style={{ paddingLeft: 8 }}>
      {TIMELINE_STEPS.map((step, i) => {
        const done   = i < currentIndex;
        const active = i === currentIndex;
        const dotColor = done ? G : active ? P : "#D1D5DB";
        const labelColor = done || active ? "#111827" : "#9CA3AF";
        return (
          <View key={step.key} style={{ flexDirection: "row", alignItems: "stretch", minHeight: 36 }}>
            <View style={{ width: 24, alignItems: "center" }}>
              {i > 0 && <View style={{ width: 2, flex: 1, marginBottom: 2, backgroundColor: done ? G : "#D1D5DB" }} />}
              <View style={[tl.dot, { backgroundColor: dotColor, borderColor: active ? P : dotColor }]}>
                {done && <IconSymbol name="checkmark" size={8} color="#fff" />}
                {active && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />}
              </View>
              {i < TIMELINE_STEPS.length - 1 && (
                <View style={{ width: 2, flex: 1, marginTop: 2, backgroundColor: i < currentIndex ? G : "#D1D5DB" }} />
              )}
            </View>
            <View style={{ flex: 1, paddingLeft: 12, paddingVertical: 6 }}>
              <Text style={{ fontSize: 13, color: labelColor, fontWeight: active ? "700" : "500" }}>
                {step.label}
              </Text>
              {active && (
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: P + "1A", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start", marginTop: 2 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: P, marginRight: 4 }} />
                  <Text style={{ fontSize: 10, color: P, fontWeight: "700" }}>Active</Text>
                </View>
              )}
              {i > currentIndex && <Text style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>Waiting</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────
function MetricCard({ icon, value, label, color, highlighted }: {
  icon: IconSymbolName; value: string; label: string; color: string; highlighted?: boolean;
}) {
  return (
    <View style={[mc.card, highlighted && { borderColor: color + "60", borderWidth: 1.5 }]}>
      <View style={[mc.iconBg, { backgroundColor: color + "1A" }]}>
        <IconSymbol name={icon} size={16} color={color} />
      </View>
      <Text style={[mc.value, { color }]}>{value}</Text>
      <Text style={mc.label}>{label}</Text>
    </View>
  );
}

// ─── SummaryCell ──────────────────────────────────────────────────────────────
function SummaryCell({ icon, label, value, color }: { icon: IconSymbolName; label: string; value: string; color: string }) {
  return (
    <View style={sc.cell}>
      <View style={[sc.icon, { backgroundColor: color + "1A" }]}>
        <IconSymbol name={icon} size={16} color={color} />
      </View>
      <Text style={sc.label}>{label}</Text>
      <Text style={sc.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Matched View ─────────────────────────────────────────────────────────────
function MatchedView({ stats, onTrack, insets }: { stats: any; onTrack: () => void; insets: any }) {
  const scale   = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- scale and opacity are stable Animated.Value refs

  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
      <Animated.View style={{ transform: [{ scale }], opacity, alignItems: "center" }}>
        <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: G + "20", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <IconSymbol name="checkmark.circle.fill" size={60} color={G} />
        </View>
        <Text style={{ fontSize: 26, fontWeight: "900", color: "#111827", textAlign: "center", marginBottom: 8 }}>
          Driver Found! 🎉
        </Text>
        <Text style={{ fontSize: 15, color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 32 }}>
          A driver has accepted your ride request. Tap below to track your driver.
        </Text>

        {stats?.pickupAddress && (
          <View style={{ backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, width: "100%", marginBottom: 24, borderWidth: 1, borderColor: "#E5E7EB" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: G }} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }} numberOfLines={1}>
                {shortAddr(stats.pickupAddress)}
              </Text>
            </View>
            <View style={{ width: 2, height: 12, backgroundColor: "#D1D5DB", marginLeft: 4, marginVertical: 2 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: R }} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }} numberOfLines={1}>
                {shortAddr(stats.dropoffAddress)}
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={{ backgroundColor: G, borderRadius: 16, paddingVertical: 18, width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
          onPress={onTrack}
          activeOpacity={0.88}
        >
          <IconSymbol name="location.fill" size={20} color="#fff" />
          <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>Track My Ride</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Expired View ─────────────────────────────────────────────────────────────
function ExpiredView({ stats, router, insets }: { stats: any; router: any; insets: any }) {
  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}>
        <View style={{ alignItems: "center", marginTop: 40, marginBottom: 24 }}>
          <View style={{ width: 96, height: 96, borderRadius: 24, backgroundColor: A + "18", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <IconSymbol name="person.fill.xmark" size={48} color={A} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: "#111827", textAlign: "center" }}>No Driver Found</Text>
          <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20, marginTop: 6 }}>
            No drivers accepted your request before it expired.
          </Text>
        </View>

        {/* Stats */}
        {stats && (
          <View style={card.base}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: "#6B7280" }}>
                <Text style={{ fontWeight: "700", color: "#111827" }}>{stats.driversNotified}</Text>
                {" drivers notified"}
              </Text>
              <Text style={{ fontSize: 12, color: "#6B7280" }}>
                <Text style={{ fontWeight: "700", color: "#111827" }}>{stats.driversViewed}</Text>
                {" viewed"}
              </Text>
              <Text style={{ fontSize: 12, color: "#6B7280" }}>
                <Text style={{ fontWeight: "700", color: R }}>0</Text>
                {" accepted"}
              </Text>
            </View>
          </View>
        )}

        <View style={{ gap: 10, marginTop: 4 }}>
          {[
            { icon: "dollarsign.circle.fill" as IconSymbolName, color: G, title: "Increase Offer Price", sub: "Higher fare improves match speed significantly", onPress: () => router.replace("/create-ride?flow=find-driver" as Href) },
            { icon: "clock.arrow.2.circlepath" as IconSymbolName, color: P, title: "Post Again", sub: "Re-broadcast your request to nearby drivers", onPress: () => router.replace("/create-ride?flow=find-driver" as Href) },
            { icon: "calendar.badge.clock" as IconSymbolName, color: V, title: "Browse Carpools", sub: "Find available shared rides in the marketplace", onPress: () => router.replace("/find-shared" as Href) },
          ].map((opt) => (
            <TouchableOpacity key={opt.title} style={card.option} onPress={opt.onPress} activeOpacity={0.85}>
              <IconSymbol name={opt.icon} size={20} color={opt.color} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#111827" }}>{opt.title}</Text>
                <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{opt.sub}</Text>
              </View>
              <IconSymbol name="chevron.right" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[card.option, { borderColor: R + "40" }]}
            onPress={() => router.replace("/(tabs)/rides" as Href)}
            activeOpacity={0.85}
          >
            <IconSymbol name="xmark.circle.fill" size={20} color={R} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: R }}>Go Home</Text>
              <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Return to My Rides</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function RideRequestedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { requestId, pickupName, dropoffName, scheduledAt } = useLocalSearchParams<{
    requestId: string;
    pickupName?: string;
    dropoffName?: string;
    scheduledAt?: string;
  }>();

  const [pollEnabled, setPollEnabled] = useState(true);

  const { data: stats, isError: statsError } = trpc.passengerRequest.getLiveStats.useQuery(
    { requestId: requestId! },
    { enabled: !!requestId && pollEnabled, refetchInterval: 3_000, retry: false },
  );

  const cancelMut   = trpc.passengerRequest.cancel.useMutation();
  const updateOffer = trpc.passengerRequest.updateOffer.useMutation();
  const utils       = trpc.useUtils();

  // ── Raise offer panel ──────────────────────────────────────────────────────
  const [showRaiseOffer, setShowRaiseOffer] = useState(false);
  const [newOfferInput,  setNewOfferInput]  = useState("");
  const raiseAnim = useRef(new Animated.Value(0)).current;

  // ── Countdown timer ────────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    if (!stats?.expiresAt) return;
    const tick = () => setCountdown(fmtCountdown(stats.expiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [stats?.expiresAt]);

  // ── Stop polling on terminal states ────────────────────────────────────────
  useEffect(() => {
    const s = stats?.status;
    if (s === "matched" || s === "expired" || s === "cancelled") {
      setPollEnabled(false);
    }
  }, [stats?.status]);

  useEffect(() => {
    if (!requestId) router.back();
  }, [requestId, router]);

  if (!requestId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#090618" }}>
        <ActivityIndicator size="large" color="#1E88FF" />
      </View>
    );
  }

  // 404 / NOT_FOUND means the request doesn't exist or belongs to another user — treat as expired
  const matched = stats?.status === "matched";
  const expired = statsError || stats?.status === "expired" || stats?.status === "cancelled";

  const pickupAddr  = stats?.pickupAddress  ?? (pickupName  ? decodeURIComponent(pickupName)  : "");
  const dropoffAddr = stats?.dropoffAddress ?? (dropoffName ? decodeURIComponent(dropoffName) : "");
  const pickupLat   = stats?.pickupLat  ?? 0;
  const pickupLng   = stats?.pickupLng  ?? 0;
  const dropoffLat  = stats?.dropoffLat ?? 0;
  const dropoffLng  = stats?.dropoffLng ?? 0;
  const offerPrice  = stats?.offerPrice ?? 0;
  const passengerCount = stats?.passengerCount ?? 1;
  const distKm  = stats?.distanceKm  ?? 0;
  const estMin  = stats?.estimatedMinutes ?? 0;
  const notified    = stats?.driversNotified  ?? 0;
  const viewed      = stats?.driversViewed    ?? 0;
  const interested  = (stats as any)?.driversInterested ?? 0;
  const tlIndex     = getTimelineIndex(stats?.status ?? "broadcasting", matched);

  // Dynamic header title: show "Scheduled Ride" only when scheduledAt param is present
  const headerTitle = scheduledAt ? "Scheduled Ride" : "Ride Request";

  const handleCancel = () => {
    Alert.alert(
      "Cancel Request?",
      "Are you sure you want to cancel this ride request?",
      [
        { text: "Yes, Cancel", style: "destructive", onPress: async () => {
          try { await cancelMut.mutateAsync({ requestId: requestId! }); } catch {}
          router.back();
        }},
        { text: "Keep Request", style: "cancel" },
      ],
    );
  };

  const handleTrack = () => {
    if (stats?.matchedRideId) {
      router.replace(`/active-ride?rideId=${stats.matchedRideId}` as Href);
    } else {
      router.replace("/(tabs)/rides" as Href);
    }
  };

  // ── Terminal views ─────────────────────────────────────────────────────────
  if (matched) return <MatchedView stats={stats} onTrack={handleTrack} insets={insets} />;
  if (expired) return <ExpiredView stats={stats} router={router} insets={insets} />;

  // ── Searching view ─────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={18} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{headerTitle}</Text>
          <Text style={s.headerSub}>Finding you a driver…</Text>
        </View>
        <TouchableOpacity style={s.helpBtn} onPress={() => router.push("/help-support" as Href)}>
          <IconSymbol name="headphones" size={14} color="#374151" />
          <Text style={s.helpText}>Help</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status Banner ──────────────────────────────────────────────── */}
        <View style={s.statusBanner}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", flex: 1 }}>
            <ActivityIndicator color={P} size="small" style={{ marginTop: 2 }} />
            <View style={{ marginLeft: 14 }}>
              <Text style={s.bannerTitle}>Searching for Driver...</Text>
              <Text style={s.bannerSub}>{"We're notifying nearby drivers."}</Text>
              <Text style={s.bannerSub}>{"You'll get a notification when a driver accepts."}</Text>
            </View>
          </View>
          {countdown ? (
            <View style={s.timerBadge}>
              <Text style={s.timerText}>{countdown}</Text>
              <Text style={s.timerLabel}>remaining</Text>
            </View>
          ) : null}
        </View>

        {/* ── Map ────────────────────────────────────────────────────────── */}
        {pickupLat !== 0 && pickupLng !== 0 && (
          <View style={s.mapCard}>
            <DriverTrackingMapView
              pickupLat={pickupLat}
              pickupLng={pickupLng}
              pickupLabel={shortAddr(pickupAddr)}
              destLat={dropoffLat}
              destLng={dropoffLng}
              destLabel={shortAddr(dropoffAddr)}
              driverLat={null}
              driverLng={null}
              driverLabel=""
              mapMode="in_ride"
              durationMin={estMin}
              style={{ height: 240, borderRadius: 16 }}
            />
            {distKm > 0 && (
              <View style={s.routeOverlay}>
                <IconSymbol name="car.fill" size={12} color="#fff" />
                <Text style={s.routeOverlayText}>{distKm.toFixed(1)} km · {estMin} min</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Ride Summary ───────────────────────────────────────────────── */}
        <View style={card.base}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Your Ride Details</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: G + "15", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
              <PulsingDot color={G} size={4} />
              <Text style={{ fontSize: 11, color: G, fontWeight: "700" }}>LIVE</Text>
            </View>
          </View>
          <View style={s.summaryGrid}>
            <SummaryCell icon="mappin.circle.fill"  label="Pickup"     value={shortAddr(pickupAddr)}  color={G} />
            <SummaryCell icon="flag.fill"           label="Drop-off"   value={shortAddr(dropoffAddr)} color={R} />
            <SummaryCell icon="person.2.fill"       label="Passengers" value={`${passengerCount} ${passengerCount === 1 ? "person" : "people"}`} color={V} />
            <SummaryCell icon="dollarsign.circle.fill" label="Offer Fare" value={`$${offerPrice.toFixed(2)}`} color={A} />
          </View>

          <View style={{ marginTop: 14 }}>
            <DefaultPaymentMethodSummary variant="card" />
          </View>

          {/* Raise offer inline */}
          <TouchableOpacity
            style={s.raiseOfferRow}
            onPress={() => {
              setShowRaiseOffer(v => !v);
              setNewOfferInput("");
              Animated.timing(raiseAnim, {
                toValue: showRaiseOffer ? 0 : 1,
                duration: 220,
                useNativeDriver: true,
              }).start();
            }}
            activeOpacity={0.85}
          >
            <IconSymbol name="arrow.up.circle.fill" size={16} color={A} />
            <Text style={{ fontSize: 13, color: A, fontWeight: "700", marginLeft: 8, flex: 1 }}>
              Raise Your Offer
            </Text>
            <Text style={{ fontSize: 12, color: "#9CA3AF" }}>
              Higher offer = faster match ↑
            </Text>
          </TouchableOpacity>

          {showRaiseOffer && (
            <Animated.View style={{ opacity: raiseAnim, transform: [{ translateY: raiseAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }], marginTop: 12 }}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: A + "50", borderRadius: 12, backgroundColor: A + "08", paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: A, marginRight: 4 }}>$</Text>
                  <TextInput
                    value={newOfferInput}
                    onChangeText={(v: string) => setNewOfferInput(v.replace(/[^0-9.]/g, ""))}
                    placeholder="New offer amount"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                    style={{ flex: 1, fontSize: 18, fontWeight: "800", color: "#111827" }}
                    autoFocus
                  />
                </View>
                <TouchableOpacity
                  style={{ borderRadius: 12, backgroundColor: A, paddingHorizontal: 18, paddingVertical: 14, opacity: updateOffer.isPending ? 0.6 : 1 }}
                  disabled={updateOffer.isPending || !newOfferInput}
                  onPress={async () => {
                    const price = parseFloat(newOfferInput);
                    if (isNaN(price) || price < 1) return;
                    try {
                      await updateOffer.mutateAsync({ requestId: requestId!, offerPrice: price });
                      setShowRaiseOffer(false);
                      setNewOfferInput("");
                      utils.passengerRequest.getLiveStats.invalidate({ requestId: requestId! });
                    } catch {}
                  }}
                  activeOpacity={0.85}
                >
                  {updateOffer.isPending
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={{ fontSize: 14, fontWeight: "800", color: "#000" }}>Update</Text>}
                </TouchableOpacity>
              </View>
              {updateOffer.isError && (
                <Text style={{ fontSize: 12, color: R, marginTop: 8 }}>
                  {(updateOffer.error as any)?.message ?? "Failed to update offer"}
                </Text>
              )}
            </Animated.View>
          )}
        </View>

        {/* ── Search Progress ────────────────────────────────────────────── */}
        <View style={card.base}>
          <Text style={s.cardTitle}>Search Progress</Text>
          <View style={s.metricsRow}>
            <MetricCard icon="antenna.radiowaves.left.and.right" value={String(notified)} label="Drivers Notified" color={P} />
            <MetricCard icon="eye.fill" value={String(viewed)} label="Drivers Viewed" color={A} highlighted />
            <MetricCard icon="person.2.fill" value={String(interested)} label="Interested Drivers" color={V} />
            <MetricCard icon="clock.fill" value={countdown || "--:--"} label="Time Left" color={G} />
          </View>
        </View>

        {/* ── Status Timeline ────────────────────────────────────────────── */}
        <View style={card.base}>
          <Text style={s.cardTitle}>Status</Text>
          <View style={{ marginTop: 8 }}>
            <StatusTimeline currentIndex={tlIndex} />
          </View>
        </View>

        {/* ── Tips ───────────────────────────────────────────────────────── */}
        <View style={card.base}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <IconSymbol name="lightbulb.fill" size={14} color={P} />
            <Text style={[s.cardTitle, { marginLeft: 8 }]}>While you wait</Text>
          </View>
          {[
            "Drivers nearby are being notified in real-time",
            "Your request expires in 15 minutes if unmatched",
            "Raising your offer price may increase match speed",
            "You'll get a push notification the moment a driver matches",
          ].map((tip, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
              <IconSymbol name="checkmark.circle.fill" size={13} color={G} />
              <Text style={{ flex: 1, fontSize: 13, color: "#6B7280", lineHeight: 19 }}>{tip}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ── Cancel Button ──────────────────────────────────────────────── */}
      <View style={[s.bottomActions, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={s.cancelBtn}
          onPress={handleCancel}
          disabled={cancelMut.isPending}
          activeOpacity={0.85}
        >
          {cancelMut.isPending
            ? <ActivityIndicator color={R} size="small" />
            : <>
                <IconSymbol name="xmark.circle.fill" size={18} color={R} />
                <Text style={s.cancelBtnText}>Cancel Ride Request</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  headerSub:   { fontSize: 12, color: "#6B7280", marginTop: 2 },
  helpBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20,
  },
  helpText: { fontSize: 12, color: "#374151", fontWeight: "600" },

  statusBanner: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    margin: 12, borderRadius: 16,
    padding: 16, gap: 12,
    borderWidth: 1, borderColor: P + "30",
  },
  bannerTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  bannerSub:   { fontSize: 12, color: "#6B7280", marginTop: 2 },
  timerBadge: {
    backgroundColor: "#F3F4F6", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    alignItems: "center", minWidth: 72,
  },
  timerText:  { fontSize: 16, fontWeight: "900", color: "#111827" },
  timerLabel: { fontSize: 10, color: "#6B7280", marginTop: 2, fontWeight: "600" },

  mapCard: { marginHorizontal: 12, borderRadius: 16, overflow: "hidden", marginBottom: 12, position: "relative" },
  routeOverlay: {
    position: "absolute", bottom: 10, left: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  routeOverlayText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  cardHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  cardTitle:    { fontSize: 14, fontWeight: "700", color: "#111827" },
  summaryGrid:  { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  metricsRow:   { flexDirection: "row", gap: 8, marginTop: 8 },

  raiseOfferRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: A + "0F", borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: A + "30",
    marginTop: 4,
  },

  bottomActions: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: BG,
    borderTopWidth: 1, borderTopColor: "#E5E7EB",
  },
  cancelBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: R + "15", borderWidth: 1.5, borderColor: R + "50",
    borderRadius: 14, paddingVertical: 15, gap: 8,
  },
  cancelBtnText: { fontSize: 15, fontWeight: "800", color: R },
});

const card = StyleSheet.create({
  base: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 12, marginBottom: 12,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  option: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
});

const sc = StyleSheet.create({
  cell: {
    flex: 1, minWidth: "45%",
    backgroundColor: "#F3F4F6", borderRadius: 12, padding: 12,
    alignItems: "flex-start", gap: 6,
  },
  icon:  { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 10, color: "#6B7280", fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  value: { fontSize: 12, fontWeight: "700", color: "#111827", marginTop: 2 },
});

const mc = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: "#F3F4F6", borderRadius: 12, padding: 10,
    alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#E5E7EB",
  },
  iconBg: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  value:  { fontSize: 16, fontWeight: "900" },
  label:  { fontSize: 9, color: "#6B7280", fontWeight: "700", textAlign: "center", letterSpacing: 0.3 },
});

const tl = StyleSheet.create({
  dot: {
    width: 16, height: 16, borderRadius: 8, borderWidth: 2,
    alignItems: "center", justifyContent: "center", zIndex: 1,
  },
});
