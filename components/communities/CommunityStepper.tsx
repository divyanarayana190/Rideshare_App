import { C } from "@/components/communities/communityTheme";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

const STEPS = ["Basic Info", "Visibility", "Verification", "Rules", "Review"];

export function CommunityStepper({ current }: { current: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 20, paddingHorizontal: 4 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const isLast = i === STEPS.length - 1;
        return (
          <View key={label} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", width: "100%", justifyContent: "center" }}>
              {!isLast && i > 0 ? <View style={{ flex: 1, height: 2, backgroundColor: done || active ? C.blue : C.border, marginRight: -4 }} /> : <View style={{ flex: 1 }} />}
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: done || active ? C.blue : "#E2E8F0",
                }}
              >
                {done ? (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                ) : (
                  <Text style={{ color: active ? "#fff" : C.muted, fontSize: 13, fontWeight: "700" }}>{i + 1}</Text>
                )}
              </View>
              {!isLast ? <View style={{ flex: 1, height: 2, backgroundColor: done ? C.blue : C.border, marginLeft: -4 }} /> : <View style={{ flex: 1 }} />}
            </View>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 10,
                marginTop: 6,
                fontWeight: active ? "700" : "500",
                color: active || done ? C.blue : C.muted,
                textAlign: "center",
              }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
