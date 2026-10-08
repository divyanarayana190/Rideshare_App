import { Pressable, StyleSheet, Text, View } from "react-native";

import { C, RADIUS, SPACE, cardShadow } from "@/components/communities/communityTheme";
import { H_PAD } from "@/components/communities/types";

type Action = { label: string; onPress: () => void; primary?: boolean };

type Props = {
  title: string;
  description?: string;
  actions?: Action[];
  compact?: boolean;
};

export function EmptyStateCard({ title, description, actions, compact }: Props) {
  return (
    <View style={[s.card, compact && s.compact, { marginHorizontal: H_PAD }]}>
      <Text style={s.title}>{title}</Text>
      {description ? <Text style={s.desc}>{description}</Text> : null}
      {actions && actions.length > 0 ? (
        <View style={s.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              style={[s.btn, a.primary ? s.btnPrimary : s.btnSecondary]}
            >
              <Text style={[s.btnText, a.primary ? s.btnTextPrimary : s.btnTextSecondary]}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    backgroundColor: C.canvas,
    marginBottom: SPACE.md,
    ...cardShadow,
  },
  compact: { padding: 14 },
  title: { fontSize: 16, fontWeight: "700", color: C.text },
  desc: { color: C.muted, fontSize: 14, fontWeight: "400", marginTop: 6, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: C.blue },
  btnSecondary: { backgroundColor: "#fff", borderWidth: 1, borderColor: C.border },
  btnText: { fontWeight: "700", fontSize: 14 },
  btnTextPrimary: { color: "#fff" },
  btnTextSecondary: { color: C.blue },
});
