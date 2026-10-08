/**
 * Payment Methods — Stripe-backed saved cards (production).
 */

import { PaymentMethodCard, PaymentSecurityBanner, type PaymentMethodItem } from "@/components/payments/PaymentMethodCard";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getStripeUnavailableMessage, isStripeClientConfigured } from "@/lib/stripe-client";
import { useInvalidatePaymentQueries } from "@/lib/hooks/use-payment-queries";
import { trpc } from "@/lib/trpc";
import { useNotification } from "@/lib/use-notification";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function StripeCardsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notify = useNotification();
  const clientReady = isStripeClientConfigured();
  const { data: serverConfig } = trpc.payment.isConfigured.useQuery(undefined, {
    enabled: clientReady,
  });
  const stripeEnabled = clientReady && (serverConfig?.configured ?? false);

  const { data: cards = [], isLoading, isError, refetch, isRefetching } =
    trpc.payment.listPaymentMethods.useQuery(undefined, { enabled: stripeEnabled });

  const invalidatePayments = useInvalidatePaymentQueries();
  const setDefault = trpc.payment.setDefaultPaymentMethod.useMutation({
    onSuccess: async () => {
      await invalidatePayments();
      notify.showSuccess("Default payment method updated");
    },
    onError: (e: any) => notify.showError(e?.message ?? "Could not update default card"),
  } as any);

  const removeCard = trpc.payment.removePaymentMethod.useMutation({
    onSuccess: async () => {
      await invalidatePayments();
      notify.showSuccess("Card removed");
    },
    onError: (e: any) => notify.showError(e?.message ?? "Could not remove card"),
  } as any);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"default" | "remove" | null>(null);

  const handleSetDefault = (paymentMethodId: string) => {
    setBusyId(paymentMethodId);
    setBusyAction("default");
    setDefault.mutate(
      { paymentMethodId },
      { onSettled: () => { setBusyId(null); setBusyAction(null); } },
    );
  };

  const handleRemove = (paymentMethodId: string, last4: string | null) => {
    Alert.alert(
      "Remove card",
      `Remove card ending in ${last4 ?? "****"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setBusyId(paymentMethodId);
            setBusyAction("remove");
            removeCard.mutate(
              { paymentMethodId },
              { onSettled: () => { setBusyId(null); setBusyAction(null); } },
            );
          },
        },
      ],
    );
  };

  if (!clientReady || !stripeEnabled) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <Header onBack={() => router.back()} colors={colors} />
        <View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center" }}>
          <IconSymbol name="creditcard" size={40} color={colors.muted} />
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginTop: 16, textAlign: "center" }}>
            Payments unavailable
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
            {!clientReady
              ? getStripeUnavailableMessage()
              : "Stripe is not configured on the server. Contact support."}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <Header
        onBack={() => router.back()}
        onAdd={() => router.push("/stripe-add-card" as any)}
        colors={colors}
      />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={undefined}
      >
        <PaymentSecurityBanner />

        {isLoading ? (
          <View style={{ paddingTop: 48, alignItems: "center" }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 12, color: colors.muted, fontSize: 14 }}>Loading payment methods…</Text>
          </View>
        ) : isError ? (
          <View style={{ alignItems: "center", paddingTop: 40, gap: 12 }}>
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>Could not load cards</Text>
            <Pressable onPress={() => refetch()} style={{ padding: 10 }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Try again</Text>
            </Pressable>
          </View>
        ) : cards.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 32, paddingHorizontal: 16 }}>
            <IconSymbol name="creditcard" size={48} color={colors.muted} />
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginTop: 16 }}>
              No payment methods yet
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
              Add a card to book rides faster.
            </Text>
            <Pressable
              onPress={() => router.push("/stripe-add-card" as any)}
              style={{
                marginTop: 20,
                backgroundColor: colors.primary,
                paddingHorizontal: 24,
                paddingVertical: 14,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Add card</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {cards.map((card: PaymentMethodItem) => (
              <PaymentMethodCard
                key={card.id}
                card={card}
                onSetDefault={() => handleSetDefault(card.id)}
                onRemove={() => handleRemove(card.id, card.last4)}
                settingDefault={busyId === card.id && busyAction === "default"}
                removing={busyId === card.id && busyAction === "remove"}
              />
            ))}
            <Pressable
              onPress={() => router.push("/stripe-add-card" as any)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 14,
                gap: 8,
                marginTop: 4,
              }}
            >
              <IconSymbol name="plus.circle.fill" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 15 }}>Add another card</Text>
            </Pressable>
          </>
        )}

        {(isRefetching && !isLoading) && (
          <Text style={{ textAlign: "center", color: colors.muted, fontSize: 12, marginTop: 12 }}>
            Updating…
          </Text>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function Header({
  onBack,
  onAdd,
  colors,
}: {
  onBack: () => void;
  onAdd?: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.background,
      }}
    >
      <Pressable onPress={onBack} hitSlop={8} accessibilityLabel="Go back">
        <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
      </Pressable>
      <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.foreground }}>
        Payment Methods
      </Text>
      {onAdd ? (
        <Pressable onPress={onAdd} hitSlop={8} accessibilityLabel="Add card">
          <IconSymbol name="plus" size={22} color={colors.primary} />
        </Pressable>
      ) : (
        <View style={{ width: 22 }} />
      )}
    </View>
  );
}
