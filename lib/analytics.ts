/**
 * Lightweight analytics client.
 *
 * Fires fire-and-forget events to the server. Designed to never throw —
 * analytics failures must never break product flows.
 *
 * Usage:
 *   import { track } from "@/lib/analytics";
 *   track("ride_booked", { mode: "share", distanceKm: 12.3 });
 */

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001";

export type AnalyticsEvent =
  | { name: "ride_booked";             props: { mode: "solo" | "share"; distanceKm?: number; vehicleClass?: string } }
  | { name: "ride_completed";          props: { rideId: string; fare: number; mode: "solo" | "share" } }
  | { name: "ride_cancelled";          props: { rideId: string; reason?: string } }
  | { name: "sos_triggered";           props: { alertType: string } }
  | { name: "driver_mode_toggled";     props: { online: boolean } }
  | { name: "social_auth_attempted";   props: { provider: "google" | "apple" } }
  | { name: "referral_shared";         props: { method?: string } }
  | { name: "promo_applied";           props: { code: string; discount: number } }
  | { name: "vehicle_class_selected";  props: { vehicleClass: string } }
  | { name: "safety_mode_changed";     props: { safetyMode: string } }
  | { name: "carpool_join_requested";  props: { rideId: string } }
  | { name: "carpool_join_approved";   props: { rideId: string } }
  | { name: "rating_submitted";        props: { ratingType: string; score: number } }
  | { name: "screen_viewed";           props: { screen: string } };

/**
 * Fire an analytics event. Never throws.
 */
export function track<E extends AnalyticsEvent>(
  name: E["name"],
  props: E["props"] = {} as E["props"],
): void {
  // Fire-and-forget — do not await
  fetch(`${API_BASE}/api/analytics/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, props, ts: Date.now() }),
  }).catch(() => {
    // Silently swallow — analytics must never break product code
  });
}
