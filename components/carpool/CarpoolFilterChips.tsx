import { ScrollView, Text, TouchableOpacity } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import type { ThemeColorPalette } from "@/constants/theme";

import { CARPOOL_FILTERS, type CarpoolFilterMode } from "./constants";

interface Props {
  active: CarpoolFilterMode;
  onChange: (mode: CarpoolFilterMode) => void;
  colors: ThemeColorPalette;
}

export function CarpoolFilterChips({ active, onChange, colors }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 7, paddingHorizontal: 16, paddingVertical: 4 }}
    >
      {CARPOOL_FILTERS.map((f) => {
        const isActive = active === f.value;
        return (
          <TouchableOpacity
            key={f.value}
            onPress={() => onChange(f.value)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              borderRadius: 20,
              borderWidth: 1,
              paddingHorizontal: 13,
              paddingVertical: 7,
              backgroundColor: isActive ? colors.primary : colors.surface,
              borderColor: isActive ? colors.primary : colors.border,
            }}
          >
            <IconSymbol name={f.icon} size={12} color={isActive ? "#fff" : colors.muted} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: isActive ? "#fff" : colors.muted }}>
              {f.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
