/**
 * Rate Ride V2 — Enhanced Rating Screen
 *
 * Features:
 *  - Clean white card design
 *  - Driver avatar + name + ride summary at top
 *  - Overall star rating (1-5, big tappable stars)
 *  - Category ratings: Driving, Cleanliness, Communication
 *  - Quick tags selection
 *  - Optional comment textarea
 *  - Optional tip: $1, $2, $5, Custom
 *  - Submit button
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useNotification } from "@/lib/use-notification";
import { trpc } from "@/lib/trpc";

// ── Constants ────────────────────────────────────────────────────────────────
const P = "#1E88FF";
const G = "#16A34A";
const A = "#F59E0B";
const V = "#8B5CF6";

const QUICK_TAGS = [
  "Great conversation",
  "Clean car",
  "Smooth ride",
  "On time",
  "Friendly",
  "Safe driver",
];

const TIP_PRESETS = [1, 3, 5];

// ── Star Rating Component ────────────────────────────────────────────────────
function StarRating({
  rating,
  onRate,
  size = 36,
  color = A,
}: {
  rating: number;
  onRate: (n: number) => void;
  size?: number;
  color?: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onRate(n)} activeOpacity={0.7}>
          <IconSymbol
            name={n <= rating ? "star.fill" : "star"}
            size={size}
            color={n <= rating ? color : "#D1D5DB"}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export default function RateRideV2Screen() {
  const colors = useColors();
  const router = useRouter();
  const notify = useNotification();
  const params = useLocalSearchParams<{
    rideId?: string;
    driverName?: string;
    driverId?: string;
    ratedUserId?: string;
    ratedUserName?: string;
    pickupAddress?: string;
    dropoffAddress?: string;
    fare?: string;
  }>();

  const rideId = params.rideId ?? "";
  const paramDriverId = params.driverId
    ? parseInt(params.driverId, 10)
    : params.ratedUserId
      ? parseInt(params.ratedUserId, 10)
      : 0;

  const { data: rideData, isLoading: rideLoading } = trpc.rides.getRide.useQuery(
    { rideId },
    { enabled: !!rideId && paramDriverId === 0 },
  );

  const driverId = useMemo(() => {
    if (paramDriverId > 0) return paramDriverId;
    const fromRide = rideData?.driverInfo?.id;
    return fromRide ? Number(fromRide) : 0;
  }, [paramDriverId, rideData?.driverInfo?.id]);

  const driverName = useMemo(() => {
    const fromParams = params.driverName ?? params.ratedUserName;
    if (fromParams) {
      try {
        return decodeURIComponent(fromParams);
      } catch {
        return fromParams;
      }
    }
    return rideData?.driverInfo?.name ?? "Your Driver";
  }, [params.driverName, params.ratedUserName, rideData?.driverInfo?.name]);

  const pickupAddress = useMemo(() => {
    if (params.pickupAddress) return params.pickupAddress;
    return rideData?.myPickupAddress ?? rideData?.pickupAddress ?? "Pickup location";
  }, [params.pickupAddress, rideData]);

  const dropoffAddress = useMemo(() => {
    if (params.dropoffAddress) return params.dropoffAddress;
    return rideData?.myDropoffAddress ?? rideData?.dropoffAddress ?? "Dropoff location";
  }, [params.dropoffAddress, rideData]);

  const fare = useMemo(() => {
    if (params.fare) return params.fare;
    if (rideData?.myFareShare != null) return String(rideData.myFareShare);
    if (rideData?.totalFare != null) return String(rideData.totalFare);
    return "0.00";
  }, [params.fare, rideData]);

  // State
  const [overallRating, setOverallRating] = useState(0);
  const [drivingRating, setDrivingRating] = useState(0);
  const [cleanlinessRating, setCleanlinessRating] = useState(0);
  const [communicationRating, setCommunicationRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState("");
  const [showCustomTip, setShowCustomTip] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitRating = trpc.rides.submitRating.useMutation();

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleTipSelect = (amount: number) => {
    if (tipAmount === amount) {
      setTipAmount(null);
    } else {
      setTipAmount(amount);
      setShowCustomTip(false);
      setCustomTip("");
    }
  };

  const handleCustomTip = () => {
    setShowCustomTip(true);
    setTipAmount(null);
  };

  const handleSubmit = async () => {
    if (overallRating === 0) {
      notify.showWarning("Please select a star rating before submitting.");
      return;
    }
    if (!rideId) {
      notify.showError("Missing ride information.");
      return;
    }
    if (!driverId) {
      notify.showError(rideLoading ? "Loading ride details…" : "Driver information unavailable.");
      return;
    }

    setIsSubmitting(true);
    const loadingId = notify.showLoading("Submitting rating…");
    try {
      const finalTip = showCustomTip ? parseFloat(customTip) || 0 : tipAmount ?? 0;

      await submitRating.mutateAsync({
        rideId,
        ratedUserId: driverId,
        ratingType: "driver",
        score: overallRating,
        comment: comment.trim() || undefined,
        categories: {
          driving: drivingRating || undefined,
          cleanliness: cleanlinessRating || undefined,
          communication: communicationRating || undefined,
        },
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        tipAmount: finalTip > 0 ? finalTip : undefined,
      });

      notify.dismiss(loadingId);
      notify.showSuccess("⭐ Rating submitted. Thank you!");
      router.back();
    } catch {
      notify.dismiss(loadingId);
      notify.showError("Failed to submit rating. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (rideId && !driverId && rideLoading) {
    return (
      <ScreenContainer className="p-4">
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} />
        <Text style={{ textAlign: "center", color: colors.muted, marginTop: 12 }}>Loading ride…</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-0">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <IconSymbol name="chevron.left" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "600", marginLeft: 4, fontSize: 15 }}>
              Back
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ padding: 16 }}>
          {/* Driver Card */}
          <View style={[styles.driverCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{
              width: 88, height: 88, borderRadius: 44,
              backgroundColor: P, alignItems: "center", justifyContent: "center",
              shadowColor: P, shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
              borderWidth: 3, borderColor: "#fff",
            }}>
              <Text style={{ fontSize: 36, fontWeight: "800", color: "#fff" }}>
                {driverName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.driverName, { color: colors.foreground }]}>{driverName}</Text>
            <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>
              Your trip was <Text style={{ fontWeight: "700", color: colors.foreground }}>${fare}</Text>
            </Text>

            {/* Ride Summary */}
            <View style={[styles.rideSummary, { borderTopColor: colors.border }]}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: G }]} />
                <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }} numberOfLines={1}>
                  {pickupAddress}
                </Text>
              </View>
              <View style={[styles.routeLine, { borderLeftColor: colors.border }]} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: "#EF4444" }]} />
                <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }} numberOfLines={1}>
                  {dropoffAddress}
                </Text>
              </View>
            </View>
          </View>

          {/* Overall Rating */}
          <View style={[styles.ratingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Overall Rating</Text>
            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <StarRating rating={overallRating} onRate={setOverallRating} size={44} />
              {overallRating > 0 && (
                <Text style={{ color: A, fontWeight: "700", fontSize: 15, marginTop: 8 }}>
                  {overallRating === 5
                    ? "Excellent!"
                    : overallRating === 4
                      ? "Great!"
                      : overallRating === 3
                        ? "Good"
                        : overallRating === 2
                          ? "Fair"
                          : "Poor"}
                </Text>
              )}
            </View>
          </View>

          {/* Category Ratings */}
          <View style={[styles.ratingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
              Rate by Category
            </Text>
            <View style={styles.categoryRow}>
              <Text style={[styles.categoryLabel, { color: colors.foreground }]}>Driving</Text>
              <StarRating rating={drivingRating} onRate={setDrivingRating} size={24} color={P} />
            </View>
            <View style={styles.categoryRow}>
              <Text style={[styles.categoryLabel, { color: colors.foreground }]}>Cleanliness</Text>
              <StarRating
                rating={cleanlinessRating}
                onRate={setCleanlinessRating}
                size={24}
                color={G}
              />
            </View>
            <View style={styles.categoryRow}>
              <Text style={[styles.categoryLabel, { color: colors.foreground }]}>Communication</Text>
              <StarRating
                rating={communicationRating}
                onRate={setCommunicationRating}
                size={24}
                color={V}
              />
            </View>
          </View>

          {/* Quick Tags */}
          <View style={[styles.ratingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Quick Feedback</Text>
            <View style={styles.tagsWrap}>
              {QUICK_TAGS.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      styles.tag,
                      {
                        backgroundColor: selected ? P : colors.background,
                        borderColor: selected ? P : colors.border,
                      },
                    ]}
                    onPress={() => handleTagToggle(tag)}
                  >
                    <Text
                      style={{
                        color: selected ? "#fff" : colors.foreground,
                        fontWeight: selected ? "600" : "400",
                        fontSize: 13,
                      }}
                    >
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Comment */}
          <View style={[styles.ratingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Additional Comments</Text>
            <TextInput
              style={[styles.commentInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Share more about your experience (optional)..."
              placeholderTextColor={colors.muted}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Tip */}
          <View style={[styles.ratingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
              Add a tip for {driverName}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>
              100% of the tip goes to your driver
            </Text>
            <View style={styles.tipRow}>
              {TIP_PRESETS.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={[
                    styles.tipBtn,
                    {
                      backgroundColor: tipAmount === amount ? G : colors.background,
                      borderColor: tipAmount === amount ? G : colors.border,
                    },
                  ]}
                  onPress={() => handleTipSelect(amount)}
                >
                  <Text
                    style={{
                      color: tipAmount === amount ? "#fff" : colors.foreground,
                      fontWeight: "700",
                      fontSize: 16,
                    }}
                  >
                    ${amount}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.tipBtn,
                  {
                    backgroundColor: showCustomTip ? V : colors.background,
                    borderColor: showCustomTip ? V : colors.border,
                  },
                ]}
                onPress={handleCustomTip}
              >
                <Text
                  style={{
                    color: showCustomTip ? "#fff" : colors.foreground,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>
            {showCustomTip && (
              <TextInput
                style={[styles.customTipInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="Enter custom amount"
                placeholderTextColor={colors.muted}
                value={customTip}
                onChangeText={setCustomTip}
                keyboardType="numeric"
              />
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, {
              backgroundColor: overallRating > 0 ? "#1A1A2E" : "#CBD5E1",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: overallRating > 0 ? 0.2 : 0,
              shadowRadius: 8,
              elevation: overallRating > 0 ? 6 : 0,
            }]}
            onPress={handleSubmit}
            disabled={isSubmitting || overallRating === 0}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <Text style={styles.submitText}>Submitting…</Text>
            ) : overallRating === 0 ? (
              <Text style={styles.submitText}>Select a rating to continue</Text>
            ) : (
              <Text style={styles.submitText}>Submit Rating</Text>
            )}
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity style={styles.skipBtn} onPress={() => router.back()}>
            <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "500" }}>Skip</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  driverCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  driverName: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 12,
  },
  rideSummary: {
    width: "100%",
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 14,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  routeLine: {
    width: 1,
    height: 16,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    marginLeft: 4,
  },
  ratingSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  tipRow: {
    flexDirection: "row",
    gap: 10,
  },
  tipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  customTipInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginTop: 10,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
    gap: 8,
  },
  submitText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 16,
  },
});
