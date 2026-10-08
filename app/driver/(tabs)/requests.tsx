import RouteMapView from '@/components/RouteMapView';
import type { DriverRequest } from '@/lib/driver-store';
import { useDriverStore, useRequestStore, useRideStore, useToastStore } from '@/lib/stores';
import { trpc } from '@/lib/trpc';
import { useRoleNotificationCount } from '@/lib/use-role-notification-count';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@/hooks/use-is-focused';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  FadeIn,
  FadeInDown,
  Layout,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

dayjs.extend(relativeTime);

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  bg:              '#000000',
  surface:         '#0D0D0F',
  card:            '#111114',
  cardBorder:      '#1F1F28',
  elevated:        '#16161C',
  green:           '#10B981',
  greenGlow:       'rgba(16,185,129,0.12)',
  greenDark:       '#059669',
  purple:          '#8B5CF6',
  purpleGlow:      'rgba(139,92,246,0.12)',
  blue:            '#3B82F6',
  blueGlow:        'rgba(59,130,246,0.12)',
  orange:          '#F97316',
  orangeGlow:      'rgba(249,115,22,0.12)',
  red:             '#EF4444',
  amber:           '#F59E0B',
  text:            '#F9FAFB',
  textSub:         '#9CA3AF',
  textMuted:       '#6B7280',
  border:          '#252530',
  glass:           'rgba(255,255,255,0.04)',
};

type FilterKey = 'new' | 'accepted' | 'rejected' | 'expired';

const STATUS_MAP: Record<FilterKey, 'pending' | 'accepted' | 'rejected' | 'expired'> = {
  new: 'pending',
  accepted: 'accepted',
  rejected: 'rejected',
  expired: 'expired',
};

/** Normalized feed item from driver.getRideRequests */
type FeedRequest = DriverRequest & {
  source: 'broadcast' | 'dispatch';
  requestType?: 'dispatch' | 'broadcast' | 'scheduled' | 'carpool_join';
  rideId?: string;
  passengerPhoto?: string;
  passengerRideCount?: number;
  isStudentVerified?: boolean;
  school?: string;
  pickupLabel: string;
  dropoffLabel: string;
  scheduledAt?: string;
  isImmediate: boolean;
  rideType: 'solo' | 'shared' | 'group';
  seatsRequested: number;
  pickupEtaMinutes: number;
  tripDistanceKm: number;
  estimatedTripMinutes: number;
  offeredFare: number;
  estimatedEarnings?: number;
  platformFee?: number;
  paymentType?: 'cash' | 'card';
  matchLabel: 'High Match' | 'Medium Match' | 'Low Match';
  safetyMode?: boolean;
  genderPreference?: string;
  highRating?: boolean;
  status: string;
};

function formatPassengerName(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'passenger') return 'Passenger requesting pickup';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1]?.[0]?.toUpperCase() ?? '';
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

function rideTypeLabel(type: FeedRequest['rideType'], isImmediate?: boolean, scheduledAt?: string): string {
  if (type === 'group') return 'XL';
  if (type === 'shared') return 'Shared';
  if (!isImmediate || scheduledAt) return 'Scheduled';
  return 'Standard';
}

function splitAddress(addr: string): { name: string; sub: string } {
  const trimmed = addr.trim();
  if (!trimmed) return { name: '—', sub: '' };
  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.length <= 1) return { name: parts[0], sub: '' };
  return { name: parts[0], sub: parts.slice(1).join(', ') };
}

function kmToMi(km: number) {
  return km * 0.621371;
}

function isValidFeedItem(r: FeedRequest, filter: FilterKey = 'new'): boolean {
  const pickup = (r.pickupLabel || r.pickup.address || '').trim();
  const dropoff = (r.dropoffLabel || r.dropoff.address || '').trim();
  const fare = r.offeredFare > 0 ? r.offeredFare : r.fare;
  if (!r.id?.trim() || !pickup || !dropoff) return false;
  if (!Number.isFinite(fare) || fare <= 0) return false;
  if (filter === 'new') {
    if (r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now()) return false;
    if (['cancelled', 'completed', 'expired', 'matched'].includes(r.status)) return false;
  }
  return true;
}

function mapLegacyFeedToCard(row: Record<string, unknown>): Record<string, unknown> {
  const source = String(row.source ?? 'dispatch');
  const requestType = source === 'broadcast' ? 'broadcast' : 'dispatch';
  return {
    id: row.requestId,
    requestType,
    rideId: row.rideId ?? (requestType === 'dispatch' ? row.requestId : undefined),
    passengerId: row.passengerId,
    passengerName: row.passengerName,
    passengerRating: row.passengerRating,
    passengerPhotoUrl: row.passengerPhoto,
    pickupAddress: row.pickupLabel ?? row.pickupAddress,
    dropoffAddress: row.dropoffLabel ?? row.dropoffAddress,
    pickupLat: row.pickupLat,
    pickupLng: row.pickupLng,
    dropoffLat: row.dropoffLat,
    dropoffLng: row.dropoffLng,
    scheduledAt: row.scheduledAt,
    requestedAt: row.createdAt,
    fareCents: Math.round(Number(row.offeredFare ?? row.offerPrice ?? 0) * 100),
    distanceMiles: Number(row.tripDistanceKm ?? row.distanceKm ?? 0) * 0.621371,
    durationMinutes: row.estimatedTripMinutes ?? row.estimatedMinutes,
    pickupDistanceMiles: Number(row.distanceToPickupKm ?? 0) * 0.621371,
    matchScore: row.matchScore,
    passengerCount: row.passengerCount,
    rideType: row.rideType,
    status: row.status ?? 'pending',
    safetyPreferences: row.genderPreference,
    isScheduled: !row.isImmediate,
    expiresAt: row.expiresAt,
    matchLabel: row.matchLabel,
  };
}

