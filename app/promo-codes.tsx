import { Redirect } from "expo-router";

/** Legacy route — promo redemption lives on the Wallet screen. */
export default function PromoCodesScreen() {
  return <Redirect href="/wallet" />;
}
