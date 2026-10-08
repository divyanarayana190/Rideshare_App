/**
 * StopsList — Reusable stop timeline component for multi-passenger rides.
 * Shows ordered stops with pickup/dropoff icons, passenger names, status badges, and ETAs.
 * Driver view: "Mark Arrived" button on next pending stop.
 * Passenger view: highlights own stops with progress indicator.
 */

import React, { useState, useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export interface StopItem {
  id: number;
  stopType: "pickup" | "dropoff";
  passengerId: number;
  lat?: string | number;
  lng?: string | number;
  address: string;
  sequence: number;
  status: "pending" | "approaching" | "reached" | "skipped";
  estimatedArrivalAt?: string | Date | null;
  actualArrivalAt?: string | Date | null;
  passengerName?: string;
}

interface StopsListProps {
  stops: StopItem[];
  /** Current user's passenger ID (to highlight their stops) */
  currentUserId?: number;
  /** Whether this is the driver's view (shows action buttons) */
  isDriverView?: boolean;
  /** Callback when driver marks a stop as reached */
  onMarkReached?: (stopId: number) => void;
  /** Whether an action is in progress */
  isLoading?: boolean;
}

export function StopsList({
  stops,
  currentUserId,
  isDriverView = false,
  onMarkReached,
  isLoading = false,
}: StopsListProps) {
  const colors = useColors();
  const sortedStops = [...stops].sort((a, b) => a.sequence - b.sequence);

  // Live countdown timer — ticks every 15s
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Find the first pending stop (next stop for driver)
  const nextPendingStop = sortedStops.find((s) => s.status === "pending");

  if (sortedStops.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <IconSymbol name="map.fill" size={16} color={colors.primary} />
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
          Route Stops
        </Text>
        <View style={{ backgroundColor: colors.primary + "15", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
            {sortedStops.length}
          </Text>
        </View>
      </View>

      {sortedStops.map((stop, index) => {
        const isMyStop = stop.passengerId === currentUserId;
        const isNext = nextPendingStop?.id === stop.id;
        const isReached = stop.status === "reached";
        const isPickup = stop.stopType === "pickup";

        const dotColor = isReached
          ? "#16A34A"
          : isNext
            ? colors.primary
            : colors.muted + "60";

        const eta = stop.estimatedArrivalAt
          ? new Date(stop.estimatedArrivalAt)
          : null;
        const minutesAway = eta
          ? Math.max(0, Math.round((eta.getTime() - now) / 60000))
          : null;
        const etaCountdown = minutesAway !== null && stop.status === "pending"
          ? minutesAway <= 1 ? "Arriving now" : `${minutesAway} min away`
          : null;

        // Address display: show friendly text instead of raw coordinates
        const isRawCoords = /^-?\d+\.\d+/.test(stop.address.trim()) && !stop.address.includes(" ");
        const displayAddress = isRawCoords ? "Location pinned on map" : stop.address.split(",")[0];

        return (
          <View key={stop.id} style={styles.stopRow}>
            {/* Timeline connector */}
            <View style={styles.timeline}>
              {index > 0 && (
                <View
                  style={[
                    styles.lineUp,
                    { backgroundColor: isReached ? "#16A34A" : colors.border },
                  ]}
                />
              )}
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: dotColor,
                    borderColor: isNext ? colors.primary : "transparent",
                    borderWidth: isNext ? 2 : 0,
                  },
                ]}
              >
                <IconSymbol
                  name={isPickup ? "arrow.down.circle.fill" : "arrow.up.circle.fill"}
                  size={14}
                  color={isReached ? "#fff" : isNext ? colors.primary : colors.muted}
                />
              </View>
              {index < sortedStops.length - 1 && (
                <View
                  style={[
                    styles.lineDown,
                    { backgroundColor: isReached ? "#16A34A" : colors.border },
                  ]}
                />
              )}
            </View>

            {/* Stop details */}
            <View
              style={[
                styles.stopContent,
                {
                  backgroundColor: isMyStop
                    ? colors.primary + "08"
                    : "transparent",
                  borderColor: isMyStop ? colors.primary + "30" : "transparent",
                  borderWidth: isMyStop ? 1 : 0,
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: isPickup ? "#16A34A" : "#EF4444", textTransform: "uppercase" }}>
                  {isPickup ? "PICKUP" : "DROPOFF"}
                </Text>
                {/* Status badge */}
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: isReached
                        ? "#16A34A15"
                        : isNext
                          ? colors.primary + "15"
                          : colors.muted + "15",
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "700",
                      color: isReached ? "#16A34A" : isNext ? colors.primary : colors.muted,
                    }}
                  >
                    {isReached ? "DONE" : isNext ? "NEXT" : "PENDING"}
                  </Text>
                </View>
                {isMyStop && (
                  <View style={[styles.statusBadge, { backgroundColor: colors.primary + "15" }]}>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: colors.primary }}>YOU</Text>
                  </View>
                )}
              </View>

              <Text
                style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}
                numberOfLines={1}
              >
                {displayAddress}
              </Text>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  {stop.passengerName ?? "Passenger"}
                </Text>
                {etaCountdown && (
                  <Text style={{ fontSize: 11, fontWeight: "600", color: minutesAway !== null && minutesAway <= 2 ? "#F59E0B" : colors.primary }}>
                    · {etaCountdown}
                  </Text>
                )}
                {isReached && stop.actualArrivalAt && (
                  <Text style={{ fontSize: 11, color: "#16A34A" }}>
                    · Completed
                  </Text>
                )}
              </View>

              {/* Driver action button */}
              {isDriverView && isNext && !isReached && (
                <TouchableOpacity
                  style={[styles.arriveBtn, { backgroundColor: colors.primary }]}
                  onPress={() => onMarkReached?.(stop.id)}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  <IconSymbol name="checkmark.circle.fill" size={14} color="#fff" />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff", marginLeft: 4 }}>
                    {isPickup ? "Arrived at Pickup" : "Dropped Off"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  stopRow: {
    flexDirection: "row",
    minHeight: 60,
  },
  timeline: {
    width: 28,
    alignItems: "center",
  },
  lineUp: {
    width: 2,
    flex: 1,
  },
  lineDown: {
    width: 2,
    flex: 1,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stopContent: {
    flex: 1,
    marginLeft: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  arriveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 6,
  },
});
