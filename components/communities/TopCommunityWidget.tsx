import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { CategoryPill, MemberStats } from "@/components/communities/CommunityBadges";
import { CommunityAvatar } from "@/components/communities/CommunityAvatar";
import { GradientView } from "@/components/GradientView";
import { PressableScale } from "@/components/communities/PressableScale";
import { C, RADIUS, SPACE, TYPE, cardShadow } from "@/components/communities/communityTheme";
import type { CommunityItem } from "@/components/communities/types";

export const TOP_SCROLL_WIDTH = 170;

type Props = {
  item: CommunityItem;
  onPress: () => void;
  onJoin?: () => void;
};

export const TopCommunityWidget = memo(function TopCommunityWidget({
  item,
  onPress,
  onJoin,
}: Props) {
  const isMember = item.membershipStatus === "active";

  return (
    <PressableScale onPress={onPress} style={s.card}>
      <View style={s.avatarWrap}>
        <CommunityAvatar
          logoKey={item.logoUrl}
          name={item.name}
          category={item.category}
          size="grid"
          tint={item.themeColor}
        />
      </View>
      <View style={s.nameRow}>
        <Text style={s.name} numberOfLines={2}>
          {item.name}
        </Text>
        {item.isVerified ? <Ionicons name="checkmark-circle" size={13} color={C.blue} /> : null}
      </View>
      <View style={s.pillWrap}>
        <CategoryPill category={item.category} />
      </View>
      <MemberStats memberCount={item.memberCount} onlineCount={item.onlineCount} />
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
    width: TOP_SCROLL_WIDTH,
    marginRight: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    ...cardShadow,
  },
  avatarWrap: { alignItems: "center" },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: 3, marginTop: SPACE.xs },
  name: { ...TYPE.communityName, fontSize: 14, flex: 1, textAlign: "left" },
  pillWrap: { marginTop: 6, alignSelf: "flex-start" },
  joinTouch: { marginTop: SPACE.sm, width: "100%" },
  joinBtn: { height: 36, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  joinText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  joinedText: { color: C.green, fontWeight: "600", fontSize: 12, marginTop: SPACE.sm, textAlign: "center" },
});
