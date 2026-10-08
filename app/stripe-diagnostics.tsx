import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

function StatusRow({ label, ok, colors }: { label: string; ok: boolean; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.row}>
      <IconSymbol name={ok ? "checkmark.circle.fill" : "xmark.circle.fill"} size={18} color={ok ? colors.success : colors.error} />
      <Text style={{ marginLeft: 10, color: colors.foreground, flex: 1 }}>{label}</Text>
      <Text style={{ color: ok ? colors.success : colors.error, fontWeight: "700" }}>{ok ? "OK" : "Missing"}</Text>
    </View>
  );
}

function StripeDiagnosticsContent() {
  const colors = useColors();
  const router = useRouter();
  const { data, isLoading, error } = trpc.diagnostics.getStripeStatus.useQuery(undefined);

  return (
    <ScreenContainer className="p-4">
      <ScrollView>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: 4 }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Stripe Diagnostics</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          Configuration status only — secret keys are never displayed.
        </Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={{ color: colors.error }}>{error.message}</Text>
        ) : data ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.muted, marginBottom: 12 }}>Environment: {data.environment}</Text>
            <StatusRow label="Publishable key configured" ok={data.publishableKeyConfigured} colors={colors} />
            <StatusRow label="Secret key configured" ok={data.secretKeyConfigured} colors={colors} />
            <StatusRow label="Webhook configured" ok={data.webhookConfigured} colors={colors} />
            <StatusRow label="Connect enabled" ok={data.connectEnabled} colors={colors} />
            <StatusRow label="Payment methods enabled" ok={data.paymentMethodsEnabled} colors={colors} />
            <StatusRow label="Payouts enabled" ok={data.payoutsEnabled} colors={colors} />
            {data.notes.map((note: string) => (
              <Text key={note} style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>• {note}</Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

export default function StripeDiagnosticsScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <StripeDiagnosticsContent />;
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 14, marginBottom: 16 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
});
