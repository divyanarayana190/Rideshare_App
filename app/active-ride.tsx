/**
 * Active Ride Screen -- 100% DB-driven ride tracking.
 *
 * Polls `rides.getRide` every 5 s for live rideStep + driver info.
 * Polls `rides.getDriverLocation` every 5 s for live driver GPS.
 * Shows step-appropriate status, notifications, map with live driver dot.
 * Stays on screen until ride is `completed` from the DB.
 */
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Linking,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DefaultPaymentMethodSummary } from "@/components/payments/DefaultPaymentMethodSummary";
import DriverTrackingMapView from "@/components/DriverTrackingMapView";
import { StopsList, type StopItem } from "@/components/StopsList";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRideSocket } from "@/hooks/use-socket";
import { useRideEvents } from "@/lib/use-ride-events";
import { useAuth } from "@/lib/auth-context-v2";
import { useRides } from "@/lib/rides-store";
import { useNotification } from "@/lib/use-notification";
import { trpc } from "@/lib/trpc";
import { formatDistance } from "@/lib/utils";
import type { Driver, SharedMatchStatus } from "@/lib/types";

const P = "#1E88FF";
const G = "#16A34A";
const R = "#EF4444";
const A = "#F59E0B";
const V = "#8B5CF6";
const T = "#0EA5E9";

const MATCH_WINDOW_SECS = 5 * 60; // 5-minute passenger match window for shared rides

/** Filter stops to show: user's own + any in-between their pickup/dropoff */
function filterStopsForPassenger(stops: StopItem[], passengerId: number): StopItem[] {
  const myPickup = stops.find(s => s.passengerId === passengerId && s.stopType === "pickup");
  const myDropoff = stops.find(s => s.passengerId === passengerId && s.stopType === "dropoff");
  if (!myPickup || !myDropoff) return stops.filter(s => s.passengerId === passengerId);
  return stops.filter(s =>
    s.passengerId === passengerId ||
    (s.sequence >= myPickup.sequence && s.sequence <= myDropoff.sequence)
  );
}

const WAIT_GRACE_SECS = 5 * 60;

// ─── Step labels for each DB rideStep ────────────────────────────────────────
const STEP_CONFIG: Record<string, { label: string; subtitle: string; icon: string; color: string; headerColor: string }> = {
  finding_driver: {
    label: "Searching for a driver...",
    subtitle: "Connecting you with a nearby driver",
    icon: "magnifyingglass",
    color: A,
    headerColor: P,
  },
  driver_assigned: {
    label: "Driver assigned!",
    subtitle: "Your driver is on the way",
    icon: "car.fill",
    color: V,
    headerColor: P,
  },
  driver_en_route: {
    label: "Driver heading to pickup",
    subtitle: "Your driver is on the way to pick you up",
    icon: "car.fill",
    color: V,
    headerColor: P,
  },
  driver_picking_copassenger: {
    label: "Driver picking up co-passenger",
    subtitle: "Your driver is collecting another rider — you're up next!",
    icon: "person.2.fill",
    color: V,
    headerColor: P,
  },
  driver_arrived: {
    label: "Driver has arrived!",
    subtitle: "Your driver is waiting at pickup -- head out now!",
    icon: "mappin",
    color: A,
    headerColor: A,
  },
  ride_started: {
    label: "Ride in progress",
    subtitle: "On your way to destination",
    icon: "road.lanes",
    color: G,
    headerColor: G,
  },
  ride_in_progress: {
    label: "Ride in progress",
    subtitle: "On your way to destination",
    icon: "road.lanes",
    color: G,
    headerColor: G,
  },
  completed: {
    label: "Arrived at destination",
    subtitle: "Your ride is complete",
    icon: "checkmark.circle.fill",
    color: G,
    headerColor: G,
  },
  cancelled: {
    label: "Ride cancelled",
    subtitle: "This ride has been cancelled",
    icon: "xmark.circle.fill",
    color: R,
    headerColor: R,
  },
};


const STEP_LABELS = [
  { key: "finding_driver", label: "Finding" },
  { key: "driver_en_route", label: "En Route" },
  { key: "driver_arrived", label: "Arrived" },
  { key: "ride_in_progress", label: "In Ride" },
  { key: "completed", label: "Done" },
];

function getStepIndex(step: string): number {
  if (step === "finding_driver") return 0;
  if (step === "driver_assigned" || step === "driver_en_route" || step === "driver_picking_copassenger") return 1;
  if (step === "driver_arrived") return 2;
  if (step === "ride_started" || step === "ride_in_progress") return 3;
  if (step === "completed") return 4;
  return 0;
}

const { height: SH } = Dimensions.get("window");
const SNAP_MIN = 84;   // just handle visible — maximises map
const SNAP_MID = 320;  // shows driver card
const SNAP_MAX = SH * 0.72; // near full-sheet

// translateY snap points: 0 = fully open (SNAP_MAX visible), higher = more hidden
const SNAP_Y_EXPANDED  = 0;
const SNAP_Y_MID       = SNAP_MAX - SNAP_MID;
const SNAP_Y_COLLAPSED = SNAP_MAX - SNAP_MIN;

const SHEET_SPRING = { tension: 68, friction: 12, useNativeDriver: false } as const;

