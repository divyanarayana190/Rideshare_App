import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

const ALERTS = [
  "New ride requests (drivers)",
  "Driver accepted your ride",
  "Ride reminders before departure",
  "Driver on the way / arrived",
  "Ride started and completed",
  "Safety alerts",
  "Tips and payout updates (drivers)",
];

export default function NotificationPermissionScreen() {
  const colors = useColors();
  const router = useRouter();

  const requestPermission = async () => {
    await Notifications.requestPermissionsAsync();
    router.back();
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: 4 }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          YOO sends push notifications for time-sensitive ride updates. You can change this anytime in Settings.
        </Text>
        {ALERTS.map((a) => (
          <View key={a} style={styles.row}>
            <IconSymbol name="bell.fill" size={14} color={colors.primary} />
            <Text style={{ color: colors.foreground, marginLeft: 10, flex: 1 }}>{a}</Text>
          </View>
        ))}
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
          <Text style={styles.btnText}>Enable notifications</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  btnText: { color: "#fff", fontWeight: "700" },
});
