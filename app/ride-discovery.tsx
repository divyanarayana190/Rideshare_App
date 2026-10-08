/**
 * Ride Discovery Screen — Shared ride booking with financial transparency,
 * safety mode selection, driver earnings breakdown, and instant post flow.
 *
 * Entry: ride-options (Share Ride selected) → this screen → active-ride
 *
 * The user sees solo vs. shared fare with a clear conditional rule:
 *   "You are booking Solo. If a rider joins within 5 min, fare splits automatically."
 * They choose a safety mode, review driver earnings, then confirm & post.
 * Below that, a live "Nearby Carpools" section lets them join an existing pool
 * with a IDLE → SENT → ACCEPTED | REJECTED | TIMEOUT state machine.
 */
import * as Haptics from "expo-haptics";
import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRides } from "@/lib/rides-store";
import { useNotification } from "@/lib/use-notification";
import { trpc } from "@/lib/trpc";
import type { RequestState, Ride, RideMatch, SafetyMode } from "@/lib/types";
import { useRideEvents } from "@/lib/use-ride-events";

const P = "#1E88FF";
const G = "#16A34A";
const A = "#F59E0B";
const V = "#8B5CF6";
const R = "#EF4444";

const PLATFORM_FEE     = 1.50;
const YOO_RATE         = 0.15;
const MATCH_MINUTES    = 5;
const REQUEST_TIMEOUT_SECS = 60;

const IDLE_REQ: RequestState = {
  status: "IDLE",
  targetRideId: null,
  joinRequestId: null,
  expiresAt: null,
  fareShare: null,
};

type SafetyOption = { id: SafetyMode; label: string; icon: string; color: string; description: string };

const SAFETY_OPTIONS: SafetyOption[] = [
  {
    id:          "standard",
    label:       "Standard",
    icon:        "shield.fill",
    color:       P,
    description: "Open to all verified users",
  },
  {
    id:          "women_only",
    label:       "Women-Only",
    icon:        "person.crop.circle.fill",
    color:       V,
    description: "Only match with female drivers & riders",
  },
  {
    id:          "campus_verified",
    label:       "Campus",
    icon:        "building.2.fill",
    color:       G,
    description: "Only match with students from your university",
  },
];

