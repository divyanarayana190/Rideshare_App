import RouteMapView from '@/components/RouteMapView';
import { openMapsNavigation } from '@/lib/driver-navigation';
import { useRoleNotificationCount } from '@/lib/use-role-notification-count';
import { useDriverStore, useRequestStore, useRideStore, useToastStore } from '@/lib/stores';
import { useRides } from '@/lib/rides-store';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth-context-v2';
import type { DriverStatRange } from '@/shared/driver/constants';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useIsFocused } from '@/hooks/use-is-focused';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W } = Dimensions.get('window');
const ACTIVITY_CARD_W = Math.min(320, SCREEN_W - 48);

const C = {
  bg: '#000000',
  card: '#121212',
  cardBorder: '#1E1E1E',
  green: '#10B981',
  greenDark: '#059669',
  greenGlow: 'rgba(16,185,129,0.14)',
  greenGradTop: '#0B1F16',
  greenGradMid: '#0F2A1F',
  purple: '#8B5CF6',
  purpleGlow: 'rgba(139,92,246,0.14)',
  blue: '#3B82F6',
  orange: '#F97316',
  red: '#EF4444',
  text: '#F9FAFB',
  textSub: '#9CA3AF',
  textMuted: '#6B7280',
};

const WEEKLY_GOAL = 30;
const TREND_POINTS = [12, 18, 15, 28, 22, 38, 52, 44, 58, 72, 68, 84];
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const RANGE_OPTIONS: { key: DriverStatRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all_time', label: 'All Time' },
];

const STEP_LABELS: Record<string, { label: string; color: string; progress: number }> = {
  driver_assigned: { label: 'Assigned', color: C.purple, progress: 0.2 },
  driver_en_route: { label: 'En Route', color: C.blue, progress: 0.4 },
  driver_arrived: { label: 'Arrived', color: C.orange, progress: 0.55 },
  ride_started: { label: 'On Trip', color: C.green, progress: 0.75 },
  ride_in_progress: { label: 'On Trip', color: C.green, progress: 0.85 },
};

type ActiveRidePreview = {
  rideId: string;
  passengerName: string;
  passengerRating?: number;
  passengerCount?: number;
  fare: number;
  rideStep?: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat?: number;
  pickupLng?: number;
};

type RequestPreview = {
  id: string;
  fare: number;
  pickupAddress: string;
  dropoffAddress: string;
  distanceMi?: number;
  tripDistanceMi?: number;
  etaMinutes?: number;
  expiresAt?: string;
  source?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
};

type ScheduledPreview = {
  rideId: string;
  passengerName: string;
  fare: number;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt?: string;
};

function splitAddr(addr: string) {
  const parts = addr.split(',').map((p) => p.trim());
  return { main: parts[0] ?? addr, sub: parts.slice(1).join(', ') };
}

function formatTrend(pct: number) {
  if (pct === 0) return '—';
  const sign = pct > 0 ? '↑' : '↓';
  return `${sign} ${Math.abs(pct)}% vs avg`;
}

function PulseDot({ active, size = 8 }: { active: boolean; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (!active) { scale.setValue(1); opacity.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 2, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
      ]),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, scale, opacity]);
  const ring = useMemo(() => ({ transform: [{ scale }], opacity }), [scale, opacity]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {active && <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: C.green }, ring]} />}
      <View style={{ width: size - 2, height: size - 2, borderRadius: (size - 2) / 2, backgroundColor: active ? C.green : C.textMuted }} />
    </View>
  );
}

