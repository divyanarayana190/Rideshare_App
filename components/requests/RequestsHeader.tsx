import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { GradientView } from "@/components/GradientView";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { RQ } from "./theme";

interface RequestsHeaderProps {
  pendingCount: number;
  totalCount: number;
  isLoading: boolean;
  onNotifications: () => void;
  onCreate: () => void;
}

export function RequestsHeader({ pendingCount, totalCount, isLoading, onNotifications, onCreate }: RequestsHeaderProps) {
  const subtitle =
    pendingCount > 0
      ? `${pendingCount} pending · review riders waiting to join`
      : totalCount === 0
        ? "You're ready to accept riders"
        : "Everything looks good today";

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 32, fontWeight: "800", color: RQ.text, letterSpacing: -0.8 }}>Ride Requests</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pendingCount > 0 ? RQ.orange : RQ.green }} />
            <Text style={{ fontSize: 14, color: RQ.textSecondary, flex: 1 }} numberOfLines={2}>
              {subtitle} · {totalCount} total
            </Text>
            {isLoading ? <ActivityIndicator size="small" color={RQ.blue} /> : null}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={onNotifications}
            accessibilityLabel="Notifications"
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: RQ.surface,
              borderWidth: 1,
              borderColor: RQ.border,
              alignItems: "center",
              justifyContent: "center",
              ...RQ.shadow,
            }}
          >
            <IconSymbol name="bell.fill" size={20} color={RQ.textSecondary} />
            {pendingCount > 0 ? (
              <View style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: RQ.blue }} />
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity onPress={onCreate} accessibilityLabel="Create ride">
            <GradientView
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: RQ.blue,
              }}
            >
              <IconSymbol name="plus" size={22} color="#fff" />
            </GradientView>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
