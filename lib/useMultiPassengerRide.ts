/**
 * useMultiPassengerRide
 *
 * Manages the sequential pickup/dropoff node state for shared rides.
 *
 * State ownership model
 * ─────────────────────
 * `arrivedAtCurrent` is derived EXCLUSIVELY from server state
 * (arrivalTargetPassengerId on the ride row).  We also keep a
 * `localArrivedPassengerRef` so that the moment a successful mutation
 * returns — but before the 5-second poll refetches — the boarding button
 * appears without flicker.  The useEffect clears that local ref as soon
 * as it sees the server confirm the arrival.
 *
 * This eliminates the previous "finally + useEffect fight" where the
 * polling useEffect would silently reset arrivedAtCurrent even though the
 * driver had just tapped Arrived and the mutation succeeded.
 */

import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripNode {
  id: string;
  action: "pickup" | "dropoff";
  passengerId: number;
  firstName: string;
  isLead: boolean;
  address: string;
  lat?: number;
  lng?: number;
  stopId?: number;
}

// ─── buildTripNodes ────────────────────────────────────────────────────────────

// Returns passengers sorted by their stop sequence number for a given stopType.
// Falls back to isOriginalPassenger-first when stops aren't initialized yet.
function sortedPassengersByStops(
  passengers: any[],
  stops: any[],
  stopType: "pickup" | "dropoff",
): any[] {
  const relevant = stops
    .filter((s: any) => s.stopType === stopType)
    .sort((a: any, b: any) => (a.sequence ?? 999) - (b.sequence ?? 999));

  if (relevant.length >= passengers.length) {
    const ordered = relevant
      .map((s: any) => passengers.find((p: any) => p.passengerId === s.passengerId))
      .filter(Boolean);
    // Append any passengers not yet reflected in stops (mid-ride joiner edge case).
    const seen = new Set(ordered.map((p: any) => p.passengerId));
    for (const p of passengers) {
      if (!seen.has(p.passengerId)) ordered.push(p);
    }
    return ordered;
  }

  // Stops not yet initialized — use isOriginalPassenger-first ordering.
  const lead = passengers.find((p: any) => p.isOriginalPassenger) ?? passengers[0];
  const joiners = passengers.filter((p: any) => p.passengerId !== lead.passengerId);
  return [lead, ...joiners];
}

