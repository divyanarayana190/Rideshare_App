import { useRoleNotificationCount } from '@/lib/use-role-notification-count';
import { useIsFocused } from '@/hooks/use-is-focused';
import {
  normalizePayoutHistory,
  normalizeTransactions,
} from '@/lib/driver-earnings-normalize';
import { useToastStore } from '@/lib/stores';
import { trpc } from '@/lib/trpc';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  bg: '#0A0A0A', surface: '#141414', surfaceElevated: '#1C1C1C', border: '#252525',
  green: '#22C55E', greenDim: '#0D2818', greenBorder: '#1A4029',
  purple: '#8B5CF6', orange: '#F97316', blue: '#3B82F6', red: '#EF4444',
  white: '#FFFFFF', text: '#F9FAFB', textSub: '#9CA3AF', textMuted: '#6B7280',
};

type Period = 'today' | 'week' | 'month' | 'all_time';
type EarningsTabKey = 'overview' | 'transactions' | 'payouts';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  all_time: 'All Time',
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function NavTab({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.navTab, active && s.navTabActive]} onPress={onPress}>
      {active && <Ionicons name={icon as any} size={14} color="#000" />}
      <Text style={[s.navTabText, active && s.navTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function WeeklyBar({ day, amount, isToday, maxAmount }: { day: string; amount: number; isToday: boolean; maxAmount: number }) {
  const MAX_H = 80;
  const h = maxAmount > 0 ? Math.max(4, (amount / maxAmount) * MAX_H) : 4;
  return (
    <View style={s.barCol}>
      <Text style={[s.barLabel, isToday && s.barLabelToday]}>${amount.toFixed(0)}</Text>
      <View style={s.barTrack}>
        <View style={[
          s.barFill,
          { height: h, backgroundColor: isToday ? C.green : C.surfaceElevated },
        ]} />
      </View>
      <Text style={[s.barDay, isToday && s.barDayToday]}>{day}</Text>
    </View>
  );
}

function StatCard4({ icon, value, label, sub, iconBg, subColor }: { icon: string; value: string; label: string; sub: string; iconBg: string; subColor: string }) {
  return (
    <View style={s.stat4Card}>
      <View style={[s.stat4Icon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={22} color={subColor} />
      </View>
      <Text style={s.stat4Label}>{label}</Text>
      <Text style={s.stat4Value}>{value}</Text>
      <Text style={[s.stat4Sub, { color: subColor }]}>{sub}</Text>
    </View>
  );
}

function TransactionRow({ pickup, dropoff, fare, date }: { pickup: string; dropoff: string; fare: number; date: string }) {
  return (
    <View style={s.txRow}>
      <View style={s.txIcon}>
        <Ionicons name="car-outline" size={18} color={C.green} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.txRoute} numberOfLines={1}>{pickup} → {dropoff}</Text>
        <Text style={s.txDate}>{dayjs(date).format('MMM D, h:mm A')}</Text>
      </View>
      <Text style={s.txFare}>+${fare.toFixed(2)}</Text>
    </View>
  );
}

export default function EarningsTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const show   = useToastStore((s) => s.show);
  const isFocused = useIsFocused();
  const [period, setPeriod] = useState<Period>('week');
  const [activeTab, setActiveTab] = useState<EarningsTabKey>('overview');

  const { data: summary, isLoading: summaryLoading } = trpc.driver.getEarningsSummary.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 60_000,
  });
  const { data: earningsDetail, isLoading: ridesLoading } = trpc.driver.getEarnings.useQuery(
    { range: period },
    { enabled: isFocused, staleTime: 60_000 },
  );
  const { data: payoutStatus, refetch: refetchPayoutStatus } = trpc.driver.getPayoutStatus.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 30_000,
  });
  const { data: payoutHistory, refetch: refetchPayoutHistory } = trpc.driver.getPayoutHistory.useQuery(
    { limit: 20 },
    { enabled: isFocused && activeTab === 'payouts', staleTime: 30_000 },
  );
  const { data: tipsData } = trpc.driver.getTips.useQuery(
    { range: period },
    { enabled: isFocused, staleTime: 60_000 },
  );
  const createAccountLink = trpc.driver.createStripeAccountLink.useMutation();
  const requestPayoutMut = trpc.driver.requestPayout.useMutation();

  const periodRides = useMemo(
    () => normalizeTransactions(earningsDetail),
    [earningsDetail],
  );
  const payoutItems = useMemo(
    () => normalizePayoutHistory(payoutHistory),
    [payoutHistory],
  );
  const { data: notifCountData } = useRoleNotificationCount('driver', isFocused, 30_000);

  const periodEarnings = earningsDetail?.netEarnings ?? (
    period === 'today' ? (summary?.todayEarnings ?? 0)
    : period === 'week' ? (summary?.weekEarnings ?? 0)
    : period === 'month' ? (summary?.monthEarnings ?? 0)
    : (summary?.monthEarnings ?? 0)
  );
  const grossEarnings = earningsDetail?.grossEarnings ?? periodEarnings;
  const rideFares = earningsDetail?.rideFares ?? (grossEarnings * 0.8);
  const tipsTotal = earningsDetail?.tips ?? tipsData?.totalDollars ?? 0;
  const platformFees = earningsDetail?.platformFees ?? (grossEarnings - rideFares);
  const availableBalance = (payoutStatus?.availableBalanceCents ?? 0) / 100;
  const pendingBalance = (payoutStatus?.pendingBalanceCents ?? 0) / 100;

  const periodRideCount = earningsDetail?.completedRides ?? (
    period === 'today' ? (summary?.todayRides ?? 0)
    : period === 'week' ? (summary?.weekRides ?? 0)
    : period === 'month' ? (summary?.monthRides ?? 0)
    : (summary?.monthRides ?? 0)
  );

  const hasEarnings = periodEarnings > 0 || periodRideCount > 0;
  const isLoading = summaryLoading || ridesLoading;
  const unreadCount = notifCountData?.count ?? 0;

  const weeklyData = useMemo(() => {
    if (period !== 'week') return null;
    const todayDowIndex = (() => { const d = dayjs().day(); return d === 0 ? 6 : d - 1; })();
    const slots = DAY_LABELS.map((day, i) => ({ day, amount: 0, isToday: i === todayDowIndex }));
    for (const r of periodRides) {
      const dow = dayjs(String(r.completedAt ?? '')).day();
      const slotIdx = dow === 0 ? 6 : dow - 1;
      const slot = slots[slotIdx];
      if (slot) slot.amount += Number(r.totalFare ?? 0);
    }
    return slots;
  }, [period, periodRides]);

  const maxBar = weeklyData ? Math.max(...weeklyData.map((d) => d.amount), 1) : 1;

  const cyclePeriod = () => {
    setPeriod((p) =>
      p === 'today' ? 'week' : p === 'week' ? 'month' : p === 'month' ? 'all_time' : 'today',
    );
  };

  const handleCashOut = async () => {
    if (!payoutStatus) return;
    if (payoutStatus.payoutState === 'setup_required' || payoutStatus.payoutState === 'onboarding_incomplete') {
      try {
        const result = await createAccountLink.mutateAsync();
        if (result?.url) await Linking.openURL(result.url);
        else show('Unable to open payout setup', 'error');
      } catch (e: any) {
        show(e?.message ?? 'Unable to open Stripe setup', 'error');
      }
      return;
    }
    if (payoutStatus.availableBalanceCents < 100) {
      show(payoutStatus.message ?? 'No available balance to cash out', 'info');
      return;
    }
    try {
      await requestPayoutMut.mutateAsync({ amountCents: payoutStatus.availableBalanceCents });
      show('Payout requested successfully', 'success');
      void refetchPayoutStatus();
      void refetchPayoutHistory();
    } catch (e: any) {
      show(e?.message ?? 'Payout failed. Please try again.', 'error');
    }
  };

  const cashOutLabel = (() => {
    if (createAccountLink.isPending || requestPayoutMut.isPending) return 'Processing…';
    if (!payoutStatus) return 'Loading…';
    if (payoutStatus.payoutState === 'setup_required') return 'Set up payouts';
    if (payoutStatus.payoutState === 'onboarding_incomplete') return 'Continue setup';
    if (payoutStatus.payoutState === 'unavailable') return 'Unavailable';
    if (payoutStatus.availableBalanceCents < 100) return 'No balance';
    return 'Cash out';
  })();

  const cashOutDisabled =
    createAccountLink.isPending
    || requestPayoutMut.isPending
    || !payoutStatus
    || payoutStatus.payoutState === 'unavailable'
    || (payoutStatus.payoutState === 'ready' && payoutStatus.availableBalanceCents < 100);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      <View style={s.header}>
        <Text style={s.headerTitle}>Earnings</Text>
        <View style={s.headerRight}>
          <Pressable style={s.headerIcon} onPress={cyclePeriod}>
            <Ionicons name="calendar-outline" size={20} color={C.text} />
          </Pressable>
          <Pressable style={[s.headerIcon, { position: 'relative' }]} onPress={() => router.push('/notifications?role=driver' as any)}>
            <Ionicons name="notifications-outline" size={20} color={C.text} />
            {unreadCount > 0 && (
              <View style={s.notifBadge}>
                <Text style={s.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <View style={s.navTabs}>
        <NavTab label="Overview"     icon="trending-up-outline" active={activeTab === 'overview'}     onPress={() => setActiveTab('overview')} />
        <NavTab label="Transactions" icon="card-outline"        active={activeTab === 'transactions'} onPress={() => setActiveTab('transactions')} />
        <NavTab label="Payouts"      icon="business-outline"    active={activeTab === 'payouts'}      onPress={() => setActiveTab('payouts')} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {isLoading && !summary ? (
          <View style={s.zeroState}>
            <ActivityIndicator color={C.green} size="large" />
            <Text style={s.zeroSub}>Loading earnings…</Text>
          </View>
        ) : !hasEarnings && activeTab === 'overview' ? (
          <View style={s.zeroState}>
            <View style={s.zeroIcon}>
              <Ionicons name="wallet-outline" size={40} color={C.textMuted} />
            </View>
            <Text style={s.zeroTitle}>No earnings yet</Text>
            <Text style={s.zeroSub}>Complete your first ride to start earning.</Text>
            <Pressable style={s.zeroBtn} onPress={() => router.push('/driver/(tabs)/dashboard')}>
              <Text style={s.zeroBtnText}>Go to Dashboard</Text>
            </Pressable>
          </View>
        ) : activeTab === 'overview' ? (
          <>
            <View style={s.heroSection}>
              <View style={s.heroLeft}>
                <Pressable style={s.periodRow} onPress={cyclePeriod}>
                  <Text style={s.periodText}>{PERIOD_LABELS[period]}</Text>
                  <Ionicons name="chevron-down" size={14} color={C.textSub} />
                </Pressable>
                <Text style={s.heroAmount}>${periodEarnings.toFixed(2)}</Text>
                <Text style={s.heroLabel}>Total Earnings</Text>
              </View>
              <View style={s.heroRight}>
                <Text style={s.trendPct}>{periodRideCount} rides</Text>
                <Text style={s.trendLabel}>completed</Text>
              </View>
            </View>

            {period === 'week' && weeklyData && (
              <View style={s.chartCard}>
                <View style={s.chartBars}>
                  {weeklyData.map((d) => (
                    <WeeklyBar key={d.day} day={d.day} amount={d.amount} isToday={d.isToday} maxAmount={maxBar} />
                  ))}
                </View>
              </View>
            )}

            <View style={s.stat4Row}>
              <StatCard4 icon="car-outline"   value={String(periodRideCount)} label="Rides"         sub="Completed"  iconBg={C.greenDim} subColor={C.green} />
              <StatCard4 icon="cash-outline"   value={`$${rideFares.toFixed(0)}`} label="Ride fares"  sub="Net share"  iconBg="#1E1040" subColor={C.purple} />
              <StatCard4 icon="heart-outline" value={`$${tipsTotal.toFixed(2)}`} label="Tips"        sub={PERIOD_LABELS[period]} iconBg="#2A1400" subColor={C.orange} />
              <StatCard4 icon="remove-circle-outline" value={`$${platformFees.toFixed(0)}`} label="Platform fees" sub="20%" iconBg="#172554" subColor={C.blue} />
            </View>

            <View style={s.payoutCard}>
              <View style={s.payoutLeft}>
                <View style={s.payoutIcon}>
                  <Ionicons name="business-outline" size={22} color={C.green} />
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={s.payoutMeta}>Available balance</Text>
                  <Text style={s.payoutAmount}>${availableBalance.toFixed(2)}</Text>
                  <Text style={s.payoutDate}>
                    {pendingBalance > 0
                      ? `$${pendingBalance.toFixed(2)} pending payout`
                      : payoutStatus?.message ?? 'Complete rides to earn'}
                  </Text>
                  <View style={s.payoutSecure}>
                    <Ionicons name="shield-checkmark-outline" size={11} color={C.textMuted} />
                    <Text style={s.payoutSecureText}>
                      {payoutStatus?.instantPayoutSupported
                        ? 'Instant payout available'
                        : 'Standard Stripe Connect payout'}
                    </Text>
                  </View>
                </View>
              </View>
              <Pressable
                style={[s.cashOutBtn, cashOutDisabled && { opacity: 0.5 }]}
                onPress={handleCashOut}
                disabled={cashOutDisabled}
                accessibilityLabel={cashOutLabel}
              >
                <Text style={s.cashOutText}>{cashOutLabel}</Text>
                <Ionicons name="flash" size={14} color="#000" />
              </Pressable>
            </View>
          </>
        ) : activeTab === 'transactions' ? (
          <View style={s.txCard}>
            <View style={s.txHeader}>
              <Text style={s.txTitle}>Transaction History</Text>
              <Pressable style={s.periodRow} onPress={cyclePeriod}>
                <Text style={s.periodTextSm}>{PERIOD_LABELS[period]}</Text>
                <Ionicons name="chevron-down" size={12} color={C.textSub} />
              </Pressable>
            </View>
            {periodRides.length === 0 ? (
              <View style={s.txEmpty}>
                <Text style={s.zeroSub}>No transactions for {PERIOD_LABELS[period].toLowerCase()}.</Text>
              </View>
            ) : (
              periodRides.map((r: { id: number; pickupAddress: string; dropoffAddress: string; totalFare: unknown; completedAt: unknown }) => (
                <TransactionRow
                  key={r.id}
                  pickup={r.pickupAddress}
                  dropoff={r.dropoffAddress}
                  fare={Number(r.totalFare ?? 0)}
                  date={String(r.completedAt ?? '')}
                />
              ))
            )}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={s.payoutCard}>
              <View style={s.payoutLeft}>
                <View style={s.payoutIcon}>
                  <Ionicons name="business-outline" size={22} color={C.green} />
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={s.payoutMeta}>Available Balance</Text>
                  <Text style={s.payoutAmount}>${availableBalance.toFixed(2)}</Text>
                  <Text style={s.payoutDate}>{payoutStatus?.message ?? 'Loading payout status…'}</Text>
                </View>
              </View>
              <Pressable
                style={[s.cashOutBtn, cashOutDisabled && { opacity: 0.5 }]}
                onPress={handleCashOut}
                disabled={cashOutDisabled}
              >
                <Text style={s.cashOutText}>{cashOutLabel}</Text>
                <Ionicons name="flash" size={14} color="#000" />
              </Pressable>
            </View>
            <View style={s.txCard}>
              <Text style={s.txTitle}>Payout history</Text>
              {(payoutItems.length === 0) ? (
                <View style={s.txEmpty}>
                  <Text style={s.zeroSub}>No payouts yet.</Text>
                </View>
              ) : (
                payoutItems.map((p) => (
                  <View key={p.id} style={s.txRow}>
                    <View style={s.txIcon}>
                      <Ionicons name="arrow-up-outline" size={18} color={C.orange} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.txRoute}>Payout to bank</Text>
                      <Text style={s.txDate}>{dayjs(p.createdAt).format('MMM D, h:mm A')} · {p.status}</Text>
                    </View>
                    <Text style={s.txFare}>-${(p.amountCents / 100).toFixed(2)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: C.bg },
  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headerTitle:       { fontSize: 24, fontWeight: '700', color: C.text },
  headerRight:       { flexDirection: 'row', gap: 8 },
  headerIcon:        { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  notifBadge:        { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1, borderColor: C.bg },
  notifBadgeText:    { fontSize: 9, fontWeight: '800', color: '#fff' },
  navTabs:           { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 4 },
  navTab:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  navTabActive:      { backgroundColor: C.green },
  navTabText:        { fontSize: 13, fontWeight: '600', color: C.textSub },
  navTabTextActive:  { color: '#000', fontWeight: '700' },
  scrollContent:     { paddingHorizontal: 16 },
  heroSection:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  heroLeft:          { gap: 4 },
  periodRow:         { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  periodText:        { fontSize: 14, color: C.textSub, fontWeight: '500' },
  periodTextSm:      { fontSize: 12, color: C.textSub },
  heroAmount:        { fontSize: 40, fontWeight: '900', color: C.green, letterSpacing: -1 },
  heroLabel:         { fontSize: 13, color: C.textMuted },
  heroRight:         { alignItems: 'flex-end', gap: 2, paddingBottom: 8 },
  trendPct:          { fontSize: 16, fontWeight: '800', color: C.green },
  trendLabel:        { fontSize: 12, color: C.textMuted },
  chartCard:         { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 16 },
  chartBars:         { flexDirection: 'row', alignItems: 'flex-end', gap: 0 },
  barCol:            { flex: 1, alignItems: 'center', gap: 4 },
  barLabel:          { fontSize: 9, color: C.textMuted, fontWeight: '600' },
  barLabelToday:     { color: C.green },
  barTrack:          { width: '70%', height: 80, justifyContent: 'flex-end', borderRadius: 6 },
  barFill:           { width: '100%', borderRadius: 6, minHeight: 4 },
  barDay:            { fontSize: 10, color: C.textMuted },
  barDayToday:       { color: C.green, fontWeight: '700' },
  stat4Row:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  stat4Card:         { width: '48%', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, alignItems: 'center', gap: 6 },
  stat4Icon:         { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stat4Label:        { fontSize: 10, color: C.textMuted, textAlign: 'center' },
  stat4Value:        { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center' },
  stat4Sub:          { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  payoutCard:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.greenDim, borderRadius: 16, borderWidth: 1, borderColor: C.greenBorder, padding: 16, marginBottom: 8, gap: 12 },
  payoutLeft:        { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  payoutIcon:        { width: 44, height: 44, borderRadius: 14, backgroundColor: C.greenBorder, alignItems: 'center', justifyContent: 'center' },
  payoutMeta:        { fontSize: 12, color: C.textSub },
  payoutAmount:      { fontSize: 24, fontWeight: '900', color: C.green },
  payoutDate:        { fontSize: 11, color: C.textSub },
  payoutSecure:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  payoutSecureText:  { fontSize: 10, color: C.textMuted, flex: 1 },
  cashOutBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: C.green },
  cashOutText:       { fontSize: 13, fontWeight: '800', color: '#000' },
  zeroState:         { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  zeroIcon:          { width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  zeroTitle:         { fontSize: 20, fontWeight: '800', color: C.text },
  zeroSub:           { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 20 },
  zeroBtn:           { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: C.green },
  zeroBtnText:       { fontSize: 14, fontWeight: '700', color: '#000' },
  txCard:            { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
  txHeader:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  txTitle:           { fontSize: 16, fontWeight: '700', color: C.text },
  txEmpty:           { paddingVertical: 24, alignItems: 'center' },
  txRow:             { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  txIcon:            { width: 36, height: 36, borderRadius: 10, backgroundColor: C.greenDim, alignItems: 'center', justifyContent: 'center' },
  txRoute:           { fontSize: 13, fontWeight: '600', color: C.text },
  txDate:            { fontSize: 11, color: C.textMuted },
  txFare:            { fontSize: 14, fontWeight: '800', color: C.green },
});
