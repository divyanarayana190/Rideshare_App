import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CategoryPill } from "@/components/communities/CommunityBadges";
import { CommunityAvatar } from "@/components/communities/CommunityAvatar";
import { GradientView } from "@/components/GradientView";
import { PressableScale } from "@/components/communities/PressableScale";
import { C, RADIUS, SPACE, TYPE, cardShadow } from "@/components/communities/communityTheme";
import { formatMilesAway, type CommunityItem } from "@/components/communities/types";

export const NEARBY_SCROLL_WIDTH = 170;

type Props = {
  item: CommunityItem;
  onPress: () => void;
  onJoin?: () => void;
};

export const NearbyCommunityCard = memo(function NearbyCommunityCard({
  item,
  onPress,
  onJoin,
}: Props) {
  const isMember = item.membershipStatus === "active";
  const distance = formatMilesAway(item.distanceMiles).replace(" away", "") || "Nearby";

  return (
    <PressableScale onPress={onPress} style={s.card}>
      <CommunityAvatar
        logoKey={item.logoUrl}
        name={item.name}
        category={item.category}
        size="grid"
        tint={item.themeColor}
      />
      <Text style={[TYPE.communityName, s.name]} numberOfLines={2}>
        {item.name}
      </Text>
      <View style={s.pillWrap}>
        <CategoryPill category={item.category} />
      </View>
      <Text style={s.meta}>
        {distance} · {item.memberCount.toLocaleString()} members
      </Text>
      {!isMember ? (
        <Pressable onPress={onJoin} style={s.joinTouch}>
          <GradientView style={s.joinBtn}>
            <Text style={s.joinText}>Join</Text>
          </GradientView>
        </Pressable>
      ) : (
        <Text style={s.joinedText}>Joined</Text>
      )}
    </PressableScale>
  );
});

const s = StyleSheet.create({
  card: {
    width: NEARBY_SCROLL_WIDTH,
    marginRight: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    alignItems: "center",
    ...cardShadow,
  },
  name: { fontSize: 14, textAlign: "center", marginTop: SPACE.xs, minHeight: 34 },
  pillWrap: { marginTop: 6 },
  meta: { ...TYPE.members, marginTop: SPACE.xs, textAlign: "center" },
  joinTouch: { width: "100%", marginTop: SPACE.sm },
  joinBtn: { height: 36, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  joinText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  joinedText: { color: C.green, fontWeight: "600", fontSize: 13, marginTop: SPACE.sm },
});
