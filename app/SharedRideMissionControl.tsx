/**
 * SharedRideMissionControl
 *
 * Driver-side sequential state machine for a 2-passenger carpool mission.
 * 6-step flow: arrive Raj → start Raj → arrive Rani → start Rani → drop closest → complete.
 *
 * Drop-off order is determined at step 3 via Haversine proximity sort so the driver
 * always takes the nearer destination first.
 *
 * Push notifications are ID-scoped: only the relevant passenger is notified per step.
 * Swipe protection guards the three irreversible "start/complete" actions.
 */

import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Linking,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { trpc } from "@/lib/trpc";

// ─── Colors ────────────────────────────────────────────────────────────────────
const EMERALD     = "#16A34A"; // "Arrived" actions
const TRUST_BLUE  = "#1E88FF"; // "Start / Complete" actions
const GRAY        = "#9CA3AF";
const RED         = "#EF4444";
const SURFACE     = "#FFFFFF";
const BG          = "#F3F4F6";
const TEXT        = "#111827";
const MUTED       = "#6B7280";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Coords { lat: number; lng: number }

interface Passenger {
  id: number;
  name: string;
  pickup: Coords & { address: string };
  dropoff: Coords & { address: string };
  pickupStopId?: number;
  dropoffStopId?: number;
}

interface TripNode {
  key: string;
  nodeType: "pickup" | "dropoff";
  passengerName: string;
  passengerId: number;
  address: string;
  coords: Coords;
  stopId?: number;
}

// ─── Haversine ─────────────────────────────────────────────────────────────────

function haversineMeters(from: Coords, to: Coords): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(from.lat), φ2 = toRad(to.lat);
  const Δφ = toRad(to.lat - from.lat);
  const Δλ = toRad(to.lng - from.lng);
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns [closer, further] based on straight-line distance from currentPos.
 * Called once at Step 3 (both passengers in car) to lock the drop-off order.
 */
function getOptimalDropoffOrder(
  currentPos: Coords,
  raj: Passenger,
  rani: Passenger,
): [Passenger, Passenger] {
  const dRaj  = haversineMeters(currentPos, raj.dropoff);
  const dRani = haversineMeters(currentPos, rani.dropoff);
  return dRaj <= dRani ? [raj, rani] : [rani, raj];
}

// ─── Node builders ─────────────────────────────────────────────────────────────

function buildInitialNodes(raj: Passenger, rani: Passenger): TripNode[] {
  return [
    {
      key: "pickup-raj",
      nodeType: "pickup",
      passengerId: raj.id,
      passengerName: raj.name,
      address: raj.pickup.address,
      coords: raj.pickup,
      stopId: raj.pickupStopId,
    },
    {
      key: "pickup-rani",
      nodeType: "pickup",
      passengerId: rani.id,
      passengerName: rani.name,
      address: rani.pickup.address,
      coords: rani.pickup,
      stopId: rani.pickupStopId,
    },
    {
      key: "dropoff-1",
      nodeType: "dropoff",
      passengerId: 0,
      passengerName: "Calculating…",
      address: "Proximity sort pending",
      coords: { lat: 0, lng: 0 },
    },
    {
      key: "dropoff-2",
      nodeType: "dropoff",
      passengerId: 0,
      passengerName: "Calculating…",
      address: "Proximity sort pending",
      coords: { lat: 0, lng: 0 },
    },
  ];
}

function resolveDropoffNodes(
  prev: TripNode[],
  closer: Passenger,
  further: Passenger,
): TripNode[] {
  return [
    prev[0]!,
    prev[1]!,
    {
      key: "dropoff-1",
      nodeType: "dropoff",
      passengerId: closer.id,
      passengerName: closer.name,
      address: closer.dropoff.address,
      coords: closer.dropoff,
      stopId: closer.dropoffStopId,
    },
    {
      key: "dropoff-2",
      nodeType: "dropoff",
      passengerId: further.id,
      passengerName: further.name,
      address: further.dropoff.address,
      coords: further.dropoff,
      stopId: further.dropoffStopId,
    },
  ];
}

// ─── State machine ─────────────────────────────────────────────────────────────

interface MachineState {
  activeStep: number; // 0–5
  nodes: TripNode[];
  error: string | null;
}

type Action =
  | { type: "ADVANCE" }
  | { type: "SET_DROPOFFS"; nodes: TripNode[] }
  | { type: "SET_ERROR"; msg: string }
  | { type: "CLEAR_ERROR" };

