import { Text, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { RQ } from "./theme";
import type { RideRequestSection } from "./types";
import { fmtTime } from "./utils";

export function RideSectionHeader({ section }: { section: RideRequestSection }) {
  return (
    <View style={{ marginBottom: 10, marginTop: 4, padding: 14, borderRadius: RQ.radiusMd, backgroundColor: RQ.surface, borderWidth: 1, borderColor: RQ.border, ...RQ.shadow }}>
      <Text style={{ fontSize: 15, fontWeight: "800", color: RQ.text }} numberOfLines={1}>{section.rideTitle}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <IconSymbol name="clock.fill" size={12} color={RQ.textMuted} />
          <Text style={{ fontSize: 12, color: RQ.textSecondary }}>{fmtTime(section.departureTime)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <IconSymbol name="person.2.fill" size={12} color={RQ.textMuted} />
          <Text style={{ fontSize: 12, color: RQ.textSecondary }}>{section.seatsAvailable} seats left</Text>
        </View>
      </View>
    </View>
  );
}
