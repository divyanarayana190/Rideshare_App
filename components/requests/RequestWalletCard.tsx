import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Text, TouchableOpacity, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { RQ } from "./theme";
import type { RequestItem } from "./types";
import { avatarColor, fmtTime, isWomenOnlyPreference, matchColor, matchScore, shortAddr, timeAgo } from "./utils";

function ExpiryTimer({ createdAt }: { createdAt: string }) {
  const expiresAt = new Date(createdAt).getTime() + 10 * 60 * 1000;
  const [rem, setRem] = useState(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    if (rem <= 0) return;
    const t = setInterval(() => setRem((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [rem]);
  if (rem <= 0) return null;
  const m = Math.floor(rem / 60);
  const sec = rem % 60;
  const color = rem < 120 ? RQ.red : rem < 300 ? RQ.orange : RQ.textSecondary;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <IconSymbol name="timer" size={12} color={color} />
      <Text style={{ fontSize: 12, fontWeight: "700", color }}>{m}:{sec < 10 ? "0" : ""}{sec}</Text>
    </View>
  );
}

interface RequestWalletCardProps {
  item: RequestItem;
  status: "pending" | "accepted" | "rejected";
  expanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onMessage: () => void;
  onViewRoute: () => void;
  isApproving: boolean;
  isRejecting: boolean;
}

export function RequestWalletCard({
  item,
  status,
  expanded,
  onToggle,
  onApprove,
  onReject,
  onMessage,
  onViewRoute,
  isApproving,
  isRejecting,
}: RequestWalletCardProps) {
  const pct = matchScore(item);
  const mc = matchColor(pct);
  const estFare = Number(item.pricePerSeat) * Number(item.seatsRequested);
  const initial = item.passengerName.charAt(0).toUpperCase();
  const av = avatarColor(item.passengerName);
  const heightAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(heightAnim, { toValue: expanded ? 1 : 0, useNativeDriver: false, tension: 120, friction: 14 }).start();
  }, [expanded, heightAnim]);

  const statusCfg = {
    pending: { label: "Pending", bg: RQ.orangeSoft, color: RQ.orange, border: RQ.orange + "40" },
    accepted: { label: "Accepted", bg: RQ.greenSoft, color: RQ.green, border: RQ.green + "40" },
    rejected: { label: "Rejected", bg: RQ.redSoft, color: RQ.red, border: RQ.red + "40" },
  }[status];

  return (
    <View style={{ marginBottom: 12, borderRadius: RQ.radius, backgroundColor: RQ.surface, borderWidth: 1, borderColor: RQ.border, overflow: "hidden", ...RQ.shadow }}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.92} accessibilityRole="button">
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: statusCfg.bg, borderWidth: 1, borderColor: statusCfg.border }}>
              {status === "pending" ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusCfg.color }} /> : null}
              <Text style={{ fontSize: 11, fontWeight: "800", color: statusCfg.color, letterSpacing: 0.4 }}>{statusCfg.label.toUpperCase()}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {status === "pending" ? <ExpiryTimer createdAt={item.createdAt} /> : null}
              <Text style={{ fontSize: 11, color: RQ.textMuted }}>{timeAgo(item.createdAt)}</Text>
              <IconSymbol name={expanded ? "chevron.up" : "chevron.down"} size={14} color={RQ.textMuted} />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: av + "18", borderWidth: 2, borderColor: av + "40", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 22, fontWeight: "800", color: av }}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <Text style={{ fontSize: 17, fontWeight: "800", color: RQ.text }} numberOfLines={1}>{item.passengerName}</Text>
                {item.isStudentVerified ? <IconSymbol name="checkmark.seal.fill" size={16} color={RQ.green} /> : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <IconSymbol name="star.fill" size={12} color={RQ.orange} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: RQ.text }}>{Number(item.passengerRating).toFixed(1)}</Text>
                <Text style={{ fontSize: 12, color: RQ.textMuted }}>{item.passengerRides} rides</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {item.isStudentVerified ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "#EFF6FF" }}>
                    <IconSymbol name="graduationcap.fill" size={10} color={RQ.blue} />
                    <Text style={{ fontSize: 10, fontWeight: "700", color: RQ.blue }}>Student</Text>
                  </View>
                ) : null}
                {isWomenOnlyPreference(item.genderPreference) ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: RQ.purpleSoft }}>
                    <IconSymbol name="shield.fill" size={10} color={RQ.purple} />
                    <Text style={{ fontSize: 10, fontWeight: "700", color: RQ.purple }}>Women Only</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={{ alignItems: "center" }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: mc + "50", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: "900", color: mc }}>{pct}%</Text>
              </View>
              <Text style={{ fontSize: 9, color: RQ.textMuted, marginTop: 2 }}>Match</Text>
              <Text style={{ fontSize: 15, fontWeight: "800", color: RQ.green, marginTop: 4 }}>${estFare.toFixed(2)}</Text>
            </View>
          </View>

          <View style={{ marginTop: 14, padding: 12, borderRadius: RQ.radiusSm, backgroundColor: RQ.surfaceMuted }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ alignItems: "center", paddingTop: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: RQ.green }} />
                <View style={{ width: 2, flex: 1, minHeight: 24, backgroundColor: RQ.border, marginVertical: 4 }} />
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: RQ.red }} />
              </View>
              <View style={{ flex: 1, gap: 12 }}>
                <View>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: RQ.textMuted, letterSpacing: 0.5 }}>PICKUP</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: RQ.text }} numberOfLines={1}>{shortAddr(item.pickupAddress)}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: RQ.textMuted, letterSpacing: 0.5 }}>DROP-OFF</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: RQ.text }} numberOfLines={1}>{shortAddr(item.dropoffAddress)}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <Animated.View style={{ maxHeight: heightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }), opacity: heightAnim, overflow: "hidden" }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: RQ.borderSoft }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            <InfoPill icon="clock.fill" label="Departure" value={fmtTime(item.departureTime)} />
            <InfoPill icon="person.2.fill" label="Seats" value={String(item.seatsRequested)} />
            <InfoPill icon="dollarsign.circle.fill" label="Est. earnings" value={`$${estFare.toFixed(2)}`} />
            {item.detourKm != null && Number(item.detourKm) > 0 ? (
              <InfoPill icon="map.fill" label="Detour" value={`${Number(item.detourKm).toFixed(1)} km`} />
            ) : null}
          </View>

          {item.message ? (
            <View style={{ marginTop: 12, padding: 12, borderRadius: RQ.radiusSm, backgroundColor: RQ.purpleSoft, borderWidth: 1, borderColor: RQ.purple + "25" }}>
              <Text style={{ fontSize: 13, color: RQ.textSecondary, fontStyle: "italic" }}>{`"${item.message}"`}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            <ActionChip icon="bubble.left.fill" label="Message" onPress={onMessage} />
            <ActionChip icon="map.fill" label="View Route" onPress={onViewRoute} />
            {status === "pending" ? (
              <>
                <ActionChip icon="xmark" label="Reject" onPress={onReject} danger loading={isRejecting} disabled={isApproving || isRejecting} />
                <ActionChip icon="checkmark" label="Accept" onPress={onApprove} primary loading={isApproving} disabled={isApproving || isRejecting} />
              </>
            ) : status === "accepted" ? (
              <ActionChip icon="arrow.right.circle.fill" label="View Ride" onPress={onViewRoute} primary />
            ) : (
              <ActionChip icon="arrow.right.circle.fill" label="View Ride" onPress={onViewRoute} />
            )}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function InfoPill({ icon, label, value }: { icon: Parameters<typeof IconSymbol>[0]["name"]; label: string; value: string }) {
  return (
    <View style={{ minWidth: "46%", flexGrow: 1, padding: 10, borderRadius: 12, backgroundColor: RQ.surfaceMuted, borderWidth: 1, borderColor: RQ.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <IconSymbol name={icon} size={12} color={RQ.textMuted} />
        <Text style={{ fontSize: 10, fontWeight: "700", color: RQ.textMuted, textTransform: "uppercase" }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: "700", color: RQ.text }}>{value}</Text>
    </View>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
  primary,
  danger,
  loading,
  disabled,
}: {
  icon: Parameters<typeof IconSymbol>[0]["name"];
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  const bg = primary ? RQ.blue : danger ? RQ.redSoft : RQ.surface;
  const border = primary ? RQ.blue : danger ? RQ.red + "40" : RQ.border;
  const color = primary ? "#fff" : danger ? RQ.red : RQ.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        minHeight: 44,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : <IconSymbol name={icon} size={14} color={color} />}
      <Text style={{ fontSize: 13, fontWeight: "700", color }}>{label}</Text>
    </TouchableOpacity>
  );
}