function reducer(state: MachineState, action: Action): MachineState {
  switch (action.type) {
    case "ADVANCE":
      return { ...state, activeStep: state.activeStep + 1, error: null };
    case "SET_DROPOFFS":
      return { ...state, nodes: action.nodes };
    case "SET_ERROR":
      return { ...state, error: action.msg };
    case "CLEAR_ERROR":
      return { ...state, error: null };
  }
}

// ─── Step config ───────────────────────────────────────────────────────────────
// nodeIndex: which element in `nodes[]` is the current focus for this step.

interface StepConfig {
  header: string;
  getButtonLabel: (nodes: TripNode[]) => string;
  color: string;  // EMERALD for "Arrived", TRUST_BLUE for "Start/Complete"
  useSwipe: boolean;
  nodeIndex: number;
}

const STEPS: StepConfig[] = [
  {
    header: "Heading to Pickup: Raj",
    getButtonLabel: () => "Arrived for Raj",
    color: EMERALD,
    useSwipe: false,
    nodeIndex: 0,
  },
  {
    header: "Raj is boarding — Ready to depart",
    getButtonLabel: () => "Start Raj's Ride",
    color: TRUST_BLUE,
    useSwipe: true,
    nodeIndex: 0,
  },
  {
    header: "Heading to Pickup: Rani",
    getButtonLabel: () => "Arrived for Rani",
    color: EMERALD,
    useSwipe: false,
    nodeIndex: 1,
  },
  {
    header: "Rani is boarding — Sorting drop-offs",
    getButtonLabel: () => "Start Rani's Ride",
    color: TRUST_BLUE,
    useSwipe: true,
    nodeIndex: 1,
  },
  {
    header: "Heading to First Drop-off",
    getButtonLabel: (nodes) => `Complete Drop-off for ${nodes[2]?.passengerName ?? "Passenger"}`,
    color: EMERALD,
    useSwipe: false,
    nodeIndex: 2,
  },
  {
    header: "Almost there — Last Drop-off",
    getButtonLabel: (nodes) => `Complete Drop-off for ${nodes[3]?.passengerName ?? "Passenger"}`,
    color: TRUST_BLUE,
    useSwipe: true,
    nodeIndex: 3,
  },
];

// ─── SwipeButton ───────────────────────────────────────────────────────────────
// Prevents accidental taps on irreversible "Start Ride" and "Complete Trip" actions.

