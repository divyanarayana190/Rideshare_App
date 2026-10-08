import { useColors } from "@/hooks/use-colors";
import { Text, View } from "react-native";
import { ActionButton } from "./ActionButton";

interface Props {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message = "Please try again.",
  onRetry,
}: Props) {
  const colors = useColors();
  return (
    <View style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{title}</Text>
      <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, textAlign: "center" }}>{message}</Text>
      {onRetry ? (
        <View style={{ marginTop: 16, minWidth: 140 }}>
          <ActionButton label="Try again" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}
