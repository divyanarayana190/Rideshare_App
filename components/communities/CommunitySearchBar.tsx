import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { C, RADIUS, SPACE, searchShadow } from "@/components/communities/communityTheme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  disabled?: boolean;
};

export function CommunitySearchBar({ value, onChangeText, disabled }: Props) {
  return (
    <View style={[s.wrap, disabled && s.disabled]}>
      <Ionicons name="search" size={18} color={C.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search communities"
        placeholderTextColor={C.meta}
        style={s.input}
        accessibilityLabel="Search communities"
        editable={!disabled}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 && !disabled ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={C.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8EEF5",
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    minHeight: 48,
    backgroundColor: C.surface,
    ...searchShadow,
  },
  disabled: { opacity: 0.55 },
  input: { flex: 1, marginLeft: SPACE.xs, color: C.text, fontSize: 15, fontWeight: "400", paddingVertical: 10 },
});