export function buildTripNodes(passengers: any[], stops: any[]): TripNode[] {
  if (!passengers.length) return [];

  const toNode = (p: any, action: "pickup" | "dropoff"): TripNode => {
    const stop = stops.find(
      (s: any) => s.passengerId === p.passengerId && s.stopType === action,
    );
    const lat =
      stop?.lat != null
        ? Number(stop.lat)
        : action === "pickup"
          ? Number(p.pickupLat ?? 0)
          : Number(p.dropoffLat ?? 0);
    const lng =
      stop?.lng != null
        ? Number(stop.lng)
        : action === "pickup"
          ? Number(p.pickupLng ?? 0)
          : Number(p.dropoffLng ?? 0);
    return {
      id: `${action}-${p.passengerId}`,
      action,
      passengerId: p.passengerId,
      firstName: (p.name ?? "Passenger").split(" ")[0],
      isLead: !!p.isOriginalPassenger,
      address:
        stop?.address ??
        (action === "pickup" ? p.pickupAddress : p.dropoffAddress) ??
        "",
      lat: lat || undefined,
      lng: lng || undefined,
      stopId: stop?.id,
    };
  };

  const pickupOrder = sortedPassengersByStops(passengers, stops, "pickup");
  const dropoffOrder = sortedPassengersByStops(passengers, stops, "dropoff");

  return [
    ...pickupOrder.map((p: any) => toNode(p, "pickup")),
    ...dropoffOrder.map((p: any) => toNode(p, "dropoff")),
  ];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseMultiPassengerRideOptions {
  activeRideId: string | null;
  activeRideData: any;
  rideStops: any[];
  session: any;
  refetchSession: () => Promise<unknown>;
  refetchStops: () => Promise<unknown>;
  onError: (title: string, message?: string) => void;
  onCompleteRide: () => void;
}

export function useMultiPassengerRide({
  activeRideId,
  activeRideData,
  rideStops,
  session,
  refetchSession,
  refetchStops,
  onError,
  onCompleteRide,
}: UseMultiPassengerRideOptions) {
  const utils = trpc.useUtils();

  const [activeNodeIndex, setActiveNodeIndex] = useState(0);
  const [arrivedAtCurrent, setArrivedAtCurrent] = useState(false);

  // Tracks which passenger the driver locally confirmed arrival for so the
  // useEffect doesn't reset arrivedAtCurrent before the server poll catches up.
  const localArrivedPassengerRef = useRef<number | null>(null);
  // Prevents the sync effect from running backwards when switching rides.
  const nodeRideRef = useRef<string | null>(null);

  const onCompleteRef = useLatestRef(onCompleteRide);
  const onErrorRef = useLatestRef(onError);

  const arriveMut = trpc.driver.arriveAtPickup.useMutation();
  const arrivedForPassengerMut = trpc.driver.arrivedForPassenger.useMutation();
  const startMut = trpc.driver.startRide.useMutation();
  const confirmBoardedMut = trpc.driver.confirmBoarded.useMutation();
  const markStopReachedMut = trpc.driver.markStopReached.useMutation();

  // ── Derived data ────────────────────────────────────────────────────────────

  const isSharedRide = activeRideData?.mode === "share";
  const allPax: any[] = (activeRideData as any)?.allPassengersList ?? [];
  const tripNodes =
    isSharedRide && allPax.length > 1
      ? buildTripNodes(allPax, rideStops)
      : [];
  const currentNode = tripNodes[activeNodeIndex] ?? null;
  const isLastTripNode = activeNodeIndex === tripNodes.length - 1;

  const isBusy =
    arriveMut.isPending ||
    arrivedForPassengerMut.isPending ||
    startMut.isPending ||
    confirmBoardedMut.isPending ||
    markStopReachedMut.isPending;

  // ── Server-state sync ────────────────────────────────────────────────────────
  //
  // Runs whenever activeRideData refreshes (every 5 s). Uses arrivalTargetPassengerId
  // from the DB as the source of truth. The localArrivedPassengerRef bridges the gap
  // between "mutation succeeded" and "poll returned updated data" so we never show a
  // blank boarding button during that window.

  useEffect(() => {
    if (!activeRideId || !activeRideData) return;

    const isNewRide = activeRideId !== nodeRideRef.current;
    nodeRideRef.current = activeRideId;

    if (allPax.length < 2) {
      if (isNewRide) {
        setActiveNodeIndex(0);
        setArrivedAtCurrent(false);
        localArrivedPassengerRef.current = null;
      }
      return;
    }

    // Use the same stop-sequence ordering as buildTripNodes so activeNodeIndex
    // always aligns with the tripNodes array (geographic order after stops init).
    const pickupOrder = sortedPassengersByStops(allPax, rideStops, "pickup");

    // Count consecutive confirmed pickups from the front of the ordered queue.
    let confirmedPickups = 0;
    for (let i = 0; i < pickupOrder.length; i++) {
      if (pickupOrder[i]?.status === "picked_up") confirmedPickups = i + 1;
      else break;
    }

    // Never move the index backwards (driver may have advanced manually).
    setActiveNodeIndex((prev) => Math.max(isNewRide ? 0 : prev, confirmedPickups));

    const arrivalTarget: number | null =
      (activeRideData as any)?.arrivalTargetPassengerId ?? null;
    const inPickupPhase = confirmedPickups < pickupOrder.length;
    const currentPaxId: number | null =
      pickupOrder[confirmedPickups]?.passengerId ?? null;

    if (inPickupPhase && arrivalTarget != null) {
      // Server confirms arrival for current passenger — clear local bridge.
      if (arrivalTarget === currentPaxId) {
        localArrivedPassengerRef.current = null;
        setArrivedAtCurrent(true);
      } else {
        // Arrival is for a different passenger — stale or wrong; reset.
        localArrivedPassengerRef.current = null;
        setArrivedAtCurrent(false);
      }
    } else if (
      localArrivedPassengerRef.current !== null &&
      localArrivedPassengerRef.current === currentPaxId
    ) {
      // Mutation succeeded but server poll hasn't returned yet — keep arrived.
      setArrivedAtCurrent(true);
    } else {
      // No server arrival target and no local confirmation — driver is en route.
      localArrivedPassengerRef.current = null;
      setArrivedAtCurrent(false);
    }
  }, [activeRideId, activeRideData, rideStops]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleArrivedForNode = useCallback(
    async (node: TripNode) => {
      if (!session?.currentRideId) return;
      const rideId = session.currentRideId;

      try {
        if (activeNodeIndex === 0) {
          await arriveMut.mutateAsync({ rideId, passengerId: node.passengerId });
        } else {
          await arrivedForPassengerMut.mutateAsync({
            rideId,
            passengerId: node.passengerId,
            stopId: node.stopId,
          });
        }

        // Set state IMMEDIATELY after mutation — no awaits after this point so the
        // useEffect poll can never race in and reset arrivedAtCurrent before we set it.
        localArrivedPassengerRef.current = node.passengerId;
        setArrivedAtCurrent(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

        // Fire-and-forget background refetches — do NOT await.
        if (activeNodeIndex === 0) refetchSession();
        utils.rides.getRide.invalidate();
        refetchStops();
      } catch (e: any) {
        localArrivedPassengerRef.current = null;
        setArrivedAtCurrent(false);
        onErrorRef.current("Error", e?.message ?? "Failed to mark arrival");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeNodeIndex, session],
  );

  const handleStartedForNode = useCallback(
    async (node: TripNode) => {
      if (!session?.currentRideId) return;
      const rideId = session.currentRideId;
      const nextIndex = activeNodeIndex + 1;

      try {
        if (activeNodeIndex === 0) {
          await startMut.mutateAsync({ rideId, passengerId: node.passengerId });
        } else {
          await confirmBoardedMut.mutateAsync({ rideId, passengerId: node.passengerId });
        }

        // Advance state IMMEDIATELY — fire-and-forget the refetches.
        localArrivedPassengerRef.current = null;
        setArrivedAtCurrent(false);
        setActiveNodeIndex(nextIndex);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

        if (activeNodeIndex === 0) refetchSession();
        utils.rides.getRide.invalidate();
        refetchStops();
      } catch (e: any) {
        onErrorRef.current("Error", e?.message ?? "Failed to confirm boarding");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeNodeIndex, session],
  );

  const handleDropoffForNode = useCallback(
    async (node: TripNode, isLast: boolean) => {
      if (!session?.currentRideId) return;
      if (isLast) { onCompleteRef.current(); return; }
      const rideId = session.currentRideId;
      const nextIndex = activeNodeIndex + 1;

      try {
        if (node.stopId) {
          await markStopReachedMut.mutateAsync({ rideId, stopId: node.stopId });
        }
        // Advance index IMMEDIATELY, then fire-and-forget the refetch.
        setActiveNodeIndex(nextIndex);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        refetchStops();
      } catch (e: any) {
        onErrorRef.current("Error", e?.message ?? "Failed to mark dropoff");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeNodeIndex, session],
  );

  return {
    activeNodeIndex,
    arrivedAtCurrent,
    tripNodes,
    currentNode,
    isLastTripNode,
    isBusy,
    // Expose individual pending states for granular button disabling.
    isArriving: arriveMut.isPending || arrivedForPassengerMut.isPending,
    isStarting: startMut.isPending || confirmBoardedMut.isPending,
    isDropping: markStopReachedMut.isPending,
    handleArrivedForNode,
    handleStartedForNode,
    handleDropoffForNode,
  };
}
