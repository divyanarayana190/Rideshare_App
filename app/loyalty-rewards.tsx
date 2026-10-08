import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/ui/ErrorState";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";

const VISIBLE_HISTORY = 5;

const REASON_LABELS: Record<string, string> = {
  mid_ride_join: "Mid-ride join",
  co_rider_bonus: "Co-rider bonus",
  shared_ride_completed: "Shared ride completed",
  driver_bonus: "Driver bonus",
  referral_bonus: "Referral",
  redeemed: "Redeemed",
  first_shared_ride: "First shared ride bonus",
};

const DISCOUNT_TIERS = [
  { rides: 10, discount: "50% off", maxValue: "$10" },
  { rides: 20, discount: "60% off", maxValue: "$15" },
  { rides: 30, discount: "70% off", maxValue: "$20" },
  { rides: 50, discount: "1 free ride", maxValue: "$25" },
];

export default function LoyaltyRewardsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Fetch real points data
  const pointsQuery = trpc.rewards.getPoints.useQuery(undefined);
  const historyQuery = trpc.rewards.getHistory.useQuery({ limit: 50, offset: 0 });
  const pointsData = pointsQuery.data;
  const historyData = historyQuery.data;
  const pointsLoading = pointsQuery.isLoading;
  const historyLoading = historyQuery.isLoading;
  const loadError = pointsQuery.isError || historyQuery.isError;
  const retryLoad = () => {
    void pointsQuery.refetch();
    void historyQuery.refetch();
  };

  // Fetch real ride stats
  const { data: statsData } = trpc.user.getStats.useQuery(undefined);

  const points = pointsData?.points ?? 0;
  const totalEarned = pointsData?.totalEarned ?? 0;
  const totalRedeemed = pointsData?.totalRedeemed ?? 0;
  const totalRides = statsData?.totalRides ?? 0;
  const shareRides = statsData?.shareRides ?? 0;

  // Tier calculation
  const currentTier = points >= 200 ? "Platinum" : points >= 100 ? "Gold" : points >= 50 ? "Silver" : "Bronze";
  const tierColors: Record<string, string> = { Bronze: "#CD7F32", Silver: "#9CA3AF", Gold: "#F59E0B", Platinum: "#6366F1" };
  const nextTierThreshold = points >= 200 ? 200 : points >= 100 ? 200 : points >= 50 ? 100 : 50;
  const pointsToNextTier = Math.max(0, nextTierThreshold - points);
  const progressPercent = points >= 200 ? 100 : Math.min(100, Math.round((points / nextTierThreshold) * 100));

  // Money saved estimate (shared rides save ~40% of avg $15 fare)
  const moneySaved = Math.round(shareRides * 15 * 0.4);

  const history = historyData ?? [];
  const visibleHistory = showAllHistory ? history : history.slice(0, VISIBLE_HISTORY);

  const isLoading = pointsLoading || historyLoading;

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ gap: 20, marginTop: 16 }}>
          {/* Header */}
          <View>
            <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <IconSymbol name="chevron.left" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 16 }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground, marginTop: 12 }}>
              Loyalty & Rewards
            </Text>
          </View>

          {loadError ? (
            <ErrorState
              title="Could not load rewards"
              message="Your points balance could not be loaded."
              onRetry={retryLoad}
            />
          ) : isLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 48 }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <>
              {/* Points Overview Card */}
              <View style={{ backgroundColor: colors.primary, borderRadius: 16, padding: 20, gap: 16 }}>
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>Your Points</Text>
                  <Text style={{ color: "#fff", fontSize: 42, fontWeight: "800", marginTop: 4 }}>{points}</Text>
                </View>

                <View style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 12 }}>
                  <Text style={{ color: "#fff", fontSize: 13 }}>
                    {pointsToNextTier > 0 ? `${pointsToNextTier} points to next tier` : "You reached the highest tier!"}
                  </Text>
                  <View style={{ backgroundColor: "rgba(255,255,255,0.2)", height: 8, borderRadius: 4, marginTop: 8, overflow: "hidden" }}>
                    <View style={{ backgroundColor: "#fff", height: "100%", borderRadius: 4, width: `${progressPercent}%` }} />
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 10, alignItems: "center" }}>
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>Tier</Text>
                    <Text style={{ color: tierColors[currentTier] ?? "#fff", fontWeight: "800", fontSize: 15 }}>{currentTier}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 10, alignItems: "center" }}>
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>Rides</Text>
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{totalRides}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 10, alignItems: "center" }}>
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>Saved</Text>
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>${moneySaved}</Text>
                  </View>
                </View>
              </View>

              {/* Points Summary */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1, backgroundColor: "#16A34A10", borderRadius: 10, padding: 12, alignItems: "center" }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: "#16A34A" }}>{totalEarned}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Total Earned</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: "#EF444410", borderRadius: 10, padding: 12, alignItems: "center" }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: "#EF4444" }}>{totalRedeemed}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Redeemed</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.primary + "10", borderRadius: 10, padding: 12, alignItems: "center" }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.primary }}>{points}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Available</Text>
                </View>
              </View>

              {/* How It Works */}
              <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, gap: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                  How It Works
                </Text>
                <View style={{ gap: 8 }}>
                  {[
                    "Earn 10 points per completed ride",
                    "Bonus points for shared rides",
                    "Redeem points for discounts",
                    "Unlock tier benefits at milestones",
                  ].map((text, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <IconSymbol name="checkmark.circle.fill" size={16} color="#16A34A" />
                      <Text style={{ fontSize: 13, color: colors.muted }}>{text}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Discount Tiers */}
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                  Discount Tiers
                </Text>
                {DISCOUNT_TIERS.map((tier, index) => {
                  const unlocked = totalRides >= tier.rides;
                  return (
                    <View
                      key={index}
                      style={{
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: unlocked ? "#16A34A" + "40" : colors.border,
                        borderRadius: 10,
                        padding: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <View>
                        <Text style={{ fontWeight: "700", color: colors.foreground, fontSize: 14 }}>
                          {tier.rides} Rides
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                          {tier.discount} (up to {tier.maxValue})
                        </Text>
                      </View>
                      <View style={{
                        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
                        backgroundColor: unlocked ? "#16A34A20" : colors.border + "30",
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: unlocked ? "#16A34A" : colors.muted }}>
                          {unlocked ? "Unlocked" : `${tier.rides - totalRides} more`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Recent Activity */}
              {history.length > 0 && (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                    Recent Activity
                  </Text>
                  <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 0 }}>
                    {visibleHistory.map((entry: any, i: number) => {
                      const isPositive = entry.amount > 0;
                      const dateStr = entry.createdAt
                        ? new Date(entry.createdAt).toLocaleDateString([], { month: "short", day: "numeric" }) +
                          " " +
                          new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "";
                      return (
                        <View
                          key={entry.id}
                          style={{
                            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                            paddingVertical: 10,
                            borderTopWidth: i > 0 ? 1 : 0,
                            borderTopColor: colors.border + "30",
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                            <View style={{
                              width: 32, height: 32, borderRadius: 16,
                              backgroundColor: isPositive ? "#16A34A15" : "#EF444415",
                              alignItems: "center", justifyContent: "center",
                            }}>
                              <IconSymbol
                                name={isPositive ? "arrow.up.circle.fill" : "arrow.down.circle.fill"}
                                size={16}
                                color={isPositive ? "#16A34A" : "#EF4444"}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                                {REASON_LABELS[entry.reason] ?? entry.reason}
                              </Text>
                              {dateStr ? (
                                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>{dateStr}</Text>
                              ) : null}
                            </View>
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: isPositive ? "#16A34A" : "#EF4444" }}>
                            {isPositive ? "+" : ""}{entry.amount} pts
                          </Text>
                        </View>
                      );
                    })}

                    {history.length > VISIBLE_HISTORY && (
                      <TouchableOpacity
                        onPress={() => setShowAllHistory(!showAllHistory)}
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, marginTop: 4 }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary, marginRight: 4 }}>
                          {showAllHistory ? "Show Less" : `View All (${history.length})`}
                        </Text>
                        <IconSymbol name={showAllHistory ? "chevron.up" : "chevron.down"} size={14} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Empty state */}
              {history.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
                  <IconSymbol name="star.fill" size={36} color={colors.muted} />
                  <Text style={{ fontSize: 14, color: colors.muted }}>
                    Complete rides to start earning points!
                  </Text>
                </View>
              )}

              {/* Referral Program */}
              <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, gap: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                  Referral Program
                </Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  Invite friends and earn $5 credits for each successful referral
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: "center" }}
                  onPress={() => router.push("/referral" as Href)}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                    Share Referral Code
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
