import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  CategoryPill,
  MemberStats,
  VisibilityPill,
} from "@/components/communities/CommunityBadges";
import { CommunityAvatar } from "@/components/communities/CommunityAvatar";
import { PressableScale } from "@/components/communities/PressableScale";
import { C, RADIUS, SPACE, TYPE, cardShadow } from "@/components/communities/communityTheme";
import { formatMilesAway, type CommunityItem } from "@/components/communities/types";

type Props = {
  item: CommunityItem;
  onPress: () => void;
  showDistance?: boolean;
};

export const CompactCommunityRow = memo(function CompactCommunityRow({
  item,
  onPress,
  showDistance = false,
}: Props) {
  const distance = showDistance ? formatMilesAway(item.distanceMiles) : "";

  return (
    <PressableScale onPress={onPress} style={s.row}>
      <CommunityAvatar
        logoKey={item.logoUrl}
        name={item.name}
        category={item.category}
        size="list"
        tint={item.themeColor}
      />
      <View style={s.content}>
        <View style={s.nameRow}>
          <Text style={TYPE.communityName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.isVerified ? <Ionicons name="checkmark-circle" size={15} color={C.blue} /> : null}
        </View>
        <View style={s.badges}>
          <CategoryPill category={item.category} />
          <VisibilityPill visibility={item.visibility} />
        </View>
        <MemberStats memberCount={item.memberCount} onlineCount={item.onlineCount} />
        {distance ? <Text style={s.distance}>{distance}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
    </PressableScale>
  );
});

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACE.md,
    marginHorizontal: SPACE.md,
    marginBottom: SPACE.xs,
    minHeight: 96,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    ...cardShadow,
  },
  content: { flex: 1, marginLeft: SPACE.sm, marginRight: SPACE.xs },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  distance: { ...TYPE.members, marginTop: 4 },
});
