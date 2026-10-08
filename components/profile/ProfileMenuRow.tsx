import { Text, TouchableOpacity, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { ComponentProps } from "react";

type IconName = ComponentProps<typeof IconSymbol>["name"];

interface ProfileMenuRowProps {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  showDivider?: boolean;
  danger?: boolean;
}

export function ProfileMenuRow({
  icon,
  iconColor,
  iconBg,
  label,
  subtitle,
  onPress,
  showDivider,
  danger,
}: ProfileMenuRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 15,
        minHeight: 64,
        borderBottomWidth: showDivider ? 1 : 0,
        borderBottomColor: "#F1F5F9",
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconSymbol name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: danger ? "#EF4444" : "#0F172A" }}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 3, lineHeight: 16 }}>{subtitle}</Text>
        ) : null}
      </View>
      <IconSymbol name="chevron.right" size={16} color={danger ? "#EF4444" : "#CBD5E1"} />
    </TouchableOpacity>
  );
}
