import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRides } from "@/lib/rides-store";
import type { Passenger } from "@/lib/types";

const ME_PASSENGER: Passenger = {
  id: "me",
  name: "You",
  avatar: "ME",
  rating: 4.8,
  pickup: {
    address: "Current Location",
    lat: 0,
    lng: 0,
    shortName: "My Location",
  },
  dropoff: {
    address: "Destination",
    lat: 0,
    lng: 0,
    shortName: "Destination",
  },
  fareShare: 0,
  distanceKm: 5,
};

export default function RideDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useRides();
  const accentColor = "#F59E0B";

  const ride = state.bookingDraft.selectedAvailableRide;

  useEffect(() => {
    if (!ride) router.back();
  }, [ride, router]);

  if (!ride) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#090618" }}>
        <ActivityIndicator size="large" color="#1E88FF" />
      </View>
    );
  }

  const myPassenger: Passenger = {
    ...ME_PASSENGER,
    pickup: state.bookingDraft.pickup ?? ME_PASSENGER.pickup,
    dropoff: state.bookingDraft.dropoff ?? ME_PASSENGER.dropoff,
    distanceKm: (state.bookingDraft.pickup && state.bookingDraft.dropoff)
      ? Math.max(
          1,
          Math.round(
            Math.sqrt(
              Math.pow((state.bookingDraft.dropoff.lat - state.bookingDraft.pickup.lat) * 111, 2) +
                Math.pow((state.bookingDraft.dropoff.lng - state.bookingDraft.pickup.lng) * 85, 2)
            ) * 10
          ) / 10
        )
      : 5,
  };

  const allPassengers = [...ride.passengers, myPassenger];
  const totalDist = allPassengers.reduce((s, p) => s + p.distanceKm, 0) || 1;
  const totalFareCalc = 3.5 + totalDist * 1.2;
  const fareSplits = allPassengers.map(p =>
    Math.round(totalFareCalc * (p.distanceKm / totalDist) * 100) / 100
  );
  const myFare = fareSplits[fareSplits.length - 1];
  const totalFare = fareSplits.reduce((a, b) => a + b, 0);
  const savings = ride.fullFare - myFare;

  const handleJoin = () => {
    router.push("/confirm-ride" as Href);
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
          Ride Details
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Driver Card */}
        <View style={[styles.driverCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.driverAvatar, { backgroundColor: colors.primary }]}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 20 }}>
              {ride.driver.avatar}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
              {ride.driver.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
              <IconSymbol name="star.fill" size={14} color={accentColor} />
              <Text style={{ fontSize: 13, color: colors.muted }}>
                {ride.driver.rating} · {ride.driver.totalTrips.toLocaleString()} trips
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
              {ride.driver.vehicleColor} {ride.driver.vehicle} · {ride.driver.licensePlate}
            </Text>
          </View>
          <View style={[styles.etaBadge, { backgroundColor: colors.primary }]}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
              {ride.departureMinutes} min
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 10 }}>away</Text>
          </View>
        </View>

        {/* Route Map Preview */}
        <View style={[styles.mapPreview, { backgroundColor: "#E8F0FE" }]}>
          {/* Simplified route visualization */}
          <View style={styles.routeViz}>
            <View style={styles.routePoint}>
              <View style={[styles.routeDotGreen]} />
              <Text style={{ fontSize: 12, color: "#1E88FF", fontWeight: "600", marginTop: 4 }}>
                {ride.pickup.shortName}
              </Text>
            </View>
            <View style={[styles.routeConnector, { backgroundColor: "#1E88FF" }]} />
            <View style={styles.routePoint}>
              <View style={[styles.routeDotBlue]} />
              <Text style={{ fontSize: 12, color: "#1E88FF", fontWeight: "600", marginTop: 4 }}>
                Your Stop
              </Text>
            </View>
            <View style={[styles.routeConnector, { backgroundColor: "#94A3B8" }]} />
            <View style={styles.routePoint}>
              <View style={[styles.routeDotRed]} />
              <Text style={{ fontSize: 12, color: "#6B7280", fontWeight: "600", marginTop: 4 }}>
                {ride.dropoff.shortName}
              </Text>
            </View>
          </View>
          <View style={[styles.overlapBadge, { backgroundColor: colors.success }]}>
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
              {ride.routeOverlapPercent}% route match
            </Text>
          </View>
        </View>

        {/* Co-Passengers */}
        <View style={styles.section}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
            Co-Passengers
          </Text>
          {ride.passengers.map((p) => (
            <View
              key={p.id}
              style={[styles.passengerRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.pAvatar, { backgroundColor: colors.primary + "20" }]}>
                <Text style={{ fontWeight: "700", color: colors.primary, fontSize: 13 }}>
                  {p.avatar}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {p.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <IconSymbol name="star.fill" size={11} color={accentColor} />
                  <Text style={{ fontSize: 12, color: colors.muted }}>{p.rating}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>·</Text>
                  <View style={styles.dotGreen} />
                  <Text style={{ fontSize: 12, color: colors.muted }}>{p.pickup.shortName}</Text>
                  <IconSymbol name="arrow.right" size={11} color={colors.muted} />
                  <View style={styles.dotRed} />
                  <Text style={{ fontSize: 12, color: colors.muted }}>{p.dropoff.shortName}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                ${p.fareShare.toFixed(2)}
              </Text>
            </View>
          ))}

          {/* Your row */}
          <View
            style={[
              styles.passengerRow,
              { backgroundColor: colors.primary + "10", borderColor: colors.primary },
            ]}
          >
            <View style={[styles.pAvatar, { backgroundColor: colors.primary }]}>
              <Text style={{ fontWeight: "700", color: "#fff", fontSize: 13 }}>ME</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>
                You (joining)
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                <View style={styles.dotGreen} />
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {myPassenger.pickup.shortName}
                </Text>
                <IconSymbol name="arrow.right" size={11} color={colors.muted} />
                <View style={styles.dotRed} />
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {myPassenger.dropoff.shortName}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.primary }}>
              ${myFare.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Fare Breakdown */}
        <View style={[styles.fareCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>
            Fare Split Breakdown
          </Text>

          <View style={styles.fareRow}>
            <Text style={{ fontSize: 14, color: colors.muted }}>Total ride fare</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
              ${totalFare.toFixed(2)}
            </Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={{ fontSize: 14, color: colors.muted }}>Platform fee</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>$1.50</Text>
          </View>
          <View style={[styles.fareDivider, { backgroundColor: colors.border }]} />
          <View style={styles.fareRow}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
              Your share
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>
              ${(myFare + 1.5).toFixed(2)}
            </Text>
          </View>
          <View
            style={[styles.savingsBadge, { backgroundColor: colors.success + "15" }]}
          >
            <IconSymbol name="checkmark.circle.fill" size={16} color={colors.success} />
            <Text style={{ fontSize: 13, color: colors.success, fontWeight: "600", marginLeft: 6 }}>
              You save ${savings.toFixed(2)} compared to a solo ride!
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA — in normal flow with safe area support */}
      <View
        style={[
          styles.bottomCTA,
          { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <View>
          <Text style={{ fontSize: 12, color: colors.muted }}>Your total</Text>
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.primary }}>
            ${(myFare + 1.5).toFixed(2)}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.joinBtn, { backgroundColor: colors.primary }]}
          onPress={handleJoin}
        >
          <IconSymbol name="person.2.fill" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Join This Ride</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  etaBadge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  mapPreview: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
  },
  routeViz: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  routePoint: {
    alignItems: "center",
  },
  routeConnector: {
    height: 3,
    width: 60,
    borderRadius: 2,
  },
  routeDotGreen: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#16A34A",
    borderWidth: 2,
    borderColor: "#fff",
  },
  routeDotBlue: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#1E88FF",
    borderWidth: 2,
    borderColor: "#fff",
  },
  routeDotRed: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#fff",
  },
  overlapBadge: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  passengerRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  pAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  dotGreen: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#16A34A",
  },
  dotRed: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  fareCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  fareDivider: {
    height: 1,
    marginVertical: 8,
  },
  savingsBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  bottomCTA: {
    // FIX: Removed position:absolute — button is now always visible in normal flow
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 8,
    flex: 1,
    marginLeft: 16,
    minHeight: 52,
  },
});
