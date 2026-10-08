import type { PaymentMethodItem } from "@/components/payments/PaymentMethodCard";

export function formatPaymentMethodLabel(
  card: Pick<PaymentMethodItem, "brand" | "last4"> | null | undefined,
  fallback = "Add payment method",
): string {
  if (!card?.last4) return fallback;
  const brand = card.brand ?? "card";
  const label =
    brand.toLowerCase() === "visa" ? "VISA" :
    brand.toLowerCase() === "mastercard" ? "Mastercard" :
    brand.toLowerCase() === "amex" ? "Amex" :
    brand.charAt(0).toUpperCase() + brand.slice(1);
  return `${label} ···· ${card.last4}`;
}

export function formatPaymentMethodShort(
  card: Pick<PaymentMethodItem, "brand" | "last4"> | null | undefined,
): string {
  if (!card?.last4) return "No card";
  const brand = card.brand ?? "Card";
  return `${brand.charAt(0).toUpperCase() + brand.slice(1)} ··${card.last4}`;
}

export function isCardExpired(expMonth: number | null, expYear: number | null): boolean {
  if (!expMonth || !expYear) return false;
  const expiry = new Date(expYear, expMonth, 1);
  return expiry <= new Date();
}
