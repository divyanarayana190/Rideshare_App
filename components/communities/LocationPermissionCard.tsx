import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { C } from "@/components/communities/communityTheme";
import { H_PAD } from "@/components/communities/types";

type Props = {
  onEnable: () => void;
};

export function LocationPermissionCard({ onEnable }: Props) {
  return (
    <View style={[s.card, { marginHorizontal: H_PAD }]}>
      <Ionicons name="location-outline" size={22} color={C.blue} />
      <Text style={s.title}>Enable location to discover communities near you.</Text>
      <Pressable onPress={onEnable} style={s.btn}>
        <Text style={s.btnText}>Enable Location</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 16,
    backgroundColor: C.canvas,
    marginBottom: 16,
    alignItems: "flex-start",
    gap: 8,
  },
  title: { fontSize: 14, color: C.text, lineHeight: 20 },
  btn: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.blue,
    minHeight: 44,
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
