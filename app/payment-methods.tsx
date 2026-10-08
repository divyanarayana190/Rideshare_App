import { Redirect } from "expo-router";

/** Legacy route — redirects to Stripe payment methods. */
export default function PaymentMethodsRedirect() {
  return <Redirect href="/stripe-cards" />;
}