export default function ActiveRideScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notify = useNotification();
  const { user: authUser } = useAuth();
  const { state, setActiveRide } = useRides();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bannerPulse = useRef(new Animated.Value(0.8)).current;
  const searchRipple = useRef(new Animated.Value(0)).current;

  // ── Bottom-sheet animation ─────────────────────────────────────────────────
  // Use translateY instead of height so the sheet always stays anchored at the
  // bottom — avoiding the gray gap that height shrinkage leaves in flex layouts.
  const sheetTransY = useRef(new Animated.Value(SNAP_Y_MID)).current;
  const snapYRef    = useRef(SNAP_Y_MID);

  // snapHeight = pixels of the sheet currently visible; used for map bottom padding
  const [snapHeight, setSnapHeight] = useState(SNAP_MID);

  const snapTo = (target: number, vy = 0) => {
    snapYRef.current = target;
    Animated.spring(sheetTransY, { toValue: target, velocity: vy, ...SHEET_SPRING }).start();
    setSnapHeight(SNAP_MAX - target);
  };

  type GS = { dy: number; vy: number };
  const sheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_: any, gs: GS) => Math.abs(gs.dy) > 5,
      onPanResponderMove: (_: any, gs: GS) => {
        // drag down (+dy) → translateY increases → sheet slides down (less visible)
        const next = Math.max(SNAP_Y_EXPANDED, Math.min(SNAP_Y_COLLAPSED, snapYRef.current + gs.dy));
        sheetTransY.setValue(next);
      },
      onPanResponderRelease: (_: any, gs: GS) => {
        const curr = snapYRef.current + gs.dy;
        const vy   = gs.vy;
        let target: number;
        if      (vy < -0.35) target = SNAP_Y_EXPANDED;
        else if (vy >  0.35) target = SNAP_Y_COLLAPSED;
        else {
          const snaps = [SNAP_Y_EXPANDED, SNAP_Y_MID, SNAP_Y_COLLAPSED];
          const dists = snaps.map(s => Math.abs(s - curr));
          target = snaps[dists.indexOf(Math.min(...dists))];
        }
        snapTo(target, vy);
      },
    })
  ).current;

  const utils = trpc.useUtils();
  const cancelRideMutation = trpc.rides.cancelRide.useMutation();
  const approveMidJoinMut = trpc.rides.approveMidRideJoin.useMutation();
  const rejectMidJoinMut = trpc.rides.rejectMidRideJoin.useMutation();

  const ride = state.activeRide;

  // ── WebSocket: real-time ride events (driver location, status changes) ──────
  const { driverLocation: wsDriverLoc } = useRideSocket(ride?.id);

  // ── Error backoff: stop polling after 3 consecutive failures ────────────────
  const [rideErrCount, setRideErrCount] = useState(0);
  const [locErrCount, setLocErrCount] = useState(0);

  // ── Poll the DB ride every 4 s for step + driver info ───────────────────────
  // SSE triggers an immediate refetch; polling is the fallback.
  const { data: liveRideData, isError: rideIsError, error: rideQueryError } = trpc.rides.getRide.useQuery(
    { rideId: ride?.id ?? "" },
    {
      enabled: !!ride?.id && rideErrCount < 3,
      refetchInterval: 4000,
      retry: false,
    }
  );
  useEffect(() => {
    if (rideIsError) setRideErrCount((c) => c + 1);
    else if (liveRideData) setRideErrCount(0);
  }, [rideIsError, liveRideData]);

  // Clear stale ride data if the server rejects access — prevents showing another
  // user's ride when the stored rideId belongs to a different account.
  useEffect(() => {
    if (!rideQueryError) return;
    const code = (rideQueryError as any)?.data?.code;
    if (code === "NOT_FOUND" || code === "FORBIDDEN" || code === "UNAUTHORIZED") {
      void setActiveRide(null);
    }
  }, [rideQueryError, setActiveRide]);

  // ── Fallback polling of driver GPS every 8 s (WebSocket is primary) ─────────
  const { data: polledDriverLoc, isError: locIsError } = trpc.rides.getDriverLocation.useQuery(
    { rideId: ride?.id ?? "" },
    {
      enabled: !!ride?.id && !!liveRideData?.driverInfo && locErrCount < 3,
      refetchInterval: 8000,
      retry: false,
    }
  );
  useEffect(() => {
    if (locIsError) setLocErrCount((c) => c + 1);
    else if (polledDriverLoc) setLocErrCount(0);
  }, [locIsError, polledDriverLoc]);

  // Merge: prefer WebSocket (real-time) over polling (fallback)
  const driverLat: number | null =
    wsDriverLoc?.latitude ?? polledDriverLoc?.lat ?? null;
  const driverLng: number | null =
    wsDriverLoc?.longitude ?? polledDriverLoc?.lng ?? null;

  // Store the driver's FIRST known position — used as OSRM route origin
  // in approaching mode so the route line doesn't rebuild on every location tick
  const firstDriverLatRef = useRef<number | null>(null);
  const firstDriverLngRef = useRef<number | null>(null);
  useEffect(() => {
    if (firstDriverLatRef.current == null && driverLat != null) {
      firstDriverLatRef.current = driverLat;
      firstDriverLngRef.current = driverLng;
    }
  }, [driverLat, driverLng]);

  // ── Poll ride stops for shared rides (every 10 s) ───────────────────────────
  const isSharedRide = ride?.mode === "share";
  const { data: rideStops = [] } = trpc.rides.getRideStops.useQuery(
    { rideId: ride?.id ?? "" },
    {
      enabled: !!ride?.id && isSharedRide,
      refetchInterval: 10_000,
      retry: false,
    }
  );

  // Filter stops relevant to current passenger
  const myPassengerId = liveRideData?.myPassengerId ?? 0;
  const filteredStops = isSharedRide && rideStops.length > 0
    ? filterStopsForPassenger(rideStops as StopItem[], myPassengerId)
    : [];

  // Live co-riders and fares from server (updated after every join approval)
  const coPassengers: { passengerId: number; name: string; avatar: string; fareShare: number; dropoffAddress: string }[] =
    (liveRideData as any)?.coPassengersList ?? [];
  const isViewerDriver = !!authUser && (liveRideData as any)?.driverId === Number(authUser.id);
  // Live fare: passenger sees their own updated share; driver sees total they collect
  const liveFare: number = isViewerDriver
    ? Number((liveRideData as any)?.totalFare ?? ride?.myFare ?? 0)
    : Number((liveRideData as any)?.myFareShare ?? ride?.myFare ?? 0);
  const driverEarnings: number = Math.round(liveFare * 0.8 * 100) / 100;

  // Pending join requests visible to the ride creator
  const isOriginalPassenger = !!(liveRideData?.isOriginalPassenger);
  // For carpool rides, creator is the driver (not in ridePassengers); check by driverId
  const isRideCreator = isOriginalPassenger ||
    (!!authUser && (liveRideData as any)?.driverId === Number(authUser.id));
  const { data: pendingJoinRequests = [], refetch: refetchJoinRequests } =
    trpc.driver.getPendingJoinRequests.useQuery(
      { rideId: ride?.id ?? "" },
      {
        enabled: !!ride?.id && isSharedRide && isRideCreator,
        refetchInterval: 8000,
        retry: false,
      },
    );

  // Live ride step: prefer per-passenger server override (Redis-backed, shared ride sequential
  // arrivals), then global rideStep from DB polling. myRideStep is set by getRide when the
  // driver has arrived for someone else on a shared ride.
  const liveRideStep = liveRideData?.myRideStep ?? liveRideData?.rideStep ?? liveRideData?.status ?? "finding_driver";
  const stepConfig = STEP_CONFIG[liveRideStep] ?? STEP_CONFIG.finding_driver;
  const isCompleted = liveRideStep === "completed";
  const isCancelled = liveRideStep === "cancelled";
  const isTerminal = isCompleted || isCancelled;
  const currentStepIdx = getStepIndex(liveRideStep);

  // Map camera: only finding_driver shows a dashed preview route; all active routes are solid
  const isDashed = liveRideStep === "finding_driver";
  // Bottom padding = visible sheet height + safe area, so fitToCoordinates leaves markers clear
  const mapBottomPadding = snapHeight + insets.bottom;

  // Merge live driver info from DB into local ride state
  const liveDriver: Driver | undefined = liveRideData?.driverInfo
    ? {
        id: liveRideData.driverInfo.id,
        name: liveRideData.driverInfo.name,
        avatar: liveRideData.driverInfo.avatar,
        rating: liveRideData.driverInfo.rating,
        vehicle: liveRideData.driverInfo.vehicle,
        vehicleColor: liveRideData.driverInfo.vehicleColor,
        licensePlate: liveRideData.driverInfo.licensePlate,
        totalTrips: liveRideData.driverInfo.totalTrips,
      }
    : ride?.driver;

  // ETA: estimate based on ride step; prefer DB estimatedMinutes over stored ride fallback
  const [eta, setEta] = useState(ride?.estimatedMinutes ?? 20);
  useEffect(() => {
    if (!liveRideData) return;
    const baseEta = (liveRideData as any).estimatedMinutes ?? ride?.estimatedMinutes ?? 15;
    switch (liveRideStep) {
      case "finding_driver":    setEta(baseEta); break;
      case "driver_assigned":
      case "driver_en_route":   setEta(Math.max(5, baseEta - 5)); break;
      case "driver_arrived":    setEta(0); break;
      case "ride_started":
      case "ride_in_progress":  setEta(Math.max(3, baseEta - 10)); break;
      case "completed":         setEta(0); break;
    }
  }, [liveRideStep, liveRideData, ride?.estimatedMinutes]);

  // Pulse animation (step dots)
  useEffect(() => {
    if (!ride || isTerminal) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [ride, isTerminal]); // eslint-disable-line react-hooks/exhaustive-deps -- pulseAnim is a stable Animated.Value ref

  // Ripple animation for "Searching for Driver" card
  useEffect(() => {
    if (liveRideStep !== "finding_driver") return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(searchRipple, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(searchRipple, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [liveRideStep]); // eslint-disable-line react-hooks/exhaustive-deps -- searchRipple is a stable Animated.Value ref

  // Banner pulse animation
  useEffect(() => {
    if (!ride || isTerminal) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bannerPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(bannerPulse, { toValue: 0.8, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [ride, isTerminal]); // eslint-disable-line react-hooks/exhaustive-deps -- bannerPulse is a stable Animated.Value ref

  // SSE real-time events (route deviation alerts + join requests)
  const { lastRouteDeviation, lastRideUpdate } = useRideEvents(!!ride?.id);
  const [deviationAlert, setDeviationAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!lastRouteDeviation || lastRouteDeviation.rideId !== ride?.id) return;
    const dist = lastRouteDeviation.distanceMeters;
    setDeviationAlert(`⚠️ Driver is ${dist}m off-route. If you feel unsafe, press SOS.`);
    const t = setTimeout(() => setDeviationAlert(null), 15_000);
    return () => clearTimeout(t);
  }, [lastRouteDeviation, ride?.id]);

  // Immediately refetch join requests when SSE signals a new one
  useEffect(() => {
    if (lastRideUpdate?.step === "join_requested" && lastRideUpdate.rideId === ride?.id) {
      refetchJoinRequests();
    }
  }, [lastRideUpdate, ride?.id, refetchJoinRequests]);

  // Immediately refetch on any SSE ride-step update so the UI reacts without
  // waiting for the 8-second poll (driver accepted, arrived, started, completed…).
  useEffect(() => {
    if (!lastRideUpdate || lastRideUpdate.rideId !== ride?.id) return;
    utils.rides.getRide.invalidate({ rideId: ride.id });
  }, [lastRideUpdate, ride?.id, utils.rides.getRide]);

  // ── Shared-ride passenger match state ───────────────────────────────────────
  const [sharedMatchStatus, setSharedMatchStatus] = useState<SharedMatchStatus | null>(
    ride?.sharedMatchStatus ?? null
  );
  const [matchSecsLeft, setMatchSecsLeft] = useState(MATCH_WINDOW_SECS);
  const matchStartRef = useRef<number | null>(null);

  // Countdown timer — runs only while actively searching for a passenger match
  useEffect(() => {
    if (ride?.mode !== "share" || sharedMatchStatus !== "SEARCHING_FOR_MATCH") return;
    if (matchStartRef.current === null) matchStartRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - matchStartRef.current!) / 1000);
      const left = Math.max(0, MATCH_WINDOW_SECS - elapsed);
      setMatchSecsLeft(left);
      if (left === 0) {
        setSharedMatchStatus("MATCHED_SOLO");
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sharedMatchStatus, ride?.mode]);

  // Watch DB polling for a new passenger joining the shared ride.
  // getRide returns allPassengersList (not a raw passengerCount field), so use that.
  const prevPassengerCountRef = useRef(0);
  useEffect(() => {
    if (ride?.mode !== "share" || sharedMatchStatus !== "SEARCHING_FOR_MATCH") return;
    const allPax: any[] = (liveRideData as any)?.allPassengersList ?? [];
    const count = allPax.filter((p: any) => p.status !== "cancelled").length;
    if (count > 1) {
      setSharedMatchStatus("MATCHED_SHARED");
      if (count > prevPassengerCountRef.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    prevPassengerCountRef.current = count;
  }, [liveRideData, ride?.mode, sharedMatchStatus]);

  // Notification banner state
  const [banner, setBanner] = useState<string | null>(null);
  const prevStep = useRef(liveRideStep);
  useEffect(() => {
    if (prevStep.current === liveRideStep) return;
    prevStep.current = liveRideStep;

    switch (liveRideStep) {
      case "driver_assigned":
      case "driver_en_route":
        setBanner(`Driver ${liveDriver?.name ?? ""} is on the way!`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "driver_arrived":
        setBanner("Your driver has arrived! Head to pickup.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "ride_started":
      case "ride_in_progress":
        setBanner("Ride started -- enjoy your trip!");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "completed":
        setBanner("You've arrived at your destination!");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
    }
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [liveRideStep, liveDriver?.name]);

  // ── Wait Timer: counts down from 5 min when driver arrives ─────────────────
  const LATE_FEE_PER_MIN = 0.20; // matches driver-side paid wait rate
  const waitStartRef = useRef<number | null>(null);
  const [waitSecsLeft, setWaitSecsLeft] = useState(WAIT_GRACE_SECS);
  const [lateFeeAccrued, setLateFeeAccrued] = useState(0);
  const [overGrace, setOverGrace] = useState(false);

  useEffect(() => {
    if (liveRideStep !== "driver_arrived") {
      waitStartRef.current = null;
      setWaitSecsLeft(WAIT_GRACE_SECS);
      setLateFeeAccrued(0);
      setOverGrace(false);
      return;
    }
    if (waitStartRef.current === null) {
      const serverAnchor = (liveRideData as any)?.driverArrivedAt;
      waitStartRef.current = serverAnchor ? new Date(serverAnchor).getTime() : Date.now();
    }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - waitStartRef.current!) / 1000);
      const left = Math.max(0, WAIT_GRACE_SECS - elapsed);
      setWaitSecsLeft(left);
      if (left === 0) {
        setOverGrace(true);
        const overMins = Math.max(0, elapsed - WAIT_GRACE_SECS) / 60;
        setLateFeeAccrued(Math.round(overMins * LATE_FEE_PER_MIN * 100) / 100);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [liveRideStep]); // eslint-disable-line react-hooks/exhaustive-deps -- liveRideData read once on entry; in deps would restart interval every 4s poll

  // ── Auto-navigate to rating page when ride completes ─────────────────────
  const hasAutoRatedRef = useRef(false);
  useEffect(() => {
    if (!isCompleted || hasAutoRatedRef.current) return;
    hasAutoRatedRef.current = true;
    const t = setTimeout(async () => {
      try {
        await utils.rides.myRides.invalidate();
        await setActiveRide(null);
        const driverName = liveDriver?.name ?? "Driver";
        const driverId = liveDriver?.id ?? "";
        const fare = ride?.totalFare ?? 0;
        router.replace(
          `/rate-ride-v2?rideId=${encodeURIComponent(ride?.id ?? "")}&driverId=${encodeURIComponent(String(driverId))}&driverName=${encodeURIComponent(driverName)}&fare=${encodeURIComponent(String(fare))}` as Href,
        );
      } catch {
        // fallback: just go home
        router.replace("/" as Href);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [isCompleted, liveDriver?.id, liveDriver?.name, ride?.id, ride?.totalFare, router, setActiveRide, utils.rides.myRides]);

  // ── No-Show: track when driver was first assigned so we can show "Report No-Show" after 10 min
  const driverAssignedAtRef = useRef<number | null>(null);
  const [showNoShow, setShowNoShow] = useState(false);
  useEffect(() => {
    const isWaiting = ["driver_assigned", "driver_en_route"].includes(liveRideStep);
    if (isWaiting && driverAssignedAtRef.current == null) {
      driverAssignedAtRef.current = Date.now();
    }
    if (!isWaiting) {
      driverAssignedAtRef.current = null;
      setShowNoShow(false);
      return;
    }
    const elapsed = Date.now() - (driverAssignedAtRef.current ?? Date.now());
    const remaining = 10 * 60 * 1000 - elapsed;
    if (remaining <= 0) { setShowNoShow(true); return; }
    const t = setTimeout(() => setShowNoShow(true), remaining);
    return () => clearTimeout(t);
  }, [liveRideStep]);

  const handleReportNoShow = () => {
    Alert.alert(
      "Report Driver No-Show",
      "Has your driver failed to arrive? We'll cancel the ride at no charge and report this.",
      [
        { text: "Yes, Cancel & Report", style: "destructive", onPress: async () => {
          try {
            await cancelRideMutation.mutateAsync({ rideId: ride!.id });
          } catch { /* best-effort */ }
          await setActiveRide(null);
          router.replace("/" as Href);
        }},
        { text: "Wait a bit longer", style: "cancel" },
      ]
    );
  };

  const handleCancel = async () => {
    if (!ride) return;
    try {
      await cancelRideMutation.mutateAsync({ rideId: ride.id });
    } catch (e) {
      console.warn("[ActiveRide] cancelRide API error:", e);
    }
    await setActiveRide(null);
    router.replace("/" as Href);
  };

  const handleApproveJoin = async (joinRequestId: string) => {
    try {
      await approveMidJoinMut.mutateAsync({ joinRequestId });
      refetchJoinRequests();
    } catch (e: any) {
      notify.showError(e?.message ?? "Failed to approve join request.");
    }
  };

  const handleRejectJoin = async (joinRequestId: string) => {
    try {
      await rejectMidJoinMut.mutateAsync({ joinRequestId, reason: "Request declined by ride creator" });
      refetchJoinRequests();
    } catch (e: any) {
      notify.showError(e?.message ?? "Failed to decline join request.");
    }
  };

  if (!ride) {
    return (
      <View style={[styles.screenRoot, { backgroundColor: colors.background, paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}>
        <View style={[styles.emptyIcon, { backgroundColor: P + "12" }]}>
          <IconSymbol name="car.fill" size={32} color={P} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 16, fontWeight: "600", marginTop: 16 }}>No active ride</Text>
        <TouchableOpacity
          style={[styles.emptyBtn, { backgroundColor: P }]}
          onPress={() => router.replace("/" as Href)}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.screenRoot, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* ── Dynamic Color Header ─────────────────────────────────────────── */}
      <View style={[styles.dynamicHeader, { backgroundColor: stepConfig.headerColor }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.headerBackBtn}
            onPress={() => router.replace("/(tabs)" as Href)}
          >
            <IconSymbol name="chevron.left" size={18} color="#fff" />
          </TouchableOpacity>

          {/* Live ETA Display */}
          <View style={styles.headerEtaBox}>
            <IconSymbol name="clock.fill" size={14} color="#fff" />
            <Text style={styles.headerEtaText}>
              {isCompleted ? "Arrived!" : liveRideStep === "driver_arrived" ? "Waiting..." : `${eta} min`}
            </Text>
          </View>

          {/* Status pill */}
          <View style={styles.headerStatusPill}>
            <Animated.View style={[styles.headerPulse, { opacity: bannerPulse }]}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
            </Animated.View>
            <Text style={styles.headerStatusText}>
              {isCompleted ? "COMPLETE" : isCancelled ? "CANCELLED" : "LIVE"}
            </Text>
          </View>
        </View>

        {/* Status info in header */}
        <View style={styles.headerStatusRow}>
          <View style={styles.headerStatusIcon}>
            {liveRideStep === "finding_driver" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <IconSymbol name={stepConfig.icon as any} size={22} color="#fff" />
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerStatusLabel}>{stepConfig.label}</Text>
            <Text style={styles.headerStatusSub}>{stepConfig.subtitle}</Text>
          </View>
        </View>

        {/* Step Progress Indicator */}
        <View style={styles.stepProgressRow}>
          {STEP_LABELS.map((s, i) => (
            <View key={s.key} style={styles.stepItem}>
              <View style={[
                styles.stepDot,
                {
                  backgroundColor: i <= currentStepIdx ? "#fff" : "rgba(255,255,255,0.3)",
                  width: i === currentStepIdx ? 12 : 8,
                  height: i === currentStepIdx ? 12 : 8,
                  borderRadius: i === currentStepIdx ? 6 : 4,
                },
              ]}>
                {i === currentStepIdx && !isTerminal && (
                  <Animated.View style={{
                    position: "absolute",
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: "rgba(255,255,255,0.4)",
                    transform: [{ scale: pulseAnim }],
                  }} />
                )}
              </View>
              <Text style={[
                styles.stepLabel,
                { color: i <= currentStepIdx ? "#fff" : "rgba(255,255,255,0.4)" },
              ]}>
                {s.label}
              </Text>
              {i < STEP_LABELS.length - 1 && (
                <View style={[
                  styles.stepLine,
                  { backgroundColor: i < currentStepIdx ? "#fff" : "rgba(255,255,255,0.2)" },
                ]} />
              )}
            </View>
          ))}
        </View>
      </View>

      {/* ── Map Area — fills all space above the sheet ───────────────────── */}
      {(() => {
        // myPickup* is per-passenger (set for share mode joiners); for solo rides fall back
        // to the DB ride-level coords (pickupLat from ...ride spread), then stored cache.
        const pickupLat = liveRideData?.myPickupLat ?? (liveRideData as any)?.pickupLat ?? ride.pickup.lat;
        const pickupLng = liveRideData?.myPickupLng ?? (liveRideData as any)?.pickupLng ?? ride.pickup.lng;
        const pickupLabel = liveRideData?.myPickupAddress?.split(",")[0] ?? (liveRideData as any)?.pickupAddress?.split(",")[0] ?? ride.pickup.shortName ?? "Pickup";
        const dropoffLat = liveRideData?.myDropoffLat ?? (liveRideData as any)?.dropoffLat ?? ride.dropoff.lat;
        const dropoffLng = liveRideData?.myDropoffLng ?? (liveRideData as any)?.dropoffLng ?? ride.dropoff.lng;
        const dropoffLabel = liveRideData?.myDropoffAddress?.split(",")[0] ?? (liveRideData as any)?.dropoffAddress?.split(",")[0] ?? ride.dropoff.shortName ?? "Destination";
        const driverName = liveDriver?.name ?? "Driver";

        // Phase determination
        const isApproaching = ["driver_assigned", "driver_en_route"].includes(liveRideStep);
        const isArrived     = liveRideStep === "driver_arrived";
        const isInRide      = ["ride_started", "ride_in_progress", "completed"].includes(liveRideStep);

        const mapMode: "approaching" | "in_ride" = isApproaching ? "approaching" : "in_ride";

        const stopMarkers = filteredStops.map(s => ({
          lat: Number(s.lat ?? 0),
          lng: Number(s.lng ?? 0),
          stopType: s.stopType as "pickup" | "dropoff",
          passengerName: s.passengerName,
          sequence: s.sequence,
          status: s.status,
          isCurrentUser: s.passengerId === myPassengerId,
        }));

        return (
          <View style={styles.mapArea} pointerEvents="box-none">
            <DriverTrackingMapView
              /* ── Route ────────────────────────────────────────────────── */
              pickupLat={pickupLat}
              pickupLng={pickupLng}
              pickupLabel={pickupLabel}
              destLat={dropoffLat}
              destLng={dropoffLng}
              destLabel={dropoffLabel}

              /* ── Driver live dot ────────────────────────────────────────── */
              driverLat={isArrived ? pickupLat : driverLat}
              driverLng={isArrived ? pickupLng : driverLng}
              driverLabel={driverName}

              /* ── Phase ──────────────────────────────────────────────────── */
              mapMode={mapMode}
              routeStartLat={firstDriverLatRef.current}
              routeStartLng={firstDriverLngRef.current}

              durationMin={eta}
              style={{ flex: 1 }}
              stops={stopMarkers}
              bottomPadding={mapBottomPadding}
              isDashed={isDashed}
            />

            {/* Phase label overlay */}
            <View style={styles.mapPhaseBadge}>
              <View style={[styles.mapPhaseDot, {
                backgroundColor: isArrived ? A : isInRide ? G : V,
              }]} />
              <Text style={styles.mapPhaseText}>
                {isApproaching
                  ? `${driverName} is on the way`
                  : isArrived
                    ? `${driverName} has arrived — head out!`
                    : isInRide
                      ? "Ride in progress"
                      : "Finding your driver…"}
              </Text>
            </View>
          </View>
        );
      })()}

      {/* ── Draggable Bottom Sheet ───────────────────────────────────────── */}
      <Animated.View style={[styles.sheet, { height: SNAP_MAX, transform: [{ translateY: sheetTransY }], backgroundColor: colors.surface }]}>

        {/* ── Drag handle area ─────────────────────────────────────────── */}
        <View {...sheetPan.panHandlers} style={styles.sheetHandleArea}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

          {/* Compact searching indicator shown only when finding driver */}
          {liveRideStep === "finding_driver" && (
            <View style={styles.searchRow}>
              <View style={[styles.searchIconWrap, { backgroundColor: P + "15" }]}>
                <ActivityIndicator size="small" color={P} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                  Searching for a driver…
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                  Usually under 30 seconds
                </Text>
              </View>
              <View style={[styles.livePill, { backgroundColor: P + "18" }]}>
                <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: P, opacity: bannerPulse }} />
                <Text style={{ fontSize: 10, fontWeight: "700", color: P, marginLeft: 4 }}>LIVE</Text>
              </View>
            </View>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
        >
          {/* Notification Banner */}
          {banner && (
            <View style={[styles.bannerRow, { backgroundColor: stepConfig.color + "12", borderColor: stepConfig.color + "30" }]}>
              <View style={[styles.bannerDot, { backgroundColor: stepConfig.color }]} />
              <Text style={[styles.bannerText, { color: stepConfig.color }]}>{banner}</Text>
            </View>
          )}

          {/* Route Deviation Alert */}
          {deviationAlert && (
            <View style={[styles.bannerRow, { backgroundColor: "#EF444415", borderColor: "#EF444430" }]}>
              <View style={[styles.bannerDot, { backgroundColor: R }]} />
              <Text style={[styles.bannerText, { color: R }]}>{deviationAlert}</Text>
            </View>
          )}

          {/* ── Shared Ride Match Status Badge ───────────────────────────── */}
          {ride.mode === "share" && sharedMatchStatus && !isTerminal && (() => {
        const matchMins = Math.floor(matchSecsLeft / 60);
        const matchSecs = matchSecsLeft % 60;
        const timeStr   = `${matchMins}:${String(matchSecs).padStart(2, "0")}`;
        const isSearching = sharedMatchStatus === "SEARCHING_FOR_MATCH";
        const isMatched   = sharedMatchStatus === "MATCHED_SHARED";
        const isSolo      = sharedMatchStatus === "MATCHED_SOLO";

        const badgeBg     = isMatched ? G + "15" : isSolo ? colors.surface : A + "12";
        const badgeBorder = isMatched ? G + "40" : isSolo ? colors.border  : A + "35";
        const iconName    = isMatched ? "checkmark.circle.fill" : isSolo ? "person.fill" : "magnifyingglass";
        const iconColor   = isMatched ? G : isSolo ? colors.muted : A;

        return (
          <View style={[
            styles.matchBadge,
            { backgroundColor: badgeBg, borderColor: badgeBorder },
          ]}>
            {/* Left icon */}
            <View style={[styles.matchBadgeIcon, {
              backgroundColor: isMatched ? G + "20" : isSolo ? colors.background : A + "20",
            }]}>
              {isSearching ? (
                <ActivityIndicator size="small" color={A} />
              ) : (
                <IconSymbol name={iconName as any} size={18} color={iconColor} />
              )}
            </View>

            {/* Text block */}
            <View style={{ flex: 1, marginLeft: 10 }}>
              {isSearching && (
                <>
                  <Text style={[styles.matchBadgeTitle, { color: colors.foreground }]}>
                    Searching for matches…
                  </Text>
                  <Text style={[styles.matchBadgeSub, { color: colors.muted }]}>
                    Solo Fare active · {timeStr} remaining
                  </Text>
                </>
              )}
              {isMatched && (
                <>
                  <Text style={[styles.matchBadgeTitle, { color: G }]}>
                    Matched! Shared Fare Applied
                  </Text>
                  <Text style={[styles.matchBadgeSub, { color: colors.muted }]}>
                    Your fare has been split with a verified rider
                  </Text>
                </>
              )}
              {isSolo && (
                <>
                  <Text style={[styles.matchBadgeTitle, { color: colors.foreground }]}>
                    Solo Fare Active (no match found)
                  </Text>
                  <Text style={[styles.matchBadgeSub, { color: colors.muted }]}>
                    Match window expired · original fare applies
                  </Text>
                </>
              )}
            </View>

            {/* Right fare indicator */}
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 10, fontWeight: "600", color: colors.muted, marginBottom: 2 }}>
                {isMatched ? "SHARED" : "FARE"}
              </Text>
              <Text style={[styles.matchBadgeFare, {
                color: isMatched ? G : colors.foreground,
              }]}>
                ${ride.myFare.toFixed(2)}
              </Text>
            </View>
          </View>
        );
      })()}

          {/* ── Driver Card ────────────────────────────────────────────────── */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionCardHeader}>
            <View style={[styles.sectionIconBg, { backgroundColor: V + "15" }]}>
              <IconSymbol name="person.fill" size={16} color={V} />
            </View>
            <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>
              {liveDriver ? "Your Driver" : "Finding Driver"}
            </Text>
            {liveDriver && (
              <View style={[styles.statusPill, { backgroundColor: G + "15" }]}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: G, marginRight: 4 }} />
                <Text style={{ fontSize: 10, fontWeight: "700", color: G }}>MATCHED</Text>
              </View>
            )}
          </View>

          <View style={styles.driverInfoRow}>
            <View style={[styles.driverAvatar, { backgroundColor: liveDriver ? V : colors.border }]}>
              {liveDriver ? (
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}>
                  {liveDriver.avatar}
                </Text>
              ) : (
                <ActivityIndicator size="small" color={P} />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: liveDriver ? colors.foreground : colors.muted }}>
                {liveDriver ? liveDriver.name : "Finding your driver..."}
              </Text>
              {liveDriver ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <View style={[styles.ratingBadge, { backgroundColor: A + "15" }]}>
                      <IconSymbol name="star.fill" size={11} color={A} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: A, marginLeft: 3 }}>{liveDriver.rating}</Text>
                    </View>
                    {liveDriver.totalTrips ? (
                      <View style={[styles.tripsBadge, { backgroundColor: colors.border }]}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>{liveDriver.totalTrips} trips</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 4 }}>
                    <IconSymbol name="car.fill" size={13} color={colors.muted} />
                    <Text style={{ fontSize: 13, color: colors.muted }}>
                      {liveDriver.vehicle}
                      {liveDriver.vehicleColor ? ` (${liveDriver.vehicleColor})` : ""}
                    </Text>
                  </View>
                  {liveDriver.licensePlate && (
                    <View style={[styles.plateBadge, { backgroundColor: P + "10", borderColor: P + "20" }]}>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: P, letterSpacing: 1 }}>{liveDriver.licensePlate}</Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                  Connecting you with a nearby driver
                </Text>
              )}
            </View>
          </View>

          {/* Action Buttons Row */}
          {liveDriver && (
            <View style={styles.actionBtnRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: G + "12", borderColor: G + "30" }]}
                onPress={() => {
                  if (liveDriver.phone) {
                    Linking.openURL(`tel:${liveDriver.phone}`);
                  }
                }}
              >
                <IconSymbol name="phone.fill" size={18} color={G} />
                <Text style={[styles.actionBtnLabel, { color: G }]}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: P + "12", borderColor: P + "30" }]}
                onPress={() => router.push(`/chat-screen?rideId=${ride.id}` as Href)}
              >
                <IconSymbol name="message.fill" size={18} color={P} />
                <Text style={[styles.actionBtnLabel, { color: P }]}>Message</Text>
              </TouchableOpacity>
              {!isTerminal && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: R + "12", borderColor: R + "30" }]}
                  onPress={handleCancel}
                >
                  <IconSymbol name="xmark" size={18} color={R} />
                  <Text style={[styles.actionBtnLabel, { color: R }]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ── Route Card ─────────────────────────────────────────────────── */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionCardHeader}>
            <View style={[styles.sectionIconBg, { backgroundColor: P + "15" }]}>
              <IconSymbol name="map.fill" size={16} color={P} />
            </View>
            <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>Your Route</Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View style={{ alignItems: "center", paddingTop: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: G }} />
              <View style={{ width: 2, height: 28, backgroundColor: colors.border, marginVertical: 2 }} />
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: R }} />
            </View>
            <View style={{ flex: 1, gap: 12 }}>
              <View>
                <Text style={{ fontSize: 11, color: G, fontWeight: "700", marginBottom: 1, letterSpacing: 0.5 }}>PICKUP</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                  {(liveRideData?.myPickupAddress ?? (liveRideData as any)?.pickupAddress ?? ride.pickup.address ?? "").split(",")[0]}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>
                  {liveRideData?.myPickupAddress ?? (liveRideData as any)?.pickupAddress ?? ride.pickup.address}
                </Text>
              </View>
              <View>
                <Text style={{ fontSize: 11, color: R, fontWeight: "700", marginBottom: 1, letterSpacing: 0.5 }}>DROPOFF</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                  {(liveRideData?.myDropoffAddress ?? (liveRideData as any)?.dropoffAddress ?? ride.dropoff.address ?? "").split(",")[0]}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>
                  {liveRideData?.myDropoffAddress ?? (liveRideData as any)?.dropoffAddress ?? ride.dropoff.address}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Passenger Wait Timer (driver_arrived) ──────────────────────── */}
        {liveRideStep === "driver_arrived" && (() => {
          const pct = waitSecsLeft / WAIT_GRACE_SECS;
          const mins = Math.floor(waitSecsLeft / 60);
          const secs = waitSecsLeft % 60;
          const timeStr = `${mins}:${String(secs).padStart(2, "0")}`;
          const timerColor = overGrace ? R : waitSecsLeft < 60 ? R : waitSecsLeft < 120 ? A : G;

          return (
            <View style={[styles.waitCard, {
              backgroundColor: colors.surface,
              borderColor: timerColor + "40",
              borderWidth: 1.5,
            }]}>
              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                <View style={[styles.waitIconBg, { backgroundColor: timerColor + "15" }]}>
                  <IconSymbol name="timer" size={20} color={timerColor} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: timerColor }}>
                    {overGrace ? "Free wait expired!" : "Driver is waiting for you"}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
                    {overGrace
                      ? "Late fee is accruing — head out now!"
                      : "5 min free wait. Head to pickup now!"}
                  </Text>
                </View>
              </View>

              {/* Timer display */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                {/* Progress ring (CSS-style on web) */}
                <View style={{ width: 80, height: 80, alignItems: "center", justifyContent: "center" }}>
                  {/* Background ring */}
                  <View style={{
                    position: "absolute",
                    width: 80, height: 80, borderRadius: 40,
                    borderWidth: 6,
                    borderColor: colors.border,
                  }} />
                  {/* Progress ring — top quadrant fill using border trick */}
                  <View style={{
                    position: "absolute",
                    width: 80, height: 80, borderRadius: 40,
                    borderWidth: 6,
                    borderColor: timerColor,
                    opacity: pct,
                  }} />
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 22, fontWeight: "900", color: timerColor }}>
                      {overGrace ? "0:00" : timeStr}
                    </Text>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>
                      {overGrace ? "EXPIRED" : "REMAINING"}
                    </Text>
                  </View>
                </View>

                {/* Right side info */}
                <View style={{ flex: 1 }}>
                  {!overGrace ? (
                    <>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: G }} />
                        <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600" }}>
                          Free wait time
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: A }} />
                        <Text style={{ fontSize: 13, color: colors.muted }}>
                          ${LATE_FEE_PER_MIN.toFixed(2)}/min after expiry
                        </Text>
                      </View>
                      {/* Progress bar */}
                      <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, marginTop: 4 }}>
                        <View style={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: timerColor,
                          width: `${Math.round(pct * 100)}%` as any,
                        }} />
                      </View>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                        {Math.round(pct * 100)}% wait time remaining
                      </Text>
                    </>
                  ) : (
                    <>
                      <View style={[{
                        backgroundColor: R + "10",
                        borderRadius: 10,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: R + "30",
                      }]}>
                        <Text style={{ fontSize: 12, color: R, fontWeight: "700", marginBottom: 2 }}>
                          Late fee accrued
                        </Text>
                        <Text style={{ fontSize: 26, fontWeight: "900", color: R }}>
                          +${lateFeeAccrued.toFixed(2)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                          ${LATE_FEE_PER_MIN.toFixed(2)}/min · added to fare
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            </View>
          );
        })()}

        {/* Route Stops -- for shared rides */}
        {isSharedRide && filteredStops.length > 0 && (
          <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
            <StopsList
              stops={filteredStops}
              currentUserId={myPassengerId}
              isDriverView={false}
            />
          </View>
        )}

        {/* ── Pending Join Requests (ride creator only) ─────────────────── */}
        {isSharedRide && isRideCreator && pendingJoinRequests.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: P + "40" }]}>
            <View style={styles.sectionCardHeader}>
              <View style={[styles.sectionIconBg, { backgroundColor: P + "15" }]}>
                <IconSymbol name="person.badge.plus" size={16} color={P} />
              </View>
              <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>Join Requests</Text>
              <View style={[styles.statusPill, { backgroundColor: P + "15" }]}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: P }}>{pendingJoinRequests.length}</Text>
              </View>
            </View>
            {(pendingJoinRequests as any[]).map((req) => {
              const iDualApproval = req.creatorApproval !== null && req.creatorApproval !== undefined;
              const iAlreadyApproved = iDualApproval && req.creatorApproval === "approved";
              return (
                <View key={req.joinRequestId} style={{
                  paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border,
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: P + "20", alignItems: "center", justifyContent: "center", marginRight: 10,
                    }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: P }}>
                        {(req.passengerName ?? "?")[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{req.passengerName}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {(req.pickupAddress ?? "").split(",")[0]} → {(req.dropoffAddress ?? "").split(",")[0]}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: "#16A34A" + "15", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#16A34A" }}>${Number(req.fareShare ?? 0).toFixed(2)}</Text>
                    </View>
                  </View>
                  {iAlreadyApproved ? (
                    <View style={{ backgroundColor: "#16A34A" + "15", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <IconSymbol name="checkmark.circle.fill" size={14} color="#16A34A" />
                      <Text style={{ fontSize: 12, color: "#16A34A", fontWeight: "600" }}>You approved · Waiting for driver to confirm</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: "#16A34A", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
                        onPress={() => handleApproveJoin(req.joinRequestId)}
                        disabled={approveMidJoinMut.isPending || rejectMidJoinMut.isPending}
                      >
                        {approveMidJoinMut.isPending
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Accept</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: "#EF4444" + "15", borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "#EF4444" + "40" }}
                        onPress={() => handleRejectJoin(req.joinRequestId)}
                        disabled={approveMidJoinMut.isPending || rejectMidJoinMut.isPending}
                      >
                        {rejectMidJoinMut.isPending
                          ? <ActivityIndicator color="#EF4444" size="small" />
                          : <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 13 }}>Decline</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Co-passengers ──────────────────────────────────────────────── */}
        {isSharedRide && coPassengers.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionCardHeader}>
              <View style={[styles.sectionIconBg, { backgroundColor: T + "15" }]}>
                <IconSymbol name="person.2.fill" size={16} color={T} />
              </View>
              <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>Co-Passengers</Text>
              <View style={[styles.statusPill, { backgroundColor: T + "15" }]}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: T }}>{coPassengers.length}</Text>
              </View>
            </View>

            {coPassengers.map((p) => (
              <View key={p.passengerId} style={[styles.coPassRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.coAvatar, { backgroundColor: T + "15" }]}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: T }}>{p.avatar}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{p.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    Dropoff: {p.dropoffAddress.split(",")[0]}
                  </Text>
                </View>
                <View style={[styles.farePill, { backgroundColor: G + "12" }]}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: G }}>${p.fareShare.toFixed(2)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Safety Mode Badge (shared rides only) ─────────────────────── */}
        {isSharedRide && (() => {
          const sm = (liveRideData as any)?.safetyMode as string | null | undefined;
          const SAFETY_META: Record<string, { label: string; desc: string; icon: any; color: string }> = {
            women_drivers_only: { label: "Women Drivers", desc: "Only female drivers", icon: "shield.fill", color: "#EC4899" },
            women_companions_only: { label: "Women Riders", desc: "All passengers must be female", icon: "person.2.fill", color: "#8B5CF6" },
            women_only: { label: "Women Only", desc: "Driver + all passengers female", icon: "lock.shield.fill", color: "#6366F1" },
          };
          const meta = sm && sm !== "none" ? SAFETY_META[sm] : null;
          return (
            <View style={[styles.sectionCard, {
              backgroundColor: meta ? meta.color + "12" : colors.surface,
              borderColor: meta ? meta.color + "30" : colors.border,
              flexDirection: "row", alignItems: "center", gap: 10,
            }]}>
              <IconSymbol
                name={meta ? meta.icon : "person.2.fill"}
                size={18}
                color={meta ? meta.color : colors.muted}
              />
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: meta ? meta.color : colors.foreground }}>
                  {meta ? meta.label : "Open to All"}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                  {meta ? meta.desc : "Any rider can join this carpool"}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* ── Trip Stats Card ────────────────────────────────────────────── */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionCardHeader}>
            <View style={[styles.sectionIconBg, { backgroundColor: G + "15" }]}>
              <IconSymbol name="chart.bar.fill" size={16} color={G} />
            </View>
            <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>Trip Stats</Text>
          </View>

          <View style={styles.tripStatsRow}>
            <View style={styles.tripStatItem}>
              <View style={[styles.tripStatIcon, { backgroundColor: P + "12" }]}>
                <IconSymbol name="road.lanes" size={20} color={P} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, marginTop: 6 }}>
                {formatDistance(
                  (liveRideData as any)?.distanceKm != null ? Number((liveRideData as any).distanceKm) :
                  ride.distanceKm != null ? Number(ride.distanceKm) : null
                )}
              </Text>
            </View>

            <View style={[styles.tripStatDivider, { backgroundColor: colors.border }]} />

            <View style={styles.tripStatItem}>
              <View style={[styles.tripStatIcon, { backgroundColor: A + "12" }]}>
                <IconSymbol name="clock.fill" size={20} color={A} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, marginTop: 6 }}>
                {eta}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>min ETA</Text>
            </View>

            <View style={[styles.tripStatDivider, { backgroundColor: colors.border }]} />

            <View style={styles.tripStatItem}>
              <View style={[styles.tripStatIcon, { backgroundColor: G + "12" }]}>
                <IconSymbol name="dollarsign.circle.fill" size={20} color={G} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, marginTop: 6 }}>
                ${isViewerDriver ? driverEarnings.toFixed(2) : liveFare.toFixed(2)}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {isViewerDriver
                  ? `earnings (${coPassengers.length + 1} riders)`
                  : ride.mode === "share" ? "your share" : "fare"}
              </Text>
            </View>
          </View>
        </View>

        {!isViewerDriver && !isTerminal && (
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <DefaultPaymentMethodSummary variant="card" />
          </View>
        )}

        {/* ── Completion: auto-navigates to rating in 2.5s ───────────────── */}
        {isCompleted && (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={[styles.terminalBtn, { backgroundColor: G }]}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.terminalBtnText}>Taking you to rate your driver…</Text>
            </View>
          </View>
        )}

        {isCancelled && (
          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity
              style={[styles.terminalBtn, { backgroundColor: R }]}
              onPress={async () => {
                await setActiveRide(null);
                router.replace("/" as Href);
              }}
            >
              <IconSymbol name="xmark.circle.fill" size={22} color="#fff" />
              <Text style={styles.terminalBtnText}>Ride Cancelled -- Go Home</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isTerminal && !liveDriver && (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <TouchableOpacity
              style={[styles.cancelOutlineBtn, { borderColor: R }]}
              onPress={handleCancel}
            >
              <IconSymbol name="xmark" size={16} color={R} />
              <Text style={{ color: R, fontSize: 14, fontWeight: "600" }}>Cancel Ride</Text>
            </TouchableOpacity>
            {showNoShow && (
              <TouchableOpacity
                style={[styles.cancelOutlineBtn, { borderColor: "#F59E0B", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]}
                onPress={handleReportNoShow}
              >
                <IconSymbol name="exclamationmark.triangle.fill" size={16} color="#F59E0B" />
                <Text style={{ color: "#F59E0B", fontSize: 14, fontWeight: "600" }}>Report No-Show</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        </ScrollView>
      </Animated.View>

      {/* ── SOS Floating Button ──────────────────────────────────────────── */}
      {!isTerminal && (
        <TouchableOpacity
          style={styles.sosButton}
          onPress={() => router.push("/emergency-sos" as Href)}
        >
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>SOS</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Dynamic Header ──
  dynamicHeader: {
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerEtaBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  headerEtaText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  headerStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerPulse: {
  },
  headerStatusText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.8,
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  headerStatusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerStatusLabel: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
  },
  headerStatusSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },

  // ── Step Progress ──
  stepProgressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 4,
  },
  stepItem: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },
  stepDot: {
    marginBottom: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  stepLine: {
    position: "absolute",
    top: 4,
    left: "60%",
    right: "-40%",
    height: 2,
    borderRadius: 1,
  },

  // ── Screen root ──
  screenRoot: {
    flex: 1,
    overflow: "hidden",
  },

  // ── Map — fills all space between header and sheet ──
  mapArea: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },

  // ── Draggable sheet ──
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 16,
    overflow: "hidden",
  },
  sheetHandleArea: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    opacity: 0.4,
    marginBottom: 10,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  searchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mapPhaseBadge: {
    position: "absolute",
    bottom: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    maxWidth: "80%",
  },
  mapPhaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mapPhaseText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
  },

  // ── Banner ──
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },

  // ── Section Cards ──
  sectionCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },
  sectionIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  // ── Driver Card ──
  driverInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tripsBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  plateBadge: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  actionBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
  },
  actionBtnLabel: {
    fontSize: 13,
    fontWeight: "700",
  },

  // ── Wait Card ──
  waitCard: {
    flexDirection: "column",
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  waitIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Co-passengers ──
  coPassRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  coAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  farePill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  // ── Trip Stats ──
  tripStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tripStatItem: {
    flex: 1,
    alignItems: "center",
  },
  tripStatIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  tripStatDivider: {
    width: 1,
    height: 60,
  },

  // ── Terminal Buttons ──
  terminalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 18,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  terminalBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  cancelOutlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    gap: 8,
  },

  // ── SOS ──
  sosButton: {
    position: "absolute",
    bottom: SNAP_MIN + 16,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: R,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: R,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100,
  },

  // ── Empty State ──
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBtn: {
    marginTop: 20,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },

  // ── Shared Match Status Badge ──
  matchBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  matchBadgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  matchBadgeTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  matchBadgeSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  matchBadgeFare: {
    fontSize: 16,
    fontWeight: "800",
  },
});
