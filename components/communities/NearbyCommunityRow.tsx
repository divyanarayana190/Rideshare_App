import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { CategoryPill } from "@/components/communities/CommunityBadges";
import { CommunityAvatar } from "@/components/communities/CommunityAvatar";
import { GradientView } from "@/components/GradientView";
import { PressableScale } from "@/components/communities/PressableScale";
import { C, RADIUS, SPACE, TYPE, cardShadow } from "@/components/communities/communityTheme";
import { H_PAD, formatMilesAway, type CommunityItem } from "@/components/communities/types";

type Props = {
  item: CommunityItem;
  onPress: () => void;
  onJoin?: () => void;
};

export const NearbyCommunityRow = memo(function NearbyCommunityRow({ item, onPress, onJoin }: Props) {
  const isMember = item.membershipStatus === "active";
  const distance = formatMilesAway(item.distanceMiles) || "Nearby";

  return (
    <PressableScale onPress={onPress} style={s.card}>
      <CommunityAvatar
        logoKey={item.logoUrl}
        name={item.name}
        category={item.category}
        size="list"
        tint={item.themeColor}
      />
      <View style={s.body}>
        <Text style={TYPE.communityName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={s.pillWrap}>
          <CategoryPill category={item.category} />
        </View>
        <Text style={s.meta}>
          {distance} · {item.memberCount.toLocaleString()} members
        </Text>
      </View>
      {isMember ? (
        <Text style={s.joinedText}>Joined</Text>
      ) : (
        <Pressable onPress={onJoin} style={s.joinTouch}>
          <GradientView style={s.joinBtn}>
            <Text style={s.joinText}>Join</Text>
          </GradientView>
        </Pressable>
      )}
      <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
    </PressableScale>
  );
});

const s = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: H_PAD,
    marginBottom: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    gap: SPACE.sm,
    ...cardShadow,
  },
  body: { flex: 1 },
  pillWrap: { marginTop: 6, alignSelf: "flex-start" },
  meta: { ...TYPE.members, marginTop: 4 },
  joinTouch: { marginRight: 4 },
  joinBtn: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  joinText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  joinedText: { color: C.green, fontWeight: "600", fontSize: 12, marginRight: 4 },
});
