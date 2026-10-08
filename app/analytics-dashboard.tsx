import { useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/ui/ErrorState";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const ACHIEVEMENTS = [
  {
    id: "eco",
    icon: "leaf.fill" as IconSymbolName,
    iconColor: "#22C55E",
    title: "Eco Warrior",
    description: "Completed 20 shared rides",
    requiredRides: 20,
  },
  {
    id: "frequent",
    icon: "star.fill" as IconSymbolName,
    iconColor: "#FFD700",
    title: "Frequent Rider",
    description: "Completed 10 rides",
    requiredRides: 10,
  },
  {
    id: "saver",
    icon: "dollarsign.circle.fill" as IconSymbolName,
    iconColor: "#1E88FF",
    title: "Smart Saver",
    description: "Saved $50+ by sharing rides",
    requiredRides: 5,
  },
];

export default function AnalyticsDashboard() {
  const colors = useColors();
  const router = useRouter();

  const { data: stats, isLoading, isError, refetch } = trpc.user.getStats.useQuery(undefined);

  const totalRides = stats?.totalRides ?? 0;
  const totalSpent = stats?.totalSpent ?? 0;
  const avgRating = stats?.avgRating ?? 0;
  const shareRides = stats?.shareRides ?? 0;

  // Rough CO2 saving estimate: 0.21 kg per km saved per person, ~5 km avg shared ride
  const co2Saved = (shareRides * 5 * 0.21).toFixed(1);
  // Money saved vs solo: shared rides ~40% cheaper, avg $15 solo fare
  const moneySaved = (shareRides * 15 * 0.4).toFixed(2);

  const statCards: { label: string; value: string; icon: IconSymbolName; color: string }[] = [
    { label: "Total Rides", value: String(totalRides), icon: "car.fill", color: colors.primary },
    { label: "Total Spent", value: `$${Number(totalSpent).toFixed(2)}`, icon: "dollarsign.circle.fill", color: colors.success },
    { label: "CO2 Saved", value: `${co2Saved} kg`, icon: "leaf.fill", color: "#22C55E" },
    { label: "Avg Rating", value: avgRating > 0 ? avgRating.toFixed(1) : "—", icon: "star.fill", color: "#FFD700" },
  ];

  const activityRows = [
    { label: "Shared Rides", value: String(shareRides), sub: `${totalRides > 0 ? Math.round((shareRides / totalRides) * 100) : 0}% of trips` },
    { label: "Money Saved", value: `$${moneySaved}`, sub: "vs. solo pricing" },
    { label: "Solo Rides", value: String(totalRides - shareRides), sub: "private rides" },
  ];

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground }}>
              Your Analytics
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
              All-time ride summary
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="xmark.circle.fill" size={26} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {isError ? (
          <ErrorState
            title="Could not load analytics"
            message="Your ride stats are temporarily unavailable."
            onRetry={() => void refetch()}
          />
        ) : isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <>
            {/* Stats Grid */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              {statCards.map((stat, idx) => (
                <View
                  key={idx}
                  style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <IconSymbol name={stat.icon} size={30} color={stat.color} />
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 10, textAlign: "center" }}>
                    {stat.label}
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, marginTop: 4 }}>
                    {stat.value}
                  </Text>
                </View>
              ))}
            </View>

            {/* Activity Breakdown */}
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
              Ride Breakdown
            </Text>
            {activityRows.map((row, idx) => (
              <View
                key={idx}
                style={[styles.activityItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    {row.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {row.sub}
                  </Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.primary }}>
                  {row.value}
                </Text>
              </View>
            ))}

            {/* Achievements */}
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 24, marginBottom: 10 }}>
              Achievements
            </Text>
            {ACHIEVEMENTS.map((ach) => {
              const unlocked = totalRides >= ach.requiredRides;
              return (
                <View
                  key={ach.id}
                  style={[
                    styles.achievementCard,
                    {
                      backgroundColor: unlocked ? colors.surface : colors.background,
                      borderColor: unlocked ? colors.border : colors.border + "80",
                      opacity: unlocked ? 1 : 0.55,
                    },
                  ]}
                >
                  <View style={[styles.achIcon, { backgroundColor: ach.iconColor + "18" }]}>
                    <IconSymbol name={ach.icon} size={28} color={unlocked ? ach.iconColor : colors.muted} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                      {ach.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      {ach.description}
                    </Text>
                  </View>
                  {unlocked ? (
                    <IconSymbol name="checkmark.circle.fill" size={22} color={colors.success} />
                  ) : (
                    <IconSymbol name="lock.fill" size={18} color={colors.muted} />
                  )}
                </View>
              );
            })}

            {/* Empty state */}
            {totalRides === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
                <IconSymbol name="car.fill" size={44} color={colors.muted} />
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                  No rides yet
                </Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  Book your first ride to see stats here
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  statCard: {
    flex: 0.47,
    paddingHorizontal: 12,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  achievementCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  achIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