function ProgressRing({ pct, color, size = 52, stroke = 5 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="#252525" strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={`${circ}`} strokeDashoffset={offset} strokeLinecap="round"
        rotation={-90} origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

function TrendLineChart({ width = 120, height = 44 }: { width?: number; height?: number }) {
  const max = Math.max(...TREND_POINTS);
  const min = Math.min(...TREND_POINTS);
  const range = max - min || 1;
  const coords = TREND_POINTS.map((v, i) => ({
    x: (i / (TREND_POINTS.length - 1)) * width,
    y: height - 6 - ((v - min) / range) * (height - 12),
  }));
  const linePath = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.green} stopOpacity="0.35" />
          <Stop offset="1" stopColor={C.green} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill="url(#trendGrad)" />
      <Path d={linePath} stroke={C.green} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function MapMini({ req }: { req: RequestPreview }) {
  const hasCoords = req.pickupLat && req.pickupLng && req.dropoffLat && req.dropoffLng
    && (req.pickupLat !== 0 || req.pickupLng !== 0);
  if (!hasCoords) {
    return (
      <View style={s.mapPlaceholder}>
        <View style={s.mapGridLine} />
        <View style={[s.mapDot, { top: 12, left: 14, backgroundColor: C.green }]} />
        <View style={[s.mapDot, { bottom: 12, right: 14, backgroundColor: C.red, borderRadius: 2 }]} />
      </View>
    );
  }
  return (
    <View style={s.mapWrap}>
      <RouteMapView
        pickupLat={req.pickupLat!}
        pickupLng={req.pickupLng!}
        destLat={req.dropoffLat!}
        destLng={req.dropoffLng!}
        height={88}
      />
    </View>
  );
}

function AcceptCountdown({ expiresAt }: { expiresAt?: string }) {
  const [sec, setSec] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    const tick = () => setSec(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);
  if (sec == null) return null;
  return <Text style={s.acceptCountdown}>Auto-accept in {sec}s</Text>;
}

function LiveRequestCard({ req, onPreview, onAccept }: { req: RequestPreview; onPreview: () => void; onAccept: () => void }) {
  const pickup = splitAddr(req.pickupAddress);
  const dropoff = splitAddr(req.dropoffAddress);
  return (
    <View style={[s.activityCard, { width: ACTIVITY_CARD_W }]}>
      <View style={s.activityHeader}>
        <View style={s.badgePurple}><Text style={s.badgePurpleText}>Live Request</Text></View>
        <View style={s.badgeNew}><Text style={s.badgeNewText}>New</Text></View>
        {req.distanceMi != null && req.distanceMi > 0 && (
          <View style={s.signalRow}>
            <Ionicons name="cellular-outline" size={11} color={C.green} />
            <Text style={s.signalText}>{req.distanceMi.toFixed(1)} mi away</Text>
          </View>
        )}
      </View>
      <View style={s.fareRow}>
        <Text style={s.fareBig}>${req.fare.toFixed(2)}</Text>
        {req.etaMinutes != null && req.etaMinutes > 0 && (
          <Text style={s.tripMeta}>{req.etaMinutes} min trip</Text>
        )}
      </View>
      <View style={s.routeMini}>
        <View style={s.routeRow}>
          <View style={[s.routeDot, { backgroundColor: C.green }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.routeMain} numberOfLines={1}>{pickup.main}</Text>
            {!!pickup.sub && <Text style={s.routeSub} numberOfLines={1}>{pickup.sub}</Text>}
          </View>
        </View>
        <View style={s.routeRow}>
          <View style={[s.routeDot, { backgroundColor: C.red, borderRadius: 2 }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.routeMain} numberOfLines={1}>{dropoff.main}</Text>
            {!!dropoff.sub && <Text style={s.routeSub} numberOfLines={1}>{dropoff.sub}</Text>}
          </View>
        </View>
      </View>
      <MapMini req={req} />
      <View style={s.metaChips}>
        {req.etaMinutes != null && (
          <View style={s.metaChip}><Ionicons name="time-outline" size={11} color={C.textMuted} /><Text style={s.metaChipText}>{req.etaMinutes} min</Text></View>
        )}
        {req.tripDistanceMi != null && (
          <View style={s.metaChip}><Ionicons name="navigate-outline" size={11} color={C.textMuted} /><Text style={s.metaChipText}>{req.tripDistanceMi.toFixed(1)} mi</Text></View>
        )}
        <View style={s.metaChip}><Ionicons name="car-outline" size={11} color={C.textMuted} /><Text style={s.metaChipText}>Standard</Text></View>
      </View>
      <View style={s.cardActions}>
        <Pressable style={s.btnGhost} onPress={onPreview}><Text style={s.btnGhostText}>Preview</Text></Pressable>
        <Pressable style={s.btnAccept} onPress={onAccept}>
          <Ionicons name="checkmark" size={16} color="#000" />
          <Text style={s.btnAcceptText}>Accept</Text>
        </Pressable>
      </View>
      <AcceptCountdown expiresAt={req.expiresAt} />
    </View>
  );
}

function ActiveRideCard({
  ride, onNavigate, onOpen,
}: { ride: ActiveRidePreview; onNavigate: () => void; onOpen: () => void }) {
  const step = ride.rideStep ? (STEP_LABELS[ride.rideStep] ?? STEP_LABELS.ride_in_progress) : STEP_LABELS.ride_in_progress;
  const pickup = splitAddr(ride.pickupAddress);
  const dropoff = splitAddr(ride.dropoffAddress);
  const progress = step.progress;
  return (
    <View style={[s.activityCard, s.activityCardActive, { width: ACTIVITY_CARD_W }]}>
      <View style={s.activityHeader}>
        <View style={s.badgeGreen}><Text style={s.badgeGreenText}>Active Ride</Text></View>
        <View style={s.onTripPill}>
          <View style={s.onTripDot} />
          <Text style={s.onTripText}>{step.label}</Text>
        </View>
      </View>
      <View style={s.passengerRow}>
        <View style={s.paxAvatar}><Text style={s.paxAvatarText}>{ride.passengerName[0]?.toUpperCase() ?? 'P'}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.paxName} numberOfLines={1}>{ride.passengerName}</Text>
          <View style={s.paxMetaRow}>
            {ride.passengerRating != null && ride.passengerRating > 0 && (
              <View style={s.ratingPill}>
                <Ionicons name="star" size={10} color={C.orange} />
                <Text style={s.ratingPillText}>{ride.passengerRating.toFixed(1)}</Text>
              </View>
            )}
            <Text style={s.paxSub}>{ride.passengerCount ?? 1} Passenger</Text>
          </View>
        </View>
        <Text style={s.fareSide}>${ride.fare.toFixed(2)}</Text>
      </View>
      <View style={s.routeMini}>
        <View style={s.routeRow}>
          <View style={[s.routeDot, { backgroundColor: C.green }]} />
          <Text style={s.routeMain} numberOfLines={1}>{pickup.main}</Text>
        </View>
        <View style={s.routeRow}>
          <View style={[s.routeDot, { backgroundColor: C.red, borderRadius: 2 }]} />
          <Text style={s.routeMain} numberOfLines={1}>{dropoff.main}</Text>
        </View>
      </View>
      <View style={s.tripProgress}>
        <View style={s.tripTrack}>
          <View style={[s.tripFill, { width: `${progress * 100}%` }]} />
          <View style={[s.tripCar, { left: `${Math.max(4, progress * 100 - 6)}%` }]}>
            <Ionicons name="car-sport" size={12} color={C.text} />
          </View>
        </View>
      </View>
      <View style={s.cardActions}>
        <Pressable style={s.btnGhost} onPress={onNavigate}>
          <Ionicons name="navigate-outline" size={15} color={C.text} />
          <Text style={s.btnGhostText}>Navigate</Text>
        </Pressable>
        <Pressable style={s.btnOpenRide} onPress={onOpen}>
          <Text style={s.btnOpenRideText}>Open Ride</Text>
          <Ionicons name="chevron-forward" size={14} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function DemandCard({ isOnline, onGoRequests }: { isOnline: boolean; onGoRequests: () => void }) {
  return (
    <View style={[s.activityCard, { width: SCREEN_W - 32 }]}>
      <View style={s.activityHeader}>
        <View style={s.badgePurple}>
          <Ionicons name="pulse-outline" size={11} color={C.purple} />
          <Text style={s.badgePurpleText}>Demand Insights</Text>
        </View>
      </View>
      <Text style={s.demandTitle}>No active rides right now</Text>
      <Text style={s.demandSub}>
        {isOnline ? 'Stay online in busy areas to get matched faster.' : 'Go online to start receiving requests.'}
      </Text>
      <View style={s.cardActions}>
        <Pressable style={s.btnGhost} onPress={onGoRequests}><Text style={s.btnGhostText}>View Requests</Text></Pressable>
        <Pressable style={s.btnAccept} onPress={onGoRequests}><Text style={s.btnAcceptText}>Find Busy Areas</Text></Pressable>
      </View>
    </View>
  );
}

function OverviewTile({
  icon, value, label, trend, trendColor, color, onPress,
}: { icon: string; value: string; label: string; trend?: string; trendColor?: string; color: string; onPress?: () => void }) {
  return (
    <Pressable style={s.overviewTile} onPress={onPress} disabled={!onPress}>
      <View style={[s.overviewIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={s.overviewValue}>{value}</Text>
      <Text style={s.overviewLabel}>{label}</Text>
      {trend ? <Text style={[s.overviewTrend, { color: trendColor ?? C.green }]}>{trend}</Text> : null}
    </Pressable>
  );
}

function QuickActionBtn({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable style={s.quickBtn} onPress={onPress}>
      <View style={[s.quickIcon, { borderColor: C.cardBorder }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={s.quickLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToastStore((s) => s.show);
  const isFocused = useIsFocused();
  const { user: authUser } = useAuth();
  const [range, setRange] = useState<DriverStatRange>('today');
  const [showRangeMenu, setShowRangeMenu] = useState(false);

  const { toggleDriverMode } = useRides();
  const { session, isTogglingStatus, setSession, setIsTogglingStatus, setLocation } = useDriverStore();
  const { requests, pendingDispatchRequest, setPendingDispatch } = useRequestStore();
  const { acceptedRides, activeRide } = useRideStore();

  const switchToPassenger = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingDispatch(null);
    toggleDriverMode();
    router.replace('/(tabs)/' as any);
  };

  const showMoreMenu = () => {
    Alert.alert('More', undefined, [
      { text: 'Driver Profile', onPress: () => router.push('/driver/(tabs)/profile' as any) },
      { text: 'Help & Support', onPress: () => router.push('/help-support' as any) },
      { text: 'Notifications', onPress: () => router.push('/notifications?role=driver' as any) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const isOnline = session?.status === 'online' || session?.status === 'on_ride';

  const { data: sessionData, refetch: refetchSession } = trpc.driver.getSession.useQuery(undefined, {
    enabled: isFocused, staleTime: 20_000, refetchInterval: isFocused ? 25_000 : false,
  });
  const { data: todayStats } = trpc.driver.getDashboardStats.useQuery(
    { range: 'today' },
    { enabled: isFocused, staleTime: 25_000, refetchInterval: isFocused ? 30_000 : false },
  );
  const { data: dashStats, refetch: refetchStats } = trpc.driver.getDashboardStats.useQuery(
    { range },
    { enabled: isFocused, staleTime: 25_000, refetchInterval: isFocused ? 30_000 : false },
  );
  const { data: weekStats } = trpc.driver.getDashboardStats.useQuery(
    { range: 'week' },
    { enabled: isFocused, staleTime: 30_000 },
  );
  const { data: pendingRequests = [] } = trpc.driver.getRideRequests.useQuery(
    { status: 'pending', range: 'all_time' },
    { enabled: isFocused && isOnline, staleTime: 15_000, refetchInterval: isFocused && isOnline ? 20_000 : false },
  );
  const { data: activeRidesApi = [] } = trpc.driver.getDriverRides.useQuery(
    { status: 'active', range: 'all_time' },
    { enabled: isFocused, staleTime: 15_000 },
  );
  const { data: upcomingRidesApi = [] } = trpc.driver.getDriverRides.useQuery(
    { status: 'upcoming', range: 'all_time' },
    { enabled: isFocused, staleTime: 30_000 },
  );
  const { data: driverNotifData } = useRoleNotificationCount('driver', isFocused);
  const driverUnreadCount = driverNotifData?.count ?? 0;

  React.useEffect(() => {
    if (sessionData) {
      setSession({
        status: sessionData.status as any,
        currentRideId: sessionData.currentRideId ?? null,
        currentRideStep: sessionData.currentRideStep as any,
        todayRides: sessionData.todayRides,
        todayEarnings: sessionData.todayEarnings,
        acceptanceRate: dashStats?.acceptanceRate ?? sessionData.acceptanceRate,
        rating: dashStats?.rating ?? Number(authUser?.averageRating ?? 0),
        onlineHours: (dashStats?.onlineMinutes ?? 0) / 60,
      });
    }
  }, [sessionData, authUser?.averageRating, dashStats, setSession]);

  const goOnlineMut = trpc.driver.goOnline.useMutation();
  const goOfflineMut = trpc.driver.goOffline.useMutation();

  const toggleOnline = async () => {
    if (isTogglingStatus) return;
    setIsTogglingStatus(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (isOnline) {
        await goOfflineMut.mutateAsync();
        setSession(session ? { ...session, status: 'offline' } : null);
        toast('You are now offline', 'info');
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          toast('Location permission is required to go online. Please enable it in Settings.', 'error');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        setLocation({ lat, lng });
        await goOnlineMut.mutateAsync({ lat, lng });
        setSession(session ? { ...session, status: 'online' } : null);
        toast('You are now online — ready for requests!', 'success');
      }
    } catch {
      toast('Failed to update status. Check connection.', 'error');
    } finally {
      setIsTogglingStatus(false);
      refetchSession();
      refetchStats();
    }
  };

  const formatHours = (mins: number) => {
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    return `${hrs}h ${m}m`;
  };

  const nextRide = acceptedRides.find((r) => r.status === 'upcoming');
  const ACTIVE_STEPS = ['driver_assigned', 'driver_en_route', 'driver_arrived', 'ride_started', 'ride_in_progress'];
  const ongoingRide = activeRide
    ?? acceptedRides.find((r) => r.status === 'active' || (r.rideStep != null && ACTIVE_STEPS.includes(r.rideStep)))
    ?? (session?.status === 'on_ride' && session.currentRideId
      ? acceptedRides.find((r) => r.rideId === session.currentRideId) ?? null
      : null);

  const apiActive = activeRidesApi[0] as (ActiveRidePreview & { passengerRating?: number; passengerCount?: number }) | undefined;

  const activeRidePreview = useMemo((): ActiveRidePreview | null => {
    if (dashStats?.activeRide?.rideId && dashStats.activeRide.pickupAddress) {
      return {
        rideId: dashStats.activeRide.rideId,
        passengerName: dashStats.activeRide.passengerName,
        fare: dashStats.activeRide.fare,
        rideStep: dashStats.activeRide.rideStep ?? undefined,
        pickupAddress: dashStats.activeRide.pickupAddress,
        dropoffAddress: dashStats.activeRide.dropoffAddress,
        passengerRating: apiActive?.passengerRating,
        passengerCount: apiActive?.passengerCount ?? 1,
        pickupLat: apiActive?.pickupLat,
        pickupLng: apiActive?.pickupLng,
      };
    }
    if (ongoingRide?.rideId && ongoingRide.pickupAddress) {
      return {
        rideId: ongoingRide.rideId,
        passengerName: ongoingRide.passengerName,
        fare: ongoingRide.offerPrice,
        rideStep: ongoingRide.rideStep ?? session?.currentRideStep ?? undefined,
        pickupAddress: ongoingRide.pickupAddress,
        dropoffAddress: ongoingRide.dropoffAddress,
        passengerCount: 1,
      };
    }
    if (apiActive?.rideId && apiActive.pickupAddress) return apiActive;
    return null;
  }, [dashStats?.activeRide, ongoingRide, apiActive, session?.currentRideStep]);

  const requestPreview = useMemo((): RequestPreview | null => {
    if (pendingDispatchRequest) {
      return {
        id: pendingDispatchRequest.rideId,
        fare: pendingDispatchRequest.totalFare,
        pickupAddress: pendingDispatchRequest.pickupAddress,
        dropoffAddress: pendingDispatchRequest.dropoffAddress,
        etaMinutes: pendingDispatchRequest.etaMinutes,
        source: 'dispatch',
      };
    }
    const apiReq = pendingRequests[0] as {
      id: string; fareCents?: number; pickupAddress: string; dropoffAddress: string;
      pickupDistanceMiles?: number; durationMinutes?: number; distanceMiles?: number;
      pickupLat?: number; pickupLng?: number; dropoffLat?: number; dropoffLng?: number;
      expiresAt?: string; requestType?: string;
    } | undefined;
    if (apiReq?.id && apiReq.pickupAddress) {
      return {
        id: apiReq.id,
        fare: (apiReq.fareCents ?? 0) / 100,
        pickupAddress: apiReq.pickupAddress,
        dropoffAddress: apiReq.dropoffAddress,
        distanceMi: apiReq.pickupDistanceMiles,
        tripDistanceMi: apiReq.distanceMiles,
        etaMinutes: apiReq.durationMinutes,
        pickupLat: apiReq.pickupLat,
        pickupLng: apiReq.pickupLng,
        dropoffLat: apiReq.dropoffLat,
        dropoffLng: apiReq.dropoffLng,
        expiresAt: apiReq.expiresAt,
        source: apiReq.requestType === 'broadcast' ? 'broadcast' : 'dispatch',
      };
    }
    const storeReq = requests[0];
    if (storeReq?.requestId && storeReq.pickupAddress) {
      return {
        id: storeReq.requestId,
        fare: storeReq.offerPrice,
        pickupAddress: storeReq.pickupAddress,
        dropoffAddress: storeReq.dropoffAddress,
        distanceMi: storeReq.distanceToPickupKm != null ? storeReq.distanceToPickupKm * 0.621371 : undefined,
        etaMinutes: storeReq.estimatedMinutes ?? undefined,
        source: 'store',
      };
    }
    return null;
  }, [pendingDispatchRequest, pendingRequests, requests]);

  const scheduledPreview = useMemo((): ScheduledPreview | null => {
    if (activeRidePreview) return null;
    if (dashStats?.upcomingRide?.rideId && dashStats.upcomingRide.pickupAddress) {
      return {
        rideId: dashStats.upcomingRide.rideId,
        passengerName: dashStats.upcomingRide.passengerName,
        fare: dashStats.upcomingRide.fare,
        pickupAddress: dashStats.upcomingRide.pickupAddress,
        dropoffAddress: dashStats.upcomingRide.dropoffAddress,
        scheduledAt: dashStats.upcomingRide.scheduledAt,
      };
    }
    const apiUp = upcomingRidesApi[0] as ScheduledPreview | undefined;
    if (apiUp?.rideId && apiUp.pickupAddress) return apiUp;
    if (nextRide?.rideId && nextRide.pickupAddress) {
      return {
        rideId: nextRide.rideId,
        passengerName: nextRide.passengerName,
        fare: nextRide.offerPrice,
        pickupAddress: nextRide.pickupAddress,
        dropoffAddress: nextRide.dropoffAddress,
        scheduledAt: nextRide.scheduledAt,
      };
    }
    return null;
  }, [activeRidePreview, dashStats?.upcomingRide, upcomingRidesApi, nextRide]);

  const todayEarnings = todayStats?.earnings ?? session?.todayEarnings ?? sessionData?.todayEarnings ?? 0;
  const todayRides = todayStats?.completedRides ?? session?.todayRides ?? sessionData?.todayRides ?? 0;
  const displayEarnings = dashStats?.earnings ?? todayEarnings;
  const displayRides = dashStats?.completedRides ?? todayRides;
  const acceptRate = dashStats?.acceptanceRate ?? session?.acceptanceRate ?? sessionData?.acceptanceRate ?? 100;
  const cancelRate = dashStats?.cancellationRate ?? 0;
  const completeRate = dashStats?.completionRate ?? 100;
  const rating = dashStats?.rating ?? session?.rating ?? 0;
  const onlineMins = dashStats?.onlineMinutes ?? todayStats?.onlineMinutes ?? 0;
  const rangeLabel = RANGE_OPTIONS.find((r) => r.key === range)?.label ?? 'Today';

  const weekCompleted = weekStats?.completedRides ?? 0;
  const weekEarnings = weekStats?.earnings ?? 0;
  const weekProgress = Math.min(100, Math.round((weekCompleted / WEEKLY_GOAL) * 100));

  const dayOfWeek = Math.max(1, new Date().getDay() || 7);
  const avgDailyEarnings = weekEarnings / dayOfWeek;
  const avgDailyRides = weekCompleted / dayOfWeek;
  const avgDailyOnline = (weekStats?.onlineMinutes ?? 0) / dayOfWeek;
  const earningsTrendPct = avgDailyEarnings > 0
    ? Math.round(((todayEarnings - avgDailyEarnings) / avgDailyEarnings) * 100)
    : todayEarnings > 0 ? 100 : 0;
  const ridesDelta = todayRides - Math.round(avgDailyRides);
  const onlineDeltaMins = Math.round(onlineMins - avgDailyOnline);

  const driverInitial = (authUser?.name?.trim()?.[0] ?? authUser?.firstName?.[0] ?? 'D').toUpperCase();
  const ratingLabel = rating >= 4.9 ? 'Top Driver' : rating >= 4.5 ? 'Great' : '';

  const openRequest = () => {
    if (!requestPreview) return;
    if (pendingDispatchRequest && requestPreview.source === 'dispatch') {
      router.push({ pathname: '/driver/request-detail', params: { requestId: requestPreview.id, mode: 'dispatch' } });
      return;
    }
    router.push({ pathname: '/driver/request-detail', params: { requestId: requestPreview.id, source: requestPreview.source ?? 'dispatch' } });
  };

  const handleNavigation = () => {
    if (!activeRidePreview) {
      Alert.alert('No active ride', 'You do not have an active ride to navigate to.');
      return;
    }
    openMapsNavigation(0, 0, activeRidePreview.pickupAddress, (m) => toast(m, 'error'));
    router.push({ pathname: '/driver/ride-detail', params: { rideId: activeRidePreview.rideId } });
  };

  const navigateTo = (rideId: string, address: string) => {
    openMapsNavigation(0, 0, address, (m) => toast(m, 'error'));
    router.push({ pathname: '/driver/ride-detail', params: { rideId } });
  };

  const showLiveRequest = requestPreview && isOnline;
  const showActiveRide = !!activeRidePreview;
  const showActivityRow = showLiveRequest || showActiveRide;

  const dailyBars = useMemo(() => {
    const today = new Date().getDay();
    const idx = today === 0 ? 6 : today - 1;
    return DAY_LABELS.map((d, i) => ({
      label: d,
      height: i === idx ? 1 : 0.3 + (i % 3) * 0.15,
      active: i === idx,
    }));
  }, []);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.avatar} onPress={() => router.push('/driver/(tabs)/profile' as any)}>
          <Text style={s.avatarText}>{driverInitial}</Text>
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Driver Mode</Text>
          <View style={s.headerStatusRow}>
            <PulseDot active={isOnline} size={7} />
            <Text style={[s.headerStatus, { color: isOnline ? C.green : C.textMuted }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
        <View style={s.headerRight}>
          <Pressable style={s.headerIconBtn} onPress={() => router.push('/notifications?role=driver' as any)}>
            <Ionicons name="notifications-outline" size={21} color={C.text} />
            {driverUnreadCount > 0 && (
              <View style={s.notifDot}>
                <Text style={s.notifDotText}>{driverUnreadCount > 9 ? '9+' : driverUnreadCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={s.passengerPill} onPress={switchToPassenger}>
            <Ionicons name="person-outline" size={13} color={C.purple} />
            <Text style={s.passengerPillText}>Passenger Mode</Text>
            <Ionicons name="chevron-forward" size={12} color={C.purple} />
          </Pressable>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={[s.content, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>

        {/* Compact Online */}
        <Pressable
          style={[s.onlineBar, isOnline && s.onlineBarOn, isTogglingStatus && { opacity: 0.7 }]}
          onPress={toggleOnline}
          disabled={isTogglingStatus}
        >
          <View style={s.onlineBarLeft}>
            <PulseDot active={isOnline} />
            <View>
              <Text style={[s.onlineTitle, { color: isOnline ? C.green : C.textSub }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
              <Text style={s.onlineSub}>
                {isOnline ? 'Ready to receive ride requests' : 'Tap to go online'}
              </Text>
            </View>
          </View>
          <Switch
            value={isOnline}
            onValueChange={toggleOnline}
            disabled={isTogglingStatus}
            trackColor={{ false: '#2A2A2A', true: C.greenDark }}
            thumbColor={isOnline ? C.green : '#666'}
            style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
          />
        </Pressable>

        {/* Earnings Hero */}
        <View style={s.heroCard}>
          <View style={s.heroBgGlow} />
          <View style={s.heroInner}>
            <View style={s.heroLeft}>
              <View style={s.heroLabelRow}>
                <Text style={s.heroLabel}>Today&apos;s Earnings</Text>
                <Ionicons name="information-circle-outline" size={14} color={C.textMuted} />
              </View>
              <Text style={s.heroAmount}>${todayEarnings.toFixed(2)}</Text>
              <Text style={[s.heroTrend, { color: earningsTrendPct >= 0 ? C.green : C.red }]}>
                {formatTrend(earningsTrendPct)}
              </Text>
            </View>
            <View style={s.heroChart}>
              <TrendLineChart width={110} height={48} />
            </View>
            <View style={s.heroRight}>
              <Text style={s.heroLabel}>Today&apos;s Trips</Text>
              <Text style={s.heroTrips}>{todayRides}</Text>
              <Text style={s.heroTripsSub}>rides completed</Text>
            </View>
          </View>
        </View>

        {/* Overview */}
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Overview</Text>
            <Pressable style={s.rangeChip} onPress={() => setShowRangeMenu((v) => !v)}>
              <Text style={s.rangeChipText}>{rangeLabel}</Text>
              <Ionicons name="chevron-down" size={12} color={C.textSub} />
            </Pressable>
          </View>
          {showRangeMenu && (
            <View style={s.rangeMenu}>
              {RANGE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[s.rangePill, range === opt.key && s.rangePillActive]}
                  onPress={() => { setRange(opt.key); setShowRangeMenu(false); }}
                >
                  <Text style={[s.rangePillText, range === opt.key && s.rangePillTextActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={s.overviewGrid}>
            <OverviewTile
              icon="wallet-outline" value={`$${displayEarnings.toFixed(2)}`} label="Earnings"
              trend={range === 'today' ? formatTrend(earningsTrendPct) : undefined}
              color={C.green} onPress={() => router.push('/driver/(tabs)/earnings')}
            />
            <OverviewTile
              icon="people-outline" value={String(displayRides)} label="Completed Trips"
              trend={range === 'today' && ridesDelta !== 0 ? `${ridesDelta > 0 ? '+' : ''}${ridesDelta} vs avg` : undefined}
              color={C.purple} onPress={() => router.push('/driver/(tabs)/rides')}
            />
            <OverviewTile
              icon="time-outline" value={formatHours(onlineMins)} label="Online Time"
              trend={range === 'today' && onlineDeltaMins !== 0 ? `${onlineDeltaMins > 0 ? '+' : ''}${onlineDeltaMins}m vs avg` : undefined}
              color={C.blue}
            />
            <OverviewTile
              icon="star-outline" value={rating > 0 ? rating.toFixed(2) : '—'} label="Rating"
              trend={ratingLabel || undefined} trendColor={C.orange} color={C.orange}
            />
          </View>
        </View>

        {/* Real-time Activity */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Real-time Activity</Text>
          {showActivityRow ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.activityRow}>
              {showLiveRequest && requestPreview && (
                <LiveRequestCard req={requestPreview} onPreview={openRequest} onAccept={openRequest} />
              )}
              {showActiveRide && activeRidePreview && (
                <ActiveRideCard
                  ride={activeRidePreview}
                  onNavigate={() => navigateTo(activeRidePreview.rideId, activeRidePreview.pickupAddress)}
                  onOpen={() => router.push({ pathname: '/driver/ride-detail', params: { rideId: activeRidePreview.rideId } })}
                />
              )}
            </ScrollView>
          ) : scheduledPreview ? (
            <View style={[s.activityCard, { width: SCREEN_W - 32 }]}>
              <View style={s.activityHeader}>
                <View style={s.badgePurple}><Text style={s.badgePurpleText}>Next Scheduled</Text></View>
                <Text style={s.signalText}>
                  {scheduledPreview.scheduledAt
                    ? new Date(scheduledPreview.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Scheduled'}
                </Text>
              </View>
              <Text style={s.paxName}>{scheduledPreview.passengerName}</Text>
              <Text style={s.routeMain} numberOfLines={2}>{scheduledPreview.pickupAddress}</Text>
              <View style={s.cardActions}>
                <Pressable style={s.btnGhost} onPress={() => navigateTo(scheduledPreview.rideId, scheduledPreview.pickupAddress)}>
                  <Ionicons name="navigate-outline" size={15} color={C.text} />
                  <Text style={s.btnGhostText}>Navigate</Text>
                </Pressable>
                <Pressable style={s.btnOpenRide} onPress={() => router.push({ pathname: '/driver/ride-detail', params: { rideId: scheduledPreview.rideId } })}>
                  <Text style={s.btnOpenRideText}>View</Text>
                  <Ionicons name="chevron-forward" size={14} color="#fff" />
                </Pressable>
              </View>
            </View>
          ) : (
            <DemandCard isOnline={isOnline} onGoRequests={() => router.push('/driver/(tabs)/requests')} />
          )}
        </View>

        {/* Weekly Progress + Performance */}
        <View style={s.twoCol}>
          <View style={[s.weekCard, { flex: 1 }]}>
            <View style={s.weekHeader}>
              <Ionicons name="flag-outline" size={14} color={C.green} />
              <Text style={s.weekTitle}>Weekly Goal</Text>
            </View>
            <Text style={s.weekCount}>{weekCompleted} / {WEEKLY_GOAL} rides</Text>
            <View style={s.weekTrack}>
              <View style={[s.weekFill, { width: `${weekProgress}%` }]} />
            </View>
            <Text style={s.weekPctLabel}>{weekProgress}% complete</Text>
            <Text style={s.weekEst}>Est. earnings ${weekEarnings.toFixed(0)}</Text>
            <View style={s.dayBars}>
              {dailyBars.map((b, i) => (
                <View key={i} style={s.dayBarCol}>
                  <View style={[s.dayBar, { height: 20 + b.height * 24, backgroundColor: b.active ? C.purple : '#2A2A2A' }]} />
                  <Text style={[s.dayBarLabel, b.active && { color: C.purple }]}>{b.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[s.perfPanel, { flex: 1 }]}>
            <View style={s.sectionRow}>
              <Text style={s.weekTitle}>Performance</Text>
              <Pressable onPress={() => router.push('/driver/(tabs)/earnings')}>
                <Text style={s.sectionLink}>This Week →</Text>
              </Pressable>
            </View>
            <View style={s.perfRings}>
              {[
                { label: 'Acceptance', value: acceptRate, color: C.green },
                { label: 'Cancellation', value: cancelRate, color: C.orange, invert: true },
                { label: 'Completion', value: completeRate, color: C.blue },
              ].map((p) => {
                const displayPct = p.invert ? 100 - p.value : p.value;
                const grade = displayPct >= 90 ? 'Excellent' : displayPct >= 75 ? 'Good' : 'Fair';
                return (
                  <View key={p.label} style={s.perfItem}>
                    <View style={s.perfRingWrap}>
                      <ProgressRing pct={displayPct} color={p.color} size={48} stroke={4} />
                      <Text style={s.perfRingVal}>{p.value}%</Text>
                    </View>
                    <Text style={s.perfItemLabel}>{p.label}</Text>
                    <Text style={[s.perfGrade, { color: p.color }]}>{grade}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Quick Actions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickRow}>
            <QuickActionBtn icon="power-outline" label={isOnline ? 'Go Offline' : 'Go Online'} color={isOnline ? C.red : C.green} onPress={toggleOnline} />
            <QuickActionBtn icon="navigate-outline" label="Navigation" color={C.blue} onPress={handleNavigation} />
            <QuickActionBtn icon="calendar-outline" label="My Schedule" color={C.purple} onPress={() => router.push('/driver/schedule')} />
            <QuickActionBtn icon="wallet-outline" label="Earnings" color={C.green} onPress={() => router.push('/driver/(tabs)/earnings')} />
            <QuickActionBtn icon="person-outline" label="Passenger Mode" color={C.purple} onPress={switchToPassenger} />
            <QuickActionBtn icon="ellipsis-horizontal" label="More" color={C.textSub} onPress={showMoreMenu} />
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 18 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, gap: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.purpleGlow, borderWidth: 2, borderColor: C.purple + '55', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.purple, fontSize: 18, fontWeight: '800' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  headerStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  headerStatus: { fontSize: 12, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notifDotText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  passengerPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 20, backgroundColor: C.purpleGlow, borderWidth: 1, borderColor: C.purple + '55' },
  passengerPillText: { color: C.purple, fontSize: 10, fontWeight: '700' },

  onlineBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 56, maxHeight: 64, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
  },
  onlineBarOn: { borderColor: C.green + '44', backgroundColor: '#0A1812' },
  onlineBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  onlineTitle: { fontSize: 14, fontWeight: '700' },
  onlineSub: { color: C.textMuted, fontSize: 11, marginTop: 1 },

  heroCard: {
    borderRadius: 22, padding: 16, overflow: 'hidden',
    backgroundColor: C.greenGradTop, borderWidth: 1, borderColor: C.green + '40',
  },
  heroBgGlow: { position: 'absolute', top: -30, right: 20, width: 160, height: 160, borderRadius: 80, backgroundColor: C.greenGlow },
  heroInner: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  heroLeft: { flex: 1 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroLabel: { color: C.textSub, fontSize: 12, fontWeight: '600' },
  heroAmount: { color: C.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  heroTrend: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  heroChart: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  heroRight: { alignItems: 'flex-end', minWidth: 72 },
  heroTrips: { color: C.text, fontSize: 28, fontWeight: '800', marginTop: 2 },
  heroTripsSub: { color: C.textMuted, fontSize: 10, fontWeight: '600' },

  section: { gap: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  sectionLink: { color: C.green, fontSize: 12, fontWeight: '600' },
  rangeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
  rangeChipText: { color: C.textSub, fontSize: 12, fontWeight: '600' },
  rangeMenu: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rangePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
  rangePillActive: { backgroundColor: C.green, borderColor: C.green },
  rangePillText: { fontSize: 12, fontWeight: '600', color: C.textSub },
  rangePillTextActive: { color: '#000' },

  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  overviewTile: { width: '47%', flexGrow: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.cardBorder, padding: 13, gap: 4 },
  overviewIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  overviewValue: { color: C.text, fontSize: 19, fontWeight: '800' },
  overviewLabel: { color: C.textMuted, fontSize: 11, fontWeight: '600' },
  overviewTrend: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  activityRow: { gap: 12, paddingVertical: 2 },
  activityCard: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, padding: 14, gap: 10 },
  activityCardActive: { borderColor: C.green + '44', backgroundColor: '#0A1812' },
  activityHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badgeGreen: { backgroundColor: C.greenGlow, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.green + '44' },
  badgeGreenText: { color: C.green, fontSize: 10, fontWeight: '800' },
  badgePurple: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.purpleGlow, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgePurpleText: { color: C.purple, fontSize: 10, fontWeight: '800' },
  badgeNew: { backgroundColor: C.purple, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeNewText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
  signalText: { color: C.textSub, fontSize: 11, fontWeight: '600' },
  fareRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  fareBig: { color: C.green, fontSize: 26, fontWeight: '800' },
  tripMeta: { color: C.textSub, fontSize: 12, fontWeight: '600' },
  routeMini: { gap: 5 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 7, height: 7, borderRadius: 4 },
  routeMain: { color: C.text, fontSize: 12, fontWeight: '600', flex: 1 },
  routeSub: { color: C.textMuted, fontSize: 10 },
  mapPlaceholder: { height: 88, borderRadius: 12, backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden', position: 'relative' },
  mapGridLine: { position: 'absolute', top: '50%', left: 16, right: 16, height: 1, backgroundColor: '#252525' },
  mapDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  mapWrap: { height: 88, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.cardBorder },
  metaChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaChipText: { color: C.textMuted, fontSize: 11, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 8 },
  btnGhost: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: '#1A1A1A' },
  btnGhostText: { color: C.text, fontSize: 13, fontWeight: '600' },
  btnAccept: { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 12, backgroundColor: C.green },
  btnAcceptText: { color: '#000', fontSize: 13, fontWeight: '800' },
  acceptCountdown: { color: C.textMuted, fontSize: 10, textAlign: 'center', fontWeight: '600' },
  onTripPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  onTripDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  onTripText: { color: C.green, fontSize: 11, fontWeight: '700' },
  passengerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paxAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.greenGlow, alignItems: 'center', justifyContent: 'center' },
  paxAvatarText: { color: C.green, fontSize: 16, fontWeight: '800' },
  paxName: { color: C.text, fontSize: 15, fontWeight: '700' },
  paxMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: C.orange + '22', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  ratingPillText: { color: C.orange, fontSize: 10, fontWeight: '700' },
  paxSub: { color: C.textMuted, fontSize: 11 },
  fareSide: { color: C.green, fontSize: 20, fontWeight: '800' },
  tripProgress: { marginVertical: 2 },
  tripTrack: { height: 6, borderRadius: 3, backgroundColor: '#252525', position: 'relative', overflow: 'visible' },
  tripFill: { height: '100%', borderRadius: 3, backgroundColor: C.green },
  tripCar: { position: 'absolute', top: -5, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  btnOpenRide: { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 11, borderRadius: 12, backgroundColor: C.blue },
  btnOpenRideText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  demandTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  demandSub: { color: C.textSub, fontSize: 12, lineHeight: 17 },

  twoCol: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  weekCard: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, padding: 14, gap: 6, minWidth: SCREEN_W > 500 ? 0 : SCREEN_W - 32 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekTitle: { color: C.text, fontSize: 13, fontWeight: '700' },
  weekCount: { color: C.text, fontSize: 18, fontWeight: '800' },
  weekTrack: { height: 8, borderRadius: 4, backgroundColor: '#252525', overflow: 'hidden', marginTop: 2 },
  weekFill: { height: '100%', backgroundColor: C.green, borderRadius: 4 },
  weekPctLabel: { color: C.textMuted, fontSize: 11, fontWeight: '600' },
  weekEst: { color: C.textSub, fontSize: 12, fontWeight: '600' },
  dayBars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.cardBorder },
  dayBarCol: { alignItems: 'center', gap: 4 },
  dayBar: { width: 8, borderRadius: 4 },
  dayBarLabel: { color: C.textMuted, fontSize: 9, fontWeight: '600' },

  perfPanel: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, padding: 14, gap: 8, minWidth: SCREEN_W > 500 ? 0 : SCREEN_W - 32 },
  perfRings: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  perfItem: { flex: 1, alignItems: 'center', gap: 3 },
  perfRingWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  perfRingVal: { position: 'absolute', color: C.text, fontSize: 11, fontWeight: '800' },
  perfItemLabel: { color: C.textMuted, fontSize: 9, fontWeight: '600', textAlign: 'center' },
  perfGrade: { fontSize: 9, fontWeight: '700' },

  quickRow: { gap: 12, paddingVertical: 4 },
  quickBtn: { alignItems: 'center', width: 68, gap: 6 },
  quickIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  quickLabel: { color: C.textSub, fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 13 },
});