function mapCardToFeed(r: Record<string, unknown>, filter: FilterKey = 'new'): FeedRequest | null {
  const requestId = String(r.id ?? r.requestId ?? '');
  if (!requestId) return null;

  const pickupLabel = String(r.pickupAddress ?? r.pickupLabel ?? '').trim();
  const dropoffLabel = String(r.dropoffAddress ?? r.dropoffLabel ?? '').trim();
  const offeredFare = Number(r.fareCents ?? 0) / 100 || Number(r.offeredFare ?? r.offerPrice ?? 0);
  if (!pickupLabel || !dropoffLabel || !Number.isFinite(offeredFare) || offeredFare <= 0) return null;

  const requestType = String(r.requestType ?? 'dispatch');
  const source: 'broadcast' | 'dispatch' = requestType === 'broadcast' ? 'broadcast' : 'dispatch';
  const expiresAt = String(r.expiresAt ?? r.requestedAt ?? '');
  const status = String(r.status ?? 'pending');
  const matchLabel = (r.matchLabel as FeedRequest['matchLabel']) ?? 'Medium Match';
  const passengerName = String(r.passengerName ?? '');

  const item: FeedRequest = {
    id: requestId,
    passengerId: String(r.passengerId ?? requestId),
    passengerName,
    passengerAvatar: r.passengerPhotoUrl as string | undefined,
    passengerRating: r.passengerRating != null ? Number(r.passengerRating) : 0,
    passengerRideCount: 0,
    passengerCompletionRate: 0,
    isVerified: false,
    pickup: { address: pickupLabel, lat: Number(r.pickupLat ?? 0), lng: Number(r.pickupLng ?? 0) },
    dropoff: { address: dropoffLabel, lat: Number(r.dropoffLat ?? 0), lng: Number(r.dropoffLng ?? 0) },
    distanceKm: Number(r.distanceMiles ?? r.tripDistanceKm ?? 0) / (r.distanceMiles ? 0.621371 : 1),
    durationMin: Number(r.durationMinutes ?? r.estimatedTripMinutes ?? 0),
    fare: offeredFare,
    seats: Number(r.passengerCount ?? 1),
    bags: 0,
    matchScore: r.matchScore != null ? Number(r.matchScore) : 0,
    matchLevel: matchLabel,
    routeMatchPct: r.matchScore != null ? Number(r.matchScore) : 0,
    extraTimeMin: 0,
    extraDistanceKm: 0,
    demandLevel: 'Medium',
    createdAt: String(r.requestedAt ?? r.createdAt ?? new Date().toISOString()),
    expiresAt,
    distanceToPickupKm: r.pickupDistanceMiles != null
      ? Number(r.pickupDistanceMiles) / 0.621371
      : undefined,
    source,
    rideId: (r.rideId as string) ?? (source === 'dispatch' ? requestId : undefined),
    passengerPhoto: r.passengerPhotoUrl as string | undefined,
    pickupLabel,
    dropoffLabel,
    scheduledAt: r.scheduledAt as string | undefined,
    isImmediate: !r.isScheduled,
    rideType: r.rideType === 'shared' || r.rideType === 'group' ? 'shared' : 'solo',
    seatsRequested: Number(r.passengerCount ?? 1),
    pickupEtaMinutes: 0,
    tripDistanceKm: Number(r.distanceMiles ?? 0) / 0.621371,
    estimatedTripMinutes: Number(r.durationMinutes ?? 0),
    offeredFare,
    matchLabel,
    safetyMode: !!r.safetyPreferences,
    genderPreference: r.safetyPreferences as string | undefined,
    status,
    requestType: requestType as FeedRequest['requestType'],
  } as FeedRequest & { requestType?: string };

  return isValidFeedItem(item, filter) ? item : null;
}

// Stable color per name first letter
const AVATAR_PALETTES = [
  { bg: '#1D2C5E', text: '#60A5FA' }, // blue
  { bg: '#1D3B2F', text: '#34D399' }, // green
  { bg: '#2E1D5E', text: '#A78BFA' }, // purple
  { bg: '#3B1D1D', text: '#F87171' }, // red
  { bg: '#2E2000', text: '#FCD34D' }, // amber
  { bg: '#1D2E3B', text: '#38BDF8' }, // sky
  { bg: '#2B1D3B', text: '#E879F9' }, // fuchsia
  { bg: '#1D3B38', text: '#2DD4BF' }, // teal
];

function avatarPalette(name: string) {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}

// ─── Animated pulse dot ───────────────────────────────────────────────────────

function PulseDot({ color = C.green }: { color?: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.7);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(withTiming(1.8, { duration: 800 }), withTiming(1, { duration: 0 })),
      -1, false,
    );
    opacity.value = withRepeat(
      withSequence(withTiming(0, { duration: 800 }), withTiming(0.7, { duration: 0 })),
      -1, false,
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- scale and opacity are stable Reanimated shared value refs
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: color }, ringStyle]} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

function RadarScanner() {
  const rot = useSharedValue(0);
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 3000 }), -1, false);
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1200 }), withTiming(0.35, { duration: 1200 })),
      -1,
      false,
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- rot and pulse are stable Reanimated shared value refs
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: pulse.value }] }));
  return (
    <View style={x.radarWrap}>
      <Animated.View style={[x.radarRing, x.radarRingOuter, pulseStyle]} />
      <Animated.View style={[x.radarRing, x.radarRingMid]} />
      <Animated.View style={[x.radarSweep, spinStyle]} />
      <View style={x.radarCore}>
        <Ionicons name="radio" size={28} color={C.green} />
      </View>
    </View>
  );
}

