import { Text, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { ComponentProps } from "react";

type IconName = ComponentProps<typeof IconSymbol>["name"];

interface ProfileStatItemProps {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  value: string;
  label: string;
}

export function ProfileStatItem({ icon, iconColor, iconBg, value, label }: ProfileStatItemProps) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 6, paddingHorizontal: 4 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <IconSymbol name={icon} size={18} color={iconColor} />
      </View>
      <Text style={{ fontSize: 20, fontWeight: "800", color: "#0F172A", letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 3, textAlign: "center", fontWeight: "500" }}>{label}</Text>
    </View>
  );
}
