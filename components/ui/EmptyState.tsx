import { D } from "@/constants/design";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { Text, View } from "react-native";
import { ActionButton } from "./ActionButton";
import type { Href } from "expo-router";

interface Props {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: Href;
}

export function EmptyState({ icon = "tray", title, subtitle, actionLabel, onAction, actionHref }: Props) {
  const colors = useColors();
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 28 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: "rgba(30, 136, 255, 0.1)",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
      >
        <IconSymbol name={icon as any} size={32} color={D.blue} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginTop: 16, textAlign: "center" }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, textAlign: "center", lineHeight: 22 }}>
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && (onAction || actionHref) ? (
        <View style={{ marginTop: 24, width: "100%", maxWidth: 300 }}>
          <ActionButton label={actionLabel} onPress={onAction} href={actionHref} />
        </View>
      ) : null}
    </View>
  );
}