function SwipeButton({
  label,
  color,
  onComplete,
  disabled,
  isLoading,
}: {
  label: string;
  color: string;
  onComplete: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  const TRACK_W  = Dimensions.get("window").width - 80;
  const THUMB    = 56;
  const MAX_DRAG = TRACK_W - THUMB - 8;
  const tx       = useRef(new Animated.Value(0)).current;
  const locked   = useRef(false);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled && !isLoading,
      onMoveShouldSetPanResponder:  () => !disabled && !isLoading,
      onPanResponderMove: (_: any, g: any) =>
        tx.setValue(Math.max(0, Math.min(g.dx, MAX_DRAG))),
      onPanResponderRelease: (_: any, g: any) => {
        if (g.dx > MAX_DRAG * 0.75 && !locked.current) {
          locked.current = true;
          Animated.spring(tx, { toValue: MAX_DRAG, useNativeDriver: true }).start(() => {
            onComplete();
            setTimeout(() => {
              locked.current = false;
              Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
            }, 1200);
          });
        } else {
          Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <View
      style={[
        s.swipeTrack,
        { backgroundColor: color + "1A", borderColor: color + "40", opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={[s.swipeHint, { color }]}>{label}</Text>
      <Animated.View
        {...pan.panHandlers}
        style={[s.swipeThumb, { backgroundColor: color, transform: [{ translateX: tx }] }]}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>›</Text>
        )}
      </Animated.View>
    </View>
  );
}

// ─── ManifestTimeline (read-only) ──────────────────────────────────────────────
// Visual-only FlatList — no interactive buttons inside.

// Which step index marks a node as "done" (i.e. the driver has COMPLETED it)
const NODE_DONE_AFTER_STEP = [1, 3, 4, 5]; // node 0 done after step 1, etc.
// Which node is "active" per step
const ACTIVE_NODE_FOR_STEP = [0, 0, 1, 1, 2, 3];

function ManifestTimeline({
  nodes,
  activeStep,
}: {
  nodes: TripNode[];
  activeStep: number;
}) {
  const activeNodeIndex = ACTIVE_NODE_FOR_STEP[activeStep] ?? 0;

  return (
    <FlatList
      data={nodes}
      keyExtractor={(item: TripNode) => item.key}
      scrollEnabled={false}
      renderItem={({ item, index }: { item: TripNode; index: number }) => {
        const doneThreshold = NODE_DONE_AFTER_STEP[index] ?? 99;
        const isCompleted   = activeStep > doneThreshold;
        const isCurrent     = index === activeNodeIndex && !isCompleted;
        const isPending     = !isCompleted && !isCurrent;
        const isLast        = index === nodes.length - 1;
        const accent        = isCompleted ? EMERALD : isCurrent ? TRUST_BLUE : GRAY;

        return (
          <View style={{ flexDirection: "row" }}>
            {/* Vertical timeline */}
            <View style={{ width: 30, alignItems: "center" }}>
              {index > 0 && (
                <View
                  style={{
                    width: 2,
                    height: 14,
                    backgroundColor: index <= activeNodeIndex ? EMERALD : GRAY + "40",
                  }}
                />
              )}
              <View
                style={[
                  s.timelineDot,
                  {
                    backgroundColor: isCompleted ? EMERALD : "transparent",
                    borderColor: accent,
                    borderWidth: isCompleted ? 0 : 2,
                  },
                ]}
              >
                {isCompleted && (
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>✓</Text>
                )}
                {isCurrent && (
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: TRUST_BLUE }} />
                )}
                {isPending && (
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: GRAY + "60" }} />
                )}
              </View>
              {!isLast && (
                <View
                  style={{
                    width: 2,
                    height: 14,
                    backgroundColor: isCompleted ? EMERALD : GRAY + "40",
                  }}
                />
              )}
            </View>

            {/* Content — strictly informational, no action buttons */}
            <View
              style={{
                flex: 1,
                paddingLeft: 12,
                paddingBottom: isLast ? 0 : 14,
                justifyContent: "center",
                opacity: isPending ? 0.4 : 1,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <View style={{ backgroundColor: accent + "20", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: accent, letterSpacing: 0.5 }}>
                    {item.nodeType.toUpperCase()}
                  </Text>
                </View>
                {isCurrent && (
                  <View style={{ backgroundColor: TRUST_BLUE + "15", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 9, fontWeight: "800", color: TRUST_BLUE }}>NOW</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: isCompleted ? EMERALD : TEXT }}>
                {item.passengerName}
              </Text>
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 1 }} numberOfLines={1}>
                {item.address}
              </Text>
            </View>
          </View>
        );
      }}
    />
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function SharedRideMissionControl() {
  const router = useRouter();

  // Navigation params — all data passed when pushing this screen onto the stack.
  // Defaults match the spec scenario (Raj @ Jersey City, Rani @ Indian Square, Princeton dropoffs).
  const p = useLocalSearchParams<{
    rideId:            string;
    rajId:             string;
    rajName:           string;
    rajPickupLat:      string; rajPickupLng:      string; rajPickupAddr:      string;
    rajDropoffLat:     string; rajDropoffLng:     string; rajDropoffAddr:     string;
    rajPickupStopId:   string; rajDropoffStopId:  string;
    raniId:            string;
    raniName:          string;
    raniPickupLat:     string; raniPickupLng:     string; raniPickupAddr:     string;
    raniDropoffLat:    string; raniDropoffLng:    string; raniDropoffAddr:    string;
    raniPickupStopId:  string; raniDropoffStopId: string;
  }>();

  const raj: Passenger = {
    id:   Number(p.rajId  ?? 1),
    name: p.rajName  ?? "Raj",
    pickup:  {
      lat:     Number(p.rajPickupLat  ?? 40.7178),
      lng:     Number(p.rajPickupLng  ?? -74.0431),
      address: p.rajPickupAddr  ?? "Jersey City, NJ",
    },
    dropoff: {
      lat:     Number(p.rajDropoffLat  ?? 40.3573),
      lng:     Number(p.rajDropoffLng  ?? -74.6672),
      address: p.rajDropoffAddr  ?? "Princeton, NJ",
    },
    pickupStopId:   p.rajPickupStopId  ? Number(p.rajPickupStopId)  : undefined,
    dropoffStopId:  p.rajDropoffStopId ? Number(p.rajDropoffStopId) : undefined,
  };

  const rani: Passenger = {
    id:   Number(p.raniId  ?? 2),
    name: p.raniName  ?? "Rani",
    pickup:  {
      lat:     Number(p.raniPickupLat  ?? 40.7282),
      lng:     Number(p.raniPickupLng  ?? -74.0776),
      address: p.raniPickupAddr  ?? "Indian Square, NJ",
    },
    dropoff: {
      lat:     Number(p.raniDropoffLat  ?? 40.3573),
      lng:     Number(p.raniDropoffLng  ?? -74.6672),
      address: p.raniDropoffAddr  ?? "Princeton, NJ",
    },
    pickupStopId:   p.raniPickupStopId  ? Number(p.raniPickupStopId)  : undefined,
    dropoffStopId:  p.raniDropoffStopId ? Number(p.raniDropoffStopId) : undefined,
  };

  const rideId = p.rideId ?? "";

  // ── State machine ──────────────────────────────────────────────────────────

  const [state, dispatch] = useReducer(reducer, {
    activeStep: 0,
    nodes: buildInitialNodes(raj, rani),
    error: null,
  });

  const [isBusy, setIsBusy]         = useState(false);
  const [currentPos, setCurrentPos] = useState<Coords | null>(null);

  // ── tRPC mutations ─────────────────────────────────────────────────────────

  const arriveMut    = trpc.driver.arriveAtPickup.useMutation();
  const startMut     = trpc.driver.startRide.useMutation();
  const arrivedForMut= trpc.driver.arrivedForPassenger.useMutation();
  const boardedMut   = trpc.driver.confirmBoarded.useMutation();
  const finalizeDropoffMut = trpc.driver.finalizePassengerDropoff.useMutation();
  const completeMut        = trpc.driver.completeRide.useMutation();

  // ── GPS (for proximity sort) ───────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCurrentPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        // GPS failure is non-fatal; proximity sort falls back to Raj's pickup coords
      }
    })();
  }, []);

  // ── handleNavigation ──────────────────────────────────────────────────────
  // Opens the native map for the CURRENT active node only.

  function handleNavigation(coords: Coords, label: string) {
    const { lat, lng } = coords;
    const q   = encodeURIComponent(label);
    const url = Platform.select({
      ios:     `maps:0,0?q=${q}@${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${q}`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    }) ?? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  }

  // ── Primary action ─────────────────────────────────────────────────────────

  async function handlePrimaryAction() {
    if (!rideId || isBusy) return;
    setIsBusy(true);
    dispatch({ type: "CLEAR_ERROR" });

    try {
      switch (state.activeStep) {
        // ── Step 0: Arrived for Raj ─────────────────────────────────────────
        // Server sends "Driver is outside!" push only to Raj's device.
        case 0:
          await arriveMut.mutateAsync({ rideId, passengerId: raj.id });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          dispatch({ type: "ADVANCE" });
          break;

        // ── Step 1: Start Raj's Ride (SwipeButton) ─────────────────────────
        // Map context shifts to Indian Square (Rani's pickup) after this step.
        case 1:
          await startMut.mutateAsync({ rideId, passengerId: raj.id });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          dispatch({ type: "ADVANCE" });
          break;

        // ── Step 2: Arrived for Rani ────────────────────────────────────────
        // Server sends push ONLY to Rani. Raj receives nothing.
        case 2:
          await arrivedForMut.mutateAsync({
            rideId,
            passengerId: rani.id,
            stopId: rani.pickupStopId,
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          dispatch({ type: "ADVANCE" });
          break;

        // ── Step 3: Start Rani's Ride (SwipeButton) ─────────────────────────
        // Both passengers are now aboard — run Haversine proximity sort and
        // update the final two nodes before advancing to Step 4.
        case 3: {
          await boardedMut.mutateAsync({ rideId, passengerId: rani.id });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          const origin: Coords = currentPos ?? raj.pickup; // GPS fallback
          const [closer, further] = getOptimalDropoffOrder(origin, raj, rani);
          dispatch({
            type: "SET_DROPOFFS",
            nodes: resolveDropoffNodes(state.nodes, closer, further),
          });
          dispatch({ type: "ADVANCE" });
          break;
        }

        // ── Step 4: Segment completion — drop off closest passenger ────────
        // finalizePassengerDropoff marks them as dropped_off, pushes an SSE event
        // so their app transitions to RATING immediately (no poll wait),
        // and sends them a ride_completed notification.
        // The driver's session stays open — Rani is still in the car.
        case 4: {
          const dropoffNode = state.nodes[2];
          if (!dropoffNode?.passengerId) break;
          await finalizeDropoffMut.mutateAsync({
            rideId,
            passengerId: dropoffNode.passengerId,
          });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          dispatch({ type: "ADVANCE" });
          break;
        }

        // ── Step 5: Trip completion — drop off second passenger (SwipeButton) ─
        // finalizePassengerDropoff closes the second passenger's segment first,
        // then completeRide closes the driver's session and credits earnings.
        case 5: {
          const lastNode = state.nodes[3];
          if (lastNode?.passengerId) {
            await finalizeDropoffMut.mutateAsync({
              rideId,
              passengerId: lastNode.passengerId,
            });
          }
          await completeMut.mutateAsync({ rideId });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace("/(tabs)" as Href);
          break;
        }
      }
    } catch (e: unknown) {
      // State does NOT advance on network failure — driver can retry safely.
      const msg = e instanceof Error ? e.message : "Action failed. Please try again.";
      dispatch({ type: "SET_ERROR", msg });
    } finally {
      setIsBusy(false);
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const stepCfg      = STEPS[state.activeStep];
  const currentNode  = state.nodes[stepCfg?.nodeIndex ?? 0];

  if (!stepCfg || !currentNode) return null;

  const btnLabel = stepCfg.getButtonLabel(state.nodes);
  const color    = stepCfg.color;

  return (
    <SafeAreaView style={s.safe}>
      {/* ── Persistent status header ────────────────────────────────────── */}
      <View style={[s.header, { borderBottomColor: color + "30" }]}>
        <View style={[s.headerPulse, { backgroundColor: color }]} />
        <Text style={s.headerGoal} numberOfLines={1}>{stepCfg.header}</Text>
        <View style={s.stepPill}>
          <Text style={s.stepPillText}>{state.activeStep + 1}/6</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Focus Card ─────────────────────────────────────────────────── */}
        <View style={s.focusCard}>
          {/* Passenger identity + navigate button */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={[s.avatar, { backgroundColor: color + "1A" }]}>
              <Text style={[s.avatarInitial, { color }]}>
                {currentNode.passengerName[0] ?? "?"}
              </Text>
            </View>

            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.passengerName}>{currentNode.passengerName}</Text>
              <Text style={s.passengerAddr} numberOfLines={2}>{currentNode.address}</Text>
            </View>

            <TouchableOpacity
              style={[s.navButton, { borderColor: TRUST_BLUE + "40" }]}
              onPress={() => handleNavigation(currentNode.coords, currentNode.address)}
              activeOpacity={0.75}
            >
              <Text style={{ fontSize: 20 }}>🗺</Text>
              <Text style={[s.navButtonLabel, { color: TRUST_BLUE }]}>Navigate</Text>
            </TouchableOpacity>
          </View>

          {/* Error banner — shown only when last action failed */}
          {state.error != null && (
            <View style={s.errorBanner}>
              <Text style={s.errorText}>⚠ {state.error}</Text>
            </View>
          )}

          {/* Primary CTA — SwipeButton for irreversible actions, large tap for arrived */}
          <View style={{ marginTop: 22 }}>
            {stepCfg.useSwipe ? (
              <SwipeButton
                label={`Swipe to ${btnLabel}`}
                color={color}
                onComplete={handlePrimaryAction}
                disabled={isBusy}
                isLoading={isBusy}
              />
            ) : (
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: color, opacity: isBusy ? 0.65 : 1 }]}
                onPress={handlePrimaryAction}
                disabled={isBusy}
                activeOpacity={0.85}
              >
                {isBusy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.primaryBtnLabel}>{btnLabel}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Trip Manifest (read-only) ───────────────────────────────────── */}
        <View style={s.manifestCard}>
          <Text style={s.manifestHeader}>TRIP MANIFEST</Text>
          <ManifestTimeline nodes={state.nodes} activeStep={state.activeStep} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  headerPulse: { width: 10, height: 10, borderRadius: 5 },
  headerGoal:  { flex: 1, fontSize: 16, fontWeight: "700", color: TEXT },
  stepPill:    { backgroundColor: "#E5E7EB", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  stepPillText:{ fontSize: 12, fontWeight: "700", color: MUTED },

  scroll: { padding: 16, paddingBottom: 48, gap: 16 },

  // Focus Card
  focusCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 5,
  },
  avatar: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { fontSize: 24, fontWeight: "800" },
  passengerName: { fontSize: 18, fontWeight: "700", color: TEXT },
  passengerAddr: { fontSize: 13, color: MUTED, marginTop: 2 },

  navButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    backgroundColor: TRUST_BLUE + "08",
  },
  navButtonLabel: { fontSize: 11, fontWeight: "700" },

  errorBanner: {
    backgroundColor: RED + "10",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: RED + "30",
  },
  errorText: { fontSize: 13, color: RED, fontWeight: "600" },

  primaryBtn: {
    borderRadius: 18,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryBtnLabel: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: 0.4 },

  swipeTrack: {
    height: 62,
    borderRadius: 31,
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1.5,
  },
  swipeHint: {
    position: "absolute",
    width: "100%",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  swipeThumb: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    marginLeft: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },

  // Manifest
  manifestCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  manifestHeader: {
    fontSize: 10,
    fontWeight: "800",
    color: GRAY,
    letterSpacing: 1.2,
    marginBottom: 18,
  },
  timelineDot: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
});
