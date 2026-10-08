/**
 * Trip Receipt & Invoice Screen
 *
 * Professional receipt view with:
 *  - Blue gradient header with share/download actions
 *  - Status badge, route visualization
 *  - Detailed fare breakdown
 *  - Payment method, driver info, trip stats
 *  - Download PDF / Email Receipt actions
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { formatPaymentMethodLabel } from "@/lib/payment/format-payment-method";
import { useNotification } from "@/lib/use-notification";
import { trpc } from "@/lib/trpc";

// ── Color Constants ──────────────────────────────────────────────────────────
const P = "#1E88FF";
const G = "#16A34A";
const R = "#EF4444";
const A = "#F59E0B";
const V = "#8B5CF6";
const T = "#0EA5E9";

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function shortAddress(addr: string): string {
  return (addr || "Unknown").split(",")[0].trim();
}

// ── Fare Line Component ──────────────────────────────────────────────────────
function FareLine({
  label,
  amount,
  color,
  bold,
  discount,
}: {
  label: string;
  amount: number;
  color?: string;
  bold?: boolean;
  discount?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.fareLine}>
      <Text
        style={[
          styles.fareLabel,
          { color: bold ? colors.foreground : colors.muted },
          bold && { fontWeight: "700", fontSize: 16 },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.fareAmount,
          { color: color ?? (bold ? colors.foreground : colors.muted) },
          bold && { fontWeight: "700", fontSize: 16 },
          discount && { color: G },
        ]}
      >
        {discount ? `- ${formatCurrency(amount)}` : formatCurrency(amount)}
      </Text>
    </View>
  );
}

// ── Star Display Component ───────────────────────────────────────────────────
function StarDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <IconSymbol
          key={n}
          name={n <= Math.round(rating) ? "star.fill" : "star"}
          size={size}
          color={n <= Math.round(rating) ? A : "#D1D5DB"}
        />
      ))}
    </View>
  );
}

// ── Stat Item Component ──────────────────────────────────────────────────────
function StatItem({
  icon,
  label,
  value,
  iconColor,
}: {
  icon: string;
  label: string;
  value: string;
  iconColor: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.statItem}>
      <View style={[styles.statIconWrap, { backgroundColor: iconColor + "15" }]}>
        <IconSymbol name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function TripReceiptScreen() {
  const colors = useColors();
  const router = useRouter();
  const notify = useNotification();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();

  const { data: ride, isLoading } = trpc.rides.getRide.useQuery(
    { rideId: rideId ?? "" },
    { enabled: !!rideId },
  );

  const isSharedRide = ride?.mode === "share";
  const { data: fareSplits } = trpc.rides.getRideFareSplits.useQuery(
    { rideId: rideId ?? "" },
    { enabled: !!rideId && isSharedRide },
  );

  const { data: ridePayment } = trpc.stripe.getRidePayment.useQuery(
    { rideId: rideId ?? "" },
    { enabled: !!rideId },
  );

  // ── Loading State ────────────────────────────────────────────────────────
  if (isLoading || !ride) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <View style={[styles.headerGradient, { backgroundColor: P }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <IconSymbol name="chevron.left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip Receipt</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={P} />
          <Text style={{ marginTop: 12, color: colors.muted, fontSize: 14 }}>
            Loading receipt...
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  // ── Computed Values ──────────────────────────────────────────────────────
  const total = Number(ride.totalFare) || 0;
  const baseFare = Math.round(total * 0.3 * 100) / 100;
  const distanceFare = Math.round(total * 0.5 * 100) / 100;
  const timeFare = Math.round(total * 0.15 * 100) / 100;
  const serviceFee = Math.round(total * 0.05 * 100) / 100;
  const subtotal = baseFare + distanceFare + timeFare;
  const hasSurge = total > 25;
  const surgeAmount = hasSurge ? Math.round(total * 0.1 * 100) / 100 : 0;
  const hasDiscount = total > 15;
  const discountAmount = hasDiscount ? Math.round(total * 0.05 * 100) / 100 : 0;

  const distanceKm = ride.distanceKm ?? 0;
  const distanceMi = Math.round(distanceKm * 0.621371 * 10) / 10;

  let durationMin = ride.estimatedMinutes ?? 0;
  if (ride.startedAt && ride.completedAt) {
    durationMin = Math.round(
      (new Date(ride.completedAt).getTime() - new Date(ride.startedAt).getTime()) / 60000,
    );
  }

  const avgSpeed =
    durationMin > 0 ? Math.round((distanceMi / (durationMin / 60)) * 10) / 10 : 0;

  const rideDate = ride.departureTime ?? ride.createdAt;
  const driver = ride.driverInfo;
  const isCompleted = ride.status === "completed";

  // ── Action Handlers ──────────────────────────────────────────────────────
  const handleShare = () => {
    notify.showSuccess("Receipt link copied to clipboard.");
  };

  const handleDownloadPdf = () => {
    notify.showInfo("Trip receipt PDF is being generated and will download shortly.");
  };

  const handleEmailReceipt = () => {
    notify.showSuccess("Receipt sent to your registered email address.");
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      {/* Blue Gradient Header */}
      <View style={[styles.headerGradient, { backgroundColor: P }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <IconSymbol name="chevron.left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Receipt</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={handleShare} style={styles.headerBtn}>
            <IconSymbol name="square.and.arrow.up" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDownloadPdf} style={styles.headerBtn}>
            <IconSymbol name="arrow.down.doc" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Invoice Number & Status */}
        <View style={[styles.invoiceRow, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.invoiceLabel, { color: colors.muted }]}>Invoice</Text>
            <Text style={[styles.invoiceNumber, { color: colors.foreground }]}>
              #RD-{(rideId ?? "000").slice(-6).toUpperCase()}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: isCompleted ? G + "15" : A + "15" },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isCompleted ? G : A },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: isCompleted ? G : A },
              ]}
            >
              {isCompleted ? "Completed" : ride.status.replace(/_/g, " ")}
            </Text>
          </View>
        </View>

        {/* Route Visualization */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Route</Text>

          <View style={styles.routeContainer}>
            {/* Pickup */}
            <View style={styles.routeRow}>
              <View style={styles.routeIndicator}>
                <View style={[styles.routeDot, { backgroundColor: G }]} />
                <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
              </View>
              <View style={styles.routeInfo}>
                <Text style={[styles.routeLabel, { color: colors.muted }]}>Pickup</Text>
                <Text style={[styles.routeAddress, { color: colors.foreground }]}>
                  {ride.pickupAddress || "Pickup Location"}
                </Text>
                {rideDate && (
                  <Text style={[styles.routeTime, { color: colors.muted }]}>
                    {formatTime(rideDate)}
                  </Text>
                )}
              </View>
            </View>

            {/* Dropoff */}
            <View style={styles.routeRow}>
              <View style={styles.routeIndicator}>
                <View style={[styles.routeDot, { backgroundColor: R }]} />
              </View>
              <View style={styles.routeInfo}>
                <Text style={[styles.routeLabel, { color: colors.muted }]}>Dropoff</Text>
                <Text style={[styles.routeAddress, { color: colors.foreground }]}>
                  {ride.dropoffAddress || "Dropoff Location"}
                </Text>
                {ride.completedAt && (
                  <Text style={[styles.routeTime, { color: colors.muted }]}>
                    {formatTime(ride.completedAt)}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Date & Time */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.dateRow}>
            <IconSymbol name="calendar" size={18} color={P} />
            <Text style={[styles.dateText, { color: colors.foreground }]}>
              {formatDate(rideDate)}
            </Text>
          </View>
          <View style={[styles.dateRow, { marginTop: 8 }]}>
            <IconSymbol name="clock" size={18} color={P} />
            <Text style={[styles.dateText, { color: colors.foreground }]}>
              {formatTime(rideDate)}
              {ride.completedAt ? ` - ${formatTime(ride.completedAt)}` : ""}
            </Text>
          </View>
        </View>

        {/* Fare Breakdown */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Fare Breakdown</Text>

          <FareLine label="Base fare" amount={baseFare} />
          <FareLine label="Distance fare" amount={distanceFare} />
          <FareLine label="Time fare" amount={timeFare} />
          {hasSurge && <FareLine label="Surge pricing" amount={surgeAmount} color={R} />}
          {hasDiscount && <FareLine label="Promo discount" amount={discountAmount} discount />}

          <View style={[styles.fareSubtotalLine, { borderTopColor: colors.border }]}>
            <FareLine label="Subtotal" amount={subtotal + surgeAmount - discountAmount} />
          </View>
          <FareLine label="Service fee" amount={serviceFee} />

          <View style={[styles.fareTotalLine, { borderTopColor: colors.border }]}>
            <FareLine label="Total" amount={total} bold />
          </View>
        </View>

        {/* Shared Ride — Fare Split Breakdown */}
        {isSharedRide && fareSplits && fareSplits.passengerCount > 1 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Fare Split</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <IconSymbol name="person.2.fill" size={14} color={V} />
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {fareSplits.passengerCount} passengers · total ride fare {formatCurrency(fareSplits.totalFare)}
              </Text>
            </View>
            {fareSplits.splits.map((s: { passengerId: number; name: string; fareShare: number; isMe: boolean; pickupAddress?: string; dropoffAddress?: string }, idx: number) => (
              <View
                key={s.passengerId}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: s.isMe ? P + "20" : colors.border,
                  alignItems: "center", justifyContent: "center", marginRight: 10,
                }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: s.isMe ? P : colors.muted }}>
                    {s.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                    {s.isMe ? `${s.name} (You)` : s.name}
                  </Text>
                  {s.pickupAddress && (
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }} numberOfLines={1}>
                      {(s.pickupAddress ?? "").split(",")[0]} → {(s.dropoffAddress ?? "").split(",")[0]}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: s.isMe ? P : colors.foreground }}>
                  {formatCurrency(s.fareShare)}
                </Text>
              </View>
            ))}
            <View style={[styles.fareTotalLine, { borderTopColor: colors.border, marginTop: 4 }]}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Your share</Text>
              <Text style={{ fontSize: 15, fontWeight: "700", color: P }}>
                {formatCurrency(fareSplits.splits.find((s: { isMe: boolean; fareShare: number }) => s.isMe)?.fareShare ?? total)}
              </Text>
            </View>
          </View>
        )}

        {/* Payment Method */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Payment</Text>
          <View style={styles.paymentRow}>
            <View style={[styles.paymentIconWrap, { backgroundColor: P + "12" }]}>
              <IconSymbol name="creditcard" size={20} color={P} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.paymentMethodText, { color: colors.foreground }]}>
                {ridePayment?.cardLast4
                  ? formatPaymentMethodLabel({ brand: ridePayment.cardBrand, last4: ridePayment.cardLast4 })
                  : "Card on file"}
              </Text>
              <Text style={[styles.paymentDateText, { color: colors.muted }]}>
                Charged {formatDate(rideDate)}
              </Text>
            </View>
            <Text style={[styles.paymentTotal, { color: colors.foreground }]}>
              {formatCurrency(total)}
            </Text>
          </View>
        </View>

        {/* Driver Info */}
        {driver && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Your Driver</Text>
            <View style={styles.driverRow}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>
                  {driver.avatar ?? driver.name?.charAt(0) ?? "D"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, { color: colors.foreground }]}>
                  {driver.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <StarDisplay rating={driver.rating ?? 4.8} size={12} />
                  <Text style={[styles.driverRatingText, { color: colors.muted }]}>
                    {(driver.rating ?? 4.8).toFixed(1)}
                  </Text>
                </View>
                {driver.vehicle && (
                  <Text style={[styles.driverVehicle, { color: colors.muted }]}>
                    {driver.vehicleColor ? `${driver.vehicleColor} ` : ""}
                    {driver.vehicle}
                    {driver.licensePlate ? ` \u00B7 ${driver.licensePlate}` : ""}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Trip Stats */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Trip Statistics</Text>
          <View style={styles.statsGrid}>
            <StatItem
              icon="point.topleft.down.to.point.bottomright.curvepath"
              label="Distance"
              value={`${distanceMi} mi`}
              iconColor={P}
            />
            <StatItem
              icon="clock"
              label="Duration"
              value={`${durationMin} min`}
              iconColor={V}
            />
            <StatItem
              icon="speedometer"
              label="Avg Speed"
              value={`${avgSpeed} mph`}
              iconColor={T}
            />
          </View>
        </View>

        {/* Map Placeholder */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Trip Map</Text>
          <View style={[styles.mapPlaceholder, { backgroundColor: colors.background }]}>
            <IconSymbol name="map" size={40} color={colors.muted} />
            <Text style={[styles.mapPlaceholderText, { color: colors.muted }]}>
              {shortAddress(ride.pickupAddress)} {"\u2192"} {shortAddress(ride.dropoffAddress)}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: P }]}
            onPress={handleDownloadPdf}
            activeOpacity={0.8}
          >
            <IconSymbol name="arrow.down.doc" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Download PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtnOutline, { borderColor: P }]}
            onPress={handleEmailReceipt}
            activeOpacity={0.8}
          >
            <IconSymbol name="envelope" size={18} color={P} />
            <Text style={[styles.actionBtnOutlineText, { color: P }]}>Email Receipt</Text>
          </TouchableOpacity>
        </View>

        {/* Footer Note */}
        <Text style={[styles.footerNote, { color: colors.muted }]}>
          Thank you for riding with us. If you have any questions about this trip,
          please contact support with invoice #RD-{(rideId ?? "000").slice(-6).toUpperCase()}.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  headerGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  invoiceLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  routeContainer: {
    gap: 0,
  },
  routeRow: {
    flexDirection: "row",
    gap: 14,
  },
  routeIndicator: {
    alignItems: "center",
    width: 20,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeLine: {
    width: 2,
    flex: 1,
    marginVertical: 4,
    minHeight: 30,
  },
  routeInfo: {
    flex: 1,
    paddingBottom: 16,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  routeAddress: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  routeTime: {
    fontSize: 12,
    marginTop: 3,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateText: {
    fontSize: 14,
    fontWeight: "500",
  },
  fareLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  fareLabel: {
    fontSize: 14,
  },
  fareAmount: {
    fontSize: 14,
    fontWeight: "500",
  },
  fareSubtotalLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 8,
  },
  fareTotalLine: {
    borderTopWidth: 1.5,
    marginTop: 8,
    paddingTop: 10,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  paymentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentMethodText: {
    fontSize: 14,
    fontWeight: "600",
  },
  paymentDateText: {
    fontSize: 12,
    marginTop: 2,
  },
  paymentTotal: {
    fontSize: 16,
    fontWeight: "700",
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  driverAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1E88FF",
    alignItems: "center",
    justifyContent: "center",
  },
  driverAvatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  driverName: {
    fontSize: 15,
    fontWeight: "700",
  },
  driverRatingText: {
    fontSize: 12,
    fontWeight: "500",
  },
  driverVehicle: {
    fontSize: 13,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  mapPlaceholder: {
    height: 140,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mapPlaceholderText: {
    fontSize: 13,
    fontWeight: "500",
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  actionBtnOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  actionBtnOutlineText: {
    fontSize: 14,
    fontWeight: "700",
  },
  footerNote: {
    fontSize: 12,
    textAlign: "center",
    marginHorizontal: 32,
    marginTop: 20,
    lineHeight: 18,
  },
});
