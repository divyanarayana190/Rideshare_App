import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/ui/ErrorState";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useToastStore } from "@/lib/stores";
import { trpc } from "@/lib/trpc";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function WalletScreen() {
  const colors = useColors();
  const router = useRouter();
  const toast = useToastStore();
  const [promoCode, setPromoCode] = useState("");

  const utils = trpc.useUtils();
  const balanceQuery = trpc.wallet.getBalance.useQuery(undefined);
  const txnQuery = trpc.wallet.getTransactions.useQuery({ limit: 50 });
  const grantsQuery = trpc.wallet.getActiveGrants.useQuery(undefined);
  const balance = balanceQuery.data;
  const transactions = txnQuery.data ?? [];
  const grants = grantsQuery.data ?? [];
  const balanceLoading = balanceQuery.isLoading;
  const txnLoading = txnQuery.isLoading;
  const loadError = balanceQuery.isError || txnQuery.isError;
  const retryLoad = () => {
    void balanceQuery.refetch();
    void txnQuery.refetch();
    void grantsQuery.refetch();
  };

  const addPromo = trpc.wallet.addPromoCredit.useMutation({
    onSettled: (_data: { creditCents: number } | undefined, error: { message: string } | null) => {
      if (error) {
        toast.show(error.message, "error");
        return;
      }
      if (_data) toast.show(`Added $${(_data.creditCents / 100).toFixed(2)} in ride credits`, "success");
      setPromoCode("");
      void utils.wallet.getBalance.invalidate();
      void utils.wallet.getTransactions.invalidate();
      void utils.wallet.getActiveGrants.invalidate();
    },
  } as any);

  const isLoading = balanceLoading || txnLoading;
  const availableCents = balance?.availableBalanceCents ?? 0;

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Ride Credits</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="xmark.circle.fill" size={24} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Credits apply toward ride fares only. Not withdrawable. Drivers receive payouts via Earnings → Stripe.
        </Text>

        {loadError ? (
          <ErrorState
            title="Could not load wallet"
            message="Check your connection and try again."
            onRetry={retryLoad}
          />
        ) : isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
        ) : (
          <>
            <View style={[styles.balanceCard, { backgroundColor: "#166534", borderColor: "#15803d" }]}>
              <View>
                <Text style={styles.balanceLabel}>Available credits</Text>
                <Text style={styles.balanceAmount}>{formatCents(availableCents)}</Text>
                {(balance?.reservedBalanceCents ?? 0) > 0 && (
                  <Text style={styles.balanceMeta}>
                    {formatCents(balance!.reservedBalanceCents)} reserved for upcoming ride
                  </Text>
                )}
                {balance?.nextExpiry && (
                  <Text style={styles.balanceMeta}>
                    Next expiry: {new Date(balance.nextExpiry).toLocaleDateString()}
                  </Text>
                )}
              </View>
              <IconSymbol name="ticket.fill" size={44} color="rgba(255,255,255,0.35)" />
            </View>

            <View style={[styles.promoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Apply promo code</Text>
              <View style={styles.promoRow}>
                <TextInput
                  value={promoCode}
                  onChangeText={setPromoCode}
                  placeholder="Enter code"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  style={[styles.promoInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                />
                <TouchableOpacity
                  style={[styles.promoBtn, { backgroundColor: colors.primary, opacity: addPromo.isPending ? 0.6 : 1 }]}
                  onPress={() => promoCode.trim() && addPromo.mutate({ code: promoCode.trim() })}
                  disabled={addPromo.isPending || !promoCode.trim()}
                >
                  <Text style={styles.promoBtnText}>{addPromo.isPending ? "…" : "Apply"}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {grants.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 8 }]}>Active credits</Text>
                {grants.map((g: { grantId: string; remainingCents: number; reason: string; expiresAt: string | null }) => (
                  <View key={g.grantId} style={[styles.grantRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={{ color: colors.foreground, fontWeight: "600" }}>{formatCents(g.remainingCents)}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {g.reason.replace(/_/g, " ")} · expires {g.expiresAt ? new Date(g.expiresAt).toLocaleDateString() : "—"}
                    </Text>
                  </View>
                ))}
              </>
            )}

            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 16 }]}>Credit history</Text>
            {transactions.length === 0 ? (
              <View style={styles.empty}>
                <IconSymbol name="clock.fill" size={32} color={colors.muted} />
                <Text style={{ color: colors.muted, marginTop: 8 }}>Complete shared rides to earn credits</Text>
              </View>
            ) : (
              transactions.map((txn: { id: number; amountCents: number; notes: string | null; entryType: string; createdAt: string | null }) => {
                const positive = txn.amountCents >= 0;
                return (
                  <View key={txn.id} style={[styles.txnRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.txnIcon, { backgroundColor: positive ? `${colors.success}20` : `${colors.error}20` }]}>
                      <IconSymbol
                        name={positive ? "arrow.down.circle.fill" : "arrow.up.circle.fill"}
                        size={18}
                        color={positive ? colors.success : colors.error}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>
                        {txn.notes ?? txn.entryType}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                        {txn.createdAt ? new Date(txn.createdAt).toLocaleString() : ""}
                      </Text>
                    </View>
                    <Text style={{ color: positive ? colors.success : colors.foreground, fontWeight: "700" }}>
                      {positive ? "+" : ""}{formatCents(txn.amountCents)}
                    </Text>
                  </View>
                );
              })
            )}

            <TouchableOpacity
              style={[styles.linkRow, { borderColor: colors.border }]}
              onPress={() => router.push("/stripe-cards" as any)}
            >
              <IconSymbol name="creditcard.fill" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "600", marginLeft: 8 }}>Manage payment methods</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 20 },
  balanceCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  balanceAmount: { fontSize: 36, fontWeight: "800", color: "#fff", marginTop: 4 },
  balanceMeta: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 4 },
  promoBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  promoRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  promoInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  promoBtn: { borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  promoBtnText: { color: "#fff", fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  grantRow: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8, gap: 4 },
  txnRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  txnIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 32 },
  linkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderTopWidth: 1, marginTop: 12 },
});
