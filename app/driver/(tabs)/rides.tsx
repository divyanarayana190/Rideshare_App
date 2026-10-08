import { openMapsNavigation } from '@/lib/driver-navigation';
import { useDriverStore, useToastStore } from '@/lib/stores';
import { useIsFocused } from '@/hooks/use-is-focused';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth-context-v2';
import type { DriverRideTab, DriverStatRange } from '@/shared/driver/constants';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  bg: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1C1C1C',
  border: '#252525',
  green: '#22C55E',
  greenDim: '#0D2818',
  greenBorder: '#1A4029',
  orange: '#F97316',
  purple: '#8B5CF6',
  blue: '#3B82F6',
  red: '#EF4444',
  text: '#F9FAFB',
  textSub: '#9CA3AF',
  textMuted: '#6B7280',
};

const WEEKLY_RIDE_GOAL = 30;

type EnrichedRide = {
  rideId: string;
  passengerName: string;
  passengerRating: number;
  isVerified: boolean;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt: string;
  fare: number;
  distanceKm: number;
  estimatedMinutes: number;
  passengerCount: number;
  paymentMethod: string;
  status: string;
  rideType: string;
  rideStep?: string | null;
  pickupLat: number;
  pickupLng: number;
};

type RideTypeFilter = 'all' | 'instant' | 'scheduled' | 'shared';

function kmToMi(km: number) {
  return km * 0.621371;
}

function formatDistance(km: number) {
  if (!km || km <= 0) return '—';
  return `${kmToMi(km).toFixed(1)} mi`;
}

function formatRideTime(iso: string) {
  const d = dayjs(iso);
  if (d.isSame(dayjs(), 'day')) return `Today · ${d.format('h:mm A')}`;
  if (d.isSame(dayjs().add(1, 'day'), 'day')) return `Tomorrow · ${d.format('h:mm A')}`;
  return d.format('MMM D · h:mm A');
}

function perfLabel(pct: number): string {
  if (pct >= 95) return 'Top Driver';
  if (pct >= 90) return 'Excellent';
  if (pct >= 75) return 'Good';
  return 'Fair';
}

