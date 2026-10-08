import { Text, TouchableOpacity, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { SHADOW_CARD } from "@/constants/design";
import { useColors } from "@/hooks/use-colors";
import type { ComponentProps } from "react";

type IconName = ComponentProps<typeof IconSymbol>["name"];

interface ProfileActionTileProps {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  label: string;
  subtitle: string;
  onPress: () => void;
}

export function ProfileActionTile({ icon, iconColor, iconBg, label, subtitle, onPress }: ProfileActionTileProps) {
  const colors = useColors();

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={{
        flex: 1,
        minWidth: 58,
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 2,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 18,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <IconSymbol name={icon} size={24} color={iconColor} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, textAlign: "center" }} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 3, textAlign: "center", fontWeight: "500" }} numberOfLines={1}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

interface ProfileQuickActionsProps {
  actions: ProfileActionTileProps[];
}

export function ProfileQuickActions({ actions }: ProfileQuickActionsProps) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 14,
        backgroundColor: "#fff",
        borderRadius: 26,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingVertical: 10,
        paddingHorizontal: 6,
        flexDirection: "row",
        justifyContent: "space-between",
        ...SHADOW_CARD,
      }}
    >
      {actions.map((action) => (
        <ProfileActionTile key={action.label} {...action} />
      ))}
    </View>
  );
}
