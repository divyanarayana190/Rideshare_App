import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from "react-native";

import { GradientView } from "@/components/GradientView";
import type { ThemeColorPalette } from "@/constants/theme";

export interface CarpoolMatch {
  rideId: string;
  pickup: string;
  dropoff: string;
  departureTime: string | null;
  price: number;
  seatsLeft: number;
  totalSeats: number;
  riderName: string;
  rating: number;
  isVerified: boolean;
  isStudentVerified: boolean;
  school?: string;
  genderPreference?: "everyone" | "women_only";
  driverGender?: string | null;
  safetyMode?: string;
  routeOverlapPercent: number;
  pickupDistanceMiles: number;
  matchScore: number;
  approvalRequired: boolean;
  myJoinStatus: string | null;
  isOwnRide?: boolean;
}

interface Props {
  match: CarpoolMatch;
  colors: ThemeColorPalette;
  isJoining: boolean;
  onJoin: () => void;
}

function formatDeparture(iso: string | null): string {
  if (!iso) return "Flexible";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tmrw = new Date(now);
  tmrw.setDate(tmrw.getDate() + 1);
  const isTmrw = d.toDateString() === tmrw.toDateString();
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return t;
  if (isTmrw) return `Tomorrow ${t}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${t}`;
}

function getBadges(match: CarpoolMatch): string[] {
  const badges: string[] = [];
  if (match.school) badges.push(match.school);
  else if (match.isStudentVerified) badges.push("Student Verified");
  if (match.isVerified && !match.isStudentVerified) badges.push("Verified");
  if (match.driverGender === "female") badges.push("Women Driver");
  if (match.genderPreference === "women_only") badges.push("Women Only");
  return badges;
}

function joinLabel(match: CarpoolMatch): string {
  if (match.isOwnRide) return "Your Posted Ride";
  if (match.myJoinStatus === "pending") return "Requested";
  if (match.myJoinStatus === "approved") return "Joined";
  return match.approvalRequired ? "Request to Join" : "Join Ride";
}

export function CarpoolResultCard({ match, colors, isJoining, onJoin }: Props) {
  const badges = getBadges(match);
  const disabled = match.isOwnRide || match.myJoinStatus === "pending" || match.myJoinStatus === "approved";
  const scoreColor = match.matchScore >= 80 ? "#16A34A" : match.matchScore >= 60 ? "#F59E0B" : colors.muted;

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.scoreBadge, { backgroundColor: scoreColor + "18", borderColor: scoreColor + "40" }]}>
        <Text style={{ fontSize: 11, fontWeight: "900", color: scoreColor, letterSpacing: 0.5 }}>
          {match.matchScore}% MATCH
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
        <View style={[s.avatar, { backgroundColor: colors.primary + "15" }]}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.primary }}>
            {match.riderName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
            {match.riderName} · {match.rating.toFixed(1)} ⭐
          </Text>
          {badges.length > 0 && (
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
              {badges.join(" · ")}
            </Text>
          )}
        </View>
      </View>

      <View style={[s.routeBox, { backgroundColor: colors.background }]}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
          {match.pickup.split(",")[0]} → {match.dropoff.split(",")[0]}
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
          {formatDeparture(match.departureTime)} · {match.seatsLeft} seat{match.seatsLeft !== 1 ? "s" : ""} left · ${match.price.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
          {match.routeOverlapPercent}% route overlap · {match.pickupDistanceMiles.toFixed(1)} mi pickup
        </Text>
      </View>

      {match.isOwnRide ? (
        <View style={[s.ownRide, { borderColor: "#16A34A40", backgroundColor: "#16A34A12" }]}>
          <Text style={{ color: "#16A34A", fontWeight: "800", fontSize: 14 }}>✓ Your Posted Ride</Text>
        </View>
      ) : disabled ? (
        <View style={[s.ownRide, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 14 }}>{joinLabel(match)}</Text>
        </View>
      ) : isJoining ? (
        <View style={[s.cta, { backgroundColor: colors.primary + "80", justifyContent: "center" }]}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : (
        <TouchableOpacity onPress={onJoin} activeOpacity={0.86}>
          <GradientView style={s.cta}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{joinLabel(match)}</Text>
          </GradientView>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  scoreBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  routeBox: {
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  cta: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  ownRide: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
  },
});