function StatusPill({ label, tone }: { label: string; tone: 'live' | 'scheduled' | 'completed' | 'missed' | 'cancelled' }) {
  const tones = {
    live: { bg: C.greenDim, border: C.greenBorder, color: C.green },
    scheduled: { bg: '#2A1400', border: '#92400E', color: C.orange },
    completed: { bg: C.greenDim, border: C.greenBorder, color: C.green },
    missed: { bg: '#2A1400', border: '#92400E', color: C.orange },
    cancelled: { bg: '#2A0A0A', border: '#7F1D1D', color: C.red },
  };
  const t = tones[tone];
  return (
    <View style={[s.statusPill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[s.statusPillText, { color: t.color }]}>{label}</Text>
    </View>
  );
}

function MetricTile({
  icon,
  iconColor,
  value,
  label,
  onPress,
  compact,
}: {
  icon: string;
  iconColor: string;
  value: string;
  label: string;
  onPress?: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      style={[s.metricTile, compact && s.metricTileCompact]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[s.metricIcon, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon as any} size={compact ? 16 : 18} color={iconColor} />
      </View>
      <Text style={[s.metricValue, compact && s.metricValueCompact]} numberOfLines={1}>{value}</Text>
      <Text style={s.metricLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function InsightCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <View style={s.insightCard}>
      <Text style={s.insightLabel}>{label}</Text>
      <Text style={[s.insightValue, accent ? { color: accent } : null]}>{value}</Text>
      {sub ? <Text style={s.insightSub}>{sub}</Text> : null}
    </View>
  );
}

function PremiumRideCard({
  ride,
  tab,
  onNavigate,
  onDetails,
  onStart,
  onComplete,
  onCancel,
  busy,
}: {
  ride: EnrichedRide;
  tab: DriverRideTab;
  onNavigate: () => void;
  onDetails: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const isActive = tab === 'active' || ride.status === 'active';
  const inProgress = ride.rideStep === 'ride_started' || ride.rideStep === 'ride_in_progress';
  const canStart = isActive && !inProgress && ride.rideStep !== 'completed';
  const canComplete = isActive && inProgress;
  const canCancel = tab === 'upcoming' || tab === 'active';

  return (
    <View style={[s.rideCard, isActive && s.rideCardActive]}>
      <View style={s.rideCardTop}>
        <View style={s.rideCardTopLeft}>
          {isActive ? (
            <>
              <View style={s.liveBadge}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>LIVE</Text>
              </View>
              <Text style={s.activeLabel}>Active Ride</Text>
            </>
          ) : (
            <StatusPill
              label={ride.rideType === 'scheduled' ? 'Scheduled' : ride.rideType === 'shared' ? 'Shared' : 'Instant'}
              tone={tab === 'completed' ? 'completed' : tab === 'missed' ? 'missed' : tab === 'cancelled' ? 'cancelled' : 'scheduled'}
            />
          )}
        </View>
        <View style={s.rideCardTopRight}>
          {isActive && (
            <View style={s.onTripRow}>
              <View style={s.onTripDot} />
              <Text style={s.onTripText}>On Trip</Text>
            </View>
          )}
          <Text style={s.rideTime}>{formatRideTime(ride.scheduledAt)}</Text>
        </View>
      </View>

      <View style={s.passengerRow}>
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{ride.passengerName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={s.ratingChip}>
            <Ionicons name="star" size={9} color="#F59E0B" />
            <Text style={s.ratingChipText}>{ride.passengerRating.toFixed(1)}</Text>
          </View>
        </View>
        <View style={s.passengerMeta}>
          <View style={s.nameRow}>
            <Text style={s.passengerName} numberOfLines={1}>{ride.passengerName}</Text>
            {ride.isVerified && (
              <View style={s.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={10} color="#60A5FA" />
              </View>
            )}
          </View>
          <Text style={s.passengerSub}>
            {ride.passengerCount} passenger{ride.passengerCount !== 1 ? 's' : ''} · {ride.paymentMethod}
          </Text>
        </View>
        <View style={s.fareCol}>
          <Text style={s.fareAmount}>${ride.fare.toFixed(2)}</Text>
          <Text style={s.fareMethod}>{ride.paymentMethod}</Text>
        </View>
      </View>

      <View style={s.routeBlock}>
        <View style={s.routeRow}>
          <View style={[s.routeDot, { backgroundColor: C.green }]} />
          <Text style={s.routeText} numberOfLines={2}>{ride.pickupAddress}</Text>
        </View>
        <View style={s.routeConnector} />
        <View style={s.routeRow}>
          <View style={[s.routeDot, { backgroundColor: C.orange }]} />
          <Text style={s.routeText} numberOfLines={2}>{ride.dropoffAddress}</Text>
        </View>
      </View>

      <View style={s.metaRow}>
        <View style={s.metaChip}>
          <Ionicons name="navigate-outline" size={12} color={C.textMuted} />
          <Text style={s.metaChipText}>{formatDistance(ride.distanceKm)}</Text>
        </View>
        <View style={s.metaChip}>
          <Ionicons name="time-outline" size={12} color={C.textMuted} />
          <Text style={s.metaChipText}>{ride.estimatedMinutes > 0 ? `${ride.estimatedMinutes} min` : '—'}</Text>
        </View>
        <View style={s.metaChip}>
          <Ionicons name="car-outline" size={12} color={C.textMuted} />
          <Text style={s.metaChipText}>{ride.rideType}</Text>
        </View>
      </View>

      {(tab === 'upcoming' || tab === 'active') && (
        <View style={s.actionRow}>
          <Pressable style={s.actionOutline} onPress={onNavigate} disabled={busy}>
            <Ionicons name="compass-outline" size={16} color={C.text} />
            <Text style={s.actionOutlineText}>Navigate</Text>
          </Pressable>
          <Pressable style={s.actionGhost} onPress={onDetails}>
            <Text style={s.actionGhostText}>View Details</Text>
            <Ionicons name="chevron-forward" size={14} color={C.textSub} />
          </Pressable>
        </View>
      )}

      {(canStart || canComplete || canCancel) && (
        <View style={s.primaryActionRow}>
          {canCancel && (
            <Pressable style={s.cancelBtn} onPress={onCancel} disabled={busy}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </Pressable>
          )}
          {canStart && (
            <Pressable style={s.primaryBtn} onPress={onStart} disabled={busy}>
              <Ionicons name="play" size={16} color="#000" />
              <Text style={s.primaryBtnText}>Start Ride</Text>
            </Pressable>
          )}
          {canComplete && (
            <Pressable style={s.primaryBtn} onPress={onComplete} disabled={busy}>
              <Ionicons name="checkmark-circle" size={16} color="#000" />
              <Text style={s.primaryBtnText}>Complete Ride</Text>
            </Pressable>
          )}
        </View>
      )}

      {(tab === 'completed' || tab === 'missed' || tab === 'cancelled') && (
        <Pressable style={s.detailsLink} onPress={onDetails}>
          <Text style={s.detailsLinkText}>View Details</Text>
          <Ionicons name="chevron-forward" size={14} color={C.green} />
        </Pressable>
      )}
    </View>
  );
}

function ReadyToDriveEmpty({
  isOnline,
  onGoOnline,
  onViewRequests,
  goingOnline,
}: {
  isOnline: boolean;
  onGoOnline: () => void;
  onViewRequests: () => void;
  goingOnline: boolean;
}) {
  return (
    <Animated.View entering={FadeIn} style={s.readyEmpty}>
      <View style={s.readyIcon}>
        <Ionicons name="car-sport-outline" size={44} color={C.green} />
      </View>
      <Text style={s.readyTitle}>You&apos;re Ready to Drive</Text>
      <Text style={s.readySub}>
        {isOnline
          ? 'Accept requests to fill your schedule. Your upcoming rides will appear here.'
          : 'Go online to receive ride requests and start earning.'}
      </Text>
      <View style={s.readyActions}>
        {!isOnline && (
          <Pressable style={s.readyPrimary} onPress={onGoOnline} disabled={goingOnline}>
            {goingOnline ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="radio-button-on" size={18} color="#000" />
                <Text style={s.readyPrimaryText}>Go Online</Text>
              </>
            )}
          </Pressable>
        )}
        <Pressable style={s.readySecondary} onPress={onViewRequests}>
          <Text style={s.readySecondaryText}>View Requests</Text>
          <Ionicons name="arrow-forward" size={16} color={C.green} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default function RidesTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToastStore((s) => s.show);
  const isFocused = useIsFocused();
  const { user: authUser } = useAuth();
  const { width } = Dimensions.get('window');
  const isTablet = width >= 768;
  const contentPad = isTablet ? Math.max(24, (width - 720) / 2) : 16;

  const session = useDriverStore((s) => s.session);
  const setSession = useDriverStore((s) => s.setSession);
  const setLocation = useDriverStore((s) => s.setLocation);
  const isOnline = session?.status === 'online' || session?.status === 'on_ride';

  const [tab, setTab] = useState<DriverRideTab>('upcoming');
  const [range] = useState<DriverStatRange>('all_time');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<RideTypeFilter>('all');
  const [actionBusy, setActionBusy] = useState(false);
  const [goingOnline, setGoingOnline] = useState(false);

  const { data: tabRides = [], isLoading, refetch } = trpc.driver.getDriverRides.useQuery(
    { status: tab, range },
    { enabled: isFocused, staleTime: 20_000, refetchInterval: isFocused ? 20_000 : false },
  );

  const countOpts = { enabled: isFocused, staleTime: 60_000 };
  const upcomingQ = trpc.driver.getDriverRides.useQuery({ status: 'upcoming', range }, countOpts);
  const activeQ = trpc.driver.getDriverRides.useQuery({ status: 'active', range }, countOpts);
  const completedQ = trpc.driver.getDriverRides.useQuery({ status: 'completed', range }, countOpts);
  const missedQ = trpc.driver.getDriverRides.useQuery({ status: 'missed', range }, countOpts);
  const cancelledQ = trpc.driver.getDriverRides.useQuery({ status: 'cancelled', range }, countOpts);

  const { data: todayStats } = trpc.driver.getDashboardStats.useQuery(
    { range: 'today' },
    { enabled: isFocused, staleTime: 30_000 },
  );
  const { data: weekStats } = trpc.driver.getDashboardStats.useQuery(
    { range: 'week' },
    { enabled: isFocused, staleTime: 30_000 },
  );
  const { data: earningsSummary } = trpc.driver.getEarningsSummary.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 60_000,
  });
  const { data: weekEarnings } = trpc.driver.getEarnings.useQuery(
    { range: 'week' },
    { enabled: isFocused, staleTime: 60_000 },
  );

  const goOnlineMut = trpc.driver.goOnline.useMutation();
  const startRideMut = trpc.driver.startRide.useMutation();
  const completeRideMut = trpc.driver.completeRide.useMutation();
  const cancelRideMut = trpc.rides.cancelRide.useMutation();
  const utils = trpc.useUtils();

  const counts = {
    upcoming: upcomingQ.data?.length ?? 0,
    active: activeQ.data?.length ?? 0,
    completed: completedQ.data?.length ?? 0,
    missed: missedQ.data?.length ?? 0,
    cancelled: cancelledQ.data?.length ?? 0,
  };

  const lifetimeTrips = authUser?.totalRides ?? counts.completed;
  const lifetimeRating = Number(authUser?.averageRating ?? todayStats?.rating ?? 0);

  const filteredRides = useMemo(() => {
    const list = tabRides as EnrichedRide[];
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (typeFilter !== 'all' && r.rideType !== typeFilter) return false;
      if (!q) return true;
      return (
        r.passengerName.toLowerCase().includes(q) ||
        r.pickupAddress.toLowerCase().includes(q) ||
        r.dropoffAddress.toLowerCase().includes(q) ||
        r.rideId.toLowerCase().includes(q)
      );
    });
  }, [tabRides, search, typeFilter]);

  const TABS: { key: DriverRideTab; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'completed', label: 'Completed', count: counts.completed },
    { key: 'missed', label: 'Missed', count: counts.missed },
    { key: 'cancelled', label: 'Cancelled', count: counts.cancelled },
  ];

  const invalidateRides = useCallback(() => {
    void utils.driver.getDriverRides.invalidate();
    void utils.driver.getDashboardStats.invalidate();
  }, [utils]);

  const handleGoOnline = async () => {
    if (goingOnline || isOnline) return;
    setGoingOnline(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat = 40.7327;
      let lng = -74.0563;
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
        setLocation({ lat, lng });
      }
      await goOnlineMut.mutateAsync({ lat, lng });
      setSession(session ? { ...session, status: 'online' } : null);
      toast('You are now online — ready for requests!', 'success');
    } catch {
      toast('Failed to go online. Check connection.', 'error');
    } finally {
      setGoingOnline(false);
    }
  };

  const handleStart = async (rideId: string) => {
    setActionBusy(true);
    try {
      await startRideMut.mutateAsync({ rideId });
      toast('Ride started', 'success');
      invalidateRides();
      router.push({ pathname: '/driver/ride-detail', params: { rideId } });
    } catch (e: any) {
      toast(e?.message ?? 'Could not start ride', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleComplete = async (rideId: string) => {
    setActionBusy(true);
    try {
      await completeRideMut.mutateAsync({ rideId });
      toast('Ride completed', 'success');
      invalidateRides();
    } catch (e: any) {
      toast(e?.message ?? 'Could not complete ride', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = (rideId: string) => {
    Alert.alert('Cancel ride?', 'This will cancel the ride for you and the passenger.', [
      { text: 'Keep ride', style: 'cancel' },
      {
        text: 'Cancel ride',
        style: 'destructive',
        onPress: async () => {
          setActionBusy(true);
          try {
            await cancelRideMut.mutateAsync({ rideId });
            toast('Ride cancelled', 'info');
            invalidateRides();
          } catch (e: any) {
            toast(e?.message ?? 'Could not cancel ride', 'error');
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  };

  const weekCompleted = weekStats?.completedRides ?? earningsSummary?.weekRides ?? 0;
  const weekProgress = Math.min(100, Math.round((weekCompleted / WEEKLY_RIDE_GOAL) * 100));
  const weekEarningsAmount = weekEarnings?.netEarnings ?? earningsSummary?.weekEarnings ?? 0;
  const todayEarnings = todayStats?.earnings ?? earningsSummary?.todayEarnings ?? 0;
  const todayRides = todayStats?.completedRides ?? earningsSummary?.todayRides ?? 0;
  const acceptanceRate = todayStats?.acceptanceRate ?? session?.acceptanceRate ?? 100;
  const driverRating = todayStats?.rating ?? lifetimeRating;

  const showReadyEmpty =
    !isLoading &&
    filteredRides.length === 0 &&
    (tab === 'upcoming' || (counts.upcoming + counts.active === 0));

  const ListHeader = (
    <View style={{ paddingHorizontal: contentPad }}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>My Rides</Text>
          <Text style={s.headerSub}>
            {lifetimeTrips} Lifetime Trips · {lifetimeRating > 0 ? `${lifetimeRating.toFixed(2)} ★` : '— ★'}
          </Text>
        </View>
        <View style={s.headerActions}>
          <Pressable
            style={s.headerBtn}
            accessibilityLabel="Search rides"
            onPress={() => setShowFilters((v) => !v)}
          >
            <Ionicons name="search-outline" size={20} color={C.text} />
          </Pressable>
          <Pressable
            style={[s.headerBtn, showFilters && s.headerBtnActive]}
            accessibilityLabel="Filter rides"
            onPress={() => setShowFilters((v) => !v)}
          >
            <Ionicons name="options-outline" size={20} color={showFilters ? C.green : C.text} />
          </Pressable>
        </View>
      </View>

      {(showFilters || search.length > 0) && (
        <View style={s.searchRow}>
          <Ionicons name="search" size={18} color={C.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search passenger, pickup, dropoff…"
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      )}

      {showFilters && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {(['all', 'instant', 'scheduled', 'shared'] as RideTypeFilter[]).map((f) => (
            <Pressable
              key={f}
              style={[s.filterChip, typeFilter === f && s.filterChipActive]}
              onPress={() => setTypeFilter(f)}
            >
              <Text style={[s.filterChipText, typeFilter === f && s.filterChipTextActive]}>
                {f === 'all' ? 'All types' : f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Metrics row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.metricsRow}
      >
        <MetricTile
          icon="calendar-outline"
          iconColor={C.green}
          value={String(counts.upcoming)}
          label="Upcoming"
          onPress={() => setTab('upcoming')}
          compact={width < 380}
        />
        <MetricTile
          icon="navigate-circle-outline"
          iconColor={C.blue}
          value={String(counts.active)}
          label="Active"
          onPress={() => setTab('active')}
          compact={width < 380}
        />
        <MetricTile
          icon="checkmark-circle-outline"
          iconColor={C.purple}
          value={String(counts.completed)}
          label="Completed"
          onPress={() => setTab('completed')}
          compact={width < 380}
        />
        <MetricTile
          icon="alert-circle-outline"
          iconColor={C.orange}
          value={String(counts.missed)}
          label="Missed"
          onPress={() => setTab('missed')}
          compact={width < 380}
        />
      </ScrollView>

      {/* Compact status chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={s.chip} onPress={() => setTab(t.key)}>
              <Text style={[s.chipText, active && s.chipTextActive]}>
                {t.label}{t.count > 0 ? ` (${t.count})` : ''}
              </Text>
              {active && <View style={s.chipUnderline} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const ListFooter = (
    <View style={[s.footerSections, { paddingHorizontal: contentPad }]}>
      {/* Today's Insights */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Today&apos;s Insights</Text>
          <Pressable onPress={() => router.push('/driver/dashboard')}>
            <Text style={s.sectionLink}>View all stats</Text>
          </Pressable>
        </View>
        <View style={[s.insightsGrid, isTablet && s.insightsGridTablet]}>
          <InsightCard
            label="Earnings"
            value={`$${todayEarnings.toFixed(2)}`}
            sub={weekEarningsAmount > todayEarnings ? `Week $${weekEarningsAmount.toFixed(0)}` : undefined}
            accent={C.green}
          />
          <InsightCard label="Completed" value={String(todayRides)} sub="rides today" />
          <InsightCard
            label="Acceptance"
            value={`${acceptanceRate}%`}
            sub={perfLabel(acceptanceRate)}
            accent={acceptanceRate >= 90 ? C.green : C.orange}
          />
          <InsightCard
            label="Rating"
            value={driverRating > 0 ? driverRating.toFixed(2) : '—'}
            sub={driverRating >= 4.9 ? 'Top Driver' : 'Your rating'}
            accent="#F59E0B"
          />
        </View>
      </View>

      {/* Weekly Progress */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Weekly Progress</Text>
          <Text style={s.sectionMeta}>{weekCompleted} / {WEEKLY_RIDE_GOAL} rides</Text>
        </View>
        <View style={s.progressCard}>
          <View style={s.progressLeft}>
            <Text style={s.progressLabel}>Ride goal</Text>
            <Text style={s.progressValue}>{weekProgress}% complete</Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${weekProgress}%` }]} />
            </View>
          </View>
          <View style={s.progressRing}>
            <Text style={s.progressRingText}>{weekProgress}%</Text>
          </View>
        </View>
      </View>

      {/* Earnings Preview */}
      <Pressable style={s.earningsCard} onPress={() => router.push('/driver/earnings')}>
        <View style={s.earningsLeft}>
          <Text style={s.earningsLabel}>This Week&apos;s Earnings</Text>
          <Text style={s.earningsValue}>${weekEarningsAmount.toFixed(2)}</Text>
          <Text style={s.earningsSub}>{weekCompleted} completed rides</Text>
        </View>
        <View style={s.earningsSpark}>
          {[0.3, 0.5, 0.4, 0.7, 0.6, 0.9, 0.8].map((h, i) => (
            <View key={i} style={[s.sparkBar, { height: 8 + h * 28 }]} />
          ))}
        </View>
        <View style={s.earningsCta}>
          <Text style={s.earningsCtaText}>View earnings</Text>
          <Ionicons name="chevron-forward" size={14} color={C.green} />
        </View>
      </Pressable>

      <View style={{ height: 100 }} />
    </View>
  );

  if (isLoading && (tabRides as EnrichedRide[]).length === 0) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        {ListHeader}
        <View style={s.loadingWrap}>
          <ActivityIndicator color={C.green} size="large" />
          <Text style={s.loadingText}>Loading your rides…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <FlatList
        data={filteredRides}
        keyExtractor={(r: EnrichedRide) => r.rideId}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={
          showReadyEmpty ? (
            <ReadyToDriveEmpty
              isOnline={isOnline}
              onGoOnline={handleGoOnline}
              onViewRequests={() => router.push('/driver/requests')}
              goingOnline={goingOnline}
            />
          ) : (
            <Animated.View entering={FadeIn} style={s.tabEmpty}>
              <Ionicons name="car-outline" size={36} color={C.textMuted} />
              <Text style={s.tabEmptyTitle}>No {tab} rides</Text>
              <Text style={s.tabEmptySub}>
                {search || typeFilter !== 'all'
                  ? 'Try adjusting search or filters.'
                  : tab === 'upcoming'
                    ? 'Accept requests to see upcoming rides here.'
                    : tab === 'active'
                      ? 'No rides in progress right now.'
                      : `Your ${tab} rides will appear here.`}
              </Text>
              {(search || typeFilter !== 'all') && (
                <Pressable
                  style={s.clearFilters}
                  onPress={() => { setSearch(''); setTypeFilter('all'); }}
                >
                  <Text style={s.clearFiltersText}>Clear filters</Text>
                </Pressable>
              )}
            </Animated.View>
          )
        }
        renderItem={({ item }: { item: EnrichedRide }) => (
          <View style={{ paddingHorizontal: contentPad, marginBottom: 12 }}>
            <PremiumRideCard
              ride={item}
              tab={tab}
              busy={actionBusy}
              onNavigate={() =>
                openMapsNavigation(item.pickupLat, item.pickupLng, item.pickupAddress, (m) => toast(m, 'error'))
              }
              onDetails={() => router.push({ pathname: '/driver/ride-detail', params: { rideId: item.rideId } })}
              onStart={() => handleStart(item.rideId)}
              onComplete={() => handleComplete(item.rideId)}
              onCancel={() => handleCancel(item.rideId)}
            />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        onRefresh={() => void refetch()}
        refreshing={isLoading}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: C.textMuted, marginTop: 4 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  headerBtnActive: { borderColor: C.green, backgroundColor: C.greenDim },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: C.text, padding: 0 },
  filterRow: { gap: 8, paddingBottom: 12 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterChipActive: { backgroundColor: C.greenDim, borderColor: C.greenBorder },
  filterChipText: { fontSize: 12, fontWeight: '600', color: C.textSub },
  filterChipTextActive: { color: C.green },
  metricsRow: { gap: 10, paddingBottom: 14 },
  metricTile: {
    width: 108,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 6,
  },
  metricTileCompact: { width: 92, padding: 10 },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: { fontSize: 20, fontWeight: '800', color: C.text },
  metricValueCompact: { fontSize: 18 },
  metricLabel: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  chipRow: { gap: 4, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  chip: { paddingHorizontal: 12, paddingVertical: 10, position: 'relative' },
  chipText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  chipTextActive: { color: C.text, fontWeight: '700' },
  chipUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.green,
  },
  rideCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 12,
  },
  rideCardActive: { borderColor: C.green + '88', backgroundColor: '#0F1A12' },
  rideCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rideCardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  rideCardTopRight: { alignItems: 'flex-end', gap: 4 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.greenDim,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: C.greenBorder,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  liveText: { fontSize: 10, fontWeight: '800', color: C.green, letterSpacing: 0.5 },
  activeLabel: { fontSize: 12, fontWeight: '700', color: C.text },
  onTripRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onTripDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  onTripText: { fontSize: 11, color: C.green, fontWeight: '600' },
  rideTime: { fontSize: 12, color: C.textMuted },
  statusPill: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  passengerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1A1040',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.purple + '55',
  },
  avatarText: { fontSize: 17, fontWeight: '800', color: C.purple },
  ratingChip: {
    position: 'absolute',
    bottom: -4,
    right: -6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: C.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: C.border,
  },
  ratingChipText: { fontSize: 9, fontWeight: '700', color: '#F59E0B' },
  passengerMeta: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  passengerName: { fontSize: 16, fontWeight: '700', color: C.text, flexShrink: 1 },
  verifiedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#172554',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerSub: { fontSize: 12, color: C.textMuted },
  fareCol: { alignItems: 'flex-end' },
  fareAmount: { fontSize: 22, fontWeight: '800', color: C.green },
  fareMethod: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  routeBlock: { gap: 2, paddingLeft: 2 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeDot: { width: 9, height: 9, borderRadius: 5, marginTop: 4 },
  routeConnector: { width: 1, height: 12, backgroundColor: C.border, marginLeft: 4 },
  routeText: { flex: 1, fontSize: 13, color: '#D1D5DB', lineHeight: 18 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  metaChipText: { fontSize: 12, color: C.textSub, fontWeight: '500' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceElevated,
  },
  actionOutlineText: { fontSize: 14, fontWeight: '600', color: C.text },
  actionGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 11,
  },
  actionGhostText: { fontSize: 14, fontWeight: '600', color: C.textSub },
  primaryActionRow: { flexDirection: 'row', gap: 8 },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.green,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    backgroundColor: '#2A0A0A',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: C.red },
  detailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  detailsLinkText: { fontSize: 14, fontWeight: '600', color: C.green },
  readyEmpty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40 },
  readyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.greenBorder,
  },
  readyTitle: { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center' },
  readySub: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 21, marginTop: 8 },
  readyActions: { width: '100%', maxWidth: 320, gap: 10, marginTop: 24 },
  readyPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.green,
    borderRadius: 14,
    paddingVertical: 15,
  },
  readyPrimaryText: { fontSize: 16, fontWeight: '700', color: '#000' },
  readySecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  readySecondaryText: { fontSize: 15, fontWeight: '600', color: C.green },
  tabEmpty: { alignItems: 'center', paddingHorizontal: 40, paddingVertical: 32, gap: 8 },
  tabEmptyTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  tabEmptySub: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
  clearFilters: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 16 },
  clearFiltersText: { fontSize: 14, fontWeight: '600', color: C.green },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: C.textMuted },
  footerSections: { gap: 20, paddingTop: 8 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  sectionLink: { fontSize: 13, fontWeight: '600', color: C.green },
  sectionMeta: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  insightsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  insightsGridTablet: { justifyContent: 'space-between' },
  insightCard: {
    width: '48%',
    minWidth: 140,
    flexGrow: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 4,
  },
  insightLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  insightValue: { fontSize: 22, fontWeight: '800', color: C.text },
  insightSub: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 16,
  },
  progressLeft: { flex: 1, gap: 8 },
  progressLabel: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  progressValue: { fontSize: 18, fontWeight: '800', color: C.text },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.surfaceElevated,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.green, borderRadius: 4 },
  progressRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.greenDim,
  },
  progressRingText: { fontSize: 13, fontWeight: '800', color: C.green },
  earningsCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  earningsLeft: { gap: 4 },
  earningsLabel: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  earningsValue: { fontSize: 28, fontWeight: '800', color: C.green },
  earningsSub: { fontSize: 12, color: C.textMuted },
  earningsSpark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 40,
    marginTop: 4,
  },
  sparkBar: {
    flex: 1,
    backgroundColor: C.green + '55',
    borderRadius: 3,
    minHeight: 8,
  },
  earningsCta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  earningsCtaText: { fontSize: 14, fontWeight: '600', color: C.green },
});
