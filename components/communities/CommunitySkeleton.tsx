import { StyleSheet, View } from "react-native";

import { C, RADIUS, SPACE, cardShadow } from "@/components/communities/communityTheme";
import { NEARBY_SCROLL_WIDTH } from "@/components/communities/NearbyCommunityCard";
import { TOP_SCROLL_WIDTH } from "@/components/communities/TopCommunityWidget";
import { H_PAD } from "@/components/communities/types";

function Bone({ w, h, r = 8 }: { w: number | `${number}%`; h: number; r?: number }) {
  return <View style={{ width: w, height: h, borderRadius: r, backgroundColor: "#EEF2F6" }} />;
}

export function MyCommunityRowSkeleton() {
  return (
    <View style={s.myRow}>
      <Bone w={64} h={64} r={32} />
      <View style={{ flex: 1, marginLeft: SPACE.sm, gap: 8 }}>
        <Bone w="55%" h={14} />
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Bone w={72} h={24} r={12} />
          <Bone w={56} h={24} r={12} />
        </View>
        <Bone w="70%" h={12} />
      </View>
    </View>
  );
}

export function CommunitySectionSkeleton({ variant }: { variant: "rows" | "nearby" | "top" }) {
  if (variant === "nearby") {
    return (
      <View style={s.hRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[s.nearbyCard, { width: NEARBY_SCROLL_WIDTH }]}>
            <Bone w={72} h={72} r={36} />
            <Bone w={100} h={14} />
            <Bone w={64} h={24} r={12} />
            <Bone w="90%" h={12} />
            <Bone w="100%" h={36} r={12} />
          </View>
        ))}
      </View>
    );
  }

  if (variant === "top") {
    return (
      <View style={s.hRow}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[s.topCard, { width: TOP_SCROLL_WIDTH }]}>
            <Bone w={72} h={72} r={36} />
            <Bone w="90%" h={12} />
            <Bone w={64} h={24} r={12} />
            <Bone w="80%" h={10} />
            <Bone w="100%" h={36} r={12} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: H_PAD, gap: SPACE.sm }}>
      {[0, 1, 2].map((i) => (
        <MyCommunityRowSkeleton key={i} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  myRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: H_PAD,
    marginBottom: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    ...cardShadow,
  },
  hRow: { flexDirection: "row", paddingHorizontal: H_PAD, gap: SPACE.sm, marginBottom: SPACE.sm },
  nearbyCard: {
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    alignItems: "center",
    gap: SPACE.xs,
    ...cardShadow,
  },
  topCard: {
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    gap: SPACE.xs,
    ...cardShadow,
  },
});
