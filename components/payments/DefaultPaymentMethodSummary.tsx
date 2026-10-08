import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useDefaultPaymentMethod } from "@/lib/hooks/use-payment-queries";
import { formatPaymentMethodLabel } from "@/lib/payment/format-payment-method";
import { useRouter, type Href } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

type Variant = "row" | "card" | "inline";

interface Props {
  variant?: Variant;
  onPressManage?: () => void;
  manageHref?: Href;
  showAddWhenEmpty?: boolean;
}

export function DefaultPaymentMethodSummary({
  variant = "row",
  onPressManage,
  manageHref = "/stripe-cards",
  showAddWhenEmpty = true,
}: Props) {
  const colors = useColors();
  const router = useRouter();
  const { defaultCard, hasDefaultCard, stripeEnabled, isStripeLoading } = useDefaultPaymentMethod();

  if (!stripeEnabled) return null;

  const openManage = () => {
    if (onPressManage) onPressManage();
    else router.push(manageHref);
  };

  if (isStripeLoading) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={{ fontSize: 13, color: colors.muted }}>Loading payment method…</Text>
      </View>
    );
  }

  const label = hasDefaultCard
    ? formatPaymentMethodLabel(defaultCard)
    : showAddWhenEmpty
      ? "Add payment method"
      : "No payment method";

  if (variant === "inline") {
    return (
      <Pressable onPress={openManage} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <IconSymbol name="creditcard.fill" size={14} color={colors.primary} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: hasDefaultCard ? colors.foreground : colors.primary }}>
          {label}
        </Text>
      </Pressable>
    );
  }

  if (variant === "card") {
    return (
      <Pressable
        onPress={openManage}
        style={{
          borderRadius: 14,
          padding: 14,
          backgroundColor: hasDefaultCard ? `${colors.primary}08` : colors.surface,
          borderWidth: 1,
          borderColor: hasDefaultCard ? colors.primary : colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconSymbol name="creditcard.fill" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 2 }}>Payment method</Text>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{label}</Text>
          </View>
          {hasDefaultCard && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: `${colors.primary}15` }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: colors.primary }}>DEFAULT</Text>
            </View>
          )}
          <IconSymbol name="chevron.right" size={14} color={colors.muted} />
        </View>
      </Pressable>
    );
  }

  // row
  return (
    <Pressable
      onPress={openManage}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: colors.surface,
      }}
    >
      <IconSymbol name="creditcard.fill" size={18} color={colors.primary} />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: hasDefaultCard ? colors.foreground : colors.primary }}>
        {label}
      </Text>
      <IconSymbol name="chevron.right" size={14} color={colors.muted} />
    </Pressable>
  );
}
