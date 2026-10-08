import { AUTH, D, SHADOW_BUTTON } from "@/constants/design";
import { GradientView } from "@/components/GradientView";
import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ segments, value, onChange }: Props<T>) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: AUTH.surface,
        borderRadius: D.radius.lg,
        padding: 4,
        borderWidth: 1,
        borderColor: AUTH.border,
      }}
    >
      {segments.map((seg) => {
        const active = value === seg.value;
        if (active) {
          return (
            <GradientView
              key={seg.value}
              style={{
                flex: 1,
                borderRadius: D.radius.md,
                ...SHADOW_BUTTON,
              }}
            >
              <TouchableOpacity
                onPress={() => onChange(seg.value)}
                activeOpacity={0.85}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 12,
                }}
              >
                {seg.icon ? (
                  <Ionicons name={seg.icon} size={16} color="#FFFFFF" />
                ) : null}
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>
                  {seg.label}
                </Text>
              </TouchableOpacity>
            </GradientView>
          );
        }
        return (
          <TouchableOpacity
            key={seg.value}
            onPress={() => onChange(seg.value)}
            activeOpacity={0.7}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 12,
              borderRadius: D.radius.md,
              borderWidth: 1,
              borderColor: "rgba(30, 58, 95, 0.5)",
            }}
          >
            {seg.icon ? (
              <Ionicons name={seg.icon} size={16} color={AUTH.textSubtle} />
            ) : null}
            <Text style={{ fontSize: 14, fontWeight: "500", color: AUTH.textSubtle }}>
              {seg.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
