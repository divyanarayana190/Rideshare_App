import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  CategoryPill,
  MemberStats,
  PendingPill,
  VisibilityPill,
} from "@/components/communities/CommunityBadges";
import { CommunityAvatar } from "@/components/communities/CommunityAvatar";
import { PressableScale } from "@/components/communities/PressableScale";
import { C, RADIUS, SPACE, TYPE, cardShadow } from "@/components/communities/communityTheme";
import { H_PAD, type CommunityItem } from "@/components/communities/types";

type Props = {
  item: CommunityItem;
  onPress: () => void;
};

export const MyCommunityRow = memo(function MyCommunityRow({ item, onPress }: Props) {
  const isPending = item.membershipStatus === "pending";

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
        <View style={s.nameRow}>
          <Text style={[TYPE.communityName, s.name]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.isVerified ? (
            <Ionicons name="checkmark-circle" size={16} color={C.blue} style={{ marginLeft: 4 }} />
          ) : null}
        </View>
        <View style={s.badges}>
          <CategoryPill category={item.category} />
          <VisibilityPill visibility={item.visibility} />
        </View>
        <MemberStats memberCount={item.memberCount} onlineCount={item.onlineCount} />
        {isPending ? <PendingPill /> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#CBD5E1" style={s.chevron} />
    </PressableScale>
  );
});

const s = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 104,
    maxHeight: 116,
    marginHorizontal: H_PAD,
    marginBottom: SPACE.sm,
    padding: SPACE.md,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    ...cardShadow,
  },
  body: { flex: 1, marginLeft: SPACE.sm, marginRight: SPACE.xs, justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center" },
  name: { flexShrink: 1 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chevron: { alignSelf: "center" },
});
