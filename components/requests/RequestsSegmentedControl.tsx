import { useEffect, useRef } from "react";
import { Animated, Dimensions, Text, TouchableOpacity, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { ComponentProps } from "react";
import { RQ } from "./theme";
import type { TabKey } from "./types";

type IconName = ComponentProps<typeof IconSymbol>["name"];

const TABS: { key: TabKey; label: string; icon: IconName; color: string }[] = [
  { key: "all", label: "All", icon: "list.bullet", color: RQ.blue },
  { key: "pending", label: "Pending", icon: "bell.fill", color: RQ.orange },
  { key: "accepted", label: "Accepted", icon: "checkmark.circle.fill", color: RQ.green },
  { key: "rejected", label: "Rejected", icon: "xmark.circle.fill", color: RQ.red },
];

interface RequestsSegmentedControlProps {
  active: TabKey;
  counts: Record<TabKey, number>;
  onChange: (tab: TabKey) => void;
}

export function RequestsSegmentedControl({ active, counts, onChange }: RequestsSegmentedControlProps) {
  const tabWidth = Dimensions.get("window").width / TABS.length;
  const underlineX = useRef(new Animated.Value(TABS.findIndex((t) => t.key === active) * tabWidth)).current;

  useEffect(() => {
    const idx = TABS.findIndex((t) => t.key === active);
    Animated.spring(underlineX, { toValue: idx * tabWidth, useNativeDriver: true, tension: 220, friction: 24 }).start();
  }, [active, tabWidth, underlineX]);

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14, backgroundColor: RQ.surface, borderRadius: RQ.radiusMd, borderWidth: 1, borderColor: RQ.border, overflow: "hidden", ...RQ.shadow }}>
      <View style={{ flexDirection: "row" }}>
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          const count = counts[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={{ flex: 1, paddingVertical: 14, alignItems: "center", minHeight: 52 }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <IconSymbol name={tab.icon} size={14} color={isActive ? tab.color : RQ.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: isActive ? "800" : "600", color: isActive ? tab.color : RQ.textMuted }}>
                  {tab.label}
                </Text>
                {count > 0 ? (
                  <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: isActive ? tab.color : RQ.surfaceMuted, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: isActive ? "#fff" : RQ.textMuted }}>{count > 99 ? "99+" : count}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Animated.View
        style={{
          position: "absolute",
          bottom: 0,
          width: tabWidth,
          height: 3,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          backgroundColor: TABS.find((t) => t.key === active)?.color ?? RQ.blue,
          transform: [{ translateX: underlineX }],
        }}
      />
    </View>
  );
}
