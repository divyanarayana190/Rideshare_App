import { ErrorState } from '@/components/ui/ErrorState';
import { useIsFocused } from '@/hooks/use-is-focused';
import {
  buildVehicleSpecsLine,
  resolveVehicleImageSource,
} from '@/lib/vehicle-display';
import { useRides } from '@/lib/rides-store';
import { useDriverStore, useToastStore } from '@/lib/stores';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth-context-v2';
import { useProfilePhoto } from '@/hooks/use-profile-photo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import dayjs from 'dayjs';
import React, { useMemo } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const REFER_GIFT = require('@/assets/images/refer-gift.png');

const C = {
  bg: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1C1C1C',
  border: '#252525',
  green: '#22C55E',
  greenDim: '#0D2818',
  greenBorder: '#1A4029',
  greenGlow: 'rgba(34,197,94,0.12)',
  purple: '#8B5CF6',
  purpleDim: '#120D2E',
  orange: '#F97316',
  blue: '#3B82F6',
  red: '#EF4444',
  white: '#FFFFFF',
  text: '#F9FAFB',
  textSub: '#9CA3AF',
  textMuted: '#6B7280',
};

function VerifiedBadge() {
  return (
    <View style={s.verified}>
      <Ionicons name="shield-checkmark" size={10} color="#60A5FA" />
      <Text style={s.verifiedText}>VERIFIED</Text>
    </View>
  );
}

function AchievementBadge({ compact }: { compact?: boolean }) {
  return (
    <View style={s.achievementWrap}>
      <View style={[s.achievementHex, compact && s.achievementHexCompact]}>
        <Ionicons name="star" size={compact ? 14 : 18} color={C.green} />
      </View>
    </View>
  );
}

