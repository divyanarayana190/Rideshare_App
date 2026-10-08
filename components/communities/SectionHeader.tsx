import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { C, SPACE, TYPE } from "@/components/communities/communityTheme";
import { H_PAD } from "@/components/communities/types";

type Props = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onViewAll?: () => void;
  showViewAll?: boolean;
};

export function SectionHeader({
  title,
  subtitle,
  icon,
  iconColor = C.blue,
  onViewAll,
  showViewAll = false,
}: Props) {
  return (
    <View style={s.wrap}>
      <View style={s.left}>
        {icon ? (
          <View style={s.titleRow}>
            <Ionicons name={icon} size={18} color={iconColor} />
            <Text style={TYPE.sectionTitle}>{title}</Text>
          </View>
        ) : (
          <Text style={TYPE.sectionTitle}>{title}</Text>
        )}
        {subtitle ? <Text style={[TYPE.description, s.subtitle]}>{subtitle}</Text> : null}
      </View>
      {showViewAll && onViewAll ? (
        <Pressable onPress={onViewAll} hitSlop={8} style={s.viewAllBtn}>
          <Text style={TYPE.viewAll}>View all</Text>
          <Ionicons name="chevron-forward" size={14} color={C.blue} />
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: H_PAD,
    marginBottom: SPACE.sm,
    marginTop: SPACE.xs,
  },
  left: { flex: 1, paddingRight: SPACE.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  subtitle: { marginTop: 4 },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 44,
    justifyContent: "center",
    paddingTop: 2,
  },
});
