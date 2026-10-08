/**
 * Carpool Detail — Pre-join browsing AND post-join live status.
 *
 * State machine driven by getCarpoolDetail.myJoinStatus:
 *   null      → browse mode: show full ride info + "Request to Join"
 *   pending   → waiting mode: show status pill + driver card (awaiting approval)
 *   approved  → active mode: live status tracking + action bar
 *   rejected  → rejected: show reason + search again CTA
 *   cancelled → cancelled info
 */
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BrandedBackButton from "@/components/BrandedBackButton";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRides } from "@/lib/rides-store";
import { useToastStore } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { useRideEvents } from "@/lib/use-ride-events";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BLUE   = "#1E88FF";
const GREEN  = "#16A34A";
const AMBER  = "#F59E0B";
const RED    = "#EF4444";
const VIOLET = "#8B5CF6";

function showAlert(title: string, msg?: string) {
  const lc = title.toLowerCase();
  const type = lc.includes("success") || lc.includes("joined") || lc.includes("left")
    ? "success" as const
    : lc.includes("error") || lc.includes("full") || lc.includes("already")
      ? "error" as const
      : "info" as const;
  useToastStore.getState().show(msg ?? title, type);
}

// ─── Status pill config ───────────────────────────────────────────────────────
const STEP_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  finding_driver:       { label: "Searching for driver",    color: AMBER,     icon: "magnifyingglass" },
  finding_passengers:   { label: "Accepting passengers",    color: AMBER,     icon: "antenna.radiowaves.left.and.right" },
  driver_assigned:      { label: "Driver confirmed",        color: BLUE,      icon: "checkmark.circle.fill" },
  driver_en_route:      { label: "Driver on the way",       color: BLUE,      icon: "car.fill" },
  driver_arrived:       { label: "Driver has arrived!",     color: GREEN,     icon: "mappin.circle.fill" },
  ride_started:         { label: "Ride in progress",        color: GREEN,     icon: "location.fill" },
  ride_in_progress:     { label: "Ride in progress",        color: GREEN,     icon: "location.fill" },
  completed:            { label: "Ride completed",          color: "#6B7280", icon: "checkmark.seal.fill" },
  cancelled:            { label: "Ride cancelled",          color: RED,       icon: "xmark.circle.fill" },
};

const JOIN_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:   { label: "Awaiting driver approval",   color: AMBER,   icon: "clock.fill" },
  approved:  { label: "Request approved!",           color: GREEN,   icon: "checkmark.circle.fill" },
  rejected:  { label: "Request not accepted",        color: RED,     icon: "xmark.circle.fill" },
  cancelled: { label: "Request cancelled",           color: "#6B7280", icon: "minus.circle.fill" },
};

// ─── Haversine distance ───────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Departure countdown ──────────────────────────────────────────────────────
function useDepartureCountdown(departureTime: string | null | undefined) {
  const [label, setLabel] = useState<string>("");
  useEffect(() => {
    if (!departureTime) return;
    const update = () => {
      const diff = Math.floor((new Date(departureTime).getTime() - Date.now()) / 1000);
      if (diff <= 0)   { setLabel("Departing now"); return; }
      if (diff < 60)   { setLabel(`${diff}s`); return; }
      if (diff < 3600) { setLabel(`${Math.floor(diff / 60)}m`); return; }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      setLabel(`${h}h ${m}m`);
    };
    update();
    const id = setInterval(update, 10_000);
    return () => clearInterval(id);
  }, [departureTime]);
  return label;
}

// ─── Pulse dot for "pending" state ───────────────────────────────────────────
function PulseDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return (
    <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: anim, marginRight: 6 }} />
  );
}

