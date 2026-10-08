import { View, Text, StyleSheet } from "react-native";

import type { ThemeColorPalette } from "@/constants/theme";

interface Props {
  colors: ThemeColorPalette;
}

function SkeletonCard({ colors }: { colors: ThemeColorPalette }) {
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.line, s.badge, { backgroundColor: colors.border }]} />
      <View style={[s.line, s.title, { backgroundColor: colors.border }]} />
      <View style={[s.line, s.sub, { backgroundColor: colors.border }]} />
      <View style={[s.line, s.route, { backgroundColor: colors.border }]} />
      <View style={[s.line, s.btn, { backgroundColor: colors.border }]} />
    </View>
  );
}

export function CarpoolSkeletonList({ colors }: Props) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 14, textAlign: "center" }}>
        Finding the best matches…
      </Text>
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} colors={colors} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  line: { borderRadius: 6 },
  badge: { width: 72, height: 18 },
  title: { width: "70%", height: 16 },
  sub: { width: "50%", height: 12 },
  route: { width: "100%", height: 36 },
  btn: { width: "100%", height: 42 },
});
