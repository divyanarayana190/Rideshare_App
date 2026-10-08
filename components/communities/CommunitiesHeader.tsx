import { Pressable, StyleSheet, Text, View } from "react-native";

import { YooLogoMark } from "@/components/YooCarLogo";
import { C, SPACE } from "@/components/communities/communityTheme";
import { H_PAD } from "@/components/communities/types";
import { IconSymbol } from "@/components/ui/icon-symbol";

type Props = {
  onNotifications: () => void;
};

export function CommunitiesHeader({ onNotifications }: Props) {
  return (
    <View style={s.wrap}>
      <View style={s.logoRow}>
        <YooLogoMark size={36} variant="flat-blue" />
      </View>
      <View style={s.titleRow}>
        <View style={s.textCol}>
          <Text style={s.title}>Communities</Text>
          <Text style={s.subtitle}>Find your community, share rides, save more</Text>
        </View>
        <Pressable
          onPress={onNotifications}
          style={s.bellBtn}
          accessibilityLabel="Notifications"
          hitSlop={4}
        >
          <IconSymbol name="bell.fill" size={22} color={C.text} />
          <View style={s.bellDot} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: H_PAD, paddingTop: 4, paddingBottom: SPACE.sm },
  logoRow: { marginBottom: 12 },
  titleRow: { flexDirection: "row", alignItems: "flex-start" },
  textCol: { flex: 1, paddingRight: 8 },
  title: { fontSize: 30, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  subtitle: { color: C.muted, marginTop: 4, fontSize: 14, lineHeight: 20 },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.blue,
    borderWidth: 1.5,
    borderColor: C.bg,
  },
});
