import BrandedBackButton from '@/components/BrandedBackButton';
import { useDriverStore, useRideStore, useToastStore, type AcceptedRide } from '@/lib/stores';
import { formatDistance, formatCountdown } from '@/lib/utils';
import DriverTrackingMapView from '@/components/DriverTrackingMapView';
import { useDriverTracking } from '@/lib/useDriverTracking';
import { useMultiPassengerRide } from '@/lib/useMultiPassengerRide';
import { useNavigationEngine } from '@/lib/useNavigationEngine';
import { useVoiceNavigation } from '@/lib/useVoiceNavigation';
import { trpc } from '@/lib/trpc';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  bg: '#0A0A0A', surface: '#141414', surface2: '#1A1A1A', border: '#1E1E1E',
  green: '#22C55E', greenDim: '#0D2818', greenBorder: '#1A4029',
  red: '#EF4444', redDim: '#2A0A0A',
  orange: '#F97316', orangeDim: '#2A1400',
  blue: '#3B82F6', blueDim: '#0D1A40',
  purple: '#8B5CF6', purpleDim: '#1A0A2A',
  yellow: '#F59E0B',
  white: '#FFFFFF', text: '#F9FAFB', textSub: '#9CA3AF', textMuted: '#6B7280',
};

const FREE_WAIT_SECS = 300;        // 5 min free wait — matches passenger screen
const PAID_RATE_PER_MIN = 0.20;
const NOSHOW_SECS = 600;           // 10 min no-show threshold
const DRIVER_PLATFORM_SHARE = 0.80; // driver keeps 80% of fare

type RideStep =
  | 'finding_driver' | 'driver_assigned' | 'driver_en_route'
  | 'driver_arrived' | 'ride_started' | 'ride_in_progress'
  | 'completed' | 'cancelled';

function getTimelineActiveIdx(step: RideStep): number {
  if (step === 'driver_en_route' || step === 'driver_assigned') return 1;
  if (step === 'driver_arrived') return 2;
  if (step === 'ride_started') return 3;
  if (step === 'ride_in_progress') return 4;
  if (step === 'completed') return 5;
  return 0;
}

function formatTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function fmtDistM(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function turnIcon(type: string): string {
  const map: Record<string, string> = {
    'turn-right': '↱', 'turn-left': '↰', 'slight-right': '⬈',
    'slight-left': '⬉', 'uturn': '↩', 'roundabout': '↻',
    'arrive': '⬤', 'depart': '▲', 'continue': '↑', 'merge': '↗',
  };
  return map[type] ?? '↑';
}

const H_STEPS = [
  { key: 'accepted',  label: 'Accepted',        icon: 'checkmark-circle-outline' as const },
  { key: 'en_route',  label: 'En Route to\nPickup', icon: 'car-outline' as const },
  { key: 'arrived',   label: 'Arrived at\nPickup',  icon: 'person-outline' as const },
  { key: 'onboard',   label: 'Passenger\nOnboard',  icon: 'person-add-outline' as const },
  { key: 'progress',  label: 'Trip in\nProgress',   icon: 'speedometer-outline' as const },
  { key: 'completed', label: 'Completed',           icon: 'flag-outline' as const },
];

export default function RideDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const show = useToastStore((s) => s.show);
  const patchSession = useDriverStore((s) => s.patchSession);

  const acceptedRides = useRideStore((s) => s.acceptedRides);
  const patchRide = useRideStore((s) => s.patchRide);
  const removeAcceptedRide = useRideStore((s) => s.removeAcceptedRide);
  const rideFromStore = acceptedRides.find((r) => r.rideId === rideId);

  const { data: fetchedRide, isLoading: isFetchingRide, refetch: refetchLiveRide } = trpc.rides.getRide.useQuery(
    { rideId },
    { enabled: !!rideId, refetchInterval: 12_000, staleTime: 8_000 },
  );

  const { data: rideStopsData, refetch: refetchStops } = trpc.driver.getRideStops.useQuery(
    { rideId },
    { enabled: !!rideId, refetchInterval: 15_000, staleTime: 10_000 },
  );
  const rideStops = rideStopsData ?? [];

  const ride: AcceptedRide | null = rideFromStore
    ?? (fetchedRide ? {
      rideId: fetchedRide.rideId,
      passengerName: (fetchedRide as any).passengerInfo?.name ?? (fetchedRide as any).allPassengersList?.[0]?.name ?? 'Passenger',
      passengerRating: undefined,
      isVerified: false,
      pickupAddress: fetchedRide.pickupAddress ?? '',
      dropoffAddress: fetchedRide.dropoffAddress ?? '',
      offerPrice: Number((fetchedRide as any).totalFare ?? 0),
      passengerCount: (fetchedRide as any).totalSeats ?? 1,
      distanceKm: fetchedRide.distanceKm != null ? Number(fetchedRide.distanceKm) : null,
      estimatedMinutes: (fetchedRide as any).estimatedMinutes ?? null,
      createdAt: fetchedRide.createdAt instanceof Date ? fetchedRide.createdAt.toISOString() : String(fetchedRide.createdAt ?? new Date()),
      status: (fetchedRide.status === 'in_progress' || fetchedRide.rideStep === 'ride_in_progress') ? 'active' : 'upcoming',
      rideStep: (fetchedRide.rideStep as RideStep) ?? 'driver_en_route',
      scheduledAt: (fetchedRide as any).departureTime ? new Date((fetchedRide as any).departureTime).toISOString() : undefined,
      paymentMethod: undefined,
      distanceAwayKm: 0,
    } : null);

  const [currentStep, setCurrentStep] = useState<RideStep>((ride?.rideStep as RideStep) ?? 'driver_en_route');

  const allPax: any[] = (fetchedRide as any)?.allPassengersList ?? [];
  const isSharedMulti = (fetchedRide as any)?.mode === 'share' && allPax.length > 1;

  useEffect(() => {
    if (fetchedRide?.rideStep) setCurrentStep(fetchedRide.rideStep as RideStep);
  }, [fetchedRide?.rideStep]);

  const [acting, setActing] = useState(false);
  const [confirmModal, setConfirmModal] = useState<'cancel' | 'complete' | 'noshow' | null>(null);
  const [passengerOnboard, setPassengerOnboard] = useState(false);
  const [arrivedAt, setArrivedAt] = useState<Date | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [tripStartedAt, setTripStartedAt] = useState<Date | null>(null);
  const [tripSeconds, setTripSeconds] = useState(0);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showNavSheet, setShowNavSheet] = useState(false);
  const [timelineTimestamps, setTimelineTimestamps] = useState<Record<string, Date>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const driverLocation = useDriverStore((s) => s.location);

  const mapMode: 'approaching' | 'in_ride' =
    currentStep === 'ride_in_progress' || currentStep === 'ride_started' ? 'in_ride' : 'approaching';

  // Coordinates come only from server data — never hardcoded fallbacks.
  // DB decimal columns come back as strings from Drizzle; use Number() to coerce.
  const pickupLat: number | null = (fetchedRide as any)?.pickupLat != null ? Number((fetchedRide as any).pickupLat) : ((ride as any)?.pickupLat ?? null);
  const pickupLng: number | null = (fetchedRide as any)?.pickupLng != null ? Number((fetchedRide as any).pickupLng) : ((ride as any)?.pickupLng ?? null);
  // Server returns dropoffLat/dropoffLng (DB field names), not destLat/destLng.
  const destLat: number | null   = (fetchedRide as any)?.dropoffLat != null ? Number((fetchedRide as any).dropoffLat) : ((ride as any)?.destLat ?? null);
  const destLng: number | null   = (fetchedRide as any)?.dropoffLng != null ? Number((fetchedRide as any).dropoffLng) : ((ride as any)?.destLng ?? null);
  const hasPickupCoords = pickupLat != null && pickupLng != null;
  const hasDropoffCoords = destLat != null && destLng != null;
  const hasRideCoords = hasPickupCoords && hasDropoffCoords;
  // Gate map on the coords actually needed for the current phase, not all four.
  const hasCurrentNavigationTarget = mapMode === 'approaching' ? hasPickupCoords : hasDropoffCoords;

  const handleGeofence = useCallback((event: { type: string; distanceMeters: number }) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (event.type === 'pickup_arrived' && currentStep === 'driver_en_route') {
      show('You have arrived at the pickup location!', 'success');
    } else if (event.type === 'destination_arrived' && currentStep === 'ride_in_progress') {
      show('Approaching destination — prepare to complete the ride', 'info');
    }
  }, [currentStep, show]);

  const isActiveRide = !['completed', 'cancelled'].includes(currentStep);
  const { position: livePosition } = useDriverTracking({
    rideId: rideId ?? null,
    enabled: isActiveRide,
    pickupLat: pickupLat ?? 0,
    pickupLng: pickupLng ?? 0,
    destLat: destLat ?? 0,
    destLng: destLng ?? 0,
    onGeofenceEnter: hasRideCoords ? handleGeofence : undefined,
  });

  const resolvedDriverLat = livePosition?.lat ?? driverLocation?.lat ?? null;
  const resolvedDriverLng = livePosition?.lng ?? driverLocation?.lng ?? null;
  const hasDriverGPS = resolvedDriverLat != null && resolvedDriverLng != null;
  const resolvedHeading = livePosition?.heading ?? 0;
  const resolvedSpeed   = livePosition?.speed ?? 0;

  const navTarget = mapMode === 'approaching'
    ? { lat: pickupLat ?? 0, lng: pickupLng ?? 0 }
    : { lat: destLat ?? 0, lng: destLng ?? 0 };

  const navState = useNavigationEngine({
    driverLat: resolvedDriverLat ?? 0,
    driverLng: resolvedDriverLng ?? 0,
    targetLat: navTarget.lat,
    targetLng: navTarget.lng,
    speedMs: resolvedSpeed,
    enabled: isActiveRide && hasCurrentNavigationTarget && resolvedDriverLat != null,
  });

  const isNearingDest = navState.distanceToDestM < 300 && mapMode === 'in_ride';
  const navBannerActive = isActiveRide && (
    currentStep === 'driver_en_route' || currentStep === 'driver_assigned' ||
    currentStep === 'ride_in_progress' || currentStep === 'ride_started'
  );

  const displayDistM = navState.distanceToDestM > 0
    ? navState.distanceToDestM
    : (mapMode === 'approaching' ? (ride?.distanceAwayKm ?? 0) * 1000 : (ride?.distanceKm ?? 0) * 1000);
  const displayEtaSecs = navState.etaSeconds > 0
    ? navState.etaSeconds
    : (ride?.estimatedMinutes ?? 0) * 60;

  const routeMoving = resolvedSpeed > 0.5;
  useVoiceNavigation({
    enabled: navBannerActive && voiceEnabled,
    currentInstruction: navState.currentInstruction,
    isOffRoute: navState.isOffRoute,
    isRerouting: navState.isRerouting,
    isNearingDestination: isNearingDest,
    distanceToDestM: navState.distanceToDestM,
    routeStarted: routeMoving,
  });

  const passengerDistM: number | null = null; // ponytail: simulated countdown removed; no real passenger GPS available

  const [autoArrivePrompted, setAutoArrivePrompted] = useState(false);
  useEffect(() => {
    if (!autoArrivePrompted && (currentStep === 'driver_en_route' || currentStep === 'driver_assigned')
      && mapMode === 'approaching' && navState.distanceToDestM > 0 && navState.distanceToDestM < 60) {
      setAutoArrivePrompted(true);
      show('You are at the pickup! Tap "Arrived at Pickup"', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [navState.distanceToDestM, currentStep, autoArrivePrompted, mapMode, show]);

  const multiPax = useMultiPassengerRide({
    activeRideId: isSharedMulti ? rideId : null,
    activeRideData: fetchedRide ?? null,
    rideStops,
    session: { currentRideId: rideId },
    refetchSession: refetchLiveRide,
    refetchStops,
    onError: (_title, msg) => show(msg ?? _title, 'error'),
    onCompleteRide: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setConfirmModal('complete'); },
  });

  const isWaiting = isSharedMulti
    ? (multiPax.arrivedAtCurrent && multiPax.currentNode?.action === 'pickup')
    : (currentStep === 'driver_arrived' && !passengerOnboard);
  const inFreeWait = isWaiting && waitSeconds < FREE_WAIT_SECS;
  const inPaidWait = isWaiting && waitSeconds >= FREE_WAIT_SECS;
  const freeRemaining = Math.max(0, FREE_WAIT_SECS - waitSeconds);
  const paidSecs = Math.max(0, waitSeconds - FREE_WAIT_SECS);
  const waitCharges = parseFloat(((paidSecs / 60) * PAID_RATE_PER_MIN).toFixed(2));
  const noShowEligible = isWaiting && waitSeconds >= NOSHOW_SECS;
  const baseEarnings = ride?.offerPrice ?? 0;
  const totalEarnings = baseEarnings + waitCharges;

  useEffect(() => {
    if (!isWaiting) return;
    if (!arrivedAt) {
      const serverAnchor = (fetchedRide as any)?.driverArrivedAt;
      const anchor = serverAnchor ? new Date(serverAnchor) : new Date();
      setArrivedAt(anchor);
      const elapsed = Math.max(0, Math.floor((Date.now() - anchor.getTime()) / 1000));
      setWaitSeconds(elapsed);
    }
    const iv = setInterval(() => setWaitSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [isWaiting]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentStep !== 'ride_in_progress') return;
    if (!tripStartedAt) setTripStartedAt(new Date());
    const iv = setInterval(() => setTripSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const arriveAtPickup = trpc.driver.arriveAtPickup.useMutation();
  const startRide      = trpc.driver.startRide.useMutation();
  const completeRide   = trpc.driver.completeRide.useMutation();
  const cancelRide     = trpc.rides.cancelRide.useMutation();

  const isTerminal = currentStep === 'completed' || currentStep === 'cancelled';
  const activeIdx  = getTimelineActiveIdx(currentStep);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleArrived = async () => {
    if (acting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActing(true);
    try {
      await arriveAtPickup.mutateAsync({ rideId });
      setCurrentStep('driver_arrived');
      setTimelineTimestamps((t) => ({ ...t, driver_arrived: new Date() }));
      patchRide(rideId, { rideStep: 'driver_arrived' });
      show('Marked as arrived at pickup', 'success');
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : 'Action failed.', 'error');
    } finally { setActing(false); }
  };

  const handleStartRide = async () => {
    if (acting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActing(true);
    try {
      await startRide.mutateAsync({ rideId });
      setCurrentStep('ride_in_progress');
      setTripStartedAt(new Date());
      setTimelineTimestamps((t) => ({ ...t, ride_in_progress: new Date() }));
      setPassengerOnboard(false);
      patchRide(rideId, { rideStep: 'ride_in_progress', status: 'active' });
      show('Ride started!', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : 'Action failed.', 'error');
    } finally { setActing(false); }
  };

  const doCompleteRide = async () => {
    setConfirmModal(null);
    setActing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await completeRide.mutateAsync({ rideId });
      setCurrentStep('completed');
      patchRide(rideId, { rideStep: 'completed', status: 'completed' });
      patchSession({ currentRideId: null, currentRideStep: null });
      show(`Ride completed! $${(totalEarnings * DRIVER_PLATFORM_SHARE).toFixed(2)} earned`, 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => { removeAcceptedRide(rideId); router.replace('/driver/(tabs)/earnings'); }, 1500);
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : 'Failed to complete ride', 'error');
    } finally { setActing(false); }
  };

  const doCancelRide = async () => {
    setConfirmModal(null);
    setShowMoreSheet(false);
    setActing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await cancelRide.mutateAsync({ rideId });
      setCurrentStep('cancelled');
      patchRide(rideId, { rideStep: 'cancelled', status: 'cancelled' });
      show('Ride cancelled.', 'info');
      setTimeout(() => { removeAcceptedRide(rideId); router.replace('/driver/(tabs)/dashboard'); }, 1000);
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : 'Failed to cancel ride', 'error');
      setActing(false);
    }
  };

  const doNoShowCancel = async () => {
    setConfirmModal(null);
    setActing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await cancelRide.mutateAsync({ rideId });
      setCurrentStep('cancelled');
      patchRide(rideId, { rideStep: 'cancelled', status: 'cancelled' });
      patchSession({ currentRideId: null, currentRideStep: null });
      show('No-show recorded. Ride cancelled.', 'info');
      setTimeout(() => { removeAcceptedRide(rideId); router.replace('/driver/(tabs)/dashboard'); }, 1500);
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : 'Failed to cancel ride', 'error');
      setActing(false);
    }
  };

  const handleCompleteRide = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setConfirmModal('complete'); };
  const handleCancelRide   = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setConfirmModal('cancel'); };

  const handleNavigateWithApp = (app: 'yoo' | 'google' | 'apple' | 'waze') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowNavSheet(false);
    if (app === 'yoo') { show('YOO Navigation is shown on the map above', 'info'); return; }
    const lat = mapMode === 'approaching' ? pickupLat : destLat;
    const lng = mapMode === 'approaching' ? pickupLng : destLng;
    const url =
      app === 'google' ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving` :
      app === 'apple'  ? `maps://?daddr=${lat},${lng}` :
                         `waze://?ll=${lat},${lng}&navigate=yes`;
    Linking.openURL(url).catch(() => show('Could not open navigation app', 'error'));
  };

  const handleContact = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: '/driver/driver-chat', params: { rideId } }); };

  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const phone = (ride as any)?.passengerPhone ?? (fetchedRide as any)?.passengerInfo?.phone;
    if (phone) Linking.openURL(`tel:${phone}`).catch(() => show('Could not place call', 'error'));
    else router.push({ pathname: '/driver/driver-chat', params: { rideId } });
  };

  const handleShareTrip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowMoreSheet(false);
    Share.share({ message: `I'm on my way! Pickup: ${ride?.pickupAddress ?? ''} → Drop-off: ${ride?.dropoffAddress ?? ''}` })
      .catch(() => show('Could not share trip', 'error'));
  };

  // TODO: implement passenger not-found flow (contact support / mark no-show)
  const handlePassengerNotFound = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    show('Please wait for the passenger or use SOS if needed', 'info');
  };

  // ── CTA logic ──────────────────────────────────────────────────────────────
  let ctaLabel: string | null = null;
  let ctaIcon  = 'checkmark-circle';
  let ctaColor = C.orange;
  let ctaAction: (() => void) | null = null;
  let ctaLoading = acting;

  const { currentNode, arrivedAtCurrent, isLastTripNode, isBusy,
          handleArrivedForNode, handleStartedForNode, handleDropoffForNode } = multiPax;

  if (isSharedMulti) {
    ctaLoading = acting || isBusy;
    if (!currentNode) {
      ctaLabel = 'Complete Ride'; ctaIcon = 'checkmark-circle'; ctaColor = C.green; ctaAction = handleCompleteRide;
    } else if (currentNode.action === 'pickup') {
      if (!arrivedAtCurrent) {
        ctaLabel = multiPax.activeNodeIndex === 0 ? 'Arrived at Pickup' : `Arrived for ${currentNode.firstName}`;
        ctaIcon = 'location'; ctaColor = C.orange; ctaAction = () => handleArrivedForNode(currentNode);
      } else {
        ctaLabel = `Start ride for ${currentNode.firstName}`; ctaIcon = 'play-circle'; ctaColor = C.green;
        ctaAction = () => handleStartedForNode(currentNode);
      }
    } else {
      ctaLabel = isLastTripNode ? 'Complete Ride' : `Drop off ${currentNode.firstName}`;
      ctaIcon = isLastTripNode ? 'checkmark-circle' : 'flag'; ctaColor = C.green;
      ctaAction = () => handleDropoffForNode(currentNode, isLastTripNode);
    }
  } else {
    if (currentStep === 'driver_en_route' || currentStep === 'driver_assigned') {
      ctaLabel = "I'VE ARRIVED AT PICKUP"; ctaIcon = 'location'; ctaColor = C.orange; ctaAction = handleArrived;
    } else if (currentStep === 'driver_arrived' && !passengerOnboard) {
      ctaLabel = 'PASSENGER ONBOARD'; ctaIcon = 'person-add'; ctaColor = C.blue;
      ctaAction = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPassengerOnboard(true);
        setTimelineTimestamps((t) => ({ ...t, onboard: new Date() }));
        show('Passenger confirmed onboard', 'success');
      };
    } else if (currentStep === 'driver_arrived' && passengerOnboard) {
      ctaLabel = 'START TRIP'; ctaIcon = 'play-circle'; ctaColor = C.green; ctaAction = handleStartRide;
    } else if (currentStep === 'ride_in_progress') {
      ctaLabel = 'COMPLETE TRIP'; ctaIcon = 'checkmark-circle'; ctaColor = C.green; ctaAction = handleCompleteRide;
    }
  }

  // ── Loading / not-found states ─────────────────────────────────────────────
  if (!ride) {
    if (isFetchingRide) {
      return (
        <View style={[s.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
          <StatusBar style="light" />
          <ActivityIndicator color={C.green} size="large" />
          <Text style={{ color: C.textMuted, marginTop: 12, fontSize: 14 }}>Loading ride…</Text>
        </View>
      );
    }
    return (
      <View style={[s.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style="light" />
        <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
        <Text style={{ color: C.textSub, marginTop: 12, fontSize: 16 }}>Ride not found</Text>
        <BrandedBackButton onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const now      = new Date();
  const rideDate = ride.scheduledAt ? new Date(ride.scheduledAt) : now;
  const liveEtaMin = navState.etaSeconds > 0 ? Math.round(navState.etaSeconds / 60) : null;
  const speedKmh   = Math.round(resolvedSpeed * 3.6);
  const distToPickupKm = mapMode === 'approaching' && displayDistM > 0 ? displayDistM / 1000 : (ride.distanceAwayKm ?? null);
  const trafficLevel   = resolvedSpeed > 13.9 ? 'Light' : resolvedSpeed > 5.6 ? 'Moderate' : resolvedSpeed > 0.5 ? 'Heavy' : null;
  const arrivalTime    = displayEtaSecs > 0 ? new Date(Date.now() + displayEtaSecs * 1000) : null;
  const pickupNotes    = (fetchedRide as any)?.notes ?? null;
  const passengerPhone = (ride as any)?.passengerPhone ?? (fetchedRide as any)?.passengerInfo?.phone;
  const passengerInitials = (ride.passengerName ?? 'P')[0]?.toUpperCase() ?? 'P';

  // ── Status banner text ─────────────────────────────────────────────────────
  let bannerColor = C.orange;
  let bannerBg    = C.orangeDim;
  let bannerText  = '';
  let bannerSub   = '';

  if (isSharedMulti && currentNode) {
    if (currentNode.action === 'pickup') {
      if (!arrivedAtCurrent) {
        bannerColor = C.orange; bannerBg = C.orangeDim;
        bannerText = multiPax.activeNodeIndex === 0 ? 'Heading to Pickup' : `Heading to pick up ${currentNode.firstName}`;
        bannerSub  = liveEtaMin != null ? `ETA ${liveEtaMin} min${navState.isRerouting ? ' · Recalculating…' : ''}` : 'Navigating…';
      } else if (inFreeWait) {
        bannerColor = C.yellow; bannerBg = '#2A1F00';
        bannerText = `Waiting for ${currentNode.firstName}`; bannerSub = `Free wait: ${formatCountdown(freeRemaining)} remaining`;
      } else {
        bannerColor = C.red; bannerBg = C.redDim;
        bannerText = `Waiting for ${currentNode.firstName}`; bannerSub = `+$${waitCharges.toFixed(2)} accumulated`;
      }
    } else {
      bannerColor = C.green; bannerBg = C.greenDim;
      bannerText = isNearingDest ? `Approaching ${currentNode.firstName}'s drop-off` : `Heading to drop off ${currentNode.firstName}`;
      const d = navState.etaSeconds > 0 ? Math.round(navState.etaSeconds / 60) : null;
      bannerSub = d != null ? `Arriving in ${d} min · ${formatDuration(tripSeconds)} elapsed` : tripSeconds > 0 ? `${formatDuration(tripSeconds)} elapsed` : 'Heading to destination';
    }
  } else if (isSharedMulti && !currentNode && currentStep !== 'completed') {
    bannerColor = C.green; bannerBg = C.greenDim; bannerText = 'All stops complete'; bannerSub = 'Tap Complete Ride to finish';
  } else if (currentStep === 'driver_en_route' || currentStep === 'driver_assigned') {
    bannerColor = C.orange; bannerBg = C.orangeDim; bannerText = 'Heading to Pickup';
    bannerSub = liveEtaMin != null ? `ETA ${liveEtaMin} min${navState.isRerouting ? ' · Recalculating…' : ''}` : 'Navigating…';
  } else if (currentStep === 'driver_arrived' && !passengerOnboard && inFreeWait) {
    bannerColor = C.yellow; bannerBg = '#2A1F00'; bannerText = 'Waiting for Passenger'; bannerSub = `Free wait: ${formatCountdown(freeRemaining)} remaining`;
  } else if (currentStep === 'driver_arrived' && !passengerOnboard && inPaidWait) {
    bannerColor = C.red; bannerBg = C.redDim; bannerText = 'Paid Waiting'; bannerSub = `+$${waitCharges.toFixed(2)} accumulated`;
  } else if (currentStep === 'driver_arrived' && passengerOnboard) {
    bannerColor = C.blue; bannerBg = C.blueDim; bannerText = 'Passenger Confirmed'; bannerSub = 'Ready to start ride';
  } else if (currentStep === 'ride_in_progress' || currentStep === 'ride_started') {
    bannerColor = C.green; bannerBg = C.greenDim;
    bannerText = isNearingDest ? 'Approaching Destination' : 'Ride in Progress';
    const d = navState.etaSeconds > 0 ? Math.round(navState.etaSeconds / 60) : null;
    bannerSub = d != null ? `Arriving in ${d} min · ${formatDuration(tripSeconds)} elapsed` : tripSeconds > 0 ? `${formatDuration(tripSeconds)} elapsed` : 'Heading to destination';
  } else if (currentStep === 'completed') {
    bannerColor = C.green; bannerBg = C.greenDim; bannerText = 'Ride Completed'; bannerSub = `$${totalEarnings.toFixed(2)} earned`;
  }

  const showBanner = bannerText !== '';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </Pressable>
        <Text style={s.headerTitle}>Active Ride</Text>
        <Pressable onPress={() => show('Connecting to support...', 'info')} style={s.helpBtn}>
          <Ionicons name="headset-outline" size={16} color={C.green} />
          <Text style={s.helpText}>Help</Text>
        </Pressable>
      </View>

      {/* ── Status Banner ──────────────────────────────────────────────────── */}
      {showBanner && (
        <View style={[s.statusBanner, { backgroundColor: bannerBg, borderBottomColor: bannerColor + '30' }]}>
          <View style={s.statusBannerLeft}>
            <View style={[s.statusDot, { backgroundColor: bannerColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.statusBannerTitle, { color: bannerColor }]}>{bannerText}</Text>
              <Text style={s.statusBannerSub} numberOfLines={1}>
                {mapMode === 'approaching' && distToPickupKm != null
                  ? `${formatDistance(distToPickupKm)} away · ETA ${liveEtaMin ?? ride.estimatedMinutes ?? '—'} min${trafficLevel ? ` · Traffic: ${trafficLevel}` : ''}`
                  : bannerSub}
              </Text>
            </View>
          </View>
          <Pressable
            style={s.navDropBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowNavSheet(true); }}
          >
            <Ionicons name="navigate-outline" size={11} color={C.white} />
            <Text style={s.navDropBtnText}>Navigate</Text>
            <Ionicons name="chevron-down" size={11} color={C.white} />
          </Pressable>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Ride Summary Card ───────────────────────────────────────────── */}
        <View style={s.summaryCard}>
          {/* Badge + date row */}
          <View style={s.summaryTop}>
            <View style={[s.activeBadge,
              { backgroundColor: currentStep === 'cancelled' ? C.redDim : C.greenDim,
                borderColor: currentStep === 'cancelled' ? C.red + '44' : C.greenBorder }]}>
              <Text style={[s.activeBadgeText, { color: currentStep === 'cancelled' ? C.red : C.green }]}>
                {currentStep === 'ride_in_progress' ? 'IN PROGRESS' :
                 currentStep === 'completed' ? 'COMPLETED' :
                 currentStep === 'cancelled' ? 'CANCELLED' : 'ACTIVE RIDE'}
              </Text>
            </View>
            <Text style={s.summaryDate}>
              {rideDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {formatTime(rideDate)}
            </Text>
          </View>

          {/* Route + call button */}
          <View style={s.summaryRouteWrap}>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={s.addressRow}>
                <View style={[s.routeDot, { backgroundColor: C.green }]} />
                <Text style={s.addressText} numberOfLines={1}>{ride.pickupAddress}</Text>
                <View style={s.pickupBadge}><Text style={s.pickupBadgeText}>Pickup</Text></View>
              </View>
              <View style={s.routeConnector} />
              <View style={s.addressRow}>
                <View style={[s.routeDot, { backgroundColor: C.red }]} />
                <Text style={s.addressText} numberOfLines={1}>{ride.dropoffAddress}</Text>
                <View style={s.dropoffBadge}><Text style={s.dropoffBadgeText}>Dropoff</Text></View>
              </View>
            </View>
            <Pressable style={s.callCircleBtn} onPress={handleCall}>
              <Ionicons name="call" size={18} color={C.white} />
            </Pressable>
          </View>

          {/* 5-column stats */}
          <View style={s.statGrid}>
            <View style={s.statItem}>
              <Text style={s.statValue}>
                {distToPickupKm != null ? formatDistance(distToPickupKm) : formatDistance(ride.distanceAwayKm)}
              </Text>
              <Text style={s.statLabel}>TO PICKUP</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>
                {displayEtaSecs > 0 ? `${Math.round(displayEtaSecs / 60)} min` : ride.estimatedMinutes != null ? `${ride.estimatedMinutes} min` : '—'}
              </Text>
              <Text style={s.statLabel}>ETA</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{formatDistance(ride.distanceKm != null ? Number(ride.distanceKm) : null)}</Text>
              <Text style={s.statLabel}>TOTAL TRIP</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{ride.estimatedMinutes != null ? `${ride.estimatedMinutes} min` : '—'}</Text>
              <Text style={s.statLabel}>TOTAL TIME</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: C.green }]}>${totalEarnings.toFixed(2)}</Text>
              <Text style={s.statLabel}>EST. EARNINGS</Text>
            </View>
          </View>
        </View>

        {/* ── Multi-pax node progress ─────────────────────────────────────── */}
        {isSharedMulti && multiPax.tripNodes.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Shared Ride · {multiPax.tripNodes.length} Stops</Text>
            {multiPax.tripNodes.map((node, idx) => {
              const isDone    = idx < multiPax.activeNodeIndex;
              const isCurrent = idx === multiPax.activeNodeIndex;
              const nodeColor = node.action === 'pickup' ? C.orange : C.green;
              return (
                <View key={node.id} style={[s.nodeRow, idx < multiPax.tripNodes.length - 1 && s.nodeRowBorder]}>
                  <View style={[s.nodeIcon,
                    isDone    && { backgroundColor: C.greenDim },
                    isCurrent && { backgroundColor: nodeColor + '22' },
                    !isDone && !isCurrent && { backgroundColor: C.surface2 },
                  ]}>
                    <Ionicons
                      name={isDone ? 'checkmark' : node.action === 'pickup' ? 'arrow-up' : 'arrow-down'}
                      size={12}
                      color={isDone ? C.green : isCurrent ? nodeColor : C.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[s.nodeLabel,
                      isDone    && { color: C.textMuted },
                      isCurrent && { color: C.white, fontWeight: '700' },
                      !isDone && !isCurrent && { color: C.textSub },
                    ]}>
                      {node.action === 'pickup' ? 'Pick up' : 'Drop off'} {node.firstName}
                      {isCurrent && arrivedAtCurrent && node.action === 'pickup' ? ' · Arrived' : ''}
                    </Text>
                    {node.address ? <Text style={s.nodeAddress} numberOfLines={1}>{node.address}</Text> : null}
                  </View>
                  {isCurrent && !isDone && (
                    <View style={[s.nodeActivePill, { backgroundColor: nodeColor }]}>
                      <Text style={s.nodeActivePillText}>NOW</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Waiting widget ──────────────────────────────────────────────── */}
        {isWaiting && (
          <View style={[s.waitCard, inPaidWait && { borderColor: C.red + '55' }]}>
            <View style={s.waitCardHeader}>
              <View style={[s.waitBadge,
                { backgroundColor: inPaidWait ? C.redDim : '#2A1F00',
                  borderColor: inPaidWait ? C.red + '55' : C.yellow + '55' }]}>
                <Ionicons name={inPaidWait ? 'time' : 'hourglass-outline'} size={13} color={inPaidWait ? C.red : C.yellow} />
                <Text style={[s.waitBadgeText, { color: inPaidWait ? C.red : C.yellow }]}>
                  {inPaidWait ? 'PAID WAITING' : 'FREE WAITING'}
                </Text>
              </View>
              <Text style={s.waitElapsedLabel}>{formatCountdown(waitSeconds)} elapsed</Text>
            </View>
            {inFreeWait ? (
              <View style={s.waitTimerBlock}>
                <Text style={[s.waitTimerBig, { color: C.yellow }]}>{formatCountdown(freeRemaining)}</Text>
                <Text style={s.waitTimerSub}>remaining before paid wait</Text>
              </View>
            ) : (
              <View style={s.waitTimerBlock}>
                <Text style={[s.waitTimerBig, { color: C.red }]}>+${waitCharges.toFixed(2)}</Text>
                <Text style={s.waitTimerSub}>${PAID_RATE_PER_MIN.toFixed(2)}/min · {formatCountdown(paidSecs)} paid</Text>
              </View>
            )}
            {noShowEligible && (
              <Pressable style={s.noShowBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setConfirmModal('noshow'); }}>
                <Ionicons name="person-remove-outline" size={16} color={C.red} />
                <Text style={s.noShowBtnText}>Passenger No-show?</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Passenger + Pickup Notes (two-column) ──────────────────────── */}
        <View style={s.twoColRow}>
          {/* Passenger card */}
          <View style={[s.card, s.halfCard]}>
            <View style={s.paxAvatarWrap}>
              <View style={s.paxAvatar}>
                <Text style={s.paxAvatarText}>{passengerInitials}</Text>
              </View>
            </View>
            <Text style={s.paxName} numberOfLines={1}>{ride.passengerName}</Text>
            {ride.passengerRating != null ? (
              <View style={s.paxRatingRow}>
                <Ionicons name="star" size={11} color={C.yellow} />
                <Text style={s.paxRatingText}>{ride.passengerRating.toFixed(1)}</Text>
              </View>
            ) : (
              <Text style={s.paxRatingMuted}>Rating unavailable</Text>
            )}
            <View style={s.paxBadgesRow}>
              {ride.isVerified && (
                <View style={s.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={9} color={C.green} />
                  <Text style={s.verifiedBadgeText}>Verified</Text>
                </View>
              )}
              {passengerPhone != null && (
                <View style={s.phoneBadge}>
                  <Ionicons name="person-outline" size={9} color={C.purple} />
                  <Text style={s.phoneBadgeText}>Phone</Text>
                </View>
              )}
            </View>
            <View style={s.paxActionsRow}>
              <Pressable style={s.paxActionBtn} onPress={handleCall}>
                <View style={[s.paxActionIcon, { backgroundColor: C.green + '22' }]}>
                  <Ionicons name="call-outline" size={15} color={C.green} />
                </View>
                <Text style={s.paxActionLabel}>Call</Text>
              </Pressable>
              <Pressable style={s.paxActionBtn} onPress={handleContact}>
                <View style={[s.paxActionIcon, { backgroundColor: C.surface2 }]}>
                  <Ionicons name="chatbubble-outline" size={15} color={C.textSub} />
                </View>
                <Text style={s.paxActionLabel}>Message</Text>
              </Pressable>
              <Pressable style={s.paxActionBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/emergency-sos'); }}>
                <View style={[s.paxActionIcon, { backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.red + '55' }]}>
                  <Ionicons name="warning-outline" size={15} color={C.red} />
                </View>
                <Text style={[s.paxActionLabel, { color: C.red }]}>SOS</Text>
              </Pressable>
            </View>
          </View>

          {/* Pickup Notes card */}
          <View style={[s.card, s.halfCard]}>
            <View style={s.notesHeader}>
              <Ionicons name="clipboard-outline" size={13} color={C.orange} />
              <Text style={s.notesTitle}>Pickup Notes</Text>
            </View>
            {pickupNotes
              ? pickupNotes.split('\n').filter(Boolean).map((line: string, i: number) => (
                  <View key={i} style={s.notesBullet}>
                    <Text style={s.notesBulletDot}>•</Text>
                    <Text style={s.notesBulletText} numberOfLines={2}>{line}</Text>
                  </View>
                ))
              : (
                <View style={s.notesBullet}>
                  <Text style={s.notesBulletDot}>•</Text>
                  <Text style={[s.notesBulletText, { color: C.textMuted }]}>No pickup notes provided</Text>
                </View>
              )}
            <View style={s.statusDivider} />
            <View style={s.passengerStatusRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.passengerStatusLabel}>Passenger status</Text>
                {(currentStep === 'driver_en_route' || currentStep === 'driver_assigned') ? (
                  <Text style={s.passengerStatusValue} numberOfLines={1}>
                    <Text style={{ color: C.green }}>● Online</Text>
                    <Text style={{ color: C.textMuted }}> · Viewing your location</Text>
                  </Text>
                ) : currentStep === 'driver_arrived' ? (
                  <Text style={s.passengerStatusValue} numberOfLines={1}>
                    <Text style={{ color: C.green }}>● Online</Text>
                    <Text style={{ color: C.textMuted }}> · Ready for pickup</Text>
                  </Text>
                ) : (
                  <Text style={[s.passengerStatusValue, { color: C.textMuted }]}>Status unavailable</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={13} color={C.textMuted} />
            </View>
          </View>
        </View>

        {/* ── Navigation Map Card ─────────────────────────────────────────── */}
        <View style={[s.mapCard, isFullscreen && s.mapCardFullscreen]}>
          {hasDriverGPS && hasCurrentNavigationTarget ? (
            <>
              {/* Maneuver overlay (top-left) */}
              {navBannerActive && (
                <View style={s.maneuverCard} pointerEvents="none">
                  <View style={s.maneuverRow}>
                    <View style={s.maneuverIconBox}>
                      <Text style={s.maneuverIconText}>
                        {turnIcon(navState.currentInstruction?.type ?? 'continue')}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.maneuverDist}>
                        {navState.distanceToDestM > 0 ? fmtDistM(navState.distanceToDestM) : formatDistance(distToPickupKm)}
                      </Text>
                      <Text style={s.maneuverStreet} numberOfLines={1}>
                        {navState.currentInstruction?.text ?? 'Continue to pickup'}
                      </Text>
                    </View>
                  </View>
                  {navState.nextInstruction && navState.nextInstruction.distanceM > 50 && (
                    <View style={s.maneuverNextRow}>
                      <Text style={s.maneuverNextIcon}>{turnIcon(navState.nextInstruction.type)}</Text>
                      <Text style={s.maneuverNextText} numberOfLines={1}>
                        {fmtDistM(navState.nextInstruction.distanceM)} {navState.nextInstruction.text}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Speed pill (top-right) */}
              {speedKmh > 2 && (
                <View style={s.speedPill} pointerEvents="none">
                  <Text style={s.speedValue}>{speedKmh}</Text>
                  <Text style={s.speedUnit}>km/h</Text>
                </View>
              )}

              {/* Map component */}
              <DriverTrackingMapView
                pickupLat={pickupLat!}
                pickupLng={pickupLng!}
                pickupLabel={ride.pickupAddress}
                destLat={destLat ?? pickupLat!}
                destLng={destLng ?? pickupLng!}
                destLabel={ride.dropoffAddress}
                driverLat={resolvedDriverLat ?? 0}
                driverLng={resolvedDriverLng ?? 0}
                driverHeading={resolvedHeading}
                driverSpeedMs={resolvedSpeed}
                driverLabel="You"
                durationMin={Math.round(displayEtaSecs / 60) || (ride.estimatedMinutes ?? 15)}
                height={isFullscreen ? 580 : 260}
                mapMode={mapMode}
                routeStartLat={resolvedDriverLat ?? 0}
                routeStartLng={resolvedDriverLng ?? 0}
                isFullscreen={isFullscreen}
                nightMode={false}
                completedRoutePoints={navState.completedPoints}
                remainingRoutePoints={navState.remainingPoints}
                routeProgress={navState.routeProgress}
                isNearingDestination={isNearingDest}
              />

              {/* Right-side controls */}
              <View style={s.mapControlsCol}>
                <Pressable style={s.mapCtrlBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsFullscreen(f => !f); }}>
                  <Ionicons name={isFullscreen ? 'contract-outline' : 'expand-outline'} size={15} color={C.textSub} />
                </Pressable>
                <Pressable style={s.mapCtrlBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setVoiceEnabled(v => !v); }}>
                  <Ionicons name={voiceEnabled ? 'volume-high-outline' : 'volume-mute-outline'} size={15} color={voiceEnabled ? C.white : C.textMuted} />
                </Pressable>
                <Pressable style={s.mapCtrlBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); show('Recentering map…', 'info'); }}>
                  <Ionicons name="locate-outline" size={15} color={C.textSub} />
                </Pressable>
              </View>

              {/* ETA strip (bottom) */}
              <View style={s.mapEtaStrip} pointerEvents="none">
                <Text style={s.mapEtaText}>
                  {displayEtaSecs > 0 ? `${Math.round(displayEtaSecs / 60)} min` : '—'}
                  {' • '}
                  {displayDistM > 0 ? fmtDistM(displayDistM) : '—'}
                  {arrivalTime ? ` • Arrive ${formatTime(arrivalTime)}` : ''}
                </Text>
              </View>

              {/* Fullscreen header overlay */}
              {isFullscreen && (
                <View style={s.fsHeader} pointerEvents="box-none">
                  <Pressable style={s.fsCloseBtn} onPress={() => setIsFullscreen(false)}>
                    <Ionicons name="close" size={20} color={C.white} />
                  </Pressable>
                  <View style={s.fsEtaChip}>
                    <Text style={s.fsEtaText}>
                      {displayEtaSecs > 0 ? `${Math.round(displayEtaSecs / 60)} min` : '—'} · {fmtDistM(displayDistM)}
                      {arrivalTime ? ` · Arrive ${formatTime(arrivalTime)}` : ''}
                    </Text>
                  </View>
                  <View style={{ width: 40 }} />
                </View>
              )}
            </>
          ) : hasCurrentNavigationTarget && !hasDriverGPS ? (
            <View style={s.locationFallback}>
              <Ionicons name="locate-outline" size={24} color={C.textMuted} />
              <Text style={s.locationFallbackText}>Waiting for GPS…</Text>
            </View>
          ) : (
            <View style={s.locationFallback}>
              <Ionicons name="location-outline" size={24} color={C.textMuted} />
              <Text style={s.locationFallbackText}>Location unavailable</Text>
            </View>
          )}
        </View>

        {/* ── Action Bar ──────────────────────────────────────────────────── */}
        {!isTerminal && (
          <View style={s.actionBar}>
            <Pressable style={s.actionBtn} onPress={handleShareTrip}>
              <View style={[s.actionBtnIcon, { backgroundColor: C.purpleDim }]}>
                <Ionicons name="share-social-outline" size={18} color={C.purple} />
              </View>
              <Text style={s.actionBtnLabel}>Share Trip</Text>
            </Pressable>
            <Pressable style={s.actionBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowNavSheet(true); }}>
              <View style={[s.actionBtnIcon, { backgroundColor: C.blueDim }]}>
                <Ionicons name="navigate-outline" size={18} color={C.blue} />
              </View>
              <Text style={s.actionBtnLabel}>Navigate</Text>
            </Pressable>
            <Pressable style={s.actionBtn} onPress={handlePassengerNotFound}>
              <View style={[s.actionBtnIcon, { backgroundColor: C.orangeDim }]}>
                <Ionicons name="person-remove-outline" size={18} color={C.orange} />
              </View>
              <Text style={s.actionBtnLabel}>Passenger{'\n'}Not Found</Text>
            </Pressable>
            <Pressable style={s.actionBtn} onPress={handleCancelRide}>
              <View style={[s.actionBtnIcon, { backgroundColor: C.redDim }]}>
                <Ionicons name="close-circle-outline" size={18} color={C.red} />
              </View>
              <Text style={s.actionBtnLabel}>Cancel Ride</Text>
            </Pressable>
            <Pressable style={s.actionBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowMoreSheet(true); }}>
              <View style={[s.actionBtnIcon, { backgroundColor: C.surface2 }]}>
                <Ionicons name="ellipsis-horizontal" size={18} color={C.textMuted} />
              </View>
              <Text style={s.actionBtnLabel}>More</Text>
            </Pressable>
          </View>
        )}

        {/* ── Passenger Proximity Row ─────────────────────────────────────── */}
        {currentStep === 'driver_arrived' && !passengerOnboard && passengerDistM !== null && (
          <View style={[s.proxRow, { borderColor: passengerDistM < 20 ? C.green + '80' : C.border }]}>
            <View style={s.proxLeft}>
              <Ionicons name="walk-outline" size={16} color={passengerDistM < 20 ? C.green : C.orange} />
              <View>
                <Text style={s.proxTitle}>{passengerDistM < 5 ? 'Passenger has arrived!' : 'Passenger walking to pickup'}</Text>
                <Text style={s.proxSub}>{passengerDistM < 5 ? 'Confirm onboard when ready' : `${Math.round(passengerDistM)} m away · ~${Math.ceil(passengerDistM / 1.2)} sec`}</Text>
              </View>
            </View>
            <View style={[s.proxDot, { backgroundColor: passengerDistM < 20 ? C.green : C.orange }]} />
          </View>
        )}

        {/* ── Trip Progress Card ──────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.tripProgressHeader}>
            <Text style={s.cardSectionTitle}>TRIP PROGRESS</Text>
            <View style={s.waitingTimeRow}>
              <Text style={s.waitingTimeText}>Waiting time: {isWaiting ? formatCountdown(waitSeconds) : '00:00'}</Text>
              <Pressable onPress={() => show('Free wait time is 5 min. After that, $0.20/min applies.', 'info')}>
                <Ionicons name="information-circle-outline" size={13} color={C.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Horizontal step tracker */}
          <View style={s.hStepperRow}>
            {H_STEPS.map((step, idx) => {
              const isDone    = idx < activeIdx;
              const isActive  = idx === activeIdx;
              const iconName: any = isDone ? 'checkmark-circle' : step.icon;
              return (
                <React.Fragment key={step.key}>
                  <View style={s.hStep}>
                    <View style={[s.hStepCircle,
                      isDone   && { backgroundColor: C.green, borderColor: C.green },
                      isActive && { backgroundColor: C.greenDim, borderColor: C.green },
                      !isDone && !isActive && { backgroundColor: C.surface2, borderColor: C.border },
                    ]}>
                      <Ionicons
                        name={iconName}
                        size={13}
                        color={isDone ? '#000' : isActive ? C.green : C.textMuted}
                      />
                    </View>
                    <Text style={[s.hStepLabel,
                      isDone   && { color: C.green },
                      isActive && { color: C.white, fontWeight: '700' },
                      !isDone && !isActive && { color: C.textMuted },
                    ]} numberOfLines={2}>{step.label}</Text>
                    {idx === 0 && timelineTimestamps['driver_assigned'] && (
                      <Text style={s.hStepTime}>{formatTime(timelineTimestamps['driver_assigned'])}</Text>
                    )}
                  </View>
                  {idx < H_STEPS.length - 1 && (
                    <View style={[s.hStepConnector, { backgroundColor: isDone ? C.green : C.border }]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* Free wait info card */}
          <View style={s.freeWaitCard}>
            <View style={[s.freeWaitIcon, { backgroundColor: C.blueDim }]}>
              <Ionicons name="shield-outline" size={15} color={C.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.freeWaitTitle}>Free wait time: 5 min</Text>
              <Text style={s.freeWaitSub}>Extra charges apply after free wait time</Text>
            </View>
            <Pressable
              style={s.freeWaitLearnMore}
              onPress={() => show('Free wait time is 5 min. After that, $0.20/min applies.', 'info')}
            >
              <Text style={s.freeWaitLearnMoreText}>Learn more</Text>
              <Ionicons name="chevron-forward" size={12} color={C.blue} />
            </Pressable>
          </View>
        </View>

        {/* ── Live metrics strip (in_progress) ───────────────────────────── */}
        {currentStep === 'ride_in_progress' && (
          <View style={s.metricsStrip}>
            <View style={s.metricItem}>
              <Text style={s.metricValue}>{formatDuration(tripSeconds)}</Text>
              <Text style={s.metricLabel}>Trip Duration</Text>
            </View>
            <View style={s.metricDivider} />
            <View style={s.metricItem}>
              <Text style={[s.metricValue, { color: C.green }]}>${totalEarnings.toFixed(2)}</Text>
              <Text style={s.metricLabel}>Est. Earnings</Text>
            </View>
            {waitCharges > 0 && (
              <>
                <View style={s.metricDivider} />
                <View style={s.metricItem}>
                  <Text style={[s.metricValue, { color: C.orange }]}>+${waitCharges.toFixed(2)}</Text>
                  <Text style={s.metricLabel}>Wait Charges</Text>
                </View>
              </>
            )}
          </View>
        )}

        <View style={{ height: 140 }} />
      </ScrollView>

      {/* ── Confirm / No-show Modal ─────────────────────────────────────────── */}
      {confirmModal !== null && (
        <Pressable style={s.modalBackdrop} onPress={() => setConfirmModal(null)}>
          <View style={s.modalCard}>
            {confirmModal === 'noshow' ? (
              <>
                <Ionicons name="person-remove-outline" size={40} color={C.red} />
                <Text style={s.modalTitle}>Passenger No-show?</Text>
                <Text style={s.modalSub}>{"You've been waiting "}{formatCountdown(waitSeconds)}{". Cancelling with a no-show will charge the passenger a cancellation fee."}</Text>
                <View style={s.modalActions}>
                  <Pressable style={s.modalBtnNo} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setConfirmModal(null); }}>
                    <Text style={s.modalBtnNoText}>Keep Waiting</Text>
                  </Pressable>
                  <Pressable style={[s.modalBtnYes, { backgroundColor: C.red }]} onPress={doNoShowCancel}>
                    <Text style={s.modalBtnYesText}>Cancel w/ Fee</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Ionicons
                  name={confirmModal === 'complete' ? 'checkmark-circle-outline' : 'close-circle-outline'}
                  size={40}
                  color={confirmModal === 'complete' ? C.green : C.red}
                />
                <Text style={s.modalTitle}>{confirmModal === 'complete' ? 'Complete Ride?' : 'Cancel Ride?'}</Text>
                <Text style={s.modalSub}>
                  {confirmModal === 'complete'
                    ? `Confirm drop-off and earn $${(totalEarnings * DRIVER_PLATFORM_SHARE).toFixed(2)}`
                    : 'Are you sure you want to cancel this ride?'}
                </Text>
                <View style={s.modalActions}>
                  <Pressable style={s.modalBtnNo} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setConfirmModal(null); }}>
                    <Text style={s.modalBtnNoText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[s.modalBtnYes, { backgroundColor: confirmModal === 'complete' ? C.green : C.red }]}
                    onPress={confirmModal === 'complete' ? doCompleteRide : doCancelRide}
                  >
                    <Text style={s.modalBtnYesText}>{confirmModal === 'complete' ? 'Complete' : 'Cancel Ride'}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </Pressable>
      )}

      {/* ── Navigate App Sheet ──────────────────────────────────────────────── */}
      {showNavSheet && (
        <Pressable style={s.sheetBackdrop} onPress={() => setShowNavSheet(false)}>
          <View style={[s.sheetCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Open Navigation</Text>
            <Text style={s.sheetSubtitle}>
              {mapMode === 'approaching' ? 'Navigating to pickup location' : 'Navigating to drop-off location'}
            </Text>
            {([
              { app: 'yoo',    label: 'YOO Navigation', sub: 'Built-in map navigation',   icon: 'navigate-circle-outline', color: C.green  },
              { app: 'google', label: 'Google Maps',     sub: 'Open in Google Maps',       icon: 'logo-google',             color: C.blue   },
              { app: 'apple',  label: 'Apple Maps',      sub: 'Open in Apple Maps',        icon: 'map-outline',             color: C.blue   },
              { app: 'waze',   label: 'Waze',            sub: 'Open in Waze',              icon: 'car-outline',             color: C.orange },
            ] as const).map(({ app, label, sub, icon, color }) => (
              <Pressable key={app} style={s.sheetItem} onPress={() => handleNavigateWithApp(app)}>
                <View style={[s.sheetItemIcon, { backgroundColor: color + '22' }]}>
                  <Ionicons name={icon as any} size={20} color={color} />
                </View>
                <View style={s.sheetItemText}>
                  <Text style={s.sheetItemLabel}>{label}</Text>
                  <Text style={s.sheetItemSub}>{sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
              </Pressable>
            ))}
          </View>
        </Pressable>
      )}

      {/* ── More bottom sheet ───────────────────────────────────────────────── */}
      {showMoreSheet && (
        <Pressable style={s.sheetBackdrop} onPress={() => setShowMoreSheet(false)}>
          <View style={[s.sheetCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>More Options</Text>
            <Pressable style={s.sheetItem} onPress={handleShareTrip}>
              <View style={[s.sheetItemIcon, { backgroundColor: C.purple + '22' }]}>
                <Ionicons name="share-social-outline" size={20} color={C.purple} />
              </View>
              <View style={s.sheetItemText}>
                <Text style={s.sheetItemLabel}>Share Trip</Text>
                <Text style={s.sheetItemSub}>Let someone know your route</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </Pressable>
            <Pressable style={s.sheetItem} onPress={() => { setShowMoreSheet(false); router.push('/emergency-sos'); }}>
              <View style={[s.sheetItemIcon, { backgroundColor: C.red + '22' }]}>
                <Ionicons name="warning-outline" size={20} color={C.red} />
              </View>
              <View style={s.sheetItemText}>
                <Text style={[s.sheetItemLabel, { color: C.red }]}>Emergency SOS</Text>
                <Text style={s.sheetItemSub}>Alert emergency contacts</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </Pressable>
            <Pressable style={s.sheetItem} onPress={() => { setShowMoreSheet(false); show('Issue reported to support', 'info'); }}>
              <View style={[s.sheetItemIcon, { backgroundColor: C.orange + '22' }]}>
                <Ionicons name="flag-outline" size={20} color={C.orange} />
              </View>
              <View style={s.sheetItemText}>
                <Text style={s.sheetItemLabel}>Report Issue</Text>
                <Text style={s.sheetItemSub}>Something went wrong?</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </Pressable>
            <View style={s.sheetDivider} />
            <Pressable style={s.sheetItem} onPress={() => { setShowMoreSheet(false); handleCancelRide(); }}>
              <View style={[s.sheetItemIcon, { backgroundColor: C.red + '22' }]}>
                <Ionicons name="close-circle-outline" size={20} color={C.red} />
              </View>
              <View style={s.sheetItemText}>
                <Text style={[s.sheetItemLabel, { color: C.red }]}>Cancel Ride</Text>
                <Text style={s.sheetItemSub}>End this ride request</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </Pressable>
          </View>
        </Pressable>
      )}

      {/* ── Bottom CTA ─────────────────────────────────────────────────────── */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {ctaLabel != null && (
          <Pressable
            style={[s.ctaBtn, { backgroundColor: ctaColor }, ctaLoading && s.btnDisabled]}
            onPress={ctaAction ?? undefined}
            disabled={ctaLoading || ctaAction == null}
          >
            {ctaLoading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name={ctaIcon as any} size={22} color="#000" />
                <Text style={s.ctaBtnText}>{ctaLabel}</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },
  goBackBtn:  { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },

  // header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:     { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.white },
  helpBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  helpText:    { fontSize: 14, color: C.green, fontWeight: '600' },

  // status banner
  statusBanner:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1 },
  statusBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  statusDot:        { width: 8, height: 8, borderRadius: 4 },
  statusBannerTitle: { fontSize: 14, fontWeight: '800' },
  statusBannerSub:  { fontSize: 11, color: C.textMuted, marginTop: 1 },
  navDropBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginLeft: 10 },
  navDropBtnText:   { fontSize: 11, fontWeight: '700', color: C.white },

  scroll: { padding: 14, gap: 12 },

  // summary card
  summaryCard:     { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.green + '44', padding: 14, gap: 12 },
  summaryTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activeBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  activeBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  summaryDate:     { fontSize: 11, color: C.textSub },
  summaryRouteWrap:{ flexDirection: 'row', alignItems: 'center', gap: 12 },
  addressRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  routeDot:        { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  addressText:     { flex: 1, fontSize: 13, color: C.white, fontWeight: '500' },
  pickupBadge:     { backgroundColor: C.greenDim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: C.greenBorder },
  pickupBadgeText: { fontSize: 9, fontWeight: '700', color: C.green },
  dropoffBadge:    { backgroundColor: C.surface2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: C.border },
  dropoffBadgeText:{ fontSize: 9, fontWeight: '700', color: C.textSub },
  routeConnector:  { width: 2, height: 12, backgroundColor: C.border, marginLeft: 4 },
  callCircleBtn:   { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  statGrid:        { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 2 },
  statItem:        { flex: 1, alignItems: 'center', gap: 3 },
  statDivider:     { width: 1, height: 30, backgroundColor: C.border },
  statValue:       { fontSize: 12, fontWeight: '800', color: C.white },
  statLabel:       { fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },

  // card
  card:            { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14 },
  cardSectionTitle:{ fontSize: 10, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },

  // wait card
  waitCard:        { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.yellow + '44', padding: 16, gap: 12 },
  waitCardHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  waitBadge:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  waitBadgeText:   { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  waitElapsedLabel:{ fontSize: 12, color: C.textMuted },
  waitTimerBlock:  { alignItems: 'center', paddingVertical: 8, gap: 4 },
  waitTimerBig:    { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  waitTimerSub:    { fontSize: 12, color: C.textMuted, textAlign: 'center' },
  noShowBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.red },
  noShowBtnText:   { fontSize: 13, fontWeight: '700', color: C.red },

  // two-column
  twoColRow: { flexDirection: 'row', gap: 10 },
  halfCard:  { flex: 1, gap: 8, padding: 12 },

  // passenger card
  paxAvatarWrap: { alignItems: 'center', marginBottom: 2 },
  paxAvatar:     { width: 54, height: 54, borderRadius: 27, backgroundColor: C.blueDim, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.blue + '55' },
  paxAvatarText: { fontSize: 22, fontWeight: '800', color: C.blue },
  paxName:       { fontSize: 14, fontWeight: '700', color: C.white, textAlign: 'center' },
  paxRatingRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, justifyContent: 'center' },
  paxRatingText: { fontSize: 12, color: C.yellow, fontWeight: '600' },
  paxRatingMuted:{ fontSize: 10, color: C.textMuted, textAlign: 'center' },
  paxBadgesRow:  { flexDirection: 'row', justifyContent: 'center', gap: 4, flexWrap: 'wrap' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.greenDim, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: C.greenBorder },
  verifiedBadgeText: { fontSize: 9, fontWeight: '700', color: C.green },
  phoneBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.purpleDim, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: C.purple + '44' },
  phoneBadgeText:{ fontSize: 9, fontWeight: '700', color: C.purple },
  paxActionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  paxActionBtn:  { alignItems: 'center', gap: 4, flex: 1 },
  paxActionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  paxActionLabel:{ fontSize: 10, color: C.textSub, fontWeight: '500' },

  // pickup notes card
  notesHeader:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  notesTitle:       { fontSize: 12, fontWeight: '700', color: C.white },
  notesBullet:      { flexDirection: 'row', gap: 5, alignItems: 'flex-start' },
  notesBulletDot:   { fontSize: 12, color: C.textMuted, lineHeight: 18 },
  notesBulletText:  { flex: 1, fontSize: 11, color: C.textSub, lineHeight: 17 },
  statusDivider:    { height: 1, backgroundColor: C.border, marginVertical: 6 },
  passengerStatusRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  passengerStatusLabel: { fontSize: 10, color: C.textMuted, fontWeight: '600', marginBottom: 2 },
  passengerStatusValue: { fontSize: 11, lineHeight: 16 },

  // map card
  mapCard:         { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border, position: 'relative', minHeight: 120 },
  locationFallback:     { height: 120, alignItems: 'center', justifyContent: 'center', gap: 8 },
  locationFallbackText: { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  mapCardFullscreen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, borderRadius: 0, borderWidth: 0 },

  // maneuver overlay
  maneuverCard:    { position: 'absolute', top: 10, left: 10, zIndex: 10, backgroundColor: 'rgba(10,10,10,0.92)', borderRadius: 14, padding: 10, gap: 6, maxWidth: '65%', borderWidth: 1, borderColor: '#2A2A2A' },
  maneuverRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  maneuverIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.blueDim, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  maneuverIconText:{ fontSize: 18, color: C.white, textAlign: 'center' },
  maneuverDist:    { fontSize: 14, fontWeight: '800', color: C.white, lineHeight: 17 },
  maneuverStreet:  { fontSize: 10, color: C.textSub, lineHeight: 14 },
  maneuverNextRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1A1A2A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  maneuverNextIcon:{ fontSize: 12, color: C.textSub },
  maneuverNextText:{ fontSize: 10, color: C.textSub, flex: 1 },

  // speed pill
  speedPill:  { position: 'absolute', top: 10, right: 10, zIndex: 10, backgroundColor: 'rgba(10,10,10,0.92)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A2A' },
  speedValue: { fontSize: 17, fontWeight: '800', color: C.white, lineHeight: 20 },
  speedUnit:  { fontSize: 9, color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.4 },

  // map right controls
  mapControlsCol: { position: 'absolute', right: 10, top: 60, zIndex: 10, gap: 6 },
  mapCtrlBtn:     { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(10,10,10,0.85)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2A2A2A' },

  // ETA strip at bottom of map
  mapEtaStrip: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, backgroundColor: 'rgba(10,10,10,0.88)', paddingVertical: 8, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#1E1E1E' },
  mapEtaText:  { fontSize: 13, fontWeight: '700', color: C.green, textAlign: 'center' },

  // fullscreen header overlay
  fsHeader:   { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(10,10,10,0.85)' },
  fsCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  fsEtaChip:  { backgroundColor: C.greenDim, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: C.greenBorder },
  fsEtaText:  { fontSize: 13, fontWeight: '700', color: C.green },

  // action bar
  actionBar:     { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, paddingVertical: 12, paddingHorizontal: 6 },
  actionBtn:     { flex: 1, alignItems: 'center', gap: 5 },
  actionBtnIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  actionBtnLabel:{ fontSize: 10, color: C.textSub, fontWeight: '500', textAlign: 'center' },

  // passenger proximity row
  proxRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  proxLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  proxTitle: { fontSize: 13, fontWeight: '700', color: C.white },
  proxSub:   { fontSize: 11, color: C.textMuted, marginTop: 1 },
  proxDot:   { width: 10, height: 10, borderRadius: 5 },

  // trip progress
  tripProgressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  waitingTimeRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  waitingTimeText:    { fontSize: 11, color: C.textMuted, fontWeight: '600' },

  // horizontal stepper
  hStepperRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  hStep:         { alignItems: 'center', gap: 5, flex: 1 },
  hStepCircle:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hStepLabel:    { fontSize: 9, textAlign: 'center', letterSpacing: 0.1 },
  hStepTime:     { fontSize: 9, color: C.textMuted, textAlign: 'center' },
  hStepConnector:{ height: 2, flex: 1, marginTop: 13, maxWidth: 20, alignSelf: 'flex-start', marginHorizontal: -4 },

  // free wait info
  freeWaitCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.blueDim + '66', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.blue + '22', marginTop: 2 },
  freeWaitIcon:     { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  freeWaitTitle:    { fontSize: 12, fontWeight: '700', color: C.white },
  freeWaitSub:      { fontSize: 10, color: C.textMuted, marginTop: 1 },
  freeWaitLearnMore:{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  freeWaitLearnMoreText: { fontSize: 11, color: C.blue, fontWeight: '700' },

  // live metrics
  metricsStrip:  { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.green + '33', overflow: 'hidden' },
  metricItem:    { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, gap: 4 },
  metricDivider: { width: 1, backgroundColor: C.border, marginVertical: 10 },
  metricValue:   { fontSize: 16, fontWeight: '800', color: C.white },
  metricLabel:   { fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },

  // modals
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 999 },
  modalCard:     { backgroundColor: C.surface, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 28, alignItems: 'center', gap: 10, width: '100%', maxWidth: 340 },
  modalTitle:    { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center' },
  modalSub:      { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 19 },
  modalActions:  { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  modalBtnNo:    { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modalBtnNoText:{ fontSize: 15, fontWeight: '700', color: C.textSub },
  modalBtnYes:   { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  modalBtnYesText: { fontSize: 15, fontWeight: '800', color: '#000' },

  // bottom sheets
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.70)', justifyContent: 'flex-end', zIndex: 998 },
  sheetCard:     { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingTop: 12, gap: 4 },
  sheetHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 8 },
  sheetTitle:    { fontSize: 16, fontWeight: '800', color: C.white, paddingHorizontal: 4 },
  sheetSubtitle: { fontSize: 12, color: C.textMuted, paddingHorizontal: 4, marginBottom: 4 },
  sheetItem:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 4 },
  sheetItemIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetItemText: { flex: 1, gap: 2 },
  sheetItemLabel:{ fontSize: 15, fontWeight: '600', color: C.white },
  sheetItemSub:  { fontSize: 12, color: C.textMuted },
  sheetDivider:  { height: 1, backgroundColor: C.border, marginVertical: 4 },

  // multi-pax node list
  nodeRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  nodeRowBorder:    { borderBottomWidth: 1, borderBottomColor: C.border },
  nodeIcon:         { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  nodeLabel:        { fontSize: 13, fontWeight: '500' },
  nodeAddress:      { fontSize: 11, color: C.textMuted },
  nodeActivePill:   { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  nodeActivePillText: { fontSize: 10, fontWeight: '800', color: '#000' },

  // bottom bar
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 16, paddingTop: 12 },
  ctaBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: 18 },
  ctaBtnText:{ fontSize: 16, fontWeight: '800', color: '#000' },
  btnDisabled: { opacity: 0.5 },
});
