import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import type { ThemeColorPalette } from "@/constants/theme";

interface Props {
  colors: ThemeColorPalette;
  onCreateRide: () => void;
  filterLabel?: string;
  onClearFilter?: () => void;
}

export function CarpoolEmptyState({ colors, onCreateRide, filterLabel, onClearFilter }: Props) {
  if (filterLabel && onClearFilter) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 24, paddingHorizontal: 16 }}>
        <View style={[s.filterBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="exclamationmark.triangle.fill" size={20} color="#F59E0B" />
          <Text style={{ fontSize: 13, color: colors.foreground, textAlign: "center", fontWeight: "700" }}>
            No rides match the &quot;{filterLabel}&quot; filter
          </Text>
          <TouchableOpacity onPress={onClearFilter}>
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700" }}>Show all rides →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.iconWrap, { backgroundColor: colors.primary + "12" }]}>
        <IconSymbol name="car.2.fill" size={24} color={colors.primary} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, marginBottom: 6, textAlign: "center" }}>
        No rides found on this route yet
      </Text>
      <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 8, maxWidth: 280 }}>
        Be the first to create a shared ride. Other riders can join and split the cost.
      </Text>
<TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 8 }}
        onPress={onCreateRide}
        activeOpacity={0.87}
      >
        <IconSymbol name="plus.circle.fill" size={16} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Create Shared Ride</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 8,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  filterBox: {
    borderRadius: 12,
    padding: 16,
    maxWidth: 320,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
});
