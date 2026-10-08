import {
  createEmptyLegalAcceptanceState,
  isLegalFullyAccepted,
  LegalAcceptancePanel,
  type LegalAcceptanceState,
} from "@/components/legal/LegalAcceptancePanel";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context-v2";
import { trpc } from "@/lib/trpc";
import { CURRENT_LEGAL_VERSION } from "@/shared/legal/version";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Blocks app usage until the user accepts the current legal version.
 * Shown when policy version changes or no acceptance record exists.
 */
export function LegalReacceptanceGate() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn, sessionChecked } = useAuth();
  const [legalAcceptance, setLegalAcceptance] = useState<LegalAcceptanceState>(createEmptyLegalAcceptanceState);
  const [error, setError] = useState("");

  const { data, isLoading, refetch } = trpc.legal.getMyAcceptance.useQuery(undefined, {
    enabled: isSignedIn && sessionChecked,
    staleTime: 60_000,
  });

  const acceptMutation = trpc.legal.accept.useMutation({
    onSuccess: () => refetch(),
  } as any);

  const needsGate = isSignedIn && sessionChecked && !isLoading && data?.needsReacceptance;
  const legalOk = isLegalFullyAccepted(legalAcceptance);

  if (!needsGate) return null;

  const handleAccept = async () => {
    setError("");
    if (!legalOk) {
      setError("Review and accept all required legal documents to continue.");
      return;
    }
    try {
      await acceptMutation.mutateAsync({
        legalVersion: CURRENT_LEGAL_VERSION,
        acceptTerms: true,
        acceptPrivacy: true,
        acceptCommunity: true,
        termsAcceptedAt: legalAcceptance.termsAcceptedAt!,
        privacyAcceptedAt: legalAcceptance.privacyAcceptedAt!,
        communityAcceptedAt: legalAcceptance.communityAcceptedAt!,
        deviceInfo: `${Platform.OS} ${String(Platform.Version)}`,
      });
    } catch (e: any) {
      setError(e?.message || "Could not save acceptance. Try again.");
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" accessibilityViewIsModal>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>
            Updated Legal Terms
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.muted, marginBottom: 24 }}>
            YOO updated its legal agreements (v{CURRENT_LEGAL_VERSION}). Open each document, read it fully, and accept
            to continue using the app.
          </Text>

          <LegalAcceptancePanel state={legalAcceptance} onChange={setLegalAcceptance} />

          {error ? (
            <Text style={{ color: "#ef4444", marginTop: 12, fontSize: 13 }}>{error}</Text>
          ) : null}

          <Pressable
            onPress={handleAccept}
            disabled={acceptMutation.isPending || !legalOk}
            accessibilityRole="button"
            accessibilityLabel="Accept and continue"
            style={{
              marginTop: 24,
              backgroundColor: legalOk && !acceptMutation.isPending ? colors.primary : colors.muted,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            {acceptMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Accept & Continue</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