// ─── Action button (icon + label) ────────────────────────────────────────────
function ActionBtn({
  icon, label, color, onPress, disabled,
}: { icon: string; label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionBtn, { opacity: disabled ? 0.4 : 1 }]}
      activeOpacity={0.7}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + "18" }]}>
        <IconSymbol name={icon as any} size={22} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function CarpoolDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { state } = useRides();
  const utils = trpc.useUtils();

  const [message, setMessage] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joining, setJoining] = useState(false);

  const { pickup, dropoff } = state.bookingDraft;

  // ── Data ──
  const { data, isLoading, error } = trpc.carpool.getCarpoolDetail.useQuery(
    { rideId: rideId! },
    { enabled: !!rideId, refetchInterval: 5000 }
  );

  const requestJoinMut    = trpc.carpool.requestJoin.useMutation();
  const cancelRideMut     = trpc.carpool.cancelPostedRide.useMutation();
  const advanceStepMut    = trpc.carpool.advanceCarpoolStep.useMutation();
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const countdown = useDepartureCountdown(data?.ride?.departureTime);

  // SSE: auto-refetch when a ride_update event fires for this ride
  const { lastRideUpdate } = useRideEvents(true);
  useEffect(() => {
    if (lastRideUpdate?.rideId === rideId) {
      utils.carpool.getCarpoolDetail.invalidate({ rideId: rideId! });
    }
  }, [lastRideUpdate, rideId, utils.carpool.getCarpoolDetail]);

  useEffect(() => {
    if (!rideId) router.back();
  }, [rideId, router]);

  // Pre-departure countdown alert: within 30 minutes
  const depMs = data?.ride?.departureTime ? new Date(data.ride.departureTime).getTime() - Date.now() : null;
  const depMinutes = depMs !== null ? Math.floor(depMs / 60_000) : null;
  const showPreDepartureAlert = depMinutes !== null && depMinutes > 0 && depMinutes <= 30 && data?.myJoinStatus === "approved";

  if (!rideId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#090618" }}>
        <ActivityIndicator size="large" color={BLUE} />
      </View>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={{ color: colors.muted, fontSize: 14 }}>Loading ride details…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
          <IconSymbol name="exclamationmark.circle" size={48} color={RED} />
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
            Ride not found
          </Text>
          <Text style={{ color: colors.muted, textAlign: "center" }}>
            This ride may have been cancelled or is no longer available.
          </Text>
          <BrandedBackButton onPress={() => router.back()} style={{ marginTop: 16 }} />
        </View>
      </ScreenContainer>
    );
  }

  const { ride, driver, passengers, seatsAvailable, fareShare, soloFare, savings, myJoinStatus, isMyRide, pendingRequests } = data;
  const isPassengerOrganizer = (data as any).posterRole === "passenger_organizer";

  const rideStep = (ride as any).rideStep as string | null;
  // Both the professional driver and the passenger organizer viewing their own ride
  // should see "Accepting passengers" while waiting for passengers to join.
  const effectiveStep = (isMyRide && rideStep === "driver_assigned")
    ? "finding_passengers"
    : rideStep;
  const stepCfg  = effectiveStep ? STEP_CONFIG[effectiveStep] : null;
  const joinCfg  = myJoinStatus ? JOIN_CONFIG[myJoinStatus] : null;

  const isActive = ["ride_started", "ride_in_progress"].includes(rideStep ?? "");
  const isCompleted = rideStep === "completed";
  const isCancelled = rideStep === "cancelled";
  const canJoin  = !myJoinStatus && !isMyRide && (seatsAvailable ?? 0) > 0 && !isActive && !isCompleted && !isCancelled;
  const isJoined = myJoinStatus === "approved" || myJoinStatus === "pending";

  const depTime = ride.departureTime
    ? new Date(ride.departureTime).toLocaleString([], {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "TBD";

  // ── Join handler ──
  const handleJoin = async () => {
    if (!pickup || !dropoff) {
      showAlert("Location required", "Please set your pickup and dropoff location before joining.");
      return;
    }
    setJoining(true);
    try {
      const distKm = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
      await requestJoinMut.mutateAsync({
        rideId: rideId!,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: pickup.address,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        dropoffAddress: dropoff.address,
        distanceKm: Math.max(distKm, 0.5),
        message: message.trim() || undefined,
      });
      utils.carpool.getCarpoolDetail.invalidate({ rideId: rideId! });
      setShowJoinModal(false);
      setMessage("");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      showAlert("Could not join", err?.message ?? "Please try again.");
    } finally {
      setJoining(false);
    }
  };

  // ── Share trip ──
  const handleShare = async () => {
    try {
      await Share.share({
        message: `I'm taking a shared ride on YOO! From ${(ride as any).pickupAddress ?? ""} to ${(ride as any).dropoffAddress ?? ""}. Departing ${depTime}.`,
      });
    } catch {}
  };

  // ── Emergency ──
  const handleEmergency = () => {
    router.push(`/emergency-sos?rideId=${rideId}` as Href);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
          {isMyRide
            ? isPassengerOrganizer ? "My Group Ride" : "My Posted Ride"
            : "Ride Details"}
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleShare}>
          <IconSymbol name="square.and.arrow.up" size={20} color={colors.muted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Pre-departure alert (≤30 min) ──────────────────────────── */}
        {showPreDepartureAlert && (
          <View style={[styles.statusPill, { backgroundColor: AMBER + "18", borderColor: AMBER + "35" }]}>
            <PulseDot color={AMBER} />
            <IconSymbol name="timer" size={16} color={AMBER} />
            <Text style={[styles.statusPillText, { color: AMBER }]}>
              Ride departing in {depMinutes} min — get ready!
            </Text>
          </View>
        )}

        {/* ── Status Pill ───────────────────────────────────────────────── */}
        {(stepCfg || joinCfg) && (
          <View style={[styles.statusPill, { backgroundColor: (joinCfg ?? stepCfg)!.color + "18", borderColor: (joinCfg ?? stepCfg)!.color + "30" }]}>
            <PulseDot color={(joinCfg ?? stepCfg)!.color} />
            <IconSymbol name={(joinCfg ?? stepCfg)!.icon as any} size={16} color={(joinCfg ?? stepCfg)!.color} />
            <Text style={[styles.statusPillText, { color: (joinCfg ?? stepCfg)!.color }]}>
              {joinCfg?.label ?? stepCfg?.label}
            </Text>
          </View>
        )}

        {/* ── Driver Card ───────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.driverAvatar, { backgroundColor: BLUE }]}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 22 }}>
              {driver.avatar}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
                {driver.name}
              </Text>
              {isMyRide && (
                <View style={[styles.badge, { backgroundColor: BLUE + "18" }]}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: BLUE }}>YOU</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
              <IconSymbol name="star.fill" size={13} color={AMBER} />
              <Text style={{ fontSize: 13, color: colors.muted }}>
                {Number(driver.rating).toFixed(1)} · {driver.totalRides.toLocaleString()} rides
              </Text>
            </View>
            {(ride as any).vehicleType && (
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2, textTransform: "capitalize" }}>
                {(ride as any).vehicleType}
                {(ride as any).licensePlate ? ` · ${(ride as any).licensePlate}` : ""}
              </Text>
            )}
          </View>
          {/* Departure countdown */}
          <View style={[styles.depBadge, { backgroundColor: BLUE }]}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>
              {countdown || "—"}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 10 }}>left</Text>
          </View>
        </View>

        {/* ── Route Visualization ──────────────────────────────────────── */}
        <View style={[styles.routeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.routeRow}>
            <View style={styles.dotGreen} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>PICKUP</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={2}>
                {(ride as any).pickupAddress ?? "—"}
              </Text>
            </View>
          </View>
          <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
          <View style={styles.routeRow}>
            <View style={styles.dotRed} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>DROPOFF</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={2}>
                {(ride as any).dropoffAddress ?? "—"}
              </Text>
            </View>
          </View>

          {/* Ride meta chips */}
          <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
            <MetaChip icon="clock" label={countdown ? `${countdown} away` : depTime} color={BLUE} colors={colors} />
            <MetaChip icon="person.2.fill" label={`${seatsAvailable ?? 0} seats left`} color={seatsAvailable === 0 ? RED : GREEN} colors={colors} />
            <MetaChip icon="location" label={`${Number(ride.distanceKm).toFixed(1)} km`} color={colors.muted} colors={colors} />
            <MetaChip icon="timer" label={`${ride.estimatedMinutes ?? "—"} min`} color={colors.muted} colors={colors} />
          </View>
        </View>

        {/* ── Safety & Preferences ─────────────────────────────────────── */}
        {((ride as any).safetyMode && (ride as any).safetyMode !== "none") && (
          <View style={[styles.safetyBanner, { backgroundColor: VIOLET + "12", borderColor: VIOLET + "30" }]}>
            <IconSymbol name="lock.shield.fill" size={15} color={VIOLET} />
            <Text style={{ fontSize: 12, color: VIOLET, marginLeft: 8, flex: 1 }}>
              {SAFETY_MODE_LABELS[(ride as any).safetyMode as SafetyMode] ?? "Safety mode active"}
            </Text>
          </View>
        )}

        {/* ── Fare Breakdown ───────────────────────────────────────────── */}
        <View style={[styles.fareCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>
            Fare Breakdown
          </Text>
          <FareRow label="Your share" value={`$${Number(fareShare).toFixed(2)}`} valueColor={BLUE} colors={colors} bold />
          <FareRow label="Solo would cost" value={`$${Number(soloFare).toFixed(2)}`} colors={colors} />
          <FareRow label="Platform fee" value="$1.50" colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <FareRow label="Total you pay" value={`$${(Number(fareShare) + 1.5).toFixed(2)}`} valueColor={BLUE} colors={colors} bold />
          {(savings ?? 0) > 0 && (
            <View style={[styles.savingsBadge, { backgroundColor: GREEN + "12" }]}>
              <IconSymbol name="checkmark.circle.fill" size={15} color={GREEN} />
              <Text style={{ color: GREEN, fontSize: 13, fontWeight: "600", marginLeft: 6 }}>
                Save ${Number(savings).toFixed(2)} vs. solo ride
              </Text>
            </View>
          )}
        </View>

        {/* ── Co-Passengers ────────────────────────────────────────────── */}
        {passengers && passengers.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              Co-Passengers ({passengers.length})
            </Text>
            {passengers.map((p: any, i: number) => {
              const name = p.name ?? p.passengerName ?? `Passenger ${i + 1}`;
              return (
                <View key={p.id ?? i} style={[styles.passengerRow, { borderColor: colors.border }]}>
                  <View style={[styles.pAvatar, { backgroundColor: BLUE + "20" }]}>
                    <Text style={{ fontWeight: "800", color: BLUE, fontSize: 13 }}>
                      {name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{name}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <IconSymbol name="star.fill" size={11} color={AMBER} />
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {Number(p.averageRating ?? p.rating ?? 4.8).toFixed(1)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>
                    ${Number(p.fareShare ?? fareShare).toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Ride Rules ───────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
            Ride Rules
          </Text>
          <RuleRow icon="checkmark.circle.fill" color={GREEN} label={`${ride.totalSeats ?? 3} total seats`} colors={colors} />
          <RuleRow
            icon={(ride as any).approvalRequired ? "lock.fill" : "lock.open.fill"}
            color={(ride as any).approvalRequired ? AMBER : GREEN}
            label={(ride as any).approvalRequired ? "Driver approval required" : "Auto-approve on"}
            colors={colors}
          />
          {(ride as any).allowLuggage !== false && (
            <RuleRow icon="bag.fill" color={GREEN} label="Luggage allowed" colors={colors} />
          )}
        </View>

        {/* ── Pending requests count (driver view) ─────────────────────── */}
        {isMyRide && (pendingRequests?.length ?? 0) > 0 && (
          <TouchableOpacity
            style={[styles.pendingBanner, { backgroundColor: AMBER + "18", borderColor: AMBER + "40" }]}
            onPress={() => router.push("/(tabs)/requests" as Href)}
            activeOpacity={0.8}
          >
            <IconSymbol name="person.crop.circle.badge.plus" size={20} color={AMBER} />
            <Text style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: "700", color: AMBER }}>
              {pendingRequests!.length} join request{pendingRequests!.length > 1 ? "s" : ""} need your approval
            </Text>
            <IconSymbol name="chevron.right" size={16} color={AMBER} />
          </TouchableOpacity>
        )}

        {/* ── Organizer Management Panel ────────────────────────────────── */}
        {isMyRide && isPassengerOrganizer && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: BLUE + "20", alignItems: "center", justifyContent: "center" }}>
                <IconSymbol name="person.2.fill" size={15} color={BLUE} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, flex: 1 }}>Organizer Dashboard</Text>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: BLUE + "18" }}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: BLUE }}>YOU</Text>
              </View>
            </View>

            {/* Seat capacity bar */}
            <View style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>Seat Occupancy</Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>
                  {(ride.totalSeats ?? 3) - (seatsAvailable ?? 0)}/{ride.totalSeats ?? 3} filled
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}>
                <View style={{
                  height: "100%", borderRadius: 4,
                  width: `${Math.round(((ride.totalSeats ?? 3) - (seatsAvailable ?? 0)) / (ride.totalSeats ?? 3) * 100)}%` as any,
                  backgroundColor: (seatsAvailable ?? 0) === 0 ? RED : GREEN,
                }} />
              </View>
              <Text style={{ fontSize: 11, color: (seatsAvailable ?? 0) === 0 ? RED : GREEN, marginTop: 4 }}>
                {(seatsAvailable ?? 0) === 0 ? "Ride is full" : `${seatsAvailable} seat${seatsAvailable !== 1 ? "s" : ""} still available`}
              </Text>
            </View>

            {/* Stats row */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              {[
                { label: "Pending", value: String(pendingRequests?.length ?? 0), color: AMBER },
                { label: "Accepted", value: String(passengers?.length ?? 0),     color: GREEN },
                { label: "Fare/seat", value: `$${Number(ride.pricePerSeat ?? fareShare).toFixed(2)}`, color: BLUE },
                { label: "Total fare", value: `$${(Number(ride.pricePerSeat ?? fareShare) * (ride.totalSeats ?? 3)).toFixed(2)}`, color: VIOLET },
              ].map(({ label, value, color }) => (
                <View key={label} style={{ flex: 1, alignItems: "center", padding: 10, borderRadius: 12, backgroundColor: color + "10", borderWidth: 1, borderColor: color + "25" }}>
                  <Text style={{ fontSize: 15, fontWeight: "900", color }}>{value}</Text>
                  <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2, textAlign: "center" }}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Lifecycle Progression */}
            {!isCompleted && !isCancelled && (() => {
              const P2P_STEPS = [
                { step: null,             label: "Accepting Requests", icon: "antenna.radiowaves.left.and.right", color: AMBER  },
                { step: "driver_en_route", label: "Confirmed",          icon: "checkmark.seal.fill",              color: BLUE   },
                { step: "driver_arrived",  label: "Boarding",           icon: "figure.stand",                     color: VIOLET },
                { step: "ride_started",    label: "In Progress",        icon: "car.fill",                         color: GREEN  },
              ] as const;
              const currentIdx = (() => {
                if (rideStep === "ride_started" || rideStep === "ride_in_progress") return 3;
                if (rideStep === "driver_arrived") return 2;
                if (rideStep === "driver_en_route") return 1;
                return 0;
              })();
              const NEXT_STEPS = [
                "driver_en_route" as const,
                "driver_arrived"  as const,
                "ride_started"    as const,
                "completed"       as const,
              ];
              const nextStep = currentIdx < 4 ? NEXT_STEPS[currentIdx] : null;
              const nextLabels = ["Confirm Group", "Mark Boarding", "Start Ride", "Complete Ride"];
              return (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" as const }}>Ride Lifecycle</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                    {P2P_STEPS.map((s, i) => (
                      <View key={i} style={{ flex: 1, alignItems: "center" }}>
                        <View style={{
                          width: 28, height: 28, borderRadius: 14,
                          backgroundColor: i <= currentIdx ? s.color : colors.border,
                          borderWidth: i === currentIdx ? 2 : 0,
                          borderColor: s.color + "60",
                          alignItems: "center", justifyContent: "center",
                        }}>
                          <IconSymbol name={s.icon as any} size={12} color={i <= currentIdx ? "#fff" : colors.muted} />
                        </View>
                        <Text style={{ fontSize: 8, color: i <= currentIdx ? s.color : colors.muted, marginTop: 4, textAlign: "center" }} numberOfLines={1}>{s.label}</Text>
                        {i < P2P_STEPS.length - 1 && (
                          <View style={{ position: "absolute", top: 13, left: "60%", width: "80%", height: 2, backgroundColor: i < currentIdx ? P2P_STEPS[i + 1].color : colors.border }} />
                        )}
                      </View>
                    ))}
                  </View>
                  {nextStep && (
                    <TouchableOpacity
                      onPress={() => {
                        advanceStepMut.mutate(
                          { rideId: rideId!, toStep: nextStep },
                          {
                            onSuccess: () => utils.carpool.getCarpoolDetail.invalidate({ rideId: rideId! }),
                            onError: (err: any) => showAlert("Error", err.message),
                          }
                        );
                      }}
                      disabled={advanceStepMut.isPending}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: BLUE + "50", backgroundColor: BLUE + "12", opacity: advanceStepMut.isPending ? 0.6 : 1 }}
                    >
                      {advanceStepMut.isPending
                        ? <ActivityIndicator color={BLUE} size="small" />
                        : (
                          <>
                            <IconSymbol name="arrow.right.circle.fill" size={14} color={BLUE} />
                            <Text style={{ fontSize: 13, fontWeight: "700", color: BLUE }}>
                              {nextLabels[currentIdx] ?? "Advance"}
                            </Text>
                          </>
                        )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}

            {/* Ride metadata from extended fields */}
            {(() => {
              const meta = ((ride as any).fareBreakdown ?? {}) as any;
              const items = [
                meta.rideNotes && { icon: "note.text", label: meta.rideNotes, color: BLUE },
                meta.luggageAllowed && meta.luggageAllowed !== "small" && { icon: "bag.fill", label: `Luggage: ${meta.luggageAllowed}`, color: VIOLET },
                meta.quietRide && { icon: "speaker.slash.fill", label: "Quiet ride", color: "#0EA5E9" },
                meta.flexibleDepartureMinutes && meta.flexibleDepartureMinutes > 0 && { icon: "clock.badge.checkmark", label: `±${meta.flexibleDepartureMinutes}m flexible`, color: AMBER },
                meta.genderPreference && meta.genderPreference !== "any" && { icon: "person.fill", label: meta.genderPreference === "female_only" ? "Women only" : "Men only", color: "#F062B0" },
              ].filter(Boolean) as { icon: string; label: string; color: string }[];
              if (items.length === 0) return null;
              return (
                <View style={{ gap: 7, marginBottom: 14 }}>
                  {items.map((item, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 9, borderRadius: 10, backgroundColor: item.color + "0C", borderWidth: 1, borderColor: item.color + "25" }}>
                      <IconSymbol name={item.icon as any} size={13} color={item.color} />
                      <Text style={{ fontSize: 12, color: item.color, flex: 1 }} numberOfLines={2}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* Quick action buttons */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => router.push(`/edit-carpool?rideId=${rideId}` as Href)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: BLUE + "50", backgroundColor: BLUE + "12" }}
              >
                <IconSymbol name="pencil" size={13} color={BLUE} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: BLUE }}>Edit Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/requests" as Href)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: AMBER + "50", backgroundColor: AMBER + "12" }}
              >
                <IconSymbol name="person.3.fill" size={13} color={AMBER} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: AMBER }}>Requests</Text>
                {(pendingRequests?.length ?? 0) > 0 && (
                  <View style={{ backgroundColor: AMBER, borderRadius: 6, width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 9, fontWeight: "900", color: "#fff" }}>{pendingRequests!.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push(`/chat-screen?rideId=${rideId}` as Href)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: GREEN + "50", backgroundColor: GREEN + "12" }}
              >
                <IconSymbol name="bubble.left.and.bubble.right.fill" size={13} color={GREEN} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: GREEN }}>Group Chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Actions bar (post-join only) ─────────────────────────────── */}
        {isJoined && (
          <View style={[styles.actionsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>
              Quick Actions
            </Text>
            <View style={styles.actionsRow}>
              <ActionBtn
                icon="message.fill"
                label="Chat"
                color={BLUE}
                onPress={() => router.push(`/chat-screen?rideId=${rideId}` as Href)}
              />
              <ActionBtn
                icon="phone.fill"
                label="Call"
                color={GREEN}
                onPress={() => {
                  showAlert("Calling driver", "Driver contact will be shared once the ride starts.");
                }}
              />
              <ActionBtn
                icon="square.and.arrow.up"
                label="Share"
                color={VIOLET}
                onPress={handleShare}
              />
              <ActionBtn
                icon="sos"
                label="SOS"
                color={RED}
                onPress={handleEmergency}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        {/* NOT JOINED → Request to Join */}
        {canJoin && (
          <View style={{ flex: 1, gap: 10 }}>
            {!showJoinModal ? (
              <TouchableOpacity
                style={[styles.ctaBtn, { backgroundColor: BLUE }]}
                onPress={() => setShowJoinModal(true)}
                activeOpacity={0.85}
              >
                <IconSymbol name="person.badge.plus" size={20} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                  Request to Join · ${Number(fareShare).toFixed(2)}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Message to driver (optional)…"
                  placeholderTextColor={colors.muted}
                  style={[styles.msgInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  maxLength={280}
                  multiline
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.ctaBtn, { flex: 0.35, backgroundColor: colors.border }]}
                    onPress={() => setShowJoinModal(false)}
                  >
                    <Text style={{ color: colors.foreground, fontWeight: "700" }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ctaBtn, { flex: 1, backgroundColor: BLUE, opacity: joining ? 0.7 : 1 }]}
                    onPress={handleJoin}
                    disabled={joining}
                  >
                    {joining
                      ? <ActivityIndicator color="#fff" size="small" />
                      : (
                        <>
                          <IconSymbol name="person.badge.plus" size={18} color="#fff" />
                          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Send Request</Text>
                        </>
                      )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* SEATS FULL */}
        {!canJoin && !myJoinStatus && !isMyRide && !isCompleted && !isCancelled && (
          <View style={[styles.fullBanner, { backgroundColor: RED + "12" }]}>
            <IconSymbol name="xmark.circle.fill" size={18} color={RED} />
            <Text style={{ color: RED, fontWeight: "700", marginLeft: 8 }}>This ride is full</Text>
          </View>
        )}

        {/* PENDING */}
        {myJoinStatus === "pending" && (
          <View style={[styles.statusBanner, { backgroundColor: AMBER + "15" }]}>
            <PulseDot color={AMBER} />
            <Text style={{ color: AMBER, fontWeight: "700", fontSize: 14 }}>
              Waiting for driver approval…
            </Text>
          </View>
        )}

        {/* APPROVED + not yet active */}
        {myJoinStatus === "approved" && !isActive && !isCompleted && (
          <View style={[styles.statusBanner, { backgroundColor: GREEN + "15" }]}>
            <IconSymbol name="checkmark.circle.fill" size={18} color={GREEN} />
            <Text style={{ color: GREEN, fontWeight: "700", fontSize: 14, marginLeft: 8 }}>
              {"You're on this ride · Departs "}{countdown ? `in ${countdown}` : depTime}
            </Text>
          </View>
        )}

        {/* ACTIVE */}
        {isActive && myJoinStatus === "approved" && (
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: GREEN }]}
            onPress={() => router.push(`/active-ride?rideId=${rideId}` as Href)}
          >
            <IconSymbol name="location.fill" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Track Live Ride</Text>
          </TouchableOpacity>
        )}

        {/* REJECTED */}
        {myJoinStatus === "rejected" && (
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={{ color: RED, fontWeight: "700", textAlign: "center" }}>
              Your request was not accepted by the driver.
            </Text>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: BLUE }]}
              onPress={() => router.back()}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Search Other Rides</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* COMPLETED */}
        {isCompleted && (
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: colors.muted }]}
            onPress={() => router.push(`/trip-receipt?rideId=${rideId}` as Href)}
          >
            <IconSymbol name="doc.text.fill" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>View Receipt</Text>
          </TouchableOpacity>
        )}

        {/* ORGANIZER VIEW */}
        {isMyRide && isPassengerOrganizer && (
          <View style={{ flex: 1, gap: 8 }}>
            {!cancelConfirm ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[styles.ctaBtn, { flex: 1, backgroundColor: BLUE }]}
                  onPress={() => router.push(`/edit-carpool?rideId=${rideId}` as Href)}
                >
                  <IconSymbol name="pencil" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Edit Ride</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ctaBtn, { flex: 0.5, backgroundColor: RED + "18", borderWidth: 1.5, borderColor: RED + "50" }]}
                  onPress={() => setCancelConfirm(true)}
                >
                  <IconSymbol name="xmark.circle.fill" size={16} color={RED} />
                  <Text style={{ color: RED, fontSize: 13, fontWeight: "700" }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, color: RED, fontWeight: "700", textAlign: "center" }}>
                  Cancel this ride? All approved passengers will be notified.
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.ctaBtn, { flex: 1, backgroundColor: colors.border }]}
                    onPress={() => setCancelConfirm(false)}
                  >
                    <Text style={{ color: colors.foreground, fontWeight: "700" }}>Keep Ride</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ctaBtn, { flex: 1, backgroundColor: RED, opacity: cancelRideMut.isPending ? 0.6 : 1 }]}
                    onPress={() => {
                      cancelRideMut.mutate(
                        { rideId: rideId! },
                        {
                          onSuccess: () => router.replace("/(tabs)/rides" as Href),
                          onError: (err: any) => showAlert("Error", err.message),
                        }
                      );
                    }}
                    disabled={cancelRideMut.isPending}
                  >
                    {cancelRideMut.isPending
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><IconSymbol name="xmark" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "800" }}>Yes, Cancel</Text></>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* DRIVER VIEW (approved professional driver only) */}
        {isMyRide && !isPassengerOrganizer && (
          <View style={{ flex: 1, gap: 10 }}>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: BLUE }]}
              onPress={() => router.push("/driver/dashboard" as Href)}
            >
              <IconSymbol name="car.fill" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Open Driver Dashboard</Text>
            </TouchableOpacity>
            {(pendingRequests?.length ?? 0) > 0 && (
              <TouchableOpacity
                style={[styles.ctaBtn, { backgroundColor: AMBER }]}
                onPress={() => router.push("/(tabs)/requests" as Href)}
              >
                <IconSymbol name="person.crop.circle.badge.plus" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
                  Review {pendingRequests!.length} Request{pendingRequests!.length > 1 ? "s" : ""}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────

type SafetyMode = "none" | "women_drivers_only" | "women_companions_only" | "women_only";
const SAFETY_MODE_LABELS: Record<SafetyMode, string> = {
  none: "No safety restrictions",
  women_drivers_only: "Women drivers only",
  women_companions_only: "Women co-riders only",
  women_only: "Women-only ride",
};

function MetaChip({ icon, label, color, colors }: { icon: string; label: string; color: string; colors: any }) {
  return (
    <View style={[styles.metaChip, { backgroundColor: colors.background }]}>
      <IconSymbol name={icon as any} size={13} color={color} />
      <Text style={{ fontSize: 11, color, fontWeight: "600", marginLeft: 4 }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function FareRow({ label, value, colors, bold, valueColor }: { label: string; value: string; colors: any; bold?: boolean; valueColor?: string }) {
  return (
    <View style={styles.fareRow}>
      <Text style={{ fontSize: 14, color: colors.muted }}>{label}</Text>
      <Text style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? "800" : "600", color: valueColor ?? colors.foreground }}>
        {value}
      </Text>
    </View>
  );
}

function RuleRow({ icon, color, label, colors }: { icon: string; color: string; label: string; colors: any }) {
  return (
    <View style={styles.ruleRow}>
      <IconSymbol name={icon as any} size={16} color={color} />
      <Text style={{ fontSize: 13, color: colors.foreground, marginLeft: 10 }}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  statusPill: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9,
  },
  statusPillText: { fontSize: 13, fontWeight: "700", marginLeft: 6 },

  card: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16,
  },
  driverAvatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  badge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  depBadge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },

  routeCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16,
  },
  routeRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 6 },
  routeLine: { width: 2, height: 20, marginLeft: 9, marginVertical: 2 },
  dotGreen: { width: 18, height: 18, borderRadius: 9, backgroundColor: GREEN, borderWidth: 2, borderColor: "#fff", marginTop: 2 },
  dotRed: { width: 18, height: 18, borderRadius: 9, backgroundColor: RED, borderWidth: 2, borderColor: "#fff", marginTop: 2 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  metaChip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },

  safetyBanner: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 12,
  },

  fareCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16,
  },
  fareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  divider: { height: 1, marginVertical: 8 },
  savingsBadge: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 10, padding: 10, marginTop: 8,
  },

  section: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16,
  },
  passengerRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, borderBottomWidth: 1,
  },
  pAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  ruleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7 },

  pendingBanner: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 14,
  },

  actionsCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16,
  },
  actionsRow: { flexDirection: "row", justifyContent: "space-around" },
  actionBtn: { alignItems: "center", gap: 6 },
  actionIcon: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11, fontWeight: "700" },

  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1,
  },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 14, paddingHorizontal: 20, paddingVertical: 15, gap: 8, minHeight: 52,
  },
  fullBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 14, padding: 14,
  },
  statusBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 14, padding: 14, gap: 8,
  },
  msgInput: {
    borderRadius: 12, borderWidth: 1, padding: 12, minHeight: 60,
    fontSize: 14, textAlignVertical: "top",
  },
});
