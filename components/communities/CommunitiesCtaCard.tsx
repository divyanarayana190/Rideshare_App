import { Pressable, StyleSheet, Text, View } from "react-native";

import { GradientView } from "@/components/GradientView";
import { PressableScale } from "@/components/communities/PressableScale";
import { C, RADIUS, SPACE, TYPE, cardShadow } from "@/components/communities/communityTheme";
import { H_PAD } from "@/components/communities/types";

type Props = {
  onLearnMore?: () => void;
};

function CommunityIllustration() {
  return (
    <View style={ill.wrap}>
      <View style={[ill.building, { left: 8, height: 36 }]} />
      <View style={[ill.building, { left: 22, height: 48 }]} />
      <View style={[ill.building, { left: 38, height: 30 }]} />
      <View style={[ill.person, { left: 14, bottom: 8, backgroundColor: "#42C7FF" }]} />
      <View style={[ill.person, { left: 28, bottom: 10, backgroundColor: "#1E88FF" }]} />
      <View style={[ill.person, { left: 42, bottom: 8, backgroundColor: "#1565D8" }]} />
      <View style={ill.bubble} />
      <View style={[ill.bubble, { right: 12, top: 6, left: undefined, width: 18, height: 12 }]} />
    </View>
  );
}

export function CommunitiesCtaCard({ onLearnMore }: Props) {
  return (
    <View style={[s.outer, { marginHorizontal: H_PAD }]}>
      <GradientView style={s.gradient}>
        <View style={s.row}>
          <View style={s.textCol}>
            <Text style={s.title}>Stronger together</Text>
            <Text style={s.desc}>
              Join communities to find trusted members and better ride matches.
            </Text>
            <PressableScale onPress={onLearnMore} scaleTo={0.97}>
              <View style={s.btn}>
                <Text style={s.btnText}>Learn more</Text>
              </View>
            </PressableScale>
          </View>
          <CommunityIllustration />
        </View>
      </GradientView>
    </View>
  );
}

const s = StyleSheet.create({
  outer: {
    marginTop: SPACE.xs,
    marginBottom: SPACE.lg,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    ...cardShadow,
  },
  gradient: { padding: SPACE.md, borderRadius: RADIUS.xl },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  textCol: { flex: 1 },
  title: { fontWeight: "800", fontSize: 17, color: "#fff" },
  desc: { color: "rgba(255,255,255,0.9)", marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: "400" },
  btn: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: SPACE.sm,
  },
  btnText: { color: C.blue, fontWeight: "700", fontSize: 13 },
});

const ill = StyleSheet.create({
  wrap: { width: 88, height: 72, position: "relative" },
  building: {
    position: "absolute",
    bottom: 24,
    width: 10,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  person: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  bubble: {
    position: "absolute",
    left: 10,
    top: 4,
    width: 22,
    height: 14,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
});
