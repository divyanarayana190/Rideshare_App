import { useColors } from "@/hooks/use-colors";
import { Modal, Pressable, Text, View } from "react-native";

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmActionModal({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{title}</Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 20 }}>{message}</Text>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
            <Pressable onPress={onCancel} disabled={loading} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={loading}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 10,
                backgroundColor: destructive ? "#EF4444" : colors.primary,
                opacity: loading ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
