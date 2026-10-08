import { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { GradientView } from "@/components/GradientView";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { RQ } from "./theme";

const TIPS = [
  { icon: "person.2.fill" as const, text: "Post your daily commute and invite others to split the fare", color: RQ.blue },
  { icon: "checkmark.shield.fill" as const, text: "Enable approval to screen who joins your trip", color: RQ.green },
  { icon: "graduationcap.fill" as const, text: "Verified student riders improve trust on shared rides", color: RQ.purple },
  { icon: "bell.fill" as const, text: "You'll get notified instantly when someone requests to join", color: RQ.orange },
  { icon: "calendar" as const, text: "Set recurring rides to auto-post your regular commute", color: "#14B8A6" },
];

interface RequestsOrganizerHubProps {
  onPostRide?: () => void;
  onHowItWorks?: () => void;
}

export function RequestsOrganizerHub({ onPostRide, onHowItWorks }: RequestsOrganizerHubProps) {
  const [tipIndex, setTipIndex] = useState(0);
  const tipAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setInterval(() => {
      Animated.sequence([
        Animated.timing(tipAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(tipAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 5000);
    return () => clearInterval(t);
  }, [tipAnim]);

  const tip = TIPS[tipIndex];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
      <View style={{ alignItems: "center", paddingVertical: 20, backgroundColor: RQ.surface, borderRadius: RQ.radius, borderWidth: 1, borderColor: RQ.border, marginBottom: 14, ...RQ.shadow }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: RQ.blue + "25", borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
            <IconSymbol name="antenna.radiowaves.left.and.right" size={28} color={RQ.blue} />
          </View>
        </View>
        <Text style={{ fontSize: 22, fontWeight: "800", color: RQ.text, marginTop: 18, textAlign: "center" }}>Waiting for join requests</Text>
        <Text style={{ fontSize: 14, color: RQ.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 22, paddingHorizontal: 20 }}>
          Post a shared ride and others commuting your route can request to join. You approve who gets in.
        </Text>
        {onPostRide ? (
          <TouchableOpacity onPress={onPostRide} style={{ marginTop: 18, width: "88%" }}>
            <GradientView style={{ borderRadius: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: RQ.blue }}>
              <IconSymbol name="plus.circle.fill" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Create New Ride</Text>
            </GradientView>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ borderRadius: RQ.radiusMd, borderWidth: 1, borderColor: RQ.border, backgroundColor: RQ.surface, padding: 18, marginBottom: 14, ...RQ.shadow }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: RQ.blue, letterSpacing: 0.6, marginBottom: 12 }}>HOW MATCHING WORKS</Text>
        {[
          "Post your trip with route, time, seats, and price per seat",
          "Others on the same route find your ride and send join requests",
          "You review each requester's profile and approve or reject",
          "Approved passengers are added to your ride and share the fare",
        ].map((text, i) => (
          <View key={text} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: i < 3 ? 12 : 0 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: RQ.blue }}>{i + 1}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 14, color: RQ.textSecondary, lineHeight: 21 }}>{text}</Text>
          </View>
        ))}
        {onHowItWorks ? (
          <TouchableOpacity onPress={onHowItWorks} style={{ marginTop: 14, alignSelf: "flex-start" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: RQ.blue }}>Learn more →</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Animated.View style={{ opacity: tipAnim, backgroundColor: RQ.surface, borderRadius: RQ.radiusMd, borderWidth: 1, borderColor: RQ.border, padding: 14, flexDirection: "row", gap: 12, ...RQ.shadow }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: tip.color + "15", alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name={tip.icon} size={16} color={tip.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: "800", color: RQ.textMuted, letterSpacing: 0.5, marginBottom: 4 }}>TIP {tipIndex + 1}/{TIPS.length}</Text>
          <Text style={{ fontSize: 13, color: RQ.textSecondary, lineHeight: 20 }}>{tip.text}</Text>
        </View>
      </Animated.View>
    </ScrollView>
  );
}
