import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function DataExportScreen() {
  const colors = useColors();
  const router = useRouter();
  const [showJson, setShowJson] = useState(false);
  const utils = trpc.useUtils();

  const { data: status, isLoading, refetch } = trpc.user.getDataExportStatus.useQuery(undefined);
  const requestExport = trpc.user.requestDataExport.useMutation({
    onSettled: () => void utils.user.getDataExportStatus.invalidate(),
  } as any);

  return (
    <ScreenContainer className="p-4">
      <ScrollView>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: 4 }}>Back</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.foreground }]}>Request My Data</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          Download a JSON copy of your profile, rides, payment methods (masked), ride credits, and notification history.
        </Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>
              Status: {status?.status ?? "none"}
            </Text>
            {status?.status === "ready" && status.completedAt && (
              <Text style={{ color: colors.muted, marginTop: 6 }}>
                Ready since {new Date(status.completedAt).toLocaleString()}
              </Text>
            )}
            {status?.status !== "ready" && (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, marginTop: 16, opacity: requestExport.isPending ? 0.6 : 1 }]}
                onPress={() => requestExport.mutate()}
                disabled={requestExport.isPending}
              >
                <Text style={styles.btnText}>{requestExport.isPending ? "Generating…" : "Request export"}</Text>
              </TouchableOpacity>
            )}
            {status?.status === "ready" && (
              <TouchableOpacity style={{ marginTop: 12 }} onPress={() => setShowJson((v) => !v)}>
                <Text style={{ color: colors.primary, fontWeight: "600" }}>
                  {showJson ? "Hide data" : "View export JSON"}
                </Text>
              </TouchableOpacity>
            )}
            {showJson && status?.payload && (
              <Text style={[styles.json, { color: colors.muted }]}>
                {JSON.stringify(status.payload, null, 2)}
              </Text>
            )}
            <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Refresh status</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16 },
  btn: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  json: { marginTop: 12, fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
});
