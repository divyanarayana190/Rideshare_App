import { StyleSheet, Text, View } from "react-native";

import { BADGE, RADIUS, TYPE, categoryBadgeTone, visibilityBadgeTone } from "@/components/communities/communityTheme";

export function CategoryPill({ category }: { category: string }) {
  const tone = categoryBadgeTone(category);
  const b = BADGE[tone];
  return (
    <View style={[s.pill, { backgroundColor: b.bg }]}>
      <Text style={[s.text, TYPE.category, { color: b.text }]}>{b.label}</Text>
    </View>
  );
}

export function VisibilityPill({ visibility }: { visibility?: string | null }) {
  const tone = visibilityBadgeTone(visibility);
  const b = BADGE[tone];
  return (
    <View style={[s.pill, { backgroundColor: b.bg }]}>
      <Text style={[s.text, TYPE.category, { color: b.text }]}>{b.label}</Text>
    </View>
  );
}

export function PendingPill() {
  const b = BADGE.pending;
  return (
    <View style={[s.pending, { backgroundColor: b.bg }]}>
      <Text style={[s.pendingText, { color: b.text }]}>{b.label}</Text>
    </View>
  );
}

export function MemberStats({
  memberCount,
  onlineCount,
}: {
  memberCount: number;
  onlineCount?: number | null;
}) {
  const showOnline = onlineCount != null;

  return (
    <View style={s.statsRow}>
      <Text style={TYPE.members}>{memberCount.toLocaleString()} Members</Text>
      {showOnline ? (
        <>
          <Text style={s.dot}>•</Text>
          <View style={s.onlineWrap}>
            <View style={s.onlineDot} />
            <Text style={TYPE.online}>{onlineCount.toLocaleString()} Online</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { includeFontPadding: false },
  pending: {
    alignSelf: "flex-start",
    height: 22,
    paddingHorizontal: 8,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  pendingText: { fontSize: 10, fontWeight: "600", includeFontPadding: false },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 6,
    marginTop: 6,
  },
  dot: { color: "#CBD5E1", fontSize: 12 },
  onlineWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22C55E" },
});
