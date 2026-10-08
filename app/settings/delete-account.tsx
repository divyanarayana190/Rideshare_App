import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function DeleteAccountScreen() {
  const colors = useColors();
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const utils = trpc.useUtils();

  const { data: status, isLoading } = trpc.user.getAccountDeletionStatus.useQuery(undefined);
  const requestDeletion = trpc.user.requestAccountDeletion.useMutation({
    onSettled: () => void utils.user.getAccountDeletionStatus.invalidate(),
  } as any);
  const cancelDeletion = trpc.user.cancelAccountDeletion.useMutation({
    onSettled: () => void utils.user.getAccountDeletionStatus.invalidate(),
  } as any);

  const handleRequest = () => {
    if (confirmText !== "DELETE") {
      Alert.alert("Confirmation required", 'Type DELETE to confirm account deletion.');
      return;
    }
    const run = () => requestDeletion.mutate({});
    if (Platform.OS === "web") {
      if (window.confirm("Your account will be scheduled for deletion in 30 days. Continue?")) run();
    } else {
      Alert.alert(
        "Delete account",
        "Your account will be scheduled for deletion in 30 days. Active rides will be cancelled. Payment records are retained as required by law.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: run },
        ],
      );
    }
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: 4 }}>Back</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.foreground }]}>Delete Account</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          Deletion is scheduled 30 days after request. You can cancel anytime before then. Ride and payment records required for compliance are retained in anonymized form.
        </Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : status?.status === "pending" ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.error, fontWeight: "700" }}>Deletion pending</Text>
            <Text style={{ color: colors.muted, marginTop: 8 }}>
              Scheduled for {status.scheduledFor ? new Date(status.scheduledFor).toLocaleDateString() : "—"}
            </Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary, marginTop: 16 }]}
              onPress={() => cancelDeletion.mutate()}
              disabled={cancelDeletion.isPending}
            >
              <Text style={styles.btnText}>{cancelDeletion.isPending ? "Cancelling…" : "Cancel deletion"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.foreground }]}>Type DELETE to confirm</Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              placeholder="DELETE"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.error, opacity: requestDeletion.isPending ? 0.6 : 1 }]}
              onPress={handleRequest}
              disabled={requestDeletion.isPending || confirmText !== "DELETE"}
            >
              <Text style={styles.btnText}>{requestDeletion.isPending ? "Submitting…" : "Request account deletion"}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 16 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 8 },
});