export default function RideDiscoveryScreen() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const notify  = useNotification();
  const { state, setActiveRide, clearBookingDraft } = useRides();
  const { pickup, dropoff } = state.bookingDraft;

  // Guard: redirect to home if draft is missing
  useEffect(() => {
    if (!pickup || !dropoff) router.replace("/" as Href);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fare computation ─────────────────────────────────────────────────────
  const distanceKm = useMemo(() => {
    if (!pickup || !dropoff) return 5;
    const dlat = (dropoff.lat - pickup.lat) * 111;
    const dlng = (dropoff.lng - pickup.lng) * 85;
    return Math.max(2, Math.round(Math.sqrt(dlat * dlat + dlng * dlng) * 10) / 10 + 5);
  }, [pickup, dropoff]);

  const soloFare    = Math.round((3.5 + distanceKm * 1.8) * 100) / 100;
  const sharedFare  = Math.round((3.5 + distanceKm * 1.2) * 100) / 100;
  const durationMin = Math.round((distanceKm / 40) * 60);

  const driverSoloEarning   = Math.round(soloFare   * (1 - YOO_RATE) * 100) / 100;
  const driverSharedEarning = Math.round(sharedFare * (1 - YOO_RATE) * 100) / 100;

  // ── UI state ──────────────────────────────────────────────────────────────
  const [safetyMode,        setSafetyMode]        = useState<SafetyMode>("standard");
  const [earningsExpanded,  setEarningsExpanded]  = useState(false);
  const [isPosting,         setIsPosting]         = useState(false);

  // ── Carpool request state machine ─────────────────────────────────────────
  const [req,      setReq]      = useState<RequestState>(IDLE_REQ);
  const [secsLeft, setSecsLeft] = useState(REQUEST_TIMEOUT_SECS);

  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoResetRef = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const spinAnim     = useRef(new Animated.Value(0)).current;
  const spinLoopRef  = useRef<{ stop: () => void } | null>(null);

  // Subtle scale pulse on the "If Matched" fare card
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.025, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,     duration: 1100, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  // ── tRPC ──────────────────────────────────────────────────────────────────
  const bookRide   = trpc.rides.bookRide.useMutation();
  const joinMutation = trpc.rides.requestMidRideJoin.useMutation();
  const utils      = trpc.useUtils();

  const idempotencyKeyRef = useRef(`disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  // Search live carpools
  const { data: rawCarpools, isLoading: carpoolsLoading } =
    trpc.carpool.searchCarpools.useQuery(
      {
        pickupLat:  pickup?.lat  ?? 0,
        pickupLng:  pickup?.lng  ?? 0,
        dropoffLat: dropoff?.lat ?? 0,
        dropoffLng: dropoff?.lng ?? 0,
        safetyMode: "none",
        maxResults: 30,
      },
      { enabled: !!pickup && !!dropoff, refetchInterval: 30_000 }
    );

  // Poll join-request status when waiting
  const { data: joinStatusData } = trpc.rides.getJoinRequestStatus.useQuery(
    { joinRequestId: req.joinRequestId ?? "" },
    { enabled: req.status === "SENT" && !!req.joinRequestId, refetchInterval: 3000 }
  );

  // SSE for real-time accept / reject events
  const { lastJoinApproved, lastJoinRejected } = useRideEvents(req.status === "SENT");

  // Spin animation when SENT
  useEffect(() => {
    if (req.status === "SENT") {
      spinAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
        })
      );
      spinLoopRef.current = loop;
      loop.start();
    } else {
      spinLoopRef.current?.stop();
      spinLoopRef.current = null;
    }
  }, [req.status]); // eslint-disable-line react-hooks/exhaustive-deps -- spinAnim is a stable Animated.Value ref

  // Countdown timer when SENT
  useEffect(() => {
    if (req.status !== "SENT") {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    setSecsLeft(REQUEST_TIMEOUT_SECS);
    timerRef.current = setInterval(() => {
      setSecsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          handleTimeout();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
     
  }, [req.status]);

  // SSE: approved
  useEffect(() => {
    if (!lastJoinApproved || req.status !== "SENT") return;
    if (lastJoinApproved.joinRequestId !== req.joinRequestId) return;
    handleAccepted(lastJoinApproved.rideId, Number(lastJoinApproved.fareShare));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastJoinApproved]);

  // SSE: rejected
  useEffect(() => {
    if (!lastJoinRejected || req.status !== "SENT") return;
    if (lastJoinRejected.joinRequestId !== req.joinRequestId) return;
    handleRejected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastJoinRejected]);

  // Poll: status from DB
  useEffect(() => {
    if (!joinStatusData || req.status !== "SENT") return;
    if (joinStatusData.status === "approved") {
      handleAccepted(
        joinStatusData.rideId,
        joinStatusData.fareShare ? Number(joinStatusData.fareShare) : (req.fareShare ?? soloFare * 0.6)
      );
    } else if (joinStatusData.status === "rejected") {
      handleRejected();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinStatusData?.status]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current)     clearInterval(timerRef.current);
      if (autoResetRef.current) clearTimeout(autoResetRef.current);
    };
  }, []);

  if (!pickup || !dropoff) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#090618" }}>
        <ActivityIndicator size="large" color="#1E88FF" />
      </View>
    );
  }

  // ── Transform raw carpools → RideMatch[] ─────────────────────────────────
  const matches: RideMatch[] = (() => {
    if (!rawCarpools) return [];
    const clusters = (rawCarpools as any).clusters ?? rawCarpools;
    const flat: any[] = Array.isArray(clusters)
      ? clusters.flatMap((c: any) => [c.best, ...(c.alternatives ?? [])])
      : [];
    return flat
      .filter((r) => r != null && !r.isOwnRide && r.seatsAvailable > 0)
      .slice(0, 3)
      .map((r) => ({
        rideId:               r.ride.rideId as string,
        driverName:           r.driver?.name ?? "Driver",
        driverAvatar:         (r.driver?.name ?? "D").charAt(0).toUpperCase(),
        driverRating:         Number(r.driver?.rating ?? 4.8),
        driverTotalRides:     Number(r.driver?.totalRides ?? 0),
        pickupAddress:        pickup.address,
        dropoffAddress:       dropoff.address,
        pickupDistKm:         Number(r.pickupDistKm ?? 0.5),
        routeOverlapPercent:  Math.round(Number(r.routeOverlapPercent ?? 75)),
        fareShare:            Number(r.fareShare ?? r.ride.pricePerSeat ?? soloFare * 0.5),
        seatsAvailable:       Number(r.seatsAvailable ?? 1),
        departureMinutes:     r.ride.departureTime
          ? Math.max(0, Math.round((new Date(r.ride.departureTime).getTime() - Date.now()) / 60000))
          : 5,
        score:                Number(r.score ?? 70),
        approvalRequired:     r.ride.approvalRequired ?? false,
        detourKm:             r.detourKm    != null ? Number(r.detourKm)    : undefined,
        detourMinutes:        r.detourMinutes != null ? Number(r.detourMinutes) : undefined,
        compatibilityScore:   r.compatibilityScore != null ? Number(r.compatibilityScore) : undefined,
      }));
  })();

  // ── State machine transitions ─────────────────────────────────────────────

  function handleTimeout() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setReq((prev) => ({ ...prev, status: "TIMEOUT" }));
    autoResetRef.current = setTimeout(() => setReq(IDLE_REQ), 2000);
  }

  function handleRejected() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setReq((prev) => ({ ...prev, status: "REJECTED" }));
    autoResetRef.current = setTimeout(() => setReq(IDLE_REQ), 2000);
  }

  async function handleAccepted(rideId: string, fareShare: number) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setReq((prev) => ({ ...prev, status: "ACCEPTED", fareShare }));
    const newRide: Ride = {
      id:               rideId,
      mode:             "share",
      status:           "matched",
      pickup:           pickup!,
      dropoff:          dropoff!,
      passengers:       [],
      totalFare:        fareShare + PLATFORM_FEE,
      myFare:           fareShare + PLATFORM_FEE,
      distanceKm,
      estimatedMinutes: durationMin,
      createdAt:        new Date().toISOString(),
      myPassengerId:    "me",
      rideStartedAt:    Date.now(),
      sharedMatchStatus: "MATCHED_SHARED",
      safetyMode,
    };
    await setActiveRide(newRide);
    clearBookingDraft();
    router.replace("/active-ride" as Href);
  }

  async function handleJoin(match: RideMatch) {
    if (req.status !== "IDLE") return;
    Haptics.selectionAsync().catch(() => {});
    try {
      const result = await joinMutation.mutateAsync({
        rideId:         match.rideId,
        pickupLat:      pickup!.lat,
        pickupLng:      pickup!.lng,
        pickupAddress:  pickup!.address,
        dropoffLat:     dropoff!.lat,
        dropoffLng:     dropoff!.lng,
        dropoffAddress: dropoff!.address,
        distanceKm,
        detourKm:       match.detourKm,
        detourMinutes:  match.detourMinutes,
        compatibilityScore: match.compatibilityScore,
      });
      if ((result as any).autoApproved) {
        await handleAccepted(match.rideId, Number((result as any).estimatedFare ?? match.fareShare));
      } else {
        setReq({
          status:        "SENT",
          targetRideId:  match.rideId,
          joinRequestId: (result as any).joinRequest?.joinRequestId ?? null,
          expiresAt:     Date.now() + REQUEST_TIMEOUT_SECS * 1000,
          fareShare:     Number((result as any).estimatedFare ?? match.fareShare),
        });
      }
    } catch (err: any) {
      notify.showError(err?.message ?? "❌ Unable to join ride. Please try again.");
    }
  }

  // ── Confirm & Post handler ────────────────────────────────────────────────
  const handleConfirmAndPost = async () => {
    if (isPosting) return;
    setIsPosting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await bookRide.mutateAsync({
        mode:             "share",
        pickupLat:        pickup.lat,
        pickupLng:        pickup.lng,
        pickupAddress:    pickup.address,
        dropoffLat:       dropoff.lat,
        dropoffLng:       dropoff.lng,
        dropoffAddress:   dropoff.address,
        distanceKm,
        estimatedMinutes: durationMin,
        vehicleType:      "standard",
        idempotencyKey:   idempotencyKeyRef.current,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const newRide: Ride = {
        id:                result.ride.rideId,
        mode:              "share",
        status:            "searching",
        pickup,
        dropoff,
        driver:            undefined,
        passengers:        [],
        totalFare:         Number(result.ride.totalFare) + PLATFORM_FEE,
        myFare:            result.fareShare + PLATFORM_FEE,
        distanceKm,
        estimatedMinutes:  durationMin,
        createdAt:         result.ride.createdAt.toISOString(),
        myPassengerId:     "me",
        rideStartedAt:     Date.now(),
        sharedMatchStatus: "SEARCHING_FOR_MATCH",
        safetyMode,
      };

      await setActiveRide(newRide);
      await utils.rides.myRides.invalidate();
      clearBookingDraft();
      router.replace("/active-ride" as Href);
    } catch (err: any) {
      notify.showError(err?.message ?? "❌ Unable to create ride. Please try again.");
    } finally {
      setIsPosting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[
        styles.header,
        { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
      ]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <IconSymbol name="arrow.left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Shared Ride</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>Post & match with others</Text>
        </View>
        <View style={[styles.discountBadge, { backgroundColor: G + "18" }]}>
          <IconSymbol name="arrow.down.right" size={11} color={G} />
          <Text style={[styles.discountText, { color: G }]}>SAVE 40%</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Route Summary ───────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 16 }]}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>YOUR ROUTE</Text>
          <View style={styles.routeRow}>
            <View style={styles.routeDots}>
              <View style={[styles.dotBlue,  { backgroundColor: P }]} />
              <View style={[styles.dotLine,  { backgroundColor: colors.border }]} />
              <View style={[styles.dotGreen, { backgroundColor: G }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ marginBottom: 14 }}>
                <Text style={[styles.locLabel, { color: colors.muted }]}>Pickup</Text>
                <Text style={[styles.locText, { color: colors.foreground }]} numberOfLines={1}>
                  {pickup.shortName || pickup.address.split(",")[0]}
                </Text>
              </View>
              <View>
                <Text style={[styles.locLabel, { color: colors.muted }]}>Destination</Text>
                <Text style={[styles.locText, { color: colors.foreground }]} numberOfLines={1}>
                  {dropoff.shortName || dropoff.address.split(",")[0]}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6, justifyContent: "center" }}>
              <View style={[styles.metaPill, { backgroundColor: colors.background }]}>
                <IconSymbol name="arrow.triangle.swap" size={11} color={colors.muted} />
                <Text style={[styles.metaText, { color: colors.muted }]}> {distanceKm.toFixed(1)} km</Text>
              </View>
              <View style={[styles.metaPill, { backgroundColor: colors.background }]}>
                <IconSymbol name="clock.fill" size={11} color={colors.muted} />
                <Text style={[styles.metaText, { color: colors.muted }]}> {durationMin} min</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Nearby Carpools — Discovery & Request ────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.carpoolHeader}>
            <Text style={[styles.sectionLabel, { color: colors.muted, marginBottom: 0 }]}>NEARBY CARPOOLS</Text>
            {carpoolsLoading && <ActivityIndicator size="small" color={P} />}
          </View>
          <Text style={[styles.carpoolSubtitle, { color: colors.muted }]}>
            Join an existing ride and split the fare instantly
          </Text>

          {/* Status banners */}
          {req.status === "SENT" && (
            <View style={[styles.reqBanner, { backgroundColor: A + "18", borderColor: A + "40" }]}>
              <Animated.View style={{ transform: [{ rotate: spin }], marginRight: 8 }}>
                <ActivityIndicator size="small" color={A} />
              </Animated.View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reqBannerTitle, { color: A }]}>Waiting for driver approval</Text>
                <Text style={[styles.reqBannerSub, { color: colors.muted }]}>
                  Expires in {secsLeft}s
                  {req.fareShare ? `  ·  Fare if accepted: $${(req.fareShare + PLATFORM_FEE).toFixed(2)}` : ""}
                </Text>
              </View>
            </View>
          )}
          {req.status === "REJECTED" && (
            <View style={[styles.reqBanner, { backgroundColor: R + "18", borderColor: R + "40" }]}>
              <IconSymbol name="xmark.circle.fill" size={18} color={R} style={{ marginRight: 8 }} />
              <Text style={[styles.reqBannerTitle, { color: R }]}>Driver declined — try another ride</Text>
            </View>
          )}
          {req.status === "TIMEOUT" && (
            <View style={[styles.reqBanner, { backgroundColor: "#6B728018", borderColor: "#6B728040" }]}>
              <IconSymbol name="clock.fill" size={18} color="#6B7280" style={{ marginRight: 8 }} />
              <Text style={[styles.reqBannerTitle, { color: "#6B7280" }]}>Request timed out — try another ride</Text>
            </View>
          )}

          {/* Match list */}
          {carpoolsLoading ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>Searching for nearby rides...</Text>
            </View>
          ) : matches.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconBg, { backgroundColor: P + "12" }]}>
                <IconSymbol name="car.2.fill" size={26} color={P} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No active rides found</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                No active rides found for this route yet.{"\n"}
                You can still post your own ride below.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.matchScroll}
              decelerationRate="fast"
              snapToInterval={276}
              snapToAlignment="start"
            >
              {matches.map((match) => {
                const isTarget   = req.targetRideId === match.rideId;
                const isSent     = isTarget && req.status === "SENT";
                const isAccepted = isTarget && req.status === "ACCEPTED";
                const isRejected = isTarget && req.status === "REJECTED";
                const isTimeout  = isTarget && req.status === "TIMEOUT";
                const anyLocked  = req.status === "SENT";

                let btnLabel   = "Join";
                let btnBg      = P;
                let btnDisabled = anyLocked && !isTarget;

                if (isSent)     { btnLabel = `${secsLeft}s`; btnBg = A;         btnDisabled = true; }
                if (isAccepted) { btnLabel = "Joined!";       btnBg = G;         btnDisabled = true; }
                if (isRejected) { btnLabel = "Declined";      btnBg = R;         btnDisabled = true; }
                if (isTimeout)  { btnLabel = "Timed out";     btnBg = "#6B7280"; btnDisabled = true; }

                return (
                  <View
                    key={match.rideId}
                    style={[
                      styles.matchCard,
                      { backgroundColor: colors.background, borderColor: isSent ? A : colors.border },
                    ]}
                  >
                    <View style={styles.matchDriverRow}>
                      <View style={[styles.matchAvatar, { backgroundColor: P }]}>
                        <Text style={styles.matchAvatarText}>{match.driverAvatar}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={[styles.matchDriverName, { color: colors.foreground }]}>
                          {match.driverName}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <IconSymbol name="star.fill" size={10} color={A} />
                          <Text style={[styles.matchRating, { color: colors.muted }]}>
                            {match.driverRating.toFixed(1)} · {match.driverTotalRides} trips
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.overlapBadge, { backgroundColor: G + "18" }]}>
                        <Text style={[styles.overlapText, { color: G }]}>
                          {match.routeOverlapPercent}%
                        </Text>
                      </View>
                    </View>

                    <View style={styles.matchStats}>
                      <View style={styles.matchStat}>
                        <IconSymbol name="location.fill" size={11} color={colors.muted} />
                        <Text style={[styles.matchStatText, { color: colors.muted }]}>
                          {match.pickupDistKm < 0.5 ? "Very close" : `${match.pickupDistKm.toFixed(1)} km`}
                        </Text>
                      </View>
                      <View style={styles.matchStat}>
                        <IconSymbol name="person.2.fill" size={11} color={colors.muted} />
                        <Text style={[styles.matchStatText, { color: colors.muted }]}>
                          {match.seatsAvailable} seat{match.seatsAvailable !== 1 ? "s" : ""}
                        </Text>
                      </View>
                      {match.detourMinutes != null && match.detourMinutes > 0 && (
                        <View style={styles.matchStat}>
                          <IconSymbol name="clock.fill" size={11} color={A} />
                          <Text style={[styles.matchStatText, { color: A }]}>+{match.detourMinutes}min</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.matchFooter}>
                      <Text style={[styles.matchFare, { color: colors.foreground }]}>
                        ${(match.fareShare + PLATFORM_FEE).toFixed(2)}
                      </Text>
                      <TouchableOpacity
                        style={[styles.joinBtn, { backgroundColor: btnBg, opacity: btnDisabled && !isTarget ? 0.4 : 1 }]}
                        onPress={() => handleJoin(match)}
                        disabled={btnDisabled}
                        activeOpacity={0.8}
                      >
                        {isSent ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text style={styles.joinBtnText}>{btnLabel}</Text>
                          </View>
                        ) : (
                          <Text style={styles.joinBtnText}>{btnLabel}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── Fare Transparency Panel ─────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>FARE TRANSPARENCY</Text>

          <View style={styles.fareRow}>
            <Animated.View style={[
              styles.fareCard,
              { backgroundColor: G + "12", borderColor: G + "55", borderWidth: 2, transform: [{ scale: pulseAnim }] },
            ]}>
              <View style={styles.fareBadge}>
                <IconSymbol name="checkmark.circle.fill" size={11} color={G} />
                <Text style={[styles.fareBadgeText, { color: G }]}>IF MATCHED</Text>
              </View>
              <Text style={[styles.fareAmt, { color: G }]}>${sharedFare.toFixed(2)}</Text>
              <Text style={[styles.fareType, { color: G + "BB" }]}>Shared Fare</Text>
            </Animated.View>

            <View style={styles.fareVs}>
              <Text style={[styles.fareVsText, { color: colors.muted }]}>vs</Text>
            </View>

            <View style={[styles.fareCard, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.fareBadge}>
                <IconSymbol name="person.fill" size={11} color={colors.muted} />
                <Text style={[styles.fareBadgeText, { color: colors.muted }]}>SOLO FARE</Text>
              </View>
              <Text style={[styles.fareAmt, { color: colors.foreground }]}>${soloFare.toFixed(2)}</Text>
              <Text style={[styles.fareType, { color: colors.muted }]}>Active Now</Text>
            </View>
          </View>

          <View style={[styles.ruleBox, { backgroundColor: A + "12", borderColor: A + "35" }]}>
            <IconSymbol name="info.circle.fill" size={15} color={A} />
            <Text style={[styles.ruleText, { color: colors.foreground }]}>
              {"  "}You are currently booking a{" "}
              <Text style={{ fontWeight: "700" }}>Solo ride</Text>.
              {" "}If a verified rider joins your route within{" "}
              <Text style={{ fontWeight: "700" }}>{MATCH_MINUTES} minutes</Text>,
              {" "}your fare automatically splits to the{" "}
              <Text style={{ fontWeight: "700", color: G }}>Shared Price</Text>.
            </Text>
          </View>
        </View>

        {/* ── Safety Mode Toggle ──────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>SAFETY MODE</Text>
          <View style={styles.safetyRow}>
            {SAFETY_OPTIONS.map(opt => {
              const active = safetyMode === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.safetyChip,
                    {
                      backgroundColor: active ? opt.color + "15" : colors.background,
                      borderColor:     active ? opt.color + "60" : colors.border,
                      borderWidth:     active ? 2 : 1,
                    },
                  ]}
                  onPress={() => { setSafetyMode(opt.id); Haptics.selectionAsync(); }}
                  activeOpacity={0.8}
                >
                  <IconSymbol name={opt.icon as any} size={20} color={active ? opt.color : colors.muted} />
                  <Text style={[styles.safetyLabel, { color: active ? opt.color : colors.muted }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.safetyDescRow, { backgroundColor: colors.background }]}>
            <IconSymbol
              name={SAFETY_OPTIONS.find(o => o.id === safetyMode)!.icon as any}
              size={13}
              color={SAFETY_OPTIONS.find(o => o.id === safetyMode)!.color}
            />
            <Text style={[styles.safetyDesc, { color: colors.muted }]}>
              {"  "}{SAFETY_OPTIONS.find(o => o.id === safetyMode)!.description}
            </Text>
          </View>
        </View>

        {/* ── Driver Earnings Breakdown (expandable) ──────────────────────── */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setEarningsExpanded(v => !v)}
          activeOpacity={0.85}
        >
          <View style={styles.earningsHeader}>
            <View style={[styles.earningsIconBg, { backgroundColor: A + "15" }]}>
              <IconSymbol name="banknote.fill" size={18} color={A} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.earningsTitle, { color: colors.foreground }]}>Driver Earnings Breakdown</Text>
              <Text style={[styles.earningsSub, { color: colors.muted }]}>Tap to see how fares are split</Text>
            </View>
            <IconSymbol name={earningsExpanded ? "chevron.up" : "chevron.down"} size={16} color={colors.muted} />
          </View>

          {earningsExpanded && (
            <View style={[styles.earningsBody, { borderTopColor: colors.border }]}>
              {[
                { icon: "person.fill",   iconColor: colors.muted, label: "Solo ride — driver keeps",  value: `$${driverSoloEarning.toFixed(2)}`,   valueColor: colors.foreground },
                { icon: "person.2.fill", iconColor: G,            label: "Per seat — shared ride",    value: `$${driverSharedEarning.toFixed(2)}`, valueColor: G },
                { icon: "percent",       iconColor: colors.muted, label: "YOO platform fee",          value: `${Math.round(YOO_RATE * 100)}%`,   valueColor: colors.muted },
              ].map((row, i) => (
                <View key={i}>
                  {i > 0 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
                  <View style={styles.earningsRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <IconSymbol name={row.icon as any} size={14} color={row.iconColor} />
                      <Text style={[styles.earningsRowLabel, { color: colors.muted }]}>{row.label}</Text>
                    </View>
                    <Text style={[styles.earningsRowValue, { color: row.valueColor }]}>{row.value}</Text>
                  </View>
                </View>
              ))}
              <View style={[styles.earningsNote, { backgroundColor: P + "10" }]}>
                <IconSymbol name="lightbulb.fill" size={13} color={P} />
                <Text style={[styles.earningsNoteText, { color: P }]}>
                  {"  "}With shared rides, drivers can earn up to 2× per trip by filling empty seats.
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Match Window Info ────────────────────────────────────────────── */}
        <View style={[styles.matchWindow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.matchIconBg, { backgroundColor: P + "12" }]}>
            <IconSymbol name="timer" size={20} color={P} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.matchTitle, { color: colors.foreground }]}>
              {MATCH_MINUTES}-Minute Match Window
            </Text>
            <Text style={[styles.matchSub, { color: colors.muted }]}>
              Your ride posts to nearby verified riders instantly. Solo fare is active until a match is confirmed.
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* ── Bottom CTA (fixed) ──────────────────────────────────────────────── */}
      <View style={[
        styles.ctaBar,
        { paddingBottom: insets.bottom + 12, backgroundColor: colors.surface, borderTopColor: colors.border },
      ]}>
        <View style={styles.ctaFareRow}>
          <View>
            <Text style={[styles.ctaFareLabel, { color: colors.muted }]}>Posting as Solo</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.ctaFareAmt, { color: colors.foreground }]}>${soloFare.toFixed(2)}</Text>
              <IconSymbol name="arrow.right" size={12} color={G} />
              <Text style={[styles.ctaSharedFare, { color: G }]}>${sharedFare.toFixed(2)} if matched</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: isPosting ? G + "80" : G }]}
          onPress={handleConfirmAndPost}
          activeOpacity={0.88}
          disabled={isPosting}
        >
          {isPosting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <IconSymbol name="checkmark.circle.fill" size={20} color="#fff" />
              <Text style={styles.ctaBtnText}>Confirm & Post Ride</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:       { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerTitle:   { fontSize: 17, fontWeight: "700" },
  headerSub:     { fontSize: 12, marginTop: 1 },
  discountBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 },
  discountText:  { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },

  // Cards
  card:         { marginHorizontal: 16, marginTop: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.9, marginBottom: 14 },

  // Route
  routeRow:  { flexDirection: "row", alignItems: "stretch" },
  routeDots: { width: 20, alignItems: "center", marginRight: 12 },
  dotBlue:   { width: 10, height: 10, borderRadius: 5 },
  dotLine:   { width: 2, flex: 1, minHeight: 24, marginVertical: 4 },
  dotGreen:  { width: 10, height: 10, borderRadius: 5 },
  locLabel:  { fontSize: 11, marginBottom: 3 },
  locText:   { fontSize: 14, fontWeight: "600" },
  metaPill:  { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  metaText:  { fontSize: 11, fontWeight: "600" },

  // Fare
  fareRow:       { flexDirection: "row", gap: 8, marginBottom: 14 },
  fareCard:      { flex: 1, borderRadius: 14, padding: 14, alignItems: "center" },
  fareBadge:     { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 8 },
  fareBadgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  fareAmt:       { fontSize: 26, fontWeight: "800", marginBottom: 2 },
  fareType:      { fontSize: 12, fontWeight: "600" },
  fareVs:        { width: 28, alignItems: "center", justifyContent: "center" },
  fareVsText:    { fontSize: 13, fontWeight: "700" },

  // Rule box
  ruleBox:  { borderRadius: 10, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "flex-start" },
  ruleText: { flex: 1, fontSize: 13, lineHeight: 20 },

  // Safety
  safetyRow:     { flexDirection: "row", gap: 8, marginBottom: 10 },
  safetyChip:    { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", gap: 5 },
  safetyLabel:   { fontSize: 11, fontWeight: "700", textAlign: "center" },
  safetyDescRow: { flexDirection: "row", alignItems: "center", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  safetyDesc:    { fontSize: 12, lineHeight: 17 },

  // Earnings
  earningsHeader:   { flexDirection: "row", alignItems: "center" },
  earningsIconBg:   { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  earningsTitle:    { fontSize: 15, fontWeight: "700" },
  earningsSub:      { fontSize: 12, marginTop: 1 },
  earningsBody:     { marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  earningsRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9 },
  earningsRowLabel: { fontSize: 13 },
  earningsRowValue: { fontSize: 14, fontWeight: "700" },
  rowDivider:       { height: 1 },
  earningsNote:     { flexDirection: "row", alignItems: "flex-start", borderRadius: 9, padding: 10, marginTop: 12 },
  earningsNoteText: { fontSize: 12, flex: 1, lineHeight: 18 },

  // Match window
  matchWindow: { margin: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "flex-start" },
  matchIconBg: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  matchTitle:  { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  matchSub:    { fontSize: 12, lineHeight: 18 },

  // Nearby Carpools section
  carpoolHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  carpoolSubtitle: { fontSize: 12, marginBottom: 14 },

  reqBanner:      { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14 },
  reqBannerTitle: { fontSize: 13, fontWeight: "700" },
  reqBannerSub:   { fontSize: 11, marginTop: 2 },

  emptyState:  { alignItems: "center", paddingVertical: 24 },
  emptyIconBg: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  emptyTitle:  { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  emptyText:   { fontSize: 12, textAlign: "center", lineHeight: 18 },

  matchScroll: { paddingBottom: 4, paddingRight: 4, gap: 10, flexDirection: "row" },

  matchCard: {
    width: 264,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  matchDriverRow:  { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  matchAvatar:     { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  matchAvatarText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  matchDriverName: { fontSize: 14, fontWeight: "700" },
  matchRating:     { fontSize: 11 },
  overlapBadge:    { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  overlapText:     { fontSize: 10, fontWeight: "800" },

  matchStats:    { flexDirection: "row", gap: 10, marginBottom: 12, flexWrap: "wrap" },
  matchStat:     { flexDirection: "row", alignItems: "center", gap: 3 },
  matchStatText: { fontSize: 11 },

  matchFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  matchFare:   { fontSize: 18, fontWeight: "800" },

  joinBtn:     { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, minWidth: 76, alignItems: "center", justifyContent: "center" },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // CTA bar
  ctaBar:        { paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1 },
  ctaFareRow:    { marginBottom: 12 },
  ctaFareLabel:  { fontSize: 11, marginBottom: 3 },
  ctaFareAmt:    { fontSize: 18, fontWeight: "800" },
  ctaSharedFare: { fontSize: 13, fontWeight: "600" },
  ctaBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16, paddingVertical: 16, gap: 8 },
  ctaBtnText:    { color: "#fff", fontSize: 16, fontWeight: "700" },
});
