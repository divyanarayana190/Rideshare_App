/**
 * Add Card — SetupIntent + Stripe PaymentSheet (native) / Stripe.js (web).
 * Never collects raw card numbers in YOO TextInputs.
 */

import { runNativeStripeCardSetup } from "@/components/payments/StripeCardEntry";
import { PaymentSecurityBanner } from "@/components/payments/PaymentMethodCard";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  getStripeUnavailableMessage,
  isStripeClientConfigured,
  STRIPE_PUBLISHABLE_KEY,
} from "@/lib/stripe-client";
import { useInvalidatePaymentQueries } from "@/lib/hooks/use-payment-queries";
import { trpc } from "@/lib/trpc";
import { useNotification } from "@/lib/use-notification";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function StripeAddCardScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notify = useNotification();
  const invalidatePayments = useInvalidatePaymentQueries();

  const clientReady = isStripeClientConfigured();
  const { data: serverConfig } = trpc.payment.isConfigured.useQuery(undefined, { enabled: clientReady });
  const stripeEnabled = clientReady && (serverConfig?.configured ?? false);

  const createSetup = trpc.payment.createSetupIntent.useMutation();
  const confirmSetup = trpc.payment.confirmSetupIntent.useMutation();

  const [saving, setSaving] = useState(false);
  const [stripeJsReady, setStripeJsReady] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const stripeRef = useRef<any>(null);
  const cardElementRef = useRef<any>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const setupIntentIdRef = useRef<string | null>(null);
  const clientSecretRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !stripeEnabled) return;

    let script = document.querySelector('script[src="https://js.stripe.com/v3/"]') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      document.head.appendChild(script);
    }

    const init = () => {
      if (!(window as any).Stripe) return;
      const s = (window as any).Stripe(STRIPE_PUBLISHABLE_KEY);
      stripeRef.current = s;
      const elements = s.elements();
      const cardElement = elements.create("card", {
        style: {
          base: {
            fontSize: "16px",
            color: "#111827",
            "::placeholder": { color: "#94A3B8" },
          },
          invalid: { color: "#EF4444" },
        },
      });
      cardElementRef.current = cardElement;
      const tryMount = () => {
        if (mountRef.current) {
          cardElement.mount(mountRef.current);
          setStripeJsReady(true);
        } else {
          setTimeout(tryMount, 100);
        }
      };
      tryMount();
      cardElement.on("change", (event: any) => {
        setCardError(event.error ? event.error.message : null);
      });
    };

    if ((window as any).Stripe) init();
    else script.addEventListener("load", init);

    return () => {
      try { cardElementRef.current?.unmount(); } catch { /* ignore */ }
    };
  }, [stripeEnabled]);

  const invalidateCards = async () => {
    await invalidatePayments();
  };

  const handleSaveNative = async () => {
    setSaving(true);
    const loadingId = notify.showLoading("Opening secure card form…");
    try {
      const setup = await createSetup.mutateAsync();
      setupIntentIdRef.current = setup.setupIntentId;
      clientSecretRef.current = setup.clientSecret;

      const result = await runNativeStripeCardSetup(setup.clientSecret);
      if (!result.ok) {
        notify.dismiss(loadingId);
        if (result.cancelled) {
          notify.showInfo("Card setup cancelled");
          return;
        }
        throw new Error(result.message);
      }

      notify.showLoading("Saving card…");
      const saved = await confirmSetup.mutateAsync({ setupIntentId: setup.setupIntentId });
      await invalidateCards();
      notify.dismiss(loadingId);
      if (saved.alreadyExists) {
        notify.showInfo("This card is already saved");
      } else {
        notify.showSuccess(`${(saved.brand ?? "Card").toUpperCase()} ···· ${saved.last4} saved`);
      }
      router.back();
    } catch (e: any) {
      notify.dismiss(loadingId);
      notify.showError(e?.message ?? "Failed to save card. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWeb = async () => {
    if (!stripeRef.current || !cardElementRef.current) {
      notify.showWarning("Stripe is still loading. Please wait.");
      return;
    }

    setSaving(true);
    const loadingId = notify.showLoading("Saving card…");
    try {
      const setup = await createSetup.mutateAsync();
      const { error, setupIntent } = await stripeRef.current.confirmCardSetup(setup.clientSecret, {
        payment_method: { card: cardElementRef.current },
      });

      if (error) {
        throw new Error(error.message ?? "Card was declined");
      }
      if (!setupIntent?.id) {
        throw new Error("Setup did not complete");
      }

      const saved = await confirmSetup.mutateAsync({ setupIntentId: setupIntent.id });
      await invalidateCards();
      notify.dismiss(loadingId);
      if (saved.alreadyExists) {
        notify.showInfo("This card is already saved");
      } else {
        notify.showSuccess(`${(saved.brand ?? "Card").toUpperCase()} ···· ${saved.last4} saved`);
      }
      router.back();
    } catch (e: any) {
      notify.dismiss(loadingId);
      notify.showError(e?.message ?? "Failed to save card");
    } finally {
      setSaving(false);
    }
  };

  if (!clientReady || !stripeEnabled) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <NavHeader onBack={() => router.back()} title="Add card" colors={colors} />
        <View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: colors.muted, textAlign: "center", lineHeight: 20 }}>
            {!clientReady ? getStripeUnavailableMessage() : "Stripe is not configured on the server."}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <NavHeader onBack={() => router.back()} title="Add card" colors={colors} />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <PaymentSecurityBanner />

        {Platform.OS === "web" ? (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
              Card details
            </Text>
            <View
              style={{
                borderRadius: 12,
                backgroundColor: colors.surface,
                padding: 4,
                minHeight: 48,
              }}
            >
              <div ref={(el: any) => { mountRef.current = el; }} style={{ padding: 12, minHeight: 44 }} />
            </View>
            {cardError && (
              <Text style={{ fontSize: 12, color: "#EF4444", marginTop: 6 }}>{cardError}</Text>
            )}
            {!stripeJsReady && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ fontSize: 13, color: colors.muted }}>Loading secure input…</Text>
              </View>
            )}
          </View>
        ) : (
          <View
            style={{
              padding: 20,
              borderRadius: 16,
              backgroundColor: colors.surface,
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <IconSymbol name="creditcard.fill" size={36} color={colors.primary} />
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, marginTop: 12, textAlign: "center" }}>
              Secure Stripe checkout
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: "center", lineHeight: 19 }}>
              Tap below to open Stripe&apos;s secure card form. Your card details are entered directly with Stripe.
            </Text>
          </View>
        )}

        <Pressable
          onPress={Platform.OS === "web" ? handleSaveWeb : handleSaveNative}
          disabled={saving || (Platform.OS === "web" && !stripeJsReady)}
          style={{
            backgroundColor: colors.primary,
            opacity: saving || (Platform.OS === "web" && !stripeJsReady) ? 0.6 : 1,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <IconSymbol name="lock.fill" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                {Platform.OS === "web" ? "Save card" : "Add card securely"}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function NavHeader({
  onBack,
  title,
  colors,
}: {
  onBack: () => void;
  title: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <Pressable onPress={onBack} hitSlop={8}>
        <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
      </Pressable>
      <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.foreground }}>
        {title}
      </Text>
      <View style={{ width: 22 }} />
    </View>
  );
}
