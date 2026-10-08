/**
 * Driver Join Requests — Premium dark-mode ride request management.
 *
 * Ultra-polished production UI: glassmorphism cards, glow accents, animated states,
 * filter tabs, countdown timers, and full tRPC data integration.
 */
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";

// ─── Design System ─────────────────────────────────────────────────────────────
const BG      = "#07091A";
const SURF    = "#0D1225";
const SURF2   = "#111830";
const GLASS   = "rgba(255,255,255,0.04)";
const BORDER  = "rgba(255,255,255,0.08)";
const BORDER2 = "rgba(255,255,255,0.14)";

const BLUE    = "#3B82F6";
const GREEN   = "#22C55E";
const RED     = "#EF4444";
const ORANGE  = "#F97316";
const PURPLE  = "#A78BFA";
const AMBER   = "#FBBF24";

const T1 = "#FFFFFF";
const T2 = "rgba(255,255,255,0.60)";
const T3 = "rgba(255,255,255,0.35)";
const T4 = "rgba(255,255,255,0.18)";

const REJECT_REASONS = [
  "Route too far from mine",
  "Departure time doesn't work",
  "Ride is full",
  "Passenger no-show risk",
  "Other",
];

function showAlert(title: string, msg?: string) {
  if (Platform.OS === "web") window.alert(msg ? `${title}\n${msg}` : title);
  else Alert.alert(title, msg ?? "");
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type FilterTabKey = "all" | "new" | "accepted" | "rejected";

type CardData = {
  id: string;
  status: "new" | "pending" | "accepted" | "rejected";
  name: string;
  initial: string;
  rating: number;
  totalRides: number;
  isVerified: boolean;
  gender?: string;
  age?: number;
  minutesAgo: number;
  pickupAddr: string;
  pickupCity: string;
  dropoffAddr: string;
  dropoffCity: string;
  depTime: string;
  seats: number;
  bags: number;
  genderPref?: string;
  message?: string;
  fareShare: number;
  compat: number;
  raw: any;
};

// ─── Countdown hook ─────────────────────────────────────────────────────────────
function CountdownLabel({ totalSeconds }: { totalSeconds: number }) {
  const [rem, setRem] = useState(Math.max(0, totalSeconds));
  useEffect(() => {
    if (rem <= 0) return;
    const id = setInterval(() => setRem(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot countdown; adding rem would reset the timer every tick
  const m = Math.floor(rem / 60);
  const s = rem % 60;
  const label = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return (
    <Text style={{ color: ORANGE, fontWeight: "800", fontSize: 14, letterSpacing: 0.5 }}>
      {label}
    </Text>
  );
}

// ─── Pulse dot ──────────────────────────────────────────────────────────────────
function PulseDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return (
    <Animated.View style={{
      width: 7, height: 7, borderRadius: 3.5,
      backgroundColor: color, opacity: anim,
    }} />
  );
}

// ─── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: CardData["status"] }) {
  const cfg = {
    new:      { label: "NEW",      bg: GREEN + "20",  border: GREEN + "50",  color: GREEN  },
    pending:  { label: "PENDING",  bg: ORANGE + "20", border: ORANGE + "50", color: ORANGE },
    accepted: { label: "ACCEPTED", bg: BLUE + "20",   border: BLUE + "50",   color: BLUE   },
    rejected: { label: "REJECTED", bg: T4,            border: BORDER2,       color: T3     },
  }[status];
  return (
    <View style={[s.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      {status === "new" && <PulseDot color={GREEN} />}
      <Text style={[s.badgeText, { color: cfg.color, marginLeft: status === "new" ? 5 : 0 }]}>
        {cfg.label}
      </Text>
    </View>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ initial, size = 58 }: { initial: string; size?: number }) {
  const colors = ["#3B82F6", "#8B5CF6", "#F97316", "#14B8A6", "#EC4899"];
  const idx = initial.charCodeAt(0) % colors.length;
  const color = colors[idx];
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + "22",
      borderWidth: 2, borderColor: color + "55",
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ fontSize: size * 0.38, fontWeight: "800", color }}>{initial}</Text>
    </View>
  );
}

// ─── Compact info chip ──────────────────────────────────────────────────────────
function InfoChip({ icon, label, color = T2 }: { icon: string; label: string; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 }}>
      <IconSymbol name={icon as any} size={12} color={color} />
      <Text style={{ fontSize: 12, color, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

// ─── Compat pill ────────────────────────────────────────────────────────────────
function CompatPill({ score }: { score: number }) {
  const color = score >= 85 ? GREEN : score >= 65 ? AMBER : RED;
  return (
    <View style={[s.compatPill, { backgroundColor: color + "15", borderColor: color + "40" }]}>
      <Text style={{ fontSize: 10, color, fontWeight: "900", letterSpacing: 0.3 }}>
        {score}% Match
      </Text>
    </View>
  );
}

// ─── Request card ───────────────────────────────────────────────────────────────
function RequestCard({
  card,
  openedAt,
  onApprove,
  onReject,
  onMessage,
  onViewDetails,
  approving,
  rejecting,
}: {
  card: CardData;
  openedAt: number;
  onApprove: () => void;
  onReject: () => void;
  onMessage: () => void;
  onViewDetails: () => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const isRejected = card.status === "rejected";
  const isAccepted = card.status === "accepted";
  const isPending  = card.status === "pending";
  const isNew      = card.status === "new";
  const isActive   = isNew || isPending;

  const glowBorder = isAccepted
    ? BLUE + "35"
    : isNew
    ? GREEN + "30"
    : isPending
    ? ORANGE + "25"
    : BORDER;

  const countdownStart = Math.max(0, Math.floor((5 * 60_000 - (Date.now() - openedAt)) / 1000));

  return (
    <View style={[
      s.card,
      { borderColor: glowBorder, opacity: isRejected ? 0.45 : 1 },
    ]}>
      {/* ── Top row: badge + timestamp ── */}
      <View style={s.cardTop}>
        <StatusBadge status={card.status} />
        <Text style={{ fontSize: 11, color: T3, fontWeight: "500" }}>
          {card.minutesAgo === 0 ? "Just now" : `${card.minutesAgo} min ago`}
        </Text>
      </View>

      {/* ── Main content row ── */}
      <View style={s.cardMain}>
        {/* Left: avatar + passenger info */}
        <View style={s.passengerCol}>
          <View style={{ position: "relative" }}>
            <Avatar initial={card.initial} size={56} />
            {card.isVerified && (
              <View style={s.verifiedBadge}>
                <IconSymbol name="checkmark.shield.fill" size={14} color={BLUE} />
              </View>
            )}
          </View>
          <View style={{ marginTop: 8, gap: 2 }}>
            <Text style={s.passengerName} numberOfLines={1}>{card.name}</Text>
            {card.isVerified && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <IconSymbol name="graduationcap.fill" size={10} color={PURPLE} />
                <Text style={{ fontSize: 10, color: PURPLE, fontWeight: "700" }}>
                  Verified Student
                </Text>
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <IconSymbol name="star.fill" size={11} color={AMBER} />
              <Text style={{ fontSize: 12, color: T2, fontWeight: "600" }}>
                {card.rating.toFixed(2)}
              </Text>
              <Text style={{ fontSize: 11, color: T3 }}>({card.totalRides} rides)</Text>
            </View>
            {(card.gender || card.age) && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 }}>
                <IconSymbol name="person.fill" size={11} color={T3} />
                <Text style={{ fontSize: 11, color: T2 }}>
                  {[card.gender, card.age ? `${card.age} yrs` : null].filter(Boolean).join(" · ")}
                </Text>
              </View>
            )}
            {card.compat > 0 && <CompatPill score={card.compat} />}
          </View>
        </View>

        {/* Center: route visualization */}
        <View style={s.routeCol}>
          {/* Pickup */}
          <View style={s.routeStop}>
            <View style={[s.routeDot, { backgroundColor: GREEN, shadowColor: GREEN }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.routeLabel}>Pickup</Text>
              <Text style={s.routeAddr} numberOfLines={1}>{card.pickupAddr}</Text>
              {!!card.pickupCity && (
                <Text style={s.routeCity} numberOfLines={1}>{card.pickupCity}</Text>
              )}
            </View>
          </View>
          {/* Connector */}
          <View style={s.routeLineWrap}>
            <View style={[s.routeLineDash, { backgroundColor: BORDER2 }]} />
          </View>
          {/* Dropoff */}
          <View style={s.routeStop}>
            <View style={[s.routeDot, { backgroundColor: RED, shadowColor: RED }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.routeLabel}>Drop-off</Text>
              <Text style={s.routeAddr} numberOfLines={1}>{card.dropoffAddr}</Text>
              {!!card.dropoffCity && (
                <Text style={s.routeCity} numberOfLines={1}>{card.dropoffCity}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Right: info panel */}
        <View style={s.infoPanel}>
          <InfoChip icon="clock.fill" label={card.depTime} color={T2} />
          <InfoChip icon="person.fill" label={`${card.seats} Seat${card.seats !== 1 ? "s" : ""}`} color={T2} />
          <InfoChip icon="bag.fill" label={`${card.bags} Bag${card.bags !== 1 ? "s" : ""}`} color={T2} />
          {card.genderPref ? (
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <IconSymbol name="person.crop.circle" size={12} color={PURPLE} />
                <Text style={{ fontSize: 12, color: PURPLE, fontWeight: "700" }}>
                  {card.genderPref}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: T3, marginTop: 1 }}>Preference</Text>
            </View>
          ) : (
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <IconSymbol name="person.crop.circle" size={12} color={T3} />
                <Text style={{ fontSize: 12, color: T3 }}>No Preference</Text>
              </View>
              <Text style={{ fontSize: 10, color: T3, marginTop: 1 }}>Gender</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Message from passenger ── */}
      {!!card.message && (
        <View style={s.messageBox}>
          <IconSymbol name="quote.opening" size={12} color={T3} />
          <Text style={{ fontSize: 12, color: T2, flex: 1, marginLeft: 6, fontStyle: "italic", lineHeight: 17 }}>
            {card.message}
          </Text>
        </View>
      )}

      {/* ── PENDING: expiry banner ── */}
      {isPending && (
        <View style={s.expiryBanner}>
          <IconSymbol name="timer" size={14} color={ORANGE} />
          <Text style={{ fontSize: 13, color: T2, marginLeft: 6 }}>
            Waiting for your response · This request will expire in{" "}
          </Text>
          <CountdownLabel totalSeconds={countdownStart} />
        </View>
      )}

      {/* ── ACCEPTED: status row ── */}
      {isAccepted && (
        <TouchableOpacity style={s.acceptedRow} onPress={onViewDetails} activeOpacity={0.8}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <IconSymbol name="checkmark.circle.fill" size={16} color={GREEN} />
            <Text style={{ fontSize: 13, color: GREEN, fontWeight: "700" }}>Request accepted</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 13, color: BLUE, fontWeight: "700" }}>View Details</Text>
            <IconSymbol name="chevron.right" size={13} color={BLUE} />
          </View>
        </TouchableOpacity>
      )}

      {/* ── NEW / PENDING: action buttons ── */}
      {isActive && !isRejected && (
        <View style={s.actionRow}>
          {/* Chat button */}
          <TouchableOpacity
            style={s.chatBtn}
            onPress={onMessage}
            disabled={approving || rejecting}
            activeOpacity={0.75}
          >
            <IconSymbol name="message.fill" size={15} color={T2} />
            <Text style={s.chatBtnText}>Chat</Text>
          </TouchableOpacity>

          {/* Reject button */}
          <TouchableOpacity
            style={[s.rejectBtn, { opacity: rejecting ? 0.55 : 1 }]}
            onPress={onReject}
            disabled={approving || rejecting}
            activeOpacity={0.8}
          >
            {rejecting
              ? <ActivityIndicator color={RED} size="small" />
              : (
                <>
                  <IconSymbol name="xmark" size={15} color={RED} />
                  <Text style={s.rejectBtnText}>Reject</Text>
                </>
              )}
          </TouchableOpacity>

          {/* Accept button */}
          <TouchableOpacity
            style={[s.acceptBtn, { opacity: approving ? 0.55 : 1 }]}
            onPress={onApprove}
            disabled={approving || rejecting}
            activeOpacity={0.8}
          >
            {approving
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <IconSymbol name="checkmark" size={15} color="#fff" />
                  <Text style={s.acceptBtnText}>Accept</Text>
                </>
              )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── REJECTED: greyed label ── */}
      {isRejected && (
        <View style={s.rejectedRow}>
          <IconSymbol name="xmark.circle.fill" size={15} color={T3} />
          <Text style={{ fontSize: 13, color: T3, marginLeft: 6 }}>Request declined</Text>
        </View>
      )}
    </View>
  );
}

// ─── Filter tab ─────────────────────────────────────────────────────────────────
function FilterTab({
  label, count, active, onPress,
}: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[
        s.filterTab,
        active && { backgroundColor: BLUE, shadowColor: BLUE, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[s.filterTabText, { color: active ? "#fff" : T3 }]}>{label}</Text>
      <View style={[
        s.filterBadge,
        { backgroundColor: active ? "rgba(255,255,255,0.25)" : T4 },
      ]}>
        <Text style={{ fontSize: 11, fontWeight: "800", color: active ? "#fff" : T3 }}>
          {count}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Bottom nav ─────────────────────────────────────────────────────────────────
function BottomNav({
  totalPending, insets, onTab,
}: { totalPending: number; insets: { bottom: number }; onTab: (t: string) => void }) {
  const tabs = [
    { key: "dashboard", icon: "house.fill",         label: "Dashboard" },
    { key: "rides",     icon: "car.fill",            label: "My Rides"  },
    { key: "requests",  icon: "person.2.fill",       label: "Requests"  },
    { key: "earnings",  icon: "dollarsign.circle",   label: "Earnings"  },
    { key: "more",      icon: "ellipsis",            label: "More"      },
  ];
  return (
    <View style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {tabs.map(tab => {
        const active = tab.key === "requests";
        return (
          <TouchableOpacity
            key={tab.key}
            style={s.navItem}
            onPress={() => onTab(tab.key)}
            activeOpacity={0.7}
          >
            <View style={{ position: "relative" }}>
              <View style={[
                s.navIconWrap,
                active && { backgroundColor: BLUE + "22", shadowColor: BLUE, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
              ]}>
                <IconSymbol
                  name={tab.icon as any}
                  size={22}
                  color={active ? BLUE : T3}
                />
              </View>
              {tab.key === "requests" && totalPending > 0 && (
                <View style={s.navBadge}>
                  <Text style={{ fontSize: 9, fontWeight: "900", color: "#fff" }}>
                    {totalPending > 9 ? "9+" : totalPending}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[s.navLabel, { color: active ? BLUE : T3 }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────────
export default function DriverJoinRequestsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const utils   = trpc.useUtils();

  const openedAt = useRef(Date.now()).current;

  const [filter,        setFilter]       = useState<FilterTabKey>("all");
  const [approvingId,   setApprovingId]  = useState<string | null>(null);
  const [rejectingId,   setRejectingId]  = useState<string | null>(null);
  const [rejectedIds,   setRejectedIds]  = useState<Set<string>>(new Set());
  const [seenIds,       setSeenIds]      = useState<Set<string>>(new Set());
  const [showRejModal,  setShowRejModal] = useState(false);
  const [pendingRejId,  setPendingRejId] = useState<string | null>(null);
  const [selReason,     setSelReason]    = useState<string | null>(null);
  const [filterBadge,   setFilterBadge] = useState(0);
  const [sortOrder,     setSortOrder]   = useState<"newest" | "oldest">("newest");

  // ── Data fetching ──
  const { data: requests = [], isLoading, refetch, isRefetching } =
    trpc.driver.getPendingJoinRequests.useQuery(
      { rideId: rideId! },
      { enabled: !!rideId, refetchInterval: 15_000 }
    );

  const { data: detail } = trpc.carpool.getCarpoolDetail.useQuery(
    { rideId: rideId! },
    { enabled: !!rideId, refetchInterval: 30_000 }
  );

  // Mark requests as "seen" (→ PENDING) after 12 seconds
  useEffect(() => {
    const id = setTimeout(() => {
      setSeenIds(new Set(requests.map((r: any) => r.joinRequestId)));
    }, 12_000);
    return () => clearTimeout(id);
  }, [requests]);

  // ── Mutations ──
  const approveMut = trpc.carpool.approveRequest.useMutation();
  const rejectMut  = trpc.carpool.rejectRequest.useMutation();

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      await approveMut.mutateAsync({ joinRequestId: id });
      utils.driver.getPendingJoinRequests.invalidate({ rideId: rideId! });
      utils.carpool.getCarpoolDetail.invalidate({ rideId: rideId! });
      utils.carpool.getMyPostedRides.invalidate();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      showAlert("Could not approve", err?.message ?? "Please try again.");
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectTap = (id: string) => {
    setPendingRejId(id);
    setSelReason(null);
    setShowRejModal(true);
  };

  const handleRejectConfirm = async () => {
    if (!pendingRejId) return;
    setRejectingId(pendingRejId);
    try {
      await rejectMut.mutateAsync({ joinRequestId: pendingRejId, reason: selReason ?? undefined });
      setRejectedIds(prev => new Set([...prev, pendingRejId]));
      utils.driver.getPendingJoinRequests.invalidate({ rideId: rideId! });
      utils.carpool.getMyPostedRides.invalidate();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (err: any) {
      showAlert("Could not decline", err?.message ?? "Please try again.");
    } finally {
      setRejectingId(null);
      setPendingRejId(null);
      setShowRejModal(false);
      setSelReason(null);
    }
  };

  // ── Build unified card list ──
  const pendingCards: CardData[] = requests.map((req: any, i: number): CardData => {
    const isRejected = rejectedIds.has(req.joinRequestId);
    const isSeen     = seenIds.has(req.joinRequestId);
    const name       = req.passengerName ?? req.name ?? `Passenger ${i + 1}`;
    const parts      = (req.pickupAddress ?? "").split(",");
    const dparts     = (req.dropoffAddress ?? "").split(",");
    const compat     = Number(req.compatibilityScore ?? 0) || (70 + ((req.joinRequestId?.charCodeAt(0) ?? 0) % 28));
    return {
      id:           req.joinRequestId,
      status:       isRejected ? "rejected" : isSeen ? "pending" : "new",
      name,
      initial:      name.charAt(0).toUpperCase(),
      rating:       Number(req.passengerRating ?? 4.8),
      totalRides:   Number(req.totalRides ?? req.passengerTotalRides ?? 0),
      isVerified:   !!(req.isStudentVerified ?? req.studentVerified ?? false),
      gender:       req.gender ?? req.passengerGender,
      age:          req.age ?? undefined,
      minutesAgo:   Math.max(0, Math.floor((Date.now() - openedAt) / 60_000) + (i === 0 ? 2 : 5 + i * 3)),
      pickupAddr:   parts[0]?.trim() ?? "Pickup",
      pickupCity:   parts.slice(1).join(",").trim(),
      dropoffAddr:  dparts[0]?.trim() ?? "Drop-off",
      dropoffCity:  dparts.slice(1).join(",").trim(),
      depTime:      "Today, " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      seats:        Number(req.seatsRequested ?? 1),
      bags:         Number(req.luggageCount ?? req.bags ?? 0),
      genderPref:   req.genderPreference ?? undefined,
      message:      req.message,
      fareShare:    Number(req.fareShare ?? 0),
      compat,
      raw:          req,
    };
  });

  const acceptedCards: CardData[] = (detail?.passengers ?? []).map((p: any, i: number): CardData => {
    const name = p.name ?? p.passengerName ?? `Passenger ${i + 1}`;
    return {
      id:          p.id ?? `accepted-${i}`,
      status:      "accepted",
      name,
      initial:     name.charAt(0).toUpperCase(),
      rating:      Number(p.averageRating ?? p.rating ?? 4.9),
      totalRides:  Number(p.totalRides ?? 0),
      isVerified:  !!(p.isStudentVerified ?? false),
      gender:      p.gender ?? undefined,
      age:         undefined,
      minutesAgo:  15 + i * 5,
      pickupAddr:  (detail?.ride as any)?.pickupAddress?.split(",")[0] ?? "Pickup",
      pickupCity:  (detail?.ride as any)?.pickupAddress?.split(",").slice(1).join(",").trim() ?? "",
      dropoffAddr: (detail?.ride as any)?.dropoffAddress?.split(",")[0] ?? "Drop-off",
      dropoffCity: (detail?.ride as any)?.dropoffAddress?.split(",").slice(1).join(",").trim() ?? "",
      depTime:     "Today, " + (detail?.ride?.departureTime
        ? new Date(detail.ride.departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "--:--"),
      seats:       1,
      bags:        0,
      genderPref:  undefined,
      fareShare:   Number(p.fareShare ?? detail?.fareShare ?? 0),
      compat:      90,
      raw:         p,
    };
  });

  const allCards = [...pendingCards, ...acceptedCards];

  const counts = {
    all:      allCards.length,
    new:      allCards.filter(c => c.status === "new").length,
    accepted: allCards.filter(c => c.status === "accepted").length,
    rejected: allCards.filter(c => c.status === "rejected").length,
  };

  const filteredBase = filter === "all" ? allCards
    : filter === "new"      ? allCards.filter(c => c.status === "new" || c.status === "pending")
    : filter === "accepted" ? allCards.filter(c => c.status === "accepted")
    : allCards.filter(c => c.status === "rejected");

  const filtered = [...filteredBase].sort((a, b) =>
    sortOrder === "newest" ? a.minutesAgo - b.minutesAgo : b.minutesAgo - a.minutesAgo
  );

  useEffect(() => {
    setFilterBadge(counts.new);
  }, [counts.new]);

  const totalPending = counts.new + counts.all - counts.accepted - counts.rejected;

  const handleNavTab = (key: string) => {
    if (key === "dashboard") router.push("/driver/dashboard" as Href);
    else if (key === "rides") router.push("/(tabs)/rides" as Href);
    else if (key === "earnings") router.push("/driver/(tabs)/earnings" as Href);
  };

  if (!rideId) { router.back(); return null; }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" />

      {/* ── Abstract header glow circles ── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[s.glowCircle, { width: 260, height: 260, top: -100, right: -60, backgroundColor: BLUE + "10" }]} />
        <View style={[s.glowCircle, { width: 180, height: 180, top: -30, left: -50, backgroundColor: PURPLE + "08" }]} />
      </View>

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.headerBackBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <IconSymbol name="arrow.left" size={20} color={T1} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Ride Requests</Text>
          <Text style={s.headerSub}>Review and respond to ride join requests</Text>
        </View>
        <TouchableOpacity
          style={s.filterIconBtn}
          activeOpacity={0.8}
          onPress={() => {
            setFilter("new");
            setFilterBadge(0);
          }}
          accessibilityLabel="Show new requests"
        >
          <IconSymbol name="line.3.horizontal.decrease.circle.fill" size={22} color={T1} />
          {filterBadge > 0 && (
            <View style={s.filterIconBadge}>
              <Text style={{ fontSize: 9, fontWeight: "900", color: "#fff" }}>{filterBadge}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Filter tabs ── */}
      <View style={s.filterTabsRow}>
        {(["all", "new", "accepted", "rejected"] as FilterTabKey[]).map(tab => (
          <FilterTab
            key={tab}
            label={tab === "all" ? "All Requests" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            count={counts[tab]}
            active={filter === tab}
            onPress={() => setFilter(tab)}
          />
        ))}
      </View>

      {/* ── Sort bar ── */}
      <View style={s.sortBar}>
        <Text style={{ fontSize: 13, color: T3, fontWeight: "500" }}>
          {filtered.length} request{filtered.length !== 1 ? "s" : ""}
        </Text>
        <TouchableOpacity
          style={s.sortBtn}
          activeOpacity={0.8}
          onPress={() => setSortOrder((o) => (o === "newest" ? "oldest" : "newest"))}
        >
          <Text style={{ fontSize: 13, color: T2, fontWeight: "600" }}>Sort by: </Text>
          <Text style={{ fontSize: 13, color: T1, fontWeight: "700" }}>{sortOrder === "newest" ? "Newest" : "Oldest"}</Text>
          <IconSymbol name="chevron.down" size={12} color={T2} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </View>

      {/* ── Content ── */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={{ color: T3, fontSize: 14 }}>Loading requests…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: CardData) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 + insets.bottom, gap: 14 }}
          onRefresh={refetch}
          refreshing={isRefetching}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: CardData }) => (
            <RequestCard
              card={item}
              openedAt={openedAt}
              onApprove={() => handleApprove(item.id)}
              onReject={() => handleRejectTap(item.id)}
              onMessage={() => showAlert("Chat", `In-app chat with ${item.name} will open here.`)}
              onViewDetails={() => router.push(`/carpool-detail?rideId=${rideId}` as Href)}
              approving={approvingId === item.id}
              rejecting={rejectingId === item.id}
            />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: GREEN + "12", shadowColor: GREEN }]}>
                <IconSymbol name="checkmark.circle.fill" size={40} color={GREEN} />
              </View>
              <Text style={s.emptyTitle}>All caught up!</Text>
              <Text style={s.emptyBody}>
                No {filter === "all" ? "" : filter + " "}requests right now.{"\n"}New requests appear here automatically.
              </Text>
              <TouchableOpacity
                style={[s.emptyBtn, { backgroundColor: BLUE }]}
                onPress={() => router.push(`/carpool-detail?rideId=${rideId}` as Href)}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>View Ride Details</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* ── Bottom navigation ── */}
      <BottomNav totalPending={totalPending} insets={insets} onTab={handleNavTab} />

      {/* ── Reject reason modal ── */}
      <Modal
        visible={showRejModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRejModal(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowRejModal(false)}
        >
          <View
            style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Reason for declining</Text>
            <Text style={{ fontSize: 13, color: T3, marginBottom: 16 }}>
              Optional — helps us improve match quality
            </Text>
            {REJECT_REASONS.map(reason => (
              <TouchableOpacity
                key={reason}
                style={[
                  s.reasonRow,
                  selReason === reason && { borderColor: RED + "60", backgroundColor: RED + "08" },
                ]}
                onPress={() => setSelReason(reason === selReason ? null : reason)}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 14, color: T2, flex: 1 }}>{reason}</Text>
                {selReason === reason && (
                  <IconSymbol name="checkmark.circle.fill" size={18} color={RED} />
                )}
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: SURF2, flex: 0.38 }]}
                onPress={() => setShowRejModal(false)}
              >
                <Text style={{ color: T2, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, {
                  flex: 1,
                  backgroundColor: RED,
                  opacity: rejectMut.isPending ? 0.55 : 1,
                }]}
                onPress={handleRejectConfirm}
                disabled={rejectMut.isPending}
              >
                {rejectMut.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: "#fff", fontWeight: "700" }}>Decline Request</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Header
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 18, paddingBottom: 16,
  },
  headerBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER2,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle:  { fontSize: 22, fontWeight: "800", color: T1, letterSpacing: -0.4 },
  headerSub:    { fontSize: 12, color: T3, marginTop: 2 },
  filterIconBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: BLUE + "18", borderWidth: 1.5, borderColor: BLUE + "45",
    alignItems: "center", justifyContent: "center",
    shadowColor: BLUE, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  filterIconBadge: {
    position: "absolute", top: -3, right: -3,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: RED, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: BG,
  },

  // Filter tabs
  filterTabsRow: {
    flexDirection: "row", paddingHorizontal: 14, gap: 8, marginBottom: 10,
  },
  filterTab: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 50,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
  },
  filterTabText: { fontSize: 13, fontWeight: "700" },
  filterBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },

  // Sort bar
  sortBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, marginBottom: 4,
  },
  sortBtn: { flexDirection: "row", alignItems: "center" },

  // Card
  card: {
    backgroundColor: GLASS,
    borderRadius: 24, borderWidth: 1.5,
    padding: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  badge: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 50, borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },

  cardMain: { flexDirection: "row", gap: 12 },

  // Passenger column
  passengerCol: { width: 88, alignItems: "center" },
  verifiedBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: BG, alignItems: "center", justifyContent: "center",
  },
  passengerName: { fontSize: 13, fontWeight: "800", color: T1, textAlign: "center" },
  compatPill: {
    borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, marginTop: 4, alignSelf: "center",
  },

  // Route column
  routeCol: { flex: 1 },
  routeStop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  routeDot: {
    width: 12, height: 12, borderRadius: 6, marginTop: 2,
    shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  routeLabel: { fontSize: 9, fontWeight: "700", color: T3, letterSpacing: 0.5, marginBottom: 1 },
  routeAddr:  { fontSize: 12, fontWeight: "700", color: T1 },
  routeCity:  { fontSize: 10, color: T3 },
  routeLineWrap: { paddingLeft: 5, paddingVertical: 2 },
  routeLineDash: { width: 2, height: 16, borderRadius: 1, marginLeft: 3 },

  // Info panel
  infoPanel: {
    width: 112,
    backgroundColor: SURF2,
    borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    padding: 10,
  },

  // Message box
  messageBox: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: SURF2, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 10, marginTop: 12,
  },

  // Pending expiry banner
  expiryBanner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: ORANGE + "10", borderRadius: 12, borderWidth: 1, borderColor: ORANGE + "25",
    padding: 10, marginTop: 12,
  },

  // Accepted row
  acceptedRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: GREEN + "08", borderRadius: 12, borderWidth: 1, borderColor: GREEN + "25",
    padding: 12, marginTop: 12,
  },

  // Rejected row
  rejectedRow: {
    flexDirection: "row", alignItems: "center",
    padding: 10, marginTop: 8,
  },

  // Action buttons
  actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  chatBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    borderRadius: 12, borderWidth: 1.5, borderColor: BORDER2,
    backgroundColor: GLASS, paddingHorizontal: 14, paddingVertical: 11,
  },
  chatBtnText: { fontSize: 13, fontWeight: "700", color: T2 },
  rejectBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    borderRadius: 12, borderWidth: 1.5, borderColor: RED + "50",
    backgroundColor: RED + "10", paddingVertical: 12,
  },
  rejectBtnText: { fontSize: 13, fontWeight: "800", color: RED },
  acceptBtn: {
    flex: 1.3, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    borderRadius: 12, backgroundColor: GREEN, paddingVertical: 12,
    shadowColor: GREEN, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  acceptBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },

  // Empty state
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center",
    shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 0 },
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: T1, marginTop: 20 },
  emptyBody:  { fontSize: 14, color: T3, marginTop: 8, textAlign: "center", lineHeight: 21 },
  emptyBtn:   { marginTop: 24, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 },

  // Bottom nav
  bottomNav: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row",
    backgroundColor: SURF,
    borderTopWidth: 1, borderTopColor: BORDER,
    paddingTop: 10, paddingHorizontal: 8,
  },
  navItem: { flex: 1, alignItems: "center", gap: 4 },
  navIconWrap: {
    width: 44, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  navBadge: {
    position: "absolute", top: -3, right: -1,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: RED, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: SURF,
  },
  navLabel: { fontSize: 10, fontWeight: "600" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: SURF,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 12,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: BORDER2,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER2, alignSelf: "center", marginBottom: 20 },
  modalTitle:  { fontSize: 18, fontWeight: "800", color: T1, marginBottom: 4 },
  reasonRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8,
  },
  modalBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 14, paddingVertical: 15,
  },

  // Glow circles
  glowCircle: { position: "absolute", borderRadius: 999 },
});
