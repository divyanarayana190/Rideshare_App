import { StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GradientView } from "@/components/GradientView";
import { PressableScale } from "@/components/communities/PressableScale";
import { RADIUS, SPACE } from "@/components/communities/communityTheme";

type Props = {
  onPress: () => void;
  disabled?: boolean;
};

export function CreateCommunityButton({ onPress, disabled }: Props) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={[s.wrap, disabled && s.disabled]}
      scaleTo={0.96}
      accessibilityLabel="Create community"
    >
      <GradientView style={s.btn}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={s.text}>Create</Text>
      </GradientView>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: "hidden" },
  disabled: { opacity: 0.5 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: SPACE.md,
    minHeight: 48,
    borderRadius: 18,
  },
  text: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