function SummaryMetric({
  icon,
  iconColor,
  iconBg,
  count,
  label,
  sub,
  onPress,
}: {
  icon: string;
  iconColor: string;
  iconBg: string;
  count: number;
  label: string;
  sub: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={x.summaryCard} onPress={onPress} disabled={!onPress}>
      <View style={[x.summaryIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={x.summaryCount}>{count}</Text>
      <Text style={x.summaryLabel}>{label}</Text>
      <Text style={x.summarySub}>{sub}</Text>
    </Pressable>
  );
}

function StatusChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={x.chip} onPress={onPress}>
      <Text style={[x.chipText, active && x.chipTextActive]}>
        {label}{count > 0 ? ` (${count})` : ''}
      </Text>
      {active && <View style={x.chipUnderline} />}
    </Pressable>
  );
}

function SmartInsight({ message, onLearnMore }: { message: string; onLearnMore: () => void }) {
  return (
    <View style={x.insightCard}>
      <View style={x.insightIcon}>
        <Ionicons name="bulb-outline" size={18} color={C.green} />
      </View>
      <Text style={x.insightText}>{message}</Text>
      <Pressable style={x.insightLink} onPress={onLearnMore}>
        <Text style={x.insightLinkText}>Learn more</Text>
        <Ionicons name="chevron-forward" size={12} color={C.green} />
      </Pressable>
    </View>
  );
}

function RouteMiniMap({ req }: { req: FeedRequest }) {
  const hasCoords =
    req.pickup.lat !== 0 &&
    req.pickup.lng !== 0 &&
    req.dropoff.lat !== 0 &&
    req.dropoff.lng !== 0;

  if (!hasCoords) {
    return (
      <View style={x.mapPlaceholder}>
        <View style={x.mapLine} />
        <View style={[x.mapDot, { top: 14, left: 16, backgroundColor: C.green }]} />
        <View style={[x.mapDot, { bottom: 14, right: 16, backgroundColor: C.red, borderRadius: 2 }]} />
      </View>
    );
  }

  return (
    <View style={x.mapWrap}>
      <RouteMapView
        pickupLat={req.pickup.lat}
        pickupLng={req.pickup.lng}
        destLat={req.dropoff.lat}
        destLng={req.dropoff.lng}
        height={96}
      />
    </View>
  );
}

