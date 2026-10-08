import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

const SECTIONS = [
  {
    title: "Passenger rides",
    body: "YOO uses your location to set pickup and dropoff, show nearby drivers, and track your ride in progress.",
  },
  {
    title: "Driver mode",
    body: "When you go online, YOO shares your live location with passengers during active rides so they can see ETA and arrival.",
  },
  {
    title: "Active ride tracking",
    body: "During an active ride, location updates help advance ride status (e.g. driver arrived) and power safety features.",
  },
  {
    title: "Background location",
    body: "Background location is only used when configured for active driver rides. You can disable it in device settings at any time.",
  },
];

export default function LocationPermissionScreen() {
  const colors = useColors();
  const router = useRouter();

  const requestPermission = async () => {
    await Location.requestForegroundPermissionsAsync();
    router.back();
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: 4 }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Location access</Text>
        {SECTIONS.map((s) => (
          <View key={s.title} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontWeight: "700", marginBottom: 6 }}>{s.title}</Text>
            <Text style={{ color: colors.muted, lineHeight: 20 }}>{s.body}</Text>
          </View>
        ))}
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
          <Text style={styles.btnText}>Continue to system permission</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 16 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontWeight: "700" },
});
