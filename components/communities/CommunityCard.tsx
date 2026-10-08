import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { CommunityAvatar } from "@/components/communities/CommunityAvatar";
import { C } from "@/components/communities/communityTheme";
import {
  MY_CARD_HEIGHT,
  MY_CARD_WIDTH,
  getTypeBadge,
  type CommunityItem,
} from "@/components/communities/types";

type Props = {
  item: CommunityItem;
  onPress: () => void;
  onMenuPress?: () => void;
};

export const CommunityCard = memo(function CommunityCard({ item, onPress, onMenuPress }: Props) {
  const online = item.onlineCount ?? 0;
  const badge = getTypeBadge(item.category, item.visibility);

  return (
    <Pressable onPress={onPress} style={s.card}>
      <Pressable
        onPress={onMenuPress}
        hitSlop={8}
        style={s.menuBtn}
        accessibilityLabel="Community options"
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={C.muted} />
      </Pressable>

      <View style={s.body}>
        <CommunityAvatar
          logoKey={item.logoUrl}
          name={item.name}
          category={item.category}
          size="grid"
          tint={item.themeColor}
        />
        <Text style={s.name} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge}</Text>
        </View>
      </View>

      <View style={s.stats}>
        <Text style={s.statText}>{item.memberCount.toLocaleString()}</Text>
        <View style={s.onlineDot} />
        <Text style={s.onlineText}>{online.toLocaleString()} online</Text>
      </View>
    </Pressable>
  );
});

const s = StyleSheet.create({
  card: {
    width: MY_CARD_WIDTH,
    height: MY_CARD_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    backgroundColor: C.surface,
    marginRight: 10,
    ...C.shadow,
  },
  menuBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 8 },
  name: {
    fontSize: 14,
    fontWeight: "700",
    color: C.text,
    textAlign: "center",
    marginTop: 10,
    minHeight: 36,
  },
  badge: {
    backgroundColor: "#E8F2FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
  },
  badgeText: { color: C.blue, fontSize: 11, fontWeight: "600" },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 8,
  },
  statText: { color: C.muted, fontSize: 12 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  onlineText: { color: C.green, fontSize: 12, fontWeight: "600" },
});
