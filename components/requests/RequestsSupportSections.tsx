import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { ComponentProps } from "react";
import { RQ } from "./theme";

type IconName = ComponentProps<typeof IconSymbol>["name"];

interface QuickAction {
  icon: IconName;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}

export function RequestsQuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 17, fontWeight: "800", color: RQ.text, paddingHorizontal: 20, marginBottom: 10 }}>Quick Actions</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
        {actions.map((a) => (
          <TouchableOpacity
            key={a.label}
            onPress={a.onPress}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 24,
              backgroundColor: RQ.surface,
              borderWidth: 1,
              borderColor: RQ.border,
              ...RQ.shadow,
            }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: a.bg, alignItems: "center", justifyContent: "center" }}>
              <IconSymbol name={a.icon} size={16} color={a.color} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: RQ.text }}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

interface RequestsBottomDockProps {
  pendingCount: number;
  acceptRate: number;
  onTrustPress: () => void;
}

export function RequestsBottomDock({ pendingCount, acceptRate, onTrustPress }: RequestsBottomDockProps) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 12 }}>
      <View style={{ backgroundColor: RQ.surfaceMuted, borderRadius: RQ.radiusMd, padding: 14, borderWidth: 1, borderColor: RQ.border }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: RQ.textMuted, letterSpacing: 0.5, marginBottom: 8 }}>MATCHING STATUS</Text>
        <Text style={{ fontSize: 14, color: RQ.textSecondary, lineHeight: 20 }}>
          {pendingCount > 0
            ? `${pendingCount} rider${pendingCount === 1 ? "" : "s"} waiting for your response.`
            : "No riders waiting — your inbox is clear."}
          {acceptRate >= 0 ? ` Acceptance rate: ${acceptRate}%.` : ""}
        </Text>
      </View>

      <TouchableOpacity
        onPress={onTrustPress}
        style={{ flexDirection: "row", alignItems: "center", backgroundColor: RQ.surface, borderRadius: RQ.radiusMd, borderWidth: 1, borderColor: RQ.border, padding: 16, ...RQ.shadow }}
      >
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name="checkmark.shield.fill" size={22} color={RQ.blue} />
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: RQ.text }}>Stay in control</Text>
          <Text style={{ fontSize: 13, color: RQ.textSecondary, marginTop: 4, lineHeight: 18 }}>
            You'll always review and approve riders before they join your ride.
          </Text>
        </View>
        <IconSymbol name="chevron.right" size={16} color={RQ.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

interface RequestsLiveInsightsProps {
  acceptRate: number;
  pendingCount: number;
}

export function RequestsLiveInsights({ acceptRate, pendingCount }: RequestsLiveInsightsProps) {
  const insights = [
    pendingCount > 0
      ? "Respond quickly — riders are more likely to complete booking when approved within minutes."
      : "Requests are matched when riders find your posted shared route.",
    acceptRate >= 85
      ? "Higher acceptance improves your visibility to compatible riders."
      : "Review each profile carefully before approving a join request.",
    "You'll be notified instantly when a new join request arrives.",
  ];

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14, backgroundColor: RQ.surface, borderRadius: RQ.radiusMd, borderWidth: 1, borderColor: RQ.border, padding: 16, ...RQ.shadow }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <IconSymbol name="lightbulb.fill" size={16} color={RQ.orange} />
        <Text style={{ fontSize: 15, fontWeight: "800", color: RQ.text }}>Live Insights</Text>
      </View>
      {insights.map((line) => (
        <View key={line} style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: RQ.blue, marginTop: 7 }} />
          <Text style={{ flex: 1, fontSize: 13, color: RQ.textSecondary, lineHeight: 20 }}>{line}</Text>
        </View>
      ))}
    </View>
  );
}
