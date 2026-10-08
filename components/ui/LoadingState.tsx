import { useColors } from "@/hooks/use-colors";
import { ActivityIndicator, Text, View } from "react-native";

interface Props {
  message?: string;
  compact?: boolean;
}

export function LoadingState({ message = "Loading…", compact = false }: Props) {
  const colors = useColors();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: compact ? 24 : 48,
        paddingHorizontal: 24,
      }}
    >
      <ActivityIndicator size={compact ? "small" : "large"} color={colors.primary} />
      {message ? (
        <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12, textAlign: "center" }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
