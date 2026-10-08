import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";

const YOO_BLUE = "#1E88FF";

interface Props {
  onPress?: () => void;
  label?: string;
  variant?: "dark" | "light";
  style?: ViewStyle;
}

export default function BrandedBackButton({ onPress, label = "Go back", variant = "dark", style }: Props) {
  const router = useRouter();
  const color = variant === "light" ? "#ffffff" : YOO_BLUE;

  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      style={({ pressed }: { pressed: boolean }) => [s.btn, { backgroundColor: pressed ? "rgba(30,136,255,0.18)" : "rgba(30,136,255,0.10)" }, style]}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="chevron-back" size={22} color={color} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
});
