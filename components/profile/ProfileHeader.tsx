import { Text, TouchableOpacity, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { D } from "@/constants/design";
import { useColors } from "@/hooks/use-colors";

interface ProfileHeaderProps {
  onSettingsPress: () => void;
}

export function ProfileHeader({ onSettingsPress }: ProfileHeaderProps) {
  const colors = useColors();

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 30, fontWeight: "800", color: "#0F172A", letterSpacing: -0.6 }}>
            Profile
          </Text>
          <Text style={{ fontSize: 14, color: "#64748B", marginTop: 4, lineHeight: 20 }}>
            Manage your account and preferences
          </Text>
        </View>
        <TouchableOpacity
          onPress={onSettingsPress}
          accessibilityLabel="Settings"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#F1F5F9",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "#E2E8F0",
          }}
        >
          <IconSymbol name="gear" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
