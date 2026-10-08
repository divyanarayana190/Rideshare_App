import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export type PaymentMethodItem = {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
};

const BRAND_LABEL: Record<string, string> = {
  visa: "VISA",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
};

const BRAND_COLOR: Record<string, string> = {
  visa: "#1A1F71",
  mastercard: "#EB001B",
  amex: "#006FCF",
  discover: "#FF6000",
};

function brandLabel(brand: string | null | undefined): string {
  if (!brand) return "Card";
  return BRAND_LABEL[brand.toLowerCase()] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

interface Props {
  card: PaymentMethodItem;
  onSetDefault?: () => void;
  onRemove?: () => void;
  settingDefault?: boolean;
  removing?: boolean;
}

export function PaymentMethodCard({
  card,
  onSetDefault,
  onRemove,
  settingDefault,
  removing,
}: Props) {
  const colors = useColors();
  const brand = card.brand?.toLowerCase() ?? "card";
  const label = brandLabel(card.brand);
  const chipColor = BRAND_COLOR[brand] ?? colors.primary;
  const expiry =
    card.expMonth && card.expYear
      ? `${String(card.expMonth).padStart(2, "0")}/${card.expYear}`
      : "—";

  return (
    <View
      style={{
        borderRadius: 16,
        padding: 16,
        backgroundColor: card.isDefault ? `${colors.primary}0D` : colors.surface,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View
          style={{
            width: 44,
            height: 30,
            borderRadius: 6,
            backgroundColor: chipColor,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconSymbol name="creditcard.fill" size={16} color="#fff" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
            {label} ···· {card.last4 ?? "****"}
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>
            Expires {expiry}
          </Text>
        </View>

        {card.isDefault && (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: `${colors.primary}18`,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "800", color: colors.primary, letterSpacing: 0.5 }}>
              DEFAULT
            </Text>
          </View>
        )}
      </View>

      {(onSetDefault || onRemove) && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 16,
            marginTop: 14,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          {!card.isDefault && onSetDefault && (
            <Pressable onPress={onSetDefault} disabled={settingDefault} hitSlop={8}>
              {settingDefault ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>Set default</Text>
              )}
            </Pressable>
          )}
          {onRemove && (
            <Pressable onPress={onRemove} disabled={removing} hitSlop={8}>
              {removing ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#EF4444" }}>Remove</Text>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export function PaymentSecurityBanner() {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        padding: 14,
        borderRadius: 12,
        backgroundColor: `${colors.primary}0A`,
        marginBottom: 16,
      }}
    >
      <IconSymbol name="lock.fill" size={16} color={colors.primary} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.foreground }}>
        Payments are securely processed by Stripe. YOO never stores full card numbers.
      </Text>
    </View>
  );
}