function AcceptCountdownButton({
  expiresAt,
  onPress,
  disabled,
  loading,
}: {
  expiresAt?: string;
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  const [secLeft, setSecLeft] = useState<number | null>(null);
  const [totalSec, setTotalSec] = useState(30);

  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    const start = end - 30_000;
    setTotalSec(Math.max(15, Math.round((end - start) / 1000)));
    const tick = () => setSecLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);

  const progress = secLeft != null && totalSec > 0 ? secLeft / totalSec : 1;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <Pressable
      style={({ pressed }: { pressed: boolean }) => [
        x.acceptBtnPremium,
        pressed && { opacity: 0.88 },
        disabled && { opacity: 0.55 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#000" />
      ) : (
        <>
          <View style={x.acceptBtnInner}>
            {secLeft != null && (
              <Svg width={36} height={36} style={x.acceptRing}>
                <Circle
                  cx={18}
                  cy={18}
                  r={radius}
                  stroke="rgba(0,0,0,0.15)"
                  strokeWidth={3}
                  fill="none"
                />
                <Circle
                  cx={18}
                  cy={18}
                  r={radius}
                  stroke="#000"
                  strokeWidth={3}
                  fill="none"
                  strokeDasharray={`${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  rotation={-90}
                  origin="18, 18"
                />
              </Svg>
            )}
            <Ionicons name="checkmark" size={18} color="#000" />
          </View>
          <View style={x.acceptBtnTextCol}>
            <Text style={x.acceptBtnText}>Accept</Text>
            {secLeft != null && (
              <Text style={x.acceptCountdown}>
                {secLeft > 0 ? `Expires in ${secLeft}s` : 'Expiring now'}
              </Text>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

function FooterInsight({
  icon,
  iconColor,
  iconBg,
  title,
  body,
  link,
  onPress,
}: {
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  body: string;
  link: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={x.footerCard} onPress={onPress}>
      <View style={[x.footerIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <Text style={x.footerTitle}>{title}</Text>
      <Text style={x.footerBody}>{body}</Text>
      <View style={x.footerLinkRow}>
        <Text style={x.footerLink}>{link}</Text>
        <Ionicons name="chevron-forward" size={12} color={C.green} />
      </View>
    </Pressable>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={[x.card, x.skeletonCard]}>
      <View style={x.skeletonRow}>
        <View style={[x.skeletonBlock, { width: 48, height: 48, borderRadius: 24 }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[x.skeletonBlock, { width: '60%', height: 14 }]} />
          <View style={[x.skeletonBlock, { width: '40%', height: 11 }]} />
        </View>
        <View style={[x.skeletonBlock, { width: 72, height: 22, borderRadius: 8 }]} />
      </View>
      <View style={[x.skeletonBlock, { height: 1, marginVertical: 12 }]} />
      <View style={{ gap: 10 }}>
        <View style={[x.skeletonBlock, { width: '90%', height: 13 }]} />
        <View style={[x.skeletonBlock, { width: '85%', height: 13 }]} />
      </View>
      <View style={[x.skeletonBlock, { width: '70%', height: 12, marginTop: 12 }]} />
      <View style={x.skeletonActions}>
        <View style={[x.skeletonBlock, { flex: 1, height: 48, borderRadius: 14 }]} />
        <View style={[x.skeletonBlock, { flex: 2, height: 48, borderRadius: 14 }]} />
      </View>
    </View>
  );
}

// ─── Request card ─────────────────────────────────────────────────────────────

function RequestCard({
  req, onPress, onAccept, onDecline, accepting, declining, isPending = false,
}: {
  req: FeedRequest; onPress: () => void;
  onAccept: () => void; onDecline: () => void;
  accepting: boolean; declining: boolean;
  isPending?: boolean;
}) {
  const isActing = accepting || declining;
  const displayName = formatPassengerName(req.passengerName);
  const pal = avatarPalette(displayName);
  const initials = displayName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'P';
  const pickup = splitAddress(req.pickupLabel || req.pickup.address);
  const dropoff = splitAddress(req.dropoffLabel || req.dropoff.address);
  const distPickupMi = kmToMi(req.distanceToPickupKm ?? 0);
  const tripMi = kmToMi(req.tripDistanceKm || req.distanceKm || 0);
  const tripMin = req.estimatedTripMinutes || req.durationMin || 0;
  const seats = req.seatsRequested || req.seats || 1;
  const typeLabel = rideTypeLabel(req.rideType, req.isImmediate, req.scheduledAt);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!isPending) return;
    pulse.value = withRepeat(
      withSequence(withTiming(1.04, { duration: 900 }), withTiming(1, { duration: 900 })),
      -1,
      false,
    );
  }, [isPending]); // eslint-disable-line react-hooks/exhaustive-deps -- pulse is a stable Reanimated shared value ref
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18).stiffness(160)}
      exiting={SlideOutLeft.duration(220)}
      layout={Layout.springify()}
      style={x.cardWrap}
    >
      <Animated.View style={[x.card, isPending && pulseStyle, isPending && x.cardNew]}>
        <View style={x.cardTopRow}>
          <View style={x.cardTopLeft}>
            {isPending && (
              <View style={x.newBadge}>
                <PulseDot color={C.green} />
                <Text style={x.newBadgeText}>New</Text>
              </View>
            )}
            {distPickupMi > 0 && (
              <View style={x.awayBadge}>
                <Ionicons name="navigate-outline" size={10} color={C.green} />
                <Text style={x.awayText}>{distPickupMi.toFixed(1)} mi away</Text>
              </View>
            )}
          </View>
          <View style={x.typeBadge}>
            <Text style={x.typeBadgeText}>{typeLabel}</Text>
          </View>
        </View>

        <Pressable style={x.cardBody} onPress={onPress} disabled={isActing}>
          <View style={x.cardMainCol}>
            <View style={x.passengerRow}>
              {req.passengerPhoto ? (
                <Image source={{ uri: req.passengerPhoto }} style={x.avatarImg} />
              ) : (
                <View style={[x.avatar, { backgroundColor: pal.bg, borderColor: pal.text + '33' }]}>
                  <Text style={[x.avatarText, { color: pal.text }]}>{initials}</Text>
                </View>
              )}
              <View style={x.passengerMeta}>
                <Text style={x.passengerName} numberOfLines={1}>{displayName}</Text>
                <View style={x.passengerSubRow}>
                  {req.passengerRating > 0 && (
                    <Text style={x.ratingText}>{req.passengerRating.toFixed(1)} ★</Text>
                  )}
                  <Text style={x.seatsText}>{seats} passenger{seats !== 1 ? 's' : ''}</Text>
                  {req.isVerified && (
                    <Ionicons name="shield-checkmark" size={12} color="#60A5FA" />
                  )}
                </View>
              </View>
            </View>

            <View style={x.routeSection}>
              <View style={x.routeRow}>
                <View style={[x.routeDot, { backgroundColor: C.green }]} />
                <View style={x.routeTextCol}>
                  <Text style={x.routeName} numberOfLines={1}>{pickup.name}</Text>
                  {pickup.sub ? <Text style={x.routeSub} numberOfLines={1}>{pickup.sub}</Text> : null}
                </View>
              </View>
              <View style={x.routeSpacer} />
              <View style={x.routeRow}>
                <View style={[x.routeDot, { backgroundColor: C.red, borderRadius: 2 }]} />
                <View style={x.routeTextCol}>
                  <Text style={x.routeName} numberOfLines={1}>{dropoff.name}</Text>
                  {dropoff.sub ? <Text style={x.routeSub} numberOfLines={1}>{dropoff.sub}</Text> : null}
                </View>
              </View>
            </View>

            <View style={x.statsRow}>
              <View style={x.statCol}>
                <Ionicons name="time-outline" size={14} color={C.textMuted} />
                <Text style={x.statValue}>{tripMin > 0 ? `${tripMin} min` : '—'}</Text>
                <Text style={x.statLabel}>ETA</Text>
              </View>
              <View style={x.statDivider} />
              <View style={x.statCol}>
                <Ionicons name="git-branch-outline" size={14} color={C.textMuted} />
                <Text style={x.statValue}>{tripMi > 0 ? `${tripMi.toFixed(1)} mi` : '—'}</Text>
                <Text style={x.statLabel}>Distance</Text>
              </View>
              <View style={x.statDivider} />
              <View style={x.statCol}>
                <Ionicons name="cash-outline" size={14} color={C.textMuted} />
                <Text style={[x.statValue, { color: C.green }]}>
                  {req.offeredFare > 0 ? `$${req.offeredFare.toFixed(2)}` : '—'}
                </Text>
                <Text style={x.statLabel}>Est. fare</Text>
              </View>
            </View>
          </View>

          <RouteMiniMap req={req} />
        </Pressable>

        {isPending ? (
          <View style={x.actions}>
            <Pressable
              style={({ pressed }: { pressed: boolean }) => [x.declineBtn, pressed && { opacity: 0.75 }, declining && { opacity: 0.5 }]}
              onPress={onDecline}
              disabled={isActing}
            >
              {declining ? <ActivityIndicator size="small" color={C.red} /> : <Text style={x.declineBtnText}>Decline</Text>}
            </Pressable>
            <AcceptCountdownButton
              expiresAt={req.expiresAt}
              onPress={onAccept}
              disabled={isActing}
              loading={accepting}
            />
          </View>
        ) : (
          <Pressable style={x.viewDetailsRow} onPress={onPress}>
            <Text style={x.viewDetailsText}>View Details</Text>
            <Ionicons name="chevron-forward" size={14} color={C.green} />
          </Pressable>
        )}
      </Animated.View>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RequestsTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const show   = useToastStore((s) => s.show);
  const isFocused = useIsFocused();

  const session  = useDriverStore((s) => s.session);
  const isOnline = session?.status === 'online' || session?.status === 'on_ride';

  const acceptingId    = useRequestStore((s) => s.acceptingId);
  const decliningId    = useRequestStore((s) => s.decliningId);
  const setRequests    = useRequestStore((s) => s.setRequests);
  const removeRequest  = useRequestStore((s) => s.removeRequest);
  const setAcceptingId = useRequestStore((s) => s.setAcceptingId);
  const setDecliningId = useRequestStore((s) => s.setDecliningId);
  const addAcceptedRide = useRideStore((s) => s.addAcceptedRide);

  const [filter, setFilter] = useState<FilterKey>('new');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'nearest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [liveData, setLiveData] = useState<FeedRequest[]>([]);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  const [isFetching, setIsFetching] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const screenW = Dimensions.get('window').width;
  const isTablet = screenW >= 768;
  const contentPad = isTablet ? Math.max(24, (screenW - 720) / 2) : 16;

  const { data: notifData } = useRoleNotificationCount('driver', isFocused);
  const unreadNotifs = notifData?.count ?? 0;

  const countOpts = { enabled: isFocused, staleTime: 45_000 };
  const newCountQ = trpc.driver.getRideRequests.useQuery(
    { status: 'pending', range: 'all_time' },
    { ...countOpts, enabled: countOpts.enabled && isOnline },
  );
  const acceptedCountQ = trpc.driver.getRideRequests.useQuery({ status: 'accepted', range: 'all_time' }, countOpts);
  const rejectedCountQ = trpc.driver.getRideRequests.useQuery({ status: 'rejected', range: 'all_time' }, countOpts);
  const expiredCountQ = trpc.driver.getRideRequests.useQuery({ status: 'expired', range: 'all_time' }, countOpts);

  const { data: dashStats } = trpc.driver.getDashboardStats.useQuery(
    { range: 'today' },
    { enabled: isFocused, staleTime: 30_000 },
  );

  const utils = trpc.useUtils();
  const acceptMut = trpc.driver.acceptDriverRequest.useMutation();
  const rejectMut = trpc.driver.rejectDriverRequest.useMutation();

  const { data: requestData, refetch } = trpc.driver.getRideRequests.useQuery(
    { status: STATUS_MAP[filter], range: 'all_time' },
    { enabled: isFocused && (filter === 'new' ? isOnline : true), staleTime: 15_000, refetchInterval: isFocused && filter === 'new' && isOnline ? 15_000 : false },
  );

  const invalidateAfterAction = useCallback(() => {
    void utils.driver.getRideRequests.invalidate();
    void utils.driver.getDriverRides.invalidate();
    void utils.driver.getDashboardStats.invalidate();
    void utils.notifications.getDriverNotifications.invalidate();
    void utils.notifications.unreadCount.invalidate();
  }, [utils]);

  const doFetch = useCallback(async () => {
    if (filter === 'new' && !isOnline) return;
    setIsFetching(true);
    try {
      const result = await refetch();
      let rows = (result.data ?? []) as Record<string, unknown>[];
      if (filter === 'new' && rows.length === 0 && isOnline) {
        try {
          const legacy = await utils.driver.getNearbyPassengerRequests.fetch();
          rows = (legacy as unknown as Record<string, unknown>[]).map(mapLegacyFeedToCard);
        } catch { /* unified feed is primary */ }
      }
      const apiData: FeedRequest[] = rows
        .map((row) => mapCardToFeed(row, filter))
        .filter((row): row is FeedRequest => row != null)
        .filter((row) => !ignoredIds.has(row.id));

      setRequests(apiData.map((r) => ({
        requestId:         r.id,
        passengerId:       Number(r.passengerId) || undefined,
        passengerName:     r.passengerName,
        passengerRating:   r.passengerRating > 0 ? r.passengerRating : undefined,
        isVerified:        r.isVerified,
        pickupAddress:     r.pickup.address,
        dropoffAddress:    r.dropoff.address,
        pickupLat:         r.pickup.lat,
        pickupLng:         r.pickup.lng,
        offerPrice:        r.offeredFare,
        passengerCount:    r.seats,
        distanceKm:        r.tripDistanceKm,
        estimatedMinutes:  r.estimatedTripMinutes,
        distanceToPickupKm: r.distanceToPickupKm,
        expiresAt:         r.expiresAt,
        createdAt:         r.createdAt,
        matchScore:        r.matchScore > 0 ? r.matchScore : undefined,
        matchLevel:        r.matchLabel,
      })));

      setLiveData(apiData);
    } catch {
      setLiveData([]);
      setRequests([]);
    } finally {
      setIsFetching(false);
      setInitialLoad(false);
    }
  }, [filter, isOnline, refetch, setRequests, ignoredIds, utils]);

  useEffect(() => {
    if (!isFocused) return;
    if (filter === 'new' && !isOnline) {
      setLiveData([]);
      setRequests([]);
      setInitialLoad(false);
      return;
    }
    doFetch();
  }, [isFocused, filter, isOnline, requestData, doFetch, setRequests]);

  const handleAccept = useCallback(async (req: FeedRequest) => {
    if (acceptingId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAcceptingId(req.id);

    setLiveData((prev) => prev.filter((r) => r.id !== req.id));
    removeRequest(req.id);

    try {
      const requestType = req.requestType
        ?? (req.source === 'broadcast' ? 'broadcast' : 'dispatch');
      const result = await acceptMut.mutateAsync({ requestId: req.id, requestType: requestType as any });
      const realRideId = result.rideId ?? req.rideId ?? req.id;

      addAcceptedRide({
        rideId:          realRideId,
        passengerName:   formatPassengerName(req.passengerName),
        passengerRating: req.passengerRating,
        isVerified:      req.isVerified,
        pickupAddress:   req.pickupLabel || req.pickup.address,
        dropoffAddress:  req.dropoffLabel || req.dropoff.address,
        offerPrice:      req.offeredFare,
        passengerCount:  req.seats,
        distanceKm:      req.tripDistanceKm,
        estimatedMinutes: req.estimatedTripMinutes,
        createdAt:       req.createdAt,
        status:          'upcoming',
        rideStep:        'driver_en_route',
        distanceAwayKm:  req.distanceToPickupKm ?? 0,
        paymentMethod:   req.paymentType === 'card' ? 'Card' : req.paymentType === 'cash' ? 'Cash' : undefined,
        scheduledAt:     req.scheduledAt,
      });

      const pickupShort = (req.pickupLabel || req.pickup.address).split(',')[0];
      show(`Accepted! Head to ${pickupShort}`, 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAfterAction();
      router.push({ pathname: '/driver/ride-detail', params: { rideId: realRideId } });
    } catch (e: any) {
      setLiveData((prev) => [...prev, req]);
      show(e?.message ?? 'Failed to accept ride. Please try again.', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAcceptingId(null);
    }
  }, [acceptingId, addAcceptedRide, acceptMut, removeRequest, router, show, invalidateAfterAction, setAcceptingId]);

  const handleDecline = useCallback(async (req: FeedRequest) => {
    if (decliningId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDecliningId(req.id);
    setLiveData((prev) => prev.filter((r) => r.id !== req.id));
    removeRequest(req.id);
    setIgnoredIds((prev) => new Set(prev).add(req.id));
    try {
      const requestType = req.requestType
        ?? (req.source === 'broadcast' ? 'broadcast' : 'dispatch');
      await rejectMut.mutateAsync({ requestId: req.id, requestType: requestType as any });
      invalidateAfterAction();
      show('Request declined', 'info');
    } catch { /* local ignore is sufficient */ }
    finally { setDecliningId(null); }
  }, [decliningId, rejectMut, removeRequest, show, invalidateAfterAction, setDecliningId]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let sorted = liveData.filter((r) => {
      if (!q) return true;
      return (
        r.passengerName.toLowerCase().includes(q) ||
        r.pickupLabel.toLowerCase().includes(q) ||
        r.dropoffLabel.toLowerCase().includes(q)
      );
    });
    sorted = [...sorted];
    if (sortOrder === 'nearest') {
      sorted.sort((a, b) => (a.distanceToPickupKm ?? 99) - (b.distanceToPickupKm ?? 99));
    } else if (sortOrder === 'oldest') {
      sorted.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
    } else {
      sorted.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    }
    return sorted;
  }, [liveData, sortOrder, searchQuery]);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'new', label: 'New' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'expired', label: 'Expired' },
  ];

  const counts: Record<FilterKey, number> = {
    new: newCountQ.data?.length ?? (filter === 'new' ? liveData.length : 0),
    accepted: acceptedCountQ.data?.length ?? (filter === 'accepted' ? liveData.length : 0),
    rejected: rejectedCountQ.data?.length ?? (filter === 'rejected' ? liveData.length : 0),
    expired: expiredCountQ.data?.length ?? (filter === 'expired' ? liveData.length : 0),
  };

  const acceptanceRate = dashStats?.acceptanceRate ?? session?.acceptanceRate ?? 100;
  const activeFilterCount = (searchQuery.trim() ? 1 : 0) + (sortOrder !== 'newest' ? 1 : 0);

  const insightMessage = useMemo(() => {
    if (!isOnline) return 'Go online to start receiving nearby pickup requests.';
    if (acceptanceRate < 90) return 'High acceptance rate drivers receive more trips. Keep your rate above 90%.';
    if (filter === 'new' && liveData.length === 0) return 'Stay online to get more requests. Demand updates as you drive.';
    return 'High acceptance rate drivers receive more trips. Stay in busy areas for faster matches.';
  }, [isOnline, acceptanceRate, filter, liveData.length]);

  const ListHeader = (
    <View style={{ paddingHorizontal: contentPad }}>
      <View style={x.header}>
        <View style={x.headerTextCol}>
          <View style={x.headerTitleRow}>
            <PulseDot color={isOnline ? C.green : C.textMuted} />
            <Text style={x.headerTitle}>Requests</Text>
          </View>
          <Text style={x.headerSub}>
            {isOnline ? "You're online · Receiving requests" : 'Go online to receive requests'}
          </Text>
        </View>
        <View style={x.headerActions}>
          <Pressable
            style={[x.headerBtn, showSearch && x.headerBtnActive]}
            onPress={() => setShowSearch((v) => !v)}
            accessibilityLabel="Search requests"
          >
            <Ionicons name="search-outline" size={20} color={showSearch ? C.green : C.text} />
          </Pressable>
          <Pressable
            style={[x.headerBtn, showFilters && x.headerBtnActive]}
            onPress={() => setShowFilters((v) => !v)}
            accessibilityLabel="Filter requests"
          >
            <Ionicons name="options-outline" size={20} color={showFilters ? C.green : C.text} />
            {activeFilterCount > 0 && (
              <View style={x.filterBadge}>
                <Text style={x.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={x.headerBtn}
            onPress={() => router.push('/notifications?role=driver' as any)}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={20} color={C.text} />
            {(unreadNotifs > 0 || counts.new > 0) && (
              <View style={x.notifBadge}>
                <Text style={x.notifBadgeText}>{unreadNotifs > 0 ? (unreadNotifs > 9 ? '9+' : unreadNotifs) : counts.new}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {(showSearch || searchQuery.length > 0) && (
        <View style={x.searchRow}>
          <Ionicons name="search" size={18} color={C.textMuted} />
          <TextInput
            style={x.searchInput}
            placeholder="Search passenger or address…"
            placeholderTextColor={C.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={x.summaryRow}>
        <SummaryMetric icon="flash-outline" iconColor={C.green} iconBg={C.greenGlow} count={counts.new} label="New" sub="Live requests" onPress={() => setFilter('new')} />
        <SummaryMetric icon="checkmark-circle-outline" iconColor={C.blue} iconBg={C.blueGlow} count={counts.accepted} label="Accepted" sub="Waiting on you" onPress={() => setFilter('accepted')} />
        <SummaryMetric icon="time-outline" iconColor={C.purple} iconBg={C.purpleGlow} count={counts.expired} label="Expired" sub="Last 24h" onPress={() => setFilter('expired')} />
        <SummaryMetric icon="close-circle-outline" iconColor={C.orange} iconBg={C.orangeGlow} count={counts.rejected} label="Rejected" sub="Last 24h" onPress={() => setFilter('rejected')} />
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={x.chipRow}>
        {FILTERS.map((f) => (
          <StatusChip
            key={f.key}
            label={f.label}
            count={counts[f.key]}
            active={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ScrollView>

      <View style={x.subHeader}>
        <Text style={x.subHeaderCount}>
          <Text style={{ color: C.green }}>{filtered.length}</Text>
          {' '}{filter === 'new' ? 'live' : filter} request{filtered.length !== 1 ? 's' : ''}
        </Text>
        <Pressable
          style={x.sortBtn}
          onPress={() => setSortOrder((o) => (o === 'newest' ? 'nearest' : o === 'nearest' ? 'oldest' : 'newest'))}
        >
          <Text style={x.sortText}>{sortOrder === 'newest' ? 'Newest' : sortOrder === 'nearest' ? 'Nearest' : 'Oldest'}</Text>
          <Ionicons name="chevron-down" size={12} color={C.textMuted} />
        </Pressable>
      </View>

      <SmartInsight
        message={insightMessage}
        onLearnMore={() => router.push('/help-support')}
      />
    </View>
  );

  const ListFooter = (
    <View style={[x.footerWrap, { paddingHorizontal: contentPad }]}>
      <View style={[x.footerGrid, isTablet && x.footerGridTablet]}>
        <FooterInsight
          icon="shield-checkmark-outline"
          iconColor={C.green}
          iconBg={C.greenGlow}
          title="High acceptance = More rides"
          body="Drivers with 90%+ acceptance receive more requests."
          link="View stats"
          onPress={() => router.push('/driver/dashboard')}
        />
        <FooterInsight
          icon="trophy-outline"
          iconColor={C.purple}
          iconBg={C.purpleGlow}
          title="Pro Tip"
          body="Arrive 5 minutes early to improve ratings."
          link="Learn more"
          onPress={() => router.push('/help-support')}
        />
      </View>
      <View style={{ height: 100 }} />
    </View>
  );

  return (
    <View style={[x.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <FlatList
        data={filtered}
        keyExtractor={(r: FeedRequest) => r.id}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={
          initialLoad && isFetching ? (
            <View style={{ paddingHorizontal: contentPad, gap: 14 }}>
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : (
            <Animated.View entering={FadeIn.duration(300)} style={x.empty}>
              {isFetching ? (
                <ActivityIndicator size="large" color={C.green} />
              ) : (
                <RadarScanner />
              )}
              <Text style={x.emptyTitle}>
                {isFetching ? 'Scanning nearby area…' : isOnline ? 'No pickup requests nearby' : "You're offline"}
              </Text>
              <Text style={x.emptySub}>
                {isFetching
                  ? 'Looking for passengers in your area'
                  : isOnline
                    ? "Stay online and we'll notify you when passengers request a ride."
                    : 'Go online to receive nearby passenger requests.'}
              </Text>
              <View style={x.emptyActions}>
                <Pressable style={x.emptyPrimary} onPress={doFetch} disabled={isFetching}>
                  <Ionicons name="refresh" size={16} color="#000" />
                  <Text style={x.emptyPrimaryText}>Refresh Now</Text>
                </Pressable>
                <Pressable
                  style={x.emptySecondary}
                  onPress={() => { setSortOrder('nearest'); setShowSearch(true); show('Showing nearest requests in your area', 'info'); }}
                >
                  <Text style={x.emptySecondaryText}>Adjust Search Area</Text>
                </Pressable>
                <Pressable style={x.emptySecondary} onPress={() => router.push('/driver/dashboard')}>
                  <Text style={x.emptySecondaryText}>Go to Demand Zones</Text>
                  <Ionicons name="chevron-forward" size={14} color={C.green} />
                </Pressable>
              </View>
            </Animated.View>
          )
        }
        renderItem={({ item }: { item: FeedRequest }) => (
          <View style={{ paddingHorizontal: contentPad, marginBottom: 14 }}>
            <RequestCard
              req={item}
              isPending={filter === 'new'}
              onPress={() => router.push({
                pathname: '/driver/request-detail',
                params: { requestId: item.id, source: item.source ?? 'dispatch' },
              })}
              onAccept={() => handleAccept(item)}
              onDecline={() => handleDecline(item)}
              accepting={acceptingId === item.id}
              declining={decliningId === item.id}
            />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        refreshing={isFetching}
        onRefresh={() => void doFetch()}
        itemLayoutAnimation={Layout.springify()}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const x = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 12 },
  headerTextCol: { flex: 1, gap: 4 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: C.textMuted, marginLeft: 20 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  headerBtnActive: { borderColor: C.green, backgroundColor: C.greenGlow },
  filterBadge: {
    position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 9, fontWeight: '800', color: '#000' },
  notifBadge: {
    position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  notifBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface,
    borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: C.text, padding: 0 },

  summaryRow: { gap: 10, paddingBottom: 12 },
  summaryCard: {
    width: 132, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder,
    padding: 12, gap: 4,
  },
  summaryIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  summaryCount: { fontSize: 24, fontWeight: '800', color: C.text },
  summaryLabel: { fontSize: 13, fontWeight: '700', color: C.text },
  summarySub: { fontSize: 11, color: C.textMuted },

  chipRow: { gap: 4, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  chip: { paddingHorizontal: 14, paddingVertical: 10, position: 'relative' },
  chipText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  chipTextActive: { color: C.text, fontWeight: '700' },
  chipUnderline: { position: 'absolute', bottom: 0, left: 14, right: 14, height: 2, borderRadius: 1, backgroundColor: C.green },

  subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  subHeaderCount: { fontSize: 13, fontWeight: '600', color: C.textSub },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  sortText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },

  insightCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.greenGlow,
    borderRadius: 14, borderWidth: 1, borderColor: C.green + '33', padding: 12, marginBottom: 14,
  },
  insightIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  insightText: { flex: 1, fontSize: 13, color: C.textSub, lineHeight: 18 },
  insightLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  insightLinkText: { fontSize: 12, fontWeight: '600', color: C.green },

  cardWrap: { borderRadius: 20, overflow: 'hidden' },
  card: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 20,
    overflow: 'hidden', padding: 14, gap: 12,
  },
  cardNew: { borderColor: C.green + '55', shadowColor: C.green, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  newBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.greenGlow, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: C.green + '44' },
  newBadgeText: { fontSize: 11, fontWeight: '800', color: C.green },
  awayBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.glass, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  awayText: { fontSize: 11, fontWeight: '600', color: C.textSub },
  typeBadge: { backgroundColor: C.purpleGlow, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.purple + '44' },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: C.purple },

  cardBody: { flexDirection: 'row', gap: 10 },
  cardMainCol: { flex: 1, gap: 12, minWidth: 0 },
  passengerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { fontSize: 16, fontWeight: '900' },
  passengerMeta: { flex: 1, gap: 3 },
  passengerName: { fontSize: 16, fontWeight: '800', color: C.text },
  passengerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ratingText: { fontSize: 12, fontWeight: '700', color: C.amber },
  seatsText: { fontSize: 12, color: C.textMuted },

  routeSection: { gap: 4 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  routeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  routeSpacer: { width: 1, height: 10, backgroundColor: C.border, marginLeft: 3 },
  routeTextCol: { flex: 1, gap: 1 },
  routeName: { fontSize: 14, fontWeight: '600', color: C.text },
  routeSub: { fontSize: 11, color: C.textMuted },

  statsRow: { flexDirection: 'row', backgroundColor: C.elevated, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  statCol: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  statDivider: { width: 1, backgroundColor: C.border },
  statValue: { fontSize: 14, fontWeight: '700', color: C.text },
  statLabel: { fontSize: 10, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase' },

  mapWrap: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  mapPlaceholder: {
    width: 96, height: 96, borderRadius: 12, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden', position: 'relative',
  },
  mapLine: { position: 'absolute', top: 20, left: 24, right: 24, bottom: 20, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: C.green + '66', borderStyle: 'dashed' },
  mapDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },

  actions: { flexDirection: 'row', gap: 10 },
  declineBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.red + '55' },
  declineBtnText: { fontSize: 15, fontWeight: '700', color: C.red },
  acceptBtnPremium: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.green,
  },
  acceptBtnInner: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  acceptRing: { position: 'absolute' },
  acceptBtnTextCol: { gap: 1 },
  acceptBtnText: { fontSize: 16, fontWeight: '800', color: '#000' },
  acceptCountdown: { fontSize: 11, fontWeight: '600', color: 'rgba(0,0,0,0.65)' },
  viewDetailsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  viewDetailsText: { fontSize: 14, fontWeight: '600', color: C.green },

  radarWrap: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  radarRing: { position: 'absolute', borderRadius: 999, borderWidth: 1, borderColor: C.green + '44' },
  radarRingOuter: { width: 96, height: 96 },
  radarRingMid: { width: 64, height: 64, borderColor: C.green + '66' },
  radarSweep: { position: 'absolute', width: 48, height: 2, backgroundColor: C.green, top: '50%', left: '50%', marginLeft: -24, transformOrigin: 'left center' },
  radarCore: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.greenGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.green + '55' },

  footerWrap: { paddingTop: 8 },
  footerGrid: { gap: 12 },
  footerGridTablet: { flexDirection: 'row' },
  footerCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder,
    padding: 14, gap: 6, minWidth: 160,
  },
  footerIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  footerTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  footerBody: { fontSize: 13, color: C.textMuted, lineHeight: 18 },
  footerLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  footerLink: { fontSize: 13, fontWeight: '600', color: C.green },

  skeletonCard: { padding: 14 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonBlock: { backgroundColor: C.elevated, borderRadius: 6 },
  skeletonActions: { flexDirection: 'row', gap: 8, marginTop: 16 },

  empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 36, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center' },
  emptySub: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyActions: { width: '100%', maxWidth: 320, gap: 10, marginTop: 16 },
  emptyPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.green, borderRadius: 14, paddingVertical: 14 },
  emptyPrimaryText: { fontSize: 15, fontWeight: '700', color: '#000' },
  emptySecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  emptySecondaryText: { fontSize: 14, fontWeight: '600', color: C.green },
});