function StatColumn({
  icon,
  iconBg,
  iconColor,
  value,
  label,
  trend,
  trendColor,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  value: string;
  label: string;
  trend?: string;
  trendColor?: string;
  loading?: boolean;
}) {
  return (
    <View style={s.statCol}>
      <View style={[s.statIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} style={{ marginVertical: 4 }} />
      ) : (
        <Text style={s.statValue}>{value}</Text>
      )}
      <Text style={s.statLabel}>{label}</Text>
      {trend ? (
        <Text style={[s.statTrend, { color: trendColor ?? C.textMuted }]}>{trend}</Text>
      ) : null}
    </View>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  iconBg,
  iconColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  iconBg: string;
  iconColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }: { pressed: boolean }) => [
        s.menuPressable,
        pressed && { opacity: 0.75 },
      ]}
      onPress={onPress}
    >
      <View style={s.menuRowInner}>
        <View style={[s.menuIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View style={s.menuCopy}>
          <Text style={s.menuTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.menuSub} numberOfLines={2}>{subtitle}</Text>
        </View>
        <View style={s.menuChevron}>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

async function copyToClipboard(text: string, show: (msg: string, type: 'info' | 'success') => void) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    show('License plate copied', 'success');
    return;
  }
  await Share.share({ message: text });
}

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');
  const isMobile = width < 480;
  const router = useRouter();
  const show = useToastStore((s) => s.show);
  const isFocused = useIsFocused();
  const { toggleDriverMode } = useRides();
  const { user: authContextUser } = useAuth();

  const session = useDriverStore((s) => s.session);
  const setSession = useDriverStore((s) => s.setSession);
  const isTogglingStatus = useDriverStore((s) => s.isTogglingStatus);
  const setIsTogglingStatus = useDriverStore((s) => s.setIsTogglingStatus);
  const isOnline = session?.status === 'online' || session?.status === 'on_ride';

  const profileQ = trpc.driver.getProfile.useQuery(undefined, { enabled: isFocused });
  const appQ = trpc.driver.getApplicationStatus.useQuery(undefined, { enabled: isFocused });
  const sessionQ = trpc.driver.getSession.useQuery(undefined, {
    enabled: isFocused,
    refetchInterval: isFocused ? 30_000 : false,
  });
  const monthStatsQ = trpc.driver.getDashboardStats.useQuery(
    { range: 'month' },
    { enabled: isFocused, staleTime: 60_000 },
  );
  const referralsQ = trpc.user.getMyReferrals.useQuery(undefined, { enabled: isFocused });

  const driverProfile = profileQ.data;
  const appData = appQ.data;
  const sessionData = sessionQ.data;
  const user = driverProfile?.user ?? authContextUser;

  const { photoUrl: profilePhotoUrl, isUploading: isUploadingPhoto, pickAndUpload } = useProfilePhoto(
    authContextUser?.profilePhoto ?? null,
  );

  const isVerified =
    driverProfile?.verification.applicationStatus === 'approved' || appData?.status === 'approved';

  const totalRides = user?.totalRides ?? 0;
  const avgRating = user?.averageRating ?? driverProfile?.user.averageRating;
  const acceptRate =
    driverProfile?.session.acceptanceRate ??
    sessionData?.acceptanceRate ??
    session?.acceptanceRate;
  const driverSince = user?.createdAt ? dayjs(user.createdAt).format('MMM YYYY') : null;
  const yearsOnYoo = user?.createdAt
    ? Math.max(0, parseFloat((dayjs().diff(dayjs(user.createdAt), 'month') / 12).toFixed(1)))
    : 0;

  const vehicle = driverProfile?.vehicle;
  const vehicleMake = vehicle?.make ?? appData?.vehicleMake ?? null;
  const vehicleModel = vehicle?.model ?? appData?.vehicleModel ?? null;
  const vehicleColor = vehicle?.color ?? appData?.vehicleColor ?? null;
  const plateNumber = vehicle?.plate ?? appData?.plateNumber ?? null;
  const vehicleType = vehicle?.type ?? appData?.vehicleType ?? null;
  const vehiclePhotoUrl = vehicle?.photoUrl ?? null;
  const fuelType = vehicle?.fuelType ?? null;
  const seatCount = vehicle?.seatCount ?? null;
  const hasVehicle = !!(vehicleMake || vehicleModel || plateNumber);

  const vehicleImage = useMemo(
    () => resolveVehicleImageSource({ make: vehicleMake, model: vehicleModel, photoUrl: vehiclePhotoUrl }),
    [vehicleMake, vehicleModel, vehiclePhotoUrl],
  );

  const vehicleSpecs = useMemo(
    () =>
      buildVehicleSpecsLine({
        color: vehicleColor,
        fuelType,
        make: vehicleMake,
        model: vehicleModel,
        seatCount,
        vehicleType,
      }),
    [vehicleColor, fuelType, vehicleMake, vehicleModel, seatCount, vehicleType],
  );

  const referralCount = referralsQ.data?.length ?? 0;
  const isLoading = profileQ.isLoading || appQ.isLoading;
  const hasError = profileQ.isError && !driverProfile;

  const ratingTrend =
    avgRating != null && Number(avgRating) >= 4.9
      ? '↑ Top Rated'
      : avgRating != null && Number(avgRating) >= 4.5
        ? '↑ Great'
        : undefined;
  const acceptTrend =
    acceptRate != null && acceptRate >= 90
      ? '↑ Excellent'
      : acceptRate != null && acceptRate >= 75
        ? '↑ Good'
        : undefined;
  const ridesTrend =
    monthStatsQ.data?.completedRides != null && monthStatsQ.data.completedRides > 0
      ? `↑ ${monthStatsQ.data.completedRides} this month`
      : totalRides > 0
        ? '↑ Active'
        : undefined;

  const goOfflineMut = trpc.driver.goOffline.useMutation();

  const switchToPassenger = () => {
    toggleDriverMode();
    router.replace('/(tabs)/' as any);
  };

  const handleToggleOffline = () => {
    if (isOnline) {
      Alert.alert('Go Offline', "You won't receive new requests until you go online.", [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go Offline',
          style: 'destructive',
          onPress: async () => {
            setIsTogglingStatus(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              await goOfflineMut.mutateAsync();
              setSession(session ? { ...session, status: 'offline' } : null);
              show('You are now offline', 'info');
            } catch (err: any) {
              show(err?.message ?? 'Failed to go offline', 'error');
            } finally {
              setIsTogglingStatus(false);
            }
          },
        },
      ]);
    } else {
      router.replace('/driver/(tabs)/dashboard');
    }
  };

  const menuItems = [
    {
      icon: 'person-outline' as const,
      title: 'Personal Information',
      subtitle: 'Update your personal details',
      iconBg: '#172554',
      iconColor: C.blue,
      onPress: () => router.push('/driver-onboarding'),
    },
    {
      icon: 'business-outline' as const,
      title: 'Bank Information',
      subtitle: 'Manage your bank accounts',
      iconBg: '#1A1040',
      iconColor: C.purple,
      onPress: () => router.push('/stripe-cards'),
    },
    {
      icon: 'card-outline' as const,
      title: 'Payment Methods',
      subtitle: 'Manage your payment options',
      iconBg: C.greenDim,
      iconColor: C.green,
      onPress: () => router.push('/stripe-cards'),
    },
    {
      icon: 'document-text-outline' as const,
      title: 'Documents',
      subtitle: 'Manage your documents',
      iconBg: '#2A1400',
      iconColor: C.orange,
      onPress: () => router.push('/driver-onboarding'),
    },
    {
      icon: 'notifications-outline' as const,
      title: 'Notifications',
      subtitle: 'Manage your notification preferences',
      iconBg: '#2A1400',
      iconColor: C.orange,
      onPress: () => router.push('/notifications?role=driver' as any),
    },
    {
      icon: 'shield-outline' as const,
      title: 'Privacy & Legal',
      subtitle: 'Privacy settings and legal information',
      iconBg: '#172554',
      iconColor: C.blue,
      onPress: () => router.push('/legal'),
    },
    {
      icon: 'settings-outline' as const,
      title: 'App Settings',
      subtitle: 'App preferences and configurations',
      iconBg: C.surfaceElevated,
      iconColor: C.textSub,
      onPress: () => router.push('/(tabs)/profile' as any),
    },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Top navigation */}
      <View style={s.topNav}>
        <Pressable
          style={s.navBtn}
          onPress={() => router.replace('/driver/(tabs)/dashboard')}
          accessibilityLabel="Back to dashboard"
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </Pressable>
        <Text style={s.navTitle}>Driver Profile</Text>
        <Pressable
          style={s.navBtn}
          onPress={() => router.push('/(tabs)/profile' as any)}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={22} color={C.textSub} />
        </Pressable>
      </View>

      {hasError ? (
        <ErrorState
          title="Couldn't load profile"
          message="Check your connection and try again."
          onRetry={() => {
            void profileQ.refetch();
            void appQ.refetch();
          }}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scroll, { paddingBottom: Math.max(140, insets.bottom + 120) }]}
        >
          {/* Profile header card */}
          <View style={s.profileCard}>
            <View style={s.profileGlow} />
            <View style={[s.profileRow, isMobile && s.profileRowMobile]}>
              <View style={s.avatarWrap}>
                <Pressable
                  onPress={pickAndUpload}
                  disabled={isUploadingPhoto}
                  accessibilityLabel="Edit profile photo"
                  style={{ position: 'relative' }}
                >
                  <View style={[s.avatar, isMobile && s.avatarMobile]}>
                    {profilePhotoUrl ? (
                      <Image
                        source={{ uri: profilePhotoUrl }}
                        style={isMobile ? s.avatarImageMobile : s.avatarImageFull}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <Text style={[s.avatarText, isMobile && s.avatarTextMobile]}>
                        {(user?.name ?? 'D')[0].toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={s.cameraOverlay}>
                    {isUploadingPhoto ? (
                      <ActivityIndicator size="small" color={C.white} />
                    ) : (
                      <Ionicons name="camera" size={11} color={C.white} />
                    )}
                  </View>
                </Pressable>
                <View
                  style={[s.onlineDot, { backgroundColor: isOnline ? C.green : C.textMuted }]}
                />
              </View>

              <View style={s.profileMain}>
                <View style={s.nameRow}>
                  <Text style={s.profileName} numberOfLines={1}>
                    {user?.name ?? 'Driver'}
                  </Text>
                  {isVerified && <VerifiedBadge />}
                </View>
                <View style={s.metaRow}>
                  <Ionicons name="star" size={14} color="#F59E0B" />
                  <Text style={s.metaGold} numberOfLines={1}>
                    {avgRating != null ? Number(avgRating).toFixed(1) : '—'} • {totalRides} rides
                  </Text>
                </View>
                {acceptRate != null && (
                  <View style={s.metaRow}>
                    <Ionicons name="shield-checkmark" size={14} color={C.green} />
                    <Text style={s.metaGreen} numberOfLines={1}>
                      {Math.round(acceptRate)}% acceptance rate
                    </Text>
                  </View>
                )}
                {isMobile && driverSince && (
                  <View style={s.mobileSinceRow}>
                    <Text style={s.sinceLabelInline}>Driver since {driverSince}</Text>
                    <AchievementBadge compact />
                  </View>
                )}
              </View>

              {!isMobile && (
                <View style={s.profileAside}>
                  {driverSince && <Text style={s.sinceLabel}>Driver since {driverSince}</Text>}
                  <AchievementBadge />
                </View>
              )}
            </View>

            <Pressable
              style={({ pressed }: { pressed: boolean }) => [
                s.viewProfileBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => router.push('/driver-onboarding')}
            >
              <Text style={s.viewProfileText}>View Full Profile</Text>
              <Ionicons name="chevron-forward" size={14} color={C.textSub} />
            </Pressable>
          </View>

          {/* Performance stats row */}
          <View style={s.statsCard}>
            <StatColumn
              icon="car-sport-outline"
              iconBg={C.greenDim}
              iconColor={C.green}
              value={totalRides.toLocaleString()}
              label="Total Rides"
              trend={ridesTrend}
              trendColor={C.green}
              loading={isLoading}
            />
            <View style={s.statDivider} />
            <StatColumn
              icon="star-outline"
              iconBg="#1A1040"
              iconColor={C.purple}
              value={avgRating != null ? Number(avgRating).toFixed(1) : '—'}
              label="Driver Rating"
              trend={ratingTrend}
              trendColor={C.purple}
              loading={isLoading}
            />
            <View style={s.statDivider} />
            <StatColumn
              icon="calendar-outline"
              iconBg="#172554"
              iconColor={C.blue}
              value={yearsOnYoo > 0 ? `${yearsOnYoo} Yrs` : '< 1 Yr'}
              label="On YOO"
              trend={driverSince ? `↑ Since ${driverSince}` : undefined}
              trendColor={C.blue}
              loading={isLoading}
            />
            <View style={s.statDivider} />
            <StatColumn
              icon="trophy-outline"
              iconBg="#2A1400"
              iconColor={C.orange}
              value={acceptRate != null ? `${Math.round(acceptRate)}%` : '—'}
              label="Accept Rate"
              trend={acceptTrend}
              trendColor={C.orange}
              loading={isLoading}
            />
          </View>

          {/* Vehicle Information */}
          <View style={s.sectionHeader}>
            <View style={s.sectionHeaderLeft}>
              <Ionicons name="car-outline" size={18} color={C.textSub} />
              <Text style={s.sectionTitle}>Vehicle Information</Text>
            </View>
            <Pressable
              style={s.addVehicleLink}
              onPress={() => router.push('/driver-onboarding')}
            >
              <Ionicons name="add-circle-outline" size={16} color={C.green} />
              <Text style={s.addVehicleText}>{hasVehicle ? 'Update' : 'Add Vehicle'}</Text>
            </Pressable>
          </View>

          {hasVehicle ? (
            <Pressable
              style={({ pressed }: { pressed: boolean }) => [
                s.vehicleCard,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => router.push('/driver-onboarding')}
            >
              <Image source={vehicleImage} style={s.vehicleImage} contentFit="cover" />
              <View style={s.vehicleBody}>
                <View style={s.vehicleTitleRow}>
                  <Text style={s.vehicleName} numberOfLines={1}>
                    {[vehicleMake, vehicleModel].filter(Boolean).join(' ') || 'Your Vehicle'}
                  </Text>
                  {vehicle?.isPrimary !== false && (
                    <View style={s.primaryBadge}>
                      <Text style={s.primaryBadgeText}>Primary</Text>
                    </View>
                  )}
                </View>
                {vehicleSpecs ? (
                  <Text style={s.vehicleSpecs} numberOfLines={2}>
                    {vehicleSpecs}
                  </Text>
                ) : null}
                {plateNumber ? (
                  <Pressable
                    style={s.plateRow}
                    onPress={(e: { stopPropagation?: () => void }) => {
                      e.stopPropagation?.();
                      void copyToClipboard(plateNumber, show);
                    }}
                  >
                    <View style={s.plateBadge}>
                      <Text style={s.plateText}>{plateNumber}</Text>
                    </View>
                    <Ionicons name="copy-outline" size={14} color={C.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </Pressable>
          ) : (
            <Pressable
              style={s.vehicleEmpty}
              onPress={() => router.push('/driver-onboarding')}
            >
              <View style={s.vehicleEmptyIcon}>
                <Ionicons name="car-sport-outline" size={26} color={C.textMuted} />
              </View>
              <View style={s.vehicleEmptyCopy}>
                <Text style={s.vehicleEmptyTitle}>No Vehicle Added</Text>
                <Text style={s.vehicleEmptySub} numberOfLines={2}>
                  Complete onboarding to receive ride requests.
                </Text>
                <Pressable
                  style={s.addVehicleBtn}
                  onPress={(e: { stopPropagation?: () => void }) => {
                    e.stopPropagation?.();
                    router.push('/driver-onboarding');
                  }}
                >
                  <Text style={s.addVehicleBtnText}>Add Vehicle</Text>
                </Pressable>
              </View>
            </Pressable>
          )}

          {/* Refer & Earn */}
          <View style={[s.referCard, isMobile && s.referCardMobile]}>
            <Image source={REFER_GIFT} style={s.referGift} contentFit="contain" />
            <View style={s.referCopy}>
              <Text style={s.referTitle}>Refer & Earn</Text>
              <Text style={s.referSub} numberOfLines={isMobile ? 2 : 3}>
                Invite friends to drive with YOO and earn exciting rewards!
              </Text>
              {referralCount > 0 && (
                <Text style={s.referCount}>{referralCount} referrals</Text>
              )}
            </View>
            {!isMobile && (
              <Pressable style={s.inviteBtn} onPress={() => router.push('/referral')}>
                <Text style={s.inviteBtnText}>Invite Now</Text>
                <Ionicons name="chevron-forward" size={12} color={C.purple} />
              </Pressable>
            )}
          </View>
          {isMobile && (
            <Pressable style={s.inviteBtnMobile} onPress={() => router.push('/referral')}>
              <Text style={s.inviteBtnText}>Invite Now</Text>
              <Ionicons name="chevron-forward" size={12} color={C.purple} />
            </Pressable>
          )}

          {/* Account menu */}
          <View style={s.menuCard}>
            {menuItems.map((item, idx) => (
              <View key={item.title} style={s.menuRowWrap}>
                <MenuRow {...item} />
                {idx < menuItems.length - 1 && <View style={s.menuDivider} />}
              </View>
            ))}
          </View>

          {/* Bottom actions — stacked on mobile, side-by-side on tablet+ */}
          <View style={[s.bottomRow, isMobile ? s.bottomRowStacked : s.bottomRowSide]}>
            <Pressable
              style={({ pressed }: { pressed: boolean }) => [
                s.bottomCard,
                s.passengerCard,
                isMobile && s.bottomCardFull,
                pressed && { opacity: 0.85 },
              ]}
              onPress={switchToPassenger}
            >
              <View style={s.bottomCardInner}>
                <View style={s.bottomIconBlue}>
                  <Ionicons name="person-circle-outline" size={22} color="#7EC8FF" />
                </View>
                <View style={s.bottomCopy}>
                  <Text style={s.bottomTitleBlue} numberOfLines={1}>
                    {isMobile ? 'Passenger Mode' : 'Switch to Passenger Mode'}
                  </Text>
                  <Text style={s.bottomSubBlue} numberOfLines={1}>
                    Return to passenger app
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#7EC8FF" />
              </View>
            </Pressable>

            <View style={[s.bottomCard, s.offlineCard, isMobile && s.bottomCardFull]}>
              <View style={s.bottomCardInner}>
                <View style={s.bottomIconRed}>
                  <Ionicons name="power" size={20} color={C.red} />
                </View>
                <View style={s.bottomCopy}>
                  <Text style={s.bottomTitleRed} numberOfLines={1}>
                    {isOnline ? 'Go Offline' : 'Go Online'}
                  </Text>
                  <Text style={s.bottomSubMuted} numberOfLines={1}>
                    {isOnline ? 'Stop receiving requests' : 'Start receiving requests'}
                  </Text>
                </View>
                <Switch
                  value={isOnline}
                  onValueChange={handleToggleOffline}
                  disabled={isTogglingStatus}
                  trackColor={{ false: '#333', true: C.red + 'AA' }}
                  thumbColor={isOnline ? C.red : '#888'}
                  ios_backgroundColor="#333"
                />
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  navTitle: { fontSize: 17, fontWeight: '700', color: C.text },

  scroll: { paddingHorizontal: 16, paddingTop: 4 },

  profileCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 10,
    overflow: 'hidden',
    gap: 10,
  },
  profileGlow: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.greenGlow,
  },
  profileRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  profileRowMobile: { alignItems: 'center' },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.green + '66',
    overflow: 'hidden',
  },
  avatarMobile: { width: 56, height: 56, borderRadius: 28 },
  avatarText: { fontSize: 26, fontWeight: '800', color: C.green },
  avatarTextMobile: { fontSize: 22 },
  avatarImageFull: { width: 64, height: 64, borderRadius: 32 },
  avatarImageMobile: { width: 56, height: 56, borderRadius: 28 },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.surface,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.surface,
  },
  profileMain: { flex: 1, gap: 4, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'nowrap' },
  profileName: { fontSize: 18, fontWeight: '800', color: C.text, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  metaGold: { fontSize: 13, color: '#F59E0B', fontWeight: '600', flexShrink: 1 },
  metaGreen: { fontSize: 12, color: C.textSub, flexShrink: 1 },
  mobileSinceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sinceLabelInline: { fontSize: 11, color: C.textMuted, flexShrink: 1 },
  profileAside: { alignItems: 'center', gap: 6, flexShrink: 0, width: 72 },
  sinceLabel: { fontSize: 10, color: C.textMuted, textAlign: 'center', lineHeight: 13 },
  achievementWrap: { alignItems: 'center', flexShrink: 0 },
  achievementHex: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.greenDim,
    borderWidth: 2,
    borderColor: C.green + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementHexCompact: { width: 32, height: 32, borderRadius: 10 },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#172554',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#1D4ED8',
  },
  verifiedText: { fontSize: 9, fontWeight: '800', color: '#60A5FA' },
  viewProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  viewProfileText: { fontSize: 13, fontWeight: '600', color: C.textSub },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  statCol: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 1, minWidth: 0 },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 15, fontWeight: '900', color: C.text },
  statLabel: { fontSize: 9, color: C.textMuted, textAlign: 'center' },
  statTrend: { fontSize: 8, fontWeight: '700', textAlign: 'center' },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 8 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  addVehicleLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addVehicleText: { fontSize: 13, color: C.green, fontWeight: '600' },

  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    marginBottom: 10,
  },
  vehicleImage: {
    width: 72,
    height: 56,
    borderRadius: 10,
    backgroundColor: C.surfaceElevated,
    flexShrink: 0,
  },
  vehicleBody: { flex: 1, gap: 5, minWidth: 0 },
  vehicleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  vehicleName: { fontSize: 15, fontWeight: '800', color: C.text, flexShrink: 1 },
  primaryBadge: {
    backgroundColor: C.greenDim,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: C.greenBorder,
  },
  primaryBadgeText: { fontSize: 10, fontWeight: '700', color: C.green },
  vehicleSpecs: { fontSize: 12, color: C.textMuted, lineHeight: 16 },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  plateBadge: {
    backgroundColor: C.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  plateText: { fontSize: 13, fontWeight: '700', color: C.text, letterSpacing: 0.5 },

  vehicleEmpty: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  vehicleEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: C.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: C.border,
  },
  vehicleEmptyCopy: { flex: 1, gap: 4, minWidth: 0 },
  vehicleEmptyTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  vehicleEmptySub: { fontSize: 12, color: C.textMuted, lineHeight: 16 },
  addVehicleBtn: {
    alignSelf: 'flex-start',
    backgroundColor: C.greenDim,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.greenBorder,
    marginTop: 2,
  },
  addVehicleBtnText: { fontSize: 12, fontWeight: '700', color: C.green },

  referCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.purpleDim,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.purple + '44',
    padding: 12,
    marginBottom: 10,
  },
  referCardMobile: { marginBottom: 8 },
  referGift: { width: 44, height: 44, flexShrink: 0 },
  referCopy: { flex: 1, gap: 3, minWidth: 0 },
  referTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  referSub: { fontSize: 12, color: C.textSub, lineHeight: 17 },
  referCount: { fontSize: 11, color: C.purple, fontWeight: '600', marginTop: 2 },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.purple + '66',
    backgroundColor: '#1E1040',
  },
  inviteBtnText: { fontSize: 12, fontWeight: '700', color: C.purple },
  inviteBtnMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.purple + '66',
    backgroundColor: '#1E1040',
    marginBottom: 10,
  },

  menuCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 2,
    marginBottom: 10,
  },
  menuRowWrap: { width: '100%' },
  menuPressable: {
    width: '100%',
    paddingVertical: 6,
  },
  menuRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 56,
    maxHeight: 72,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    marginRight: 8,
    justifyContent: 'center',
  },
  menuTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  menuSub: { fontSize: 12, color: C.textMuted, lineHeight: 16 },
  menuChevron: {
    flexShrink: 0,
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },

  bottomRow: { gap: 10, marginBottom: 8 },
  bottomRowStacked: { flexDirection: 'column' },
  bottomRowSide: { flexDirection: 'row' },
  bottomCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 68,
    maxHeight: 76,
    justifyContent: 'center',
  },
  bottomCardFull: { width: '100%', flex: undefined },
  bottomCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  passengerCard: {
    backgroundColor: '#1E3A5F',
    borderColor: '#3B82F6',
    flex: 1,
  },
  offlineCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    flex: 1,
  },
  bottomIconBlue: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563EB33',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bottomIconRed: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.red + '22',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bottomCopy: { flex: 1, gap: 2, minWidth: 0, justifyContent: 'center' },
  bottomTitleBlue: { fontSize: 13, fontWeight: '800', color: '#7EC8FF' },
  bottomSubBlue: { fontSize: 11, color: '#60A5FA', lineHeight: 14 },
  bottomTitleRed: { fontSize: 13, fontWeight: '800', color: C.red },
  bottomSubMuted: { fontSize: 11, color: C.textMuted, lineHeight: 14 },
});
