import BrandedBackButton from '@/components/BrandedBackButton';
import { trpc } from '@/lib/trpc';
import { useRequestStore, useRideStore, useToastStore } from '@/lib/stores';
import { formatDistance } from '@/lib/utils';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const C = {
  bg: '#0A0A0A', surface: '#141414', surfaceElevated: '#1C1C1C', border: '#252525',
  green: '#22C55E', greenDim: '#0D2818', greenBorder: '#1A4029',
  purple: '#8B5CF6', purpleDim: '#1E1040',
  orange: '#F97316', orangeDim: '#2A1400',
  blue: '#3B82F6', blueDim: '#0D1A40',
  red: '#EF4444', redDim: '#2A0A0A',
  yellow: '#F59E0B',
  white: '#FFFFFF', text: '#F9FAFB', textSub: '#9CA3AF', textMuted: '#6B7280',
};

function Countdown({ expiresAt }: { expiresAt?: string }) {
  const [secs, setSecs] = useState(() =>
    expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) : null,
  );

  useEffect(() => {
    if (secs === null) return;
    const id = setInterval(() => setSecs((s) => (s != null && s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot countdown; adding secs would restart the interval every tick

  if (secs === null) return null;

  const urgent = secs < 15;
  const warning = secs < 30;
  const color = urgent ? C.red : warning ? C.orange : C.green;
  const dim   = urgent ? C.redDim : warning ? C.orangeDim : C.greenDim;

  return (
    <View style={[s.countdownChip, { backgroundColor: dim, borderColor: color + '55' }]}>
      <Ionicons name="timer-outline" size={13} color={color} />
      <Text style={[s.countdownText, { color }]}>{secs}s</Text>
    </View>
  );
}

function MatchCircle({ score, color }: { score: number; color: string }) {
  return (
    <View style={[s.matchCircle, { borderColor: color + '88' }]}>
      <Text style={[s.matchCircleNum, { color }]}>{score}</Text>
      <Text style={[s.matchCircleLabel, { color: color + '99' }]}>%</Text>
    </View>
  );
}

function MetaChip({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View style={[s.metaChip, { backgroundColor: color + '18', borderColor: color + '33' }]}>
      <Ionicons name={icon as any} size={13} color={color} />
      <Text style={[s.metaChipText, { color }]}>{label}</Text>
    </View>
  );
}

function DetailChip({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={[s.detailChip, { borderColor: C.border }]}>
      <View style={[s.detailChipIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={s.detailChipLabel}>{label}</Text>
      <Text style={[s.detailChipValue, { color }]}>{value}</Text>
    </View>
  );
}

function MatchStatRow({ label, value, color, suffix }: { label: string; value: string; color: string; suffix?: string }) {
  return (
    <View style={s.matchStatRow}>
      <View style={s.matchStatDot} />
      <Text style={s.matchStatLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={[s.matchStatValue, { color }]}>{value}</Text>
      {suffix ? <Text style={s.matchStatSuffix}>{suffix}</Text> : null}
    </View>
  );
}

export default function RequestDetailScreen() {
  const insets = useSafeAreaInsets();
  const router  = useRouter();
  const { requestId, mode, source } = useLocalSearchParams<{ requestId: string; rideId: string; mode: string; source: string }>();
  const show = useToastStore((s) => s.show);

  const requests       = useRequestStore((s) => s.requests);
  const removeRequest  = useRequestStore((s) => s.removeRequest);
  const addAcceptedRide = useRideStore((s) => s.addAcceptedRide);
  const pendingDispatchRequest = useRequestStore((s) => s.pendingDispatchRequest);
  const setPendingDispatch = useRequestStore((s) => s.setPendingDispatch);

  const isDispatchMode = mode === 'dispatch';
  const storeRequest = isDispatchMode ? null : requests.find((r) => r.requestId === requestId);

  const { data: nearbyFeed } = trpc.driver.getRideRequests.useQuery(
    { status: 'pending', range: 'all_time' },
    { enabled: !isDispatchMode && !!requestId && !storeRequest },
  );

  const apiFeedItem = (nearbyFeed as { id: string; requestType?: string; passengerName?: string; passengerRating?: number; pickupAddress?: string; dropoffAddress?: string; fareCents?: number; passengerCount?: number; distanceMiles?: number; durationMinutes?: number; pickupDistanceMiles?: number; expiresAt?: string; requestedAt?: string; matchScore?: number; matchLabel?: string; rideId?: string }[] | undefined)?.find((row) => row.id === requestId);
  const request = storeRequest ?? (apiFeedItem ? {
    requestId: apiFeedItem.id,
    passengerName: apiFeedItem.passengerName,
    passengerRating: apiFeedItem.passengerRating,
    isVerified: false,
    passengerRideCount: apiFeedItem.passengerCount,
    pickupAddress: apiFeedItem.pickupAddress,
    dropoffAddress: apiFeedItem.dropoffAddress,
    offerPrice: (apiFeedItem.fareCents ?? 0) / 100,
    passengerCount: apiFeedItem.passengerCount,
    // Server returns distanceMiles; convert to km for consistent display
    distanceKm: apiFeedItem.distanceMiles != null ? apiFeedItem.distanceMiles * 1.60934 : undefined,
    estimatedMinutes: apiFeedItem.durationMinutes,
    distanceToPickupKm: apiFeedItem.pickupDistanceMiles != null ? apiFeedItem.pickupDistanceMiles * 1.60934 : undefined,
    expiresAt: apiFeedItem.expiresAt,
    createdAt: apiFeedItem.requestedAt ?? new Date().toISOString(),
    matchScore: apiFeedItem.matchScore,
    matchLevel: apiFeedItem.matchLabel,
  } : null);

  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);

  const acceptMut = trpc.driver.acceptDriverRequest.useMutation();
  const rejectMut = trpc.driver.rejectDriverRequest.useMutation();
  const dispatchAccept  = trpc.driver.acceptRide.useMutation();
  const dispatchDecline = trpc.driver.declineRide.useMutation();

  const handleAccept = async () => {
    if (!request || accepting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAccepting(true);
    try {
      let realRideId: string;
      // Unified accept — dispatch and broadcast via driver.acceptDriverRequest
      const reqType = source === 'broadcast' ? 'broadcast' : 'dispatch';
      const result = await acceptMut.mutateAsync({ requestId, requestType: reqType as 'dispatch' | 'broadcast' });
      realRideId = result.rideId ?? requestId;

      removeRequest(requestId);
      addAcceptedRide({
        rideId: realRideId,
        passengerName: request.passengerName?.trim() || 'Passenger',
        passengerRating: request.passengerRating,
        isVerified: request.isVerified,
        pickupAddress: request.pickupAddress ?? '',
        dropoffAddress: request.dropoffAddress ?? '',
        offerPrice: request.offerPrice ?? 0,
        passengerCount: request.passengerCount ?? 1,
        distanceKm: request.distanceKm ?? null,
        estimatedMinutes: request.estimatedMinutes ?? null,
        createdAt: request.createdAt,
        status: 'upcoming',
        rideStep: 'driver_en_route',
        distanceAwayKm: request.distanceToPickupKm,
      });

      show('Ride accepted! Head to pickup.', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/driver/ride-detail', params: { rideId: realRideId } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to accept ride.';
      show(msg, 'error');
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!request || declining) return;
    Alert.alert('Decline Request', 'Are you sure you want to decline this ride?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setDeclining(true);
          removeRequest(requestId);
          try { await rejectMut.mutateAsync({ requestId, requestType: (source === 'broadcast' ? 'broadcast' : 'dispatch') as any }); } catch { /* ignore */ }
          router.back();
        },
      },
    ]);
  };

  const handleDispatchAccept = async () => {
    if (!pendingDispatchRequest || accepting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAccepting(true);
    const dispatch = pendingDispatchRequest;
    try {
      await dispatchAccept.mutateAsync({ rideId: dispatch.rideId });
      setPendingDispatch(null);
      addAcceptedRide({
        rideId: dispatch.rideId,
        passengerName: 'Passenger',
        pickupAddress: dispatch.pickupAddress,
        dropoffAddress: dispatch.dropoffAddress,
        offerPrice: dispatch.totalFare,
        passengerCount: 1,
        distanceKm: null,
        estimatedMinutes: dispatch.etaMinutes,
        createdAt: new Date().toISOString(),
        status: 'active',
        rideStep: 'driver_en_route',
      });
      show('Ride accepted! Head to pickup.', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/driver/ride-detail', params: { rideId: dispatch.rideId } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to accept ride.';
      show(msg, 'error');
      setAccepting(false);
    }
  };

  const handleDispatchDecline = async () => {
    if (!pendingDispatchRequest || declining) return;
    Alert.alert('Decline Ride', 'Are you sure you want to decline this ride?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setDeclining(true);
          const dispatch = pendingDispatchRequest;
          setPendingDispatch(null);
          try { await dispatchDecline.mutateAsync({ rideId: dispatch.rideId }); } catch { /* ignore */ }
          router.back();
        },
      },
    ]);
  };

  if (isDispatchMode) {
    if (!pendingDispatchRequest) {
      return (
        <View style={[s.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
          <StatusBar style="light" />
          <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
          <Text style={s.notFoundText}>Request no longer available</Text>
          <BrandedBackButton onPress={() => router.back()} style={{ marginTop: 16 }} />
        </View>
      );
    }

    const dispatch = pendingDispatchRequest;
    const dispatchEarnings = (dispatch.totalFare * 0.8).toFixed(2);

    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <View style={s.navbar}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color={C.white} />
          </Pressable>
          <Text style={s.navTitle}>Incoming Ride Request</Text>
          <View style={[s.countdownChip, { backgroundColor: C.greenDim, borderColor: C.green + '55' }]}>
            <Ionicons name="timer-outline" size={13} color={C.green} />
            <Text style={[s.countdownText, { color: C.green }]}>{dispatch.expiresIn}s</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <View style={s.passengerCard}>
            <View style={s.avatarWrap}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>P</Text>
              </View>
            </View>
            <View style={s.passengerMeta}>
              <View style={s.nameRow}>
                <Text style={s.passengerName}>Passenger</Text>
              </View>
              <View style={s.chipRow}>
                <MetaChip icon="people-outline" label="1 seat" color={C.blue} />
              </View>
            </View>
            <View style={s.fareCol}>
              <Text style={s.fareLabel}>Fare</Text>
              <Text style={s.fareAmount}>${dispatch.totalFare.toFixed(2)}</Text>
              <Text style={s.fareEarns}>~${dispatchEarnings} yours</Text>
            </View>
          </View>

          <View style={s.card}>
            <View style={s.routeBlock}>
              <View style={s.routeRow}>
                <View style={s.routeIconWrap}>
                  <View style={[s.routeDot, { backgroundColor: C.green }]} />
                </View>
                <View style={s.routeTextCol}>
                  <Text style={s.routeSubLabel}>PICKUP</Text>
                  <Text style={s.routeAddr}>{dispatch.pickupAddress}</Text>
                </View>
              </View>
              <View style={s.routeConnector}>
                <View style={s.routeLine} />
              </View>
              <View style={s.routeRow}>
                <View style={s.routeIconWrap}>
                  <View style={[s.routeDot, { backgroundColor: C.red }]} />
                </View>
                <View style={s.routeTextCol}>
                  <Text style={s.routeSubLabel}>DROP-OFF</Text>
                  <Text style={s.routeAddr}>{dispatch.dropoffAddress}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={s.chipGrid}>
            <DetailChip icon="time-outline" label="ETA" value={`${dispatch.etaMinutes} min`} color={C.green} />
            <DetailChip icon="cash-outline" label="Fare" value={`$${dispatch.totalFare.toFixed(2)}`} color={C.orange} />
          </View>

          <View style={{ height: 130 }} />
        </ScrollView>

        <View style={[s.actionBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Pressable
            style={[s.declineBtn, (accepting || declining) && s.btnDisabled]}
            onPress={handleDispatchDecline}
            disabled={accepting || declining}
          >
            {declining ? (
              <ActivityIndicator color={C.red} size="small" />
            ) : (
              <>
                <Ionicons name="close-circle" size={20} color={C.red} />
                <Text style={[s.btnText, { color: C.red }]}>Decline</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={[s.acceptBtn, (accepting || declining) && s.btnDisabled]}
            onPress={handleDispatchAccept}
            disabled={accepting || declining}
          >
            {accepting ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#000" />
                <Text style={[s.btnText, { color: '#000' }]}>Accept Ride</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[s.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style="light" />
        <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
        <Text style={s.notFoundText}>Request no longer available</Text>
        <BrandedBackButton onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const matchColor =
    request.matchLevel === 'High Match'   ? C.green  :
    request.matchLevel === 'Medium Match' ? C.orange : C.textSub;

  const earnings = ((request.offerPrice ?? 0) * 0.8).toFixed(2);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* ── Navbar ── */}
      <View style={s.navbar}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </Pressable>
        <Text style={s.navTitle}>Trip Request</Text>
        <Countdown expiresAt={request.expiresAt} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Passenger Card ── */}
        <View style={s.passengerCard}>
          <View style={s.avatarWrap}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{(request.passengerName ?? 'P')[0].toUpperCase()}</Text>
            </View>
            {request.isVerified && (
              <View style={s.verifiedDot}>
                <Ionicons name="checkmark" size={9} color="#000" />
              </View>
            )}
          </View>

          <View style={s.passengerMeta}>
            <View style={s.nameRow}>
              <Text style={s.passengerName}>{request.passengerName?.trim() || 'Passenger requesting pickup'}</Text>
              {request.isVerified && (
                <View style={s.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={11} color={C.green} />
                  <Text style={s.verifiedText}>VERIFIED</Text>
                </View>
              )}
            </View>
            <View style={s.ratingRow}>
              {request.passengerRating != null && request.passengerRating > 0 && (
                <>
                  <Ionicons name="star" size={13} color={C.yellow} />
                  <Text style={s.ratingText}>{request.passengerRating.toFixed(1)}</Text>
                </>
              )}
              {request.passengerRideCount != null && request.passengerRideCount > 0 && (
                <Text style={s.rideCount}>· {request.passengerRideCount} rides</Text>
              )}
            </View>
            <View style={s.chipRow}>
              <MetaChip icon="people-outline" label={`${request.passengerCount ?? 1} seat${(request.passengerCount ?? 1) > 1 ? 's' : ''}`} color={C.blue} />
              {request.matchLevel && (
                <MetaChip
                  icon="sparkles-outline"
                  label={request.matchLevel}
                  color={matchColor}
                />
              )}
            </View>
          </View>

          {/* Fare column */}
          <View style={s.fareCol}>
            <Text style={s.fareLabel}>Offer Price</Text>
            <Text style={s.fareAmount}>${(request.offerPrice ?? 0).toFixed(2)}</Text>
            <Text style={s.fareEarns}>~${earnings} yours</Text>
          </View>
        </View>

        {/* ── Route ── */}
        <View style={s.card}>
          <View style={s.routeBlock}>
            <View style={s.routeRow}>
              <View style={s.routeIconWrap}>
                <View style={[s.routeDot, { backgroundColor: C.green }]} />
              </View>
              <View style={s.routeTextCol}>
                <Text style={s.routeSubLabel}>PICKUP</Text>
                <Text style={s.routeAddr}>{request.pickupAddress}</Text>
              </View>
            </View>
            <View style={s.routeConnector}>
              <View style={s.routeLine} />
            </View>
            <View style={s.routeRow}>
              <View style={s.routeIconWrap}>
                <View style={[s.routeDot, { backgroundColor: C.red }]} />
              </View>
              <View style={s.routeTextCol}>
                <Text style={s.routeSubLabel}>DROP-OFF</Text>
                <Text style={s.routeAddr}>{request.dropoffAddress}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Trip Details 4-chip grid ── */}
        <View style={s.chipGrid}>
          {request.distanceKm != null && request.distanceKm > 0 && (
            <DetailChip icon="map-outline" label="Distance" value={formatDistance(request.distanceKm)} color={C.blue} />
          )}
          {request.estimatedMinutes != null && request.estimatedMinutes > 0 && (
            <DetailChip icon="time-outline" label="Duration" value={`${request.estimatedMinutes} min`} color={C.green} />
          )}
          <DetailChip icon="people-outline" label="Seats" value={`${request.passengerCount ?? 1}`} color={C.purple} />
          {request.distanceToPickupKm != null && (
            <DetailChip icon="navigate-outline" label="To pickup" value={formatDistance(request.distanceToPickupKm)} color={C.orange} />
          )}
        </View>

        {request.matchScore != null && request.matchScore > 0 && (
          <View style={s.card}>
            <View style={s.matchHeader}>
              <View style={s.matchTitleRow}>
                <Ionicons name="sparkles" size={16} color={C.purple} />
                <Text style={s.matchTitle}>Match score</Text>
              </View>
              <MatchCircle score={request.matchScore} color={matchColor} />
            </View>
            {request.distanceToPickupKm != null && (
              <View style={s.matchStats}>
                <MatchStatRow
                  label="Pickup Distance"
                  value={`${formatDistance(request.distanceToPickupKm)} away`}
                  color={C.blue}
                />
              </View>
            )}
          </View>
        )}

        {/* ── Timing row ── */}
        <View style={s.timingRow}>
          <View style={s.timingItem}>
            <Ionicons name="time-outline" size={14} color={C.textMuted} />
            <View>
              <Text style={s.timingLabel}>Request Time</Text>
              <Text style={s.timingValue}>{dayjs(request.createdAt).fromNow()}</Text>
            </View>
          </View>
          {request.expiresAt && (
            <View style={[s.timingItem, s.timingItemRight]}>
              <Ionicons name="hourglass-outline" size={14} color={C.orange} />
              <View>
                <Text style={s.timingLabel}>Expires</Text>
                <Text style={[s.timingValue, { color: C.orange }]}>
                  {dayjs(request.expiresAt).fromNow()}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 130 }} />
      </ScrollView>

      {/* ── Action Bar ── */}
      <View style={[s.actionBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Pressable
          style={[s.declineBtn, (accepting || declining) && s.btnDisabled]}
          onPress={handleDecline}
          disabled={accepting || declining}
        >
          {declining ? (
            <ActivityIndicator color={C.red} size="small" />
          ) : (
            <>
              <Ionicons name="close-circle" size={20} color={C.red} />
              <Text style={[s.btnText, { color: C.red }]}>Decline</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={[s.acceptBtn, (accepting || declining) && s.btnDisabled]}
          onPress={handleAccept}
          disabled={accepting || declining}
        >
          {accepting ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#000" />
              <Text style={[s.btnText, { color: '#000' }]}>Accept Request</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: C.bg },

  // navbar
  navbar:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:          { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  navTitle:         { fontSize: 17, fontWeight: '700', color: C.white },
  countdownChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  countdownText:    { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

  scroll:           { padding: 16, gap: 14 },

  // passenger card
  passengerCard:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16 },
  avatarWrap:       { position: 'relative' },
  avatar:           { width: 60, height: 60, borderRadius: 30, backgroundColor: C.blueDim, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.blue + '55' },
  avatarText:       { fontSize: 24, fontWeight: '800', color: C.blue },
  verifiedDot:      { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.surface },
  passengerMeta:    { flex: 1, gap: 5 },
  nameRow:          { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  passengerName:    { fontSize: 16, fontWeight: '700', color: C.white },
  verifiedBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.greenDim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: C.greenBorder },
  verifiedText:     { fontSize: 9, fontWeight: '800', color: C.green, letterSpacing: 0.5 },
  ratingRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText:       { fontSize: 13, color: C.yellow, fontWeight: '700' },
  rideCount:        { fontSize: 12, color: C.textMuted },
  completionRate:   { fontSize: 12, color: C.textMuted },
  chipRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  fareCol:          { alignItems: 'flex-end', gap: 2, minWidth: 72 },
  fareLabel:        { fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  fareAmount:       { fontSize: 22, fontWeight: '900', color: C.green },
  fareEarns:        { fontSize: 10, color: C.textSub },

  // chips
  metaChip:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  metaChipText:     { fontSize: 11, fontWeight: '600' },

  // route
  card:             { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 },
  routeBlock:       { gap: 0 },
  routeRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeIconWrap:    { width: 20, alignItems: 'center', paddingTop: 4 },
  routeDot:         { width: 10, height: 10, borderRadius: 5 },
  routeConnector:   { paddingLeft: 9, paddingVertical: 4 },
  routeLine:        { width: 2, height: 22, backgroundColor: C.border },
  routeTextCol:     { flex: 1, gap: 2, paddingBottom: 8 },
  routeSubLabel:    { fontSize: 9, color: C.textMuted, fontWeight: '700', letterSpacing: 0.8 },
  routeAddr:        { fontSize: 14, color: C.white, fontWeight: '500', lineHeight: 20 },

  // 4-chip trip detail grid
  chipGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailChip:       { flex: 1, minWidth: '44%', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, padding: 12, gap: 6, alignItems: 'flex-start' },
  detailChipIcon:   { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailChipLabel:  { fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  detailChipValue:  { fontSize: 17, fontWeight: '800' },

  // match section
  matchHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  matchTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 7 },
  matchTitle:       { fontSize: 14, fontWeight: '700', color: C.text },
  matchCircle:      { width: 54, height: 54, borderRadius: 27, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceElevated },
  matchCircleNum:   { fontSize: 17, fontWeight: '900', lineHeight: 19 },
  matchCircleLabel: { fontSize: 9, fontWeight: '700', marginTop: -2 },
  matchStats:       { gap: 10 },
  matchStatRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchStatDot:     { width: 5, height: 5, borderRadius: 3, backgroundColor: C.border },
  matchStatLabel:   { fontSize: 13, color: C.textSub },
  matchStatValue:   { fontSize: 13, fontWeight: '700' },
  matchStatSuffix:  { fontSize: 12, color: C.textMuted, marginLeft: 2 },

  // note card
  noteCard:         { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 },
  noteTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteIconWrap:     { width: 30, height: 30, borderRadius: 9, backgroundColor: C.blueDim, alignItems: 'center', justifyContent: 'center' },
  noteTitle:        { fontSize: 14, fontWeight: '700', color: C.text },
  noteText:         { fontSize: 14, color: C.textSub, lineHeight: 21 },

  // timing
  timingRow:        { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  timingItem:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  timingItemRight:  { borderLeftWidth: 1, borderLeftColor: C.border },
  timingLabel:      { fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  timingValue:      { fontSize: 13, fontWeight: '700', color: C.text },

  // not found
  notFoundText:     { fontSize: 16, color: C.textSub, marginTop: 12 },
  goBackBtn:        { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  goBackText:       { fontSize: 14, fontWeight: '700', color: C.green },

  // action bar
  actionBar:        { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  declineBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16, backgroundColor: C.redDim, borderWidth: 1, borderColor: C.red + '44' },
  acceptBtn:        { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16, backgroundColor: C.green },
  btnText:          { fontSize: 16, fontWeight: '800' },
  btnDisabled:      { opacity: 0.4 },
});
