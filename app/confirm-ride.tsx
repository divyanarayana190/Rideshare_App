import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRides } from "@/lib/rides-store";
import { useToastStore } from "@/lib/stores";
import { useInvalidatePaymentQueries, usePaymentMethodsList } from "@/lib/hooks/use-payment-queries";
import { useRequireDefaultPaymentMethod } from "@/lib/hooks/use-require-default-payment";
import { isCardExpired } from "@/lib/payment/format-payment-method";
import { trpc } from "@/lib/trpc";
import { useRideEvents } from "@/lib/use-ride-events";
import { track } from "@/lib/analytics";
import type { Ride } from "@/lib/types";

const CARD_COLOR: Record<string, string> = {
  visa: "#1E88FF",
  mastercard: "#E3312A",
  amex: "#007B5E",
  discover: "#FF6B00",
};

export default function ConfirmRideScreen() {
  const colors = useColors();
  const router = useRouter();
  const toast = useToastStore();
  const { state, setActiveRide, clearBookingDraft, setBookingDraft } = useRides();
  const insets = useSafeAreaInsets();
  const [selectedPayment, setSelectedPayment] = useState<string>("");
  const [isConfirming, setIsConfirming] = useState(false);
  // Stable idempotency key — generated once per mount, survives retries
  const idempotencyKeyRef = useRef(`ck_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const accentColor = "#F59E0B";

  // Schedule state — default "now"
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [schedDayOffset, setSchedDayOffset] = useState(0); // 0=today,1=tomorrow,2,3
  const [schedHour, setSchedHour] = useState("");
  const [schedMinute, setSchedMinute] = useState("");
  const [schedAmPm, setSchedAmPm] = useState<"AM" | "PM">("AM");

  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoLabel, setPromoLabel] = useState("");
  const [promoError, setPromoError] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);

  const utils = trpc.useUtils();
  const invalidatePayments = useInvalidatePaymentQueries();
  const { cards: savedCards = [] } = usePaymentMethodsList();
  const { requirePayment, defaultCard } = useRequireDefaultPaymentMethod((msg, type) => toast.show(msg, type ?? "error"));

  const bookRide = trpc.rides.bookRide.useMutation();
  const { data: surgeData } = trpc.rides.getSurge.useQuery(undefined, { staleTime: 60_000 });

  // Fetch real per-tier fares from the server for the solo vehicle picker.
  // Only needed in solo mode and only when there's a valid route.
  const { data: rideOptionsData } = trpc.rides.getRideOptions.useQuery(
    {
      pickupLat: state.bookingDraft.pickup?.lat ?? 0,
      pickupLng: state.bookingDraft.pickup?.lng ?? 0,
      dropoffLat: state.bookingDraft.dropoff?.lat ?? 0,
      dropoffLng: state.bookingDraft.dropoff?.lng ?? 0,
      pickupAddress: state.bookingDraft.pickup?.address ?? "",
      dropoffAddress: state.bookingDraft.dropoff?.address ?? "",
      mode: "solo",
    },
    {
      enabled: !!(state.bookingDraft.pickup && state.bookingDraft.dropoff && (state.bookingDraft.mode ?? "share") === "solo"),
      staleTime: 60_000,
    }
  );
  // Map vehicleType → fareCents from the API response
  const apiFareByCls = useMemo(() => {
    const map: Record<string, number> = {};
    if (rideOptionsData?.options) {
      for (const opt of rideOptionsData.options as { type: string; fareCents: number }[]) {
        map[opt.type] = opt.fareCents;
      }
    }
    return map;
  }, [rideOptionsData]);

  useEffect(() => {
    invalidatePayments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    pickup,
    dropoff,
    mode,
    selectedAvailableRide,
    vehicleClass,
    estimatedFare,
    lockedFareCents,
    routeDistanceKm,
    routeDurationMinutes,
  } = state.bookingDraft;

  // Vehicle class metadata shown in the picker
  const VEHICLE_TIERS = [
    { id: "economy",  label: "Economy",  icon: "car",                          color: "#6B7280", desc: "Affordable everyday rides" },
    { id: "standard", label: "Standard", icon: "car.fill",                     color: "#1E88FF", desc: "Comfortable & reliable" },
    { id: "comfort",  label: "Comfort",  icon: "car.rear.fill",                color: "#8B5CF6", desc: "Premium vehicle, more space" },
    { id: "xl",       label: "XL",       icon: "car.rear.road.lane.dashed",    color: "#F59E0B", desc: "Up to 6 passengers" },
  ] as const;

  type VehicleTier = typeof VEHICLE_TIERS[number];
  const selectedTier: VehicleTier = VEHICLE_TIERS.find((t: VehicleTier) => t.id === (vehicleClass ?? "standard")) ?? VEHICLE_TIERS[1];

  // Use the route distance from ride-options (accurate road distance).
  // Fall back to Haversine only when route data is unavailable.
  const distanceKm = useMemo(() => {
    if (routeDistanceKm && routeDistanceKm > 0) return routeDistanceKm;
    if (!pickup || !dropoff) return 5;
    const dLat = (dropoff.lat - pickup.lat) * 111;
    const dLng = (dropoff.lng - pickup.lng) * Math.cos(pickup.lat * Math.PI / 180) * 111;
    return Math.max(1, Math.round(Math.sqrt(dLat * dLat + dLng * dLng) * 10) / 10);
  }, [routeDistanceKm, pickup, dropoff]);

  // Find available shared rides along the same route (only for share mode)
  // Uses searchJoinableRides which includes in-progress rides for mid-ride join
  const { data: matchingRides = [], isLoading: isSearchingRides } = trpc.rides.searchJoinableRides.useQuery(
    {
      pickupLat: pickup?.lat ?? 0,
      pickupLng: pickup?.lng ?? 0,
      dropoffLat: dropoff?.lat ?? 0,
      dropoffLng: dropoff?.lng ?? 0,
      pickupAddress: pickup?.address,
      dropoffAddress: dropoff?.address,
    },
    { enabled: !!pickup && !!dropoff && mode === "share" },
  );

  const requestMidRideJoin = trpc.rides.requestMidRideJoin.useMutation();
  const [joiningRideId, setJoiningRideId] = useState<string | null>(null);
  const [joinRequestId, setJoinRequestId] = useState<string | null>(null);

  // SSE: react instantly to server-pushed join approval/rejection
  const { lastJoinApproved, lastJoinRejected } = useRideEvents(!!joinRequestId);

  useEffect(() => {
    if (!lastJoinApproved || lastJoinApproved.joinRequestId !== joinRequestId) return;
    setJoiningRideId(null);
    setJoinRequestId(null);
    const activeRide: Ride = {
      id: lastJoinApproved.rideId,
      mode: "share",
      status: "in_progress",
      pickup: pickup!,
      dropoff: dropoff!,
      passengers: [],
      totalFare: Number(lastJoinApproved.fareShare),
      myFare: Number(lastJoinApproved.fareShare),
      distanceKm,
      estimatedMinutes: Math.round((distanceKm / 40) * 60),
      createdAt: new Date().toISOString(),
      myPassengerId: "me",
      rideStartedAt: Date.now(),
    };
    setActiveRide(activeRide);
    clearBookingDraft();
    router.replace("/active-ride" as Href);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastJoinApproved]);

  useEffect(() => {
    if (!lastJoinRejected || lastJoinRejected.joinRequestId !== joinRequestId) return;
    setJoiningRideId(null);
    setJoinRequestId(null);
    toast.show("❌ Join request declined. Try searching for another ride.", "error");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastJoinRejected]);

  // Poll for join request approval status (fallback if SSE misses event)
  const { data: joinStatus } = trpc.rides.getJoinRequestStatus.useQuery(
    { joinRequestId: joinRequestId ?? "" },
    {
      enabled: !!joinRequestId,
      refetchInterval: 3000,
    },
  );

  // Handle join request approval
  useEffect(() => {
    if (joinStatus?.status === "approved") {
      setJoiningRideId(null);
      setJoinRequestId(null);
      const activeRide: Ride = {
        id: joinStatus.rideId,
        mode: "share",
        status: "in_progress",
        pickup: pickup!,
        dropoff: dropoff!,
        passengers: [],
        totalFare: Number(joinStatus.fareShare),
        myFare: Number(joinStatus.fareShare),
        distanceKm,
        estimatedMinutes: Math.round((distanceKm / 40) * 60),
        createdAt: new Date().toISOString(),
        myPassengerId: "me",
        rideStartedAt: Date.now(),
      };
      setActiveRide(activeRide);
      clearBookingDraft();
      router.replace("/active-ride" as Href);
    } else if (joinStatus?.status === "rejected") {
      setJoiningRideId(null);
      setJoinRequestId(null);
      toast.show("❌ Join request declined. Try searching for another ride.", "error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinStatus?.status]);

  const handleRequestJoin = async (ride: any) => {
    if (!pickup || !dropoff) return;
    // Debounce: prevent double-tap or concurrent join requests
    if (joiningRideId || joinRequestId) return;
    setJoiningRideId(ride.rideId);
    try {
      const result = await requestMidRideJoin.mutateAsync({
        rideId: ride.rideId,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: pickup.address,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        dropoffAddress: dropoff.address,
        distanceKm,
        detourKm: ride.detourKm ?? undefined,
        detourMinutes: ride.detourMinutes ?? undefined,
        compatibilityScore: ride.compatibilityScore ?? undefined,
      });
      if ((result as any).autoApproved) {
        // Ride doesn't require manual approval — navigate to active ride immediately
        const activeRide: import("@/lib/types").Ride = {
          id: ride.rideId,
          mode: "share",
          status: "matched",
          pickup,
          dropoff,
          driver: undefined,
          passengers: [],
          totalFare: result.estimatedFare + 1.5,
          myFare: result.estimatedFare + 1.5,
          distanceKm,
          estimatedMinutes: ride.estimatedMinutes ?? 20,
          createdAt: new Date().toISOString(),
          myPassengerId: "",
        };
        await setActiveRide(activeRide);
        clearBookingDraft();
        router.replace("/active-ride" as Href);
        return;
      }
      setJoinRequestId(result.joinRequest.joinRequestId);
    } catch (err: any) {
      setJoiningRideId(null);
      const msg = err?.message ?? "Failed to send join request.";
      toast.show(msg, "error");
    }
  };

  // Auto-select the default card when saved cards load
  useEffect(() => {
    if (savedCards.length > 0 && !selectedPayment) {
      const def = savedCards.find((c: any) => c.isDefault) ?? savedCards[0];
      setSelectedPayment(String(def.id));
    }
  }, [savedCards, selectedPayment]);

  // Guard: redirect to book-ride on mount if booking draft is missing.
  // NEVER call router during render — it breaks React's hook count.
  useEffect(() => {
    if (!pickup || !dropoff) {
      router.replace("/book-ride" as Href);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fare calculations and the previewRedemption hook must live above the early return.
  // Hook call count must be identical on every render — an early return after a hook
  // causes "Rendered fewer hooks than expected" on subsequent renders.
  const platformFee = 1.5;
  const apiFareForTier = apiFareByCls[(vehicleClass ?? "standard")] ?? apiFareByCls["standard"];
  const lockedFare = lockedFareCents != null ? lockedFareCents / 100 : undefined;
  const baseFare = lockedFare
    ? Math.max(0, Math.round((lockedFare - platformFee) * 100) / 100)
    : apiFareForTier != null
      ? Math.max(0, Math.round((apiFareForTier / 100 - platformFee) * 100) / 100)
      : estimatedFare
        ? Math.max(0, Math.round((estimatedFare - platformFee) * 100) / 100)
        : 5.00;
  const totalFare = baseFare + platformFee - promoDiscount;
  const fareCents = Math.max(0, Math.round(totalFare * 100));
  const { data: creditPreview } = trpc.wallet.previewRedemption.useQuery(
    { fareAmountCents: fareCents },
    { enabled: fareCents >= 100, staleTime: 30_000 },
  );
  const creditsApplied = creditPreview?.maxApplicable ?? 0;
  const youPayCents = creditPreview?.stripeChargeable ?? fareCents;

  if (!pickup || !dropoff) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#090618" }}>
        <ActivityIndicator size="large" color="#1E88FF" />
        <Text style={{ color: "#9CA3AF", marginTop: 12, fontSize: 14 }}>Redirecting…</Text>
      </View>
    );
  }

  const estimatedTime = Math.round((distanceKm / 40) * 60);

  // For shared rides where a specific ride was selected, reuse its driver
  // For fresh solo/share bookings, driver is assigned async after booking
  const driver = selectedAvailableRide?.driver ?? null;
  const coPassengers = selectedAvailableRide?.passengers ?? [];

  const handleConfirm = async () => {
    if (!pickup || !dropoff) return;

    if (!requirePayment()) return;

    const paymentId = selectedPayment || defaultCard?.id;
    if (!paymentId) {
      toast.show("Please select a payment method.", "error");
      return;
    }

    const selectedCard = savedCards.find((c: { id: string }) => c.id === paymentId) ?? defaultCard;
    if (selectedCard && isCardExpired(selectedCard.expMonth, selectedCard.expYear)) {
      toast.show("Selected card has expired. Please add a new card.", "error");
      router.push("/stripe-add-card" as Href);
      return;
    }

    if (isConfirming) return; // double-tap guard
    setIsConfirming(true);
    try {
      // Save ride to database — use the mode and vehicleClass locked from ride-options
      const bookingMode: "solo" | "share" = mode === "share" ? "share" : "solo";
      const bookingVehicleType = (vehicleClass ?? "standard") as "economy" | "standard" | "comfort" | "xl";
      const estimatedMinutes = routeDurationMinutes ?? estimatedTime;
      const result = await bookRide.mutateAsync({
        mode: bookingMode,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: pickup.address,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        dropoffAddress: dropoff.address,
        distanceKm,
        estimatedMinutes,
        vehicleType: bookingVehicleType,
        idempotencyKey: idempotencyKeyRef.current,
        ...(schedIso ? { scheduledFor: schedIso } : {}),
        ...(creditsApplied > 0 ? { creditAmountCents: creditsApplied } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show("Ride booked! Finding your driver…", "success");
      track("ride_booked", { mode: mode ?? "share", distanceKm, vehicleClass: vehicleClass ?? "standard" });

      const myFare = result.fareShare + platformFee;
      const totalFare = Number(result.ride.totalFare) + platformFee;

      // Build the active ride object using the real DB rideId
      // driver is null initially — active-ride will poll getRide to get the real assigned driver
      const newRide: Ride = {
        id: result.ride.rideId,           // real DB rideId — used for completeRide/cancelRide
        mode: mode ?? "share",
        status: "searching",
        pickup,
        dropoff,
        driver: driver ?? undefined,      // real driver if pre-selected (shared), else polling fetches it
        passengers: coPassengers,
        totalFare,
        myFare,
        distanceKm,
        estimatedMinutes: estimatedTime,
        createdAt: result.ride.createdAt.toISOString(),
        myPassengerId: "me",
        rideStartedAt: Date.now(),        // persist start time so active-ride can resume from correct step
      };

      await setActiveRide(newRide);
      clearBookingDraft();
      // Invalidate so My Rides tab shows the new ride immediately
      await utils.rides.myRides.invalidate();
      router.replace("/active-ride" as Href);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to book ride. Please try again.";
      toast.show(msg, "error");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setIsApplyingPromo(true);
    setPromoError("");
    try {
      const result = await utils.client.rides.validatePromo.query({ code: promoCode.trim(), rideAmount: baseFare + platformFee });
      if (result && result.valid && result.discount) {
        setPromoDiscount(result.discount);
        setPromoLabel(promoCode.trim().toUpperCase());
        setPromoApplied(true);
      } else {
        setPromoError(result?.reason ?? "Invalid promo code");
      }
    } catch (err: any) {
      setPromoError(err?.message ?? "Failed to validate promo code");
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoCode("");
    setPromoDiscount(0);
    setPromoLabel("");
    setPromoError("");
    setPromoApplied(false);
  };

  // Build ISO for the selected schedule date+time
  const buildScheduledIso = (): string | undefined => {
    if (scheduleMode === "now") return undefined;
    let h = parseInt(schedHour) || 0;
    const m = parseInt(schedMinute) || 0;
    if (h < 1 || h > 12) return undefined;
    if (schedAmPm === "PM" && h < 12) h += 12;
    if (schedAmPm === "AM" && h === 12) h = 0;
    const d = new Date();
    d.setDate(d.getDate() + schedDayOffset);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const schedIso = buildScheduledIso();
  const schedValid = scheduleMode === "now" || (schedIso !== undefined && new Date(schedIso!).getTime() > Date.now() + 5 * 60_000);

  const DAY_CHIPS = [
    { offset: 0, label: "Today" },
    { offset: 1, label: "Tomorrow" },
    { offset: 2, label: new Date(Date.now() + 2 * 86_400_000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) },
    { offset: 3, label: new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) },
  ];

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
          Confirm Booking
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Mode badge */}
        <View
          style={[
            styles.modeBadge,
            { backgroundColor: mode === "share" ? colors.primary + "15" : accentColor + "20" },
          ]}
        >
          <IconSymbol
            name={mode === "share" ? "person.2.fill" : "car.fill"}
            size={18}
            color={mode === "share" ? colors.primary : accentColor}
          />
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: mode === "share" ? colors.primary : accentColor,
              marginLeft: 8,
            }}
          >
            {mode === "share" ? "Shared Ride" : "Solo Ride"}
          </Text>
          {mode === "share" && (
            <View style={[styles.saveBadge, { backgroundColor: colors.success }]}>
              <Text style={{ fontSize: 10, color: "#fff", fontWeight: "700" }}>SAVE 40%</Text>
            </View>
          )}
        </View>

        {/* Surge pricing warning */}
        {surgeData?.isSurging && (
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 10,
            backgroundColor: "#FEF3C7", borderColor: "#F59E0B", borderWidth: 1,
            borderRadius: 12, padding: 12, marginBottom: 12,
          }}>
            <IconSymbol name="bolt.fill" size={18} color="#D97706" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#92400E" }}>
                High demand — {surgeData.multiplier.toFixed(1)}× surge pricing active
              </Text>
              <Text style={{ fontSize: 11, color: "#B45309", marginTop: 2 }}>
                Fares are higher than usual right now. Waiting a few minutes may lower your fare.
              </Text>
            </View>
          </View>
        )}

        {/* Vehicle Class Picker — only for solo rides */}
        {(mode ?? "share") === "solo" && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 }]}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              Choose Vehicle Class
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {VEHICLE_TIERS.map((tier: VehicleTier) => {
                const isSelected = (vehicleClass ?? "standard") === tier.id;
                const apiCents = apiFareByCls[tier.id];
                const tierFareDisplay = apiCents != null
                  ? `$${(apiCents / 100).toFixed(2)}`
                  : rideOptionsData ? "N/A" : "…";
                return (
                  <TouchableOpacity
                    key={tier.id}
                    onPress={() => {
                      const newLockedCents = apiCents ?? lockedFareCents ?? undefined;
                      setBookingDraft({ vehicleClass: tier.id, lockedFareCents: newLockedCents });
                    }}
                    accessibilityLabel={`${tier.label} vehicle class, ${tierFareDisplay}`}
                    accessibilityRole="button"
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      paddingHorizontal: 6,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: isSelected ? tier.color : colors.border,
                      backgroundColor: isSelected ? tier.color + "15" : colors.background,
                      alignItems: "center",
                    }}
                  >
                    <IconSymbol name={tier.icon} size={20} color={isSelected ? tier.color : colors.muted} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: isSelected ? tier.color : colors.foreground, marginTop: 4 }}>
                      {tier.label}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: isSelected ? tier.color : colors.muted, marginTop: 2 }}>
                      {tierFareDisplay}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>
              {selectedTier.desc}
            </Text>
          </View>
        )}

        {/* Route summary */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>
            Your Route
          </Text>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View style={{ alignItems: "center", paddingTop: 3 }}>
              <View style={styles.dotGreen} />
              <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
              <View style={styles.dotRed} />
            </View>
            <View style={{ flex: 1, gap: 14 }}>
              <View>
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 2 }}>Pickup</Text>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                  {pickup.shortName}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{pickup.address}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 2 }}>Destination</Text>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                  {dropoff.shortName}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{dropoff.address}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
            <View style={styles.statItem}>
              <IconSymbol name="clock.fill" size={16} color={accentColor} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginTop: 4 }}>
                {estimatedTime} min
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>Duration</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <IconSymbol name="road.lanes" size={16} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginTop: 4 }}>
                {distanceKm} km
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>Distance</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <IconSymbol name="person.2.fill" size={16} color={colors.success} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginTop: 4 }}>
                {coPassengers.length + 1}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>Passengers</Text>
            </View>
          </View>
        </View>

        {/* Driver */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
            Your Driver
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={[styles.driverAvatar, { backgroundColor: driver ? colors.primary : colors.border }]}>
              {driver ? (
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{driver.avatar}</Text>
              ) : (
                <IconSymbol name="car.fill" size={20} color={colors.muted} />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: driver ? colors.foreground : colors.muted }}>
                {driver ? driver.name : "Finding your driver…"}
              </Text>
              {driver ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <IconSymbol name="star.fill" size={12} color={accentColor} />
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {driver.rating} · {driver.vehicle} · {driver.licensePlate}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  A driver will be assigned once you confirm
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.contactBtn, { borderColor: colors.primary }]}
              onPress={() => {
                const phone = (driver as any)?.phone;
                if (phone) {
                  Linking.openURL(`tel:${phone}`);
                } else {
                  toast.show("Driver contact details will be available once a driver is assigned.", "info");
                }
              }}
            >
              <IconSymbol name="phone.fill" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Schedule for */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <IconSymbol name="calendar" size={16} color={accentColor} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginLeft: 8, flex: 1 }}>
              Schedule For
            </Text>
            {/* Now / Later toggle */}
            <View style={{ flexDirection: "row", borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
              {(["now", "later"] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setScheduleMode(m)}
                  style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: scheduleMode === m ? accentColor : "transparent" }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: scheduleMode === m ? "#fff" : colors.muted, textTransform: "capitalize" }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {scheduleMode === "now" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: accentColor + "12", borderRadius: 10, padding: 10 }}>
              <IconSymbol name="bolt.fill" size={14} color={accentColor} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: accentColor }}>
                Departing now · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
              </Text>
            </View>
          ) : (
            <>
              {/* Day chips */}
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
                {DAY_CHIPS.map((c) => (
                  <TouchableOpacity
                    key={c.offset}
                    onPress={() => setSchedDayOffset(c.offset)}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                      backgroundColor: schedDayOffset === c.offset ? accentColor + "20" : colors.background,
                      borderColor: schedDayOffset === c.offset ? accentColor : colors.border }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "700", color: schedDayOffset === c.offset ? accentColor : colors.muted, textAlign: "center" }}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Time row: HH · MM · AM/PM */}
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <TextInput
                  style={{ flex: 1, borderWidth: 1, borderRadius: 10, borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, fontSize: 20, fontWeight: "700", textAlign: "center", paddingVertical: 10 }}
                  placeholder="HH" placeholderTextColor={colors.muted} keyboardType="number-pad"
                  maxLength={2} value={schedHour}
                  onChangeText={(v: string) => setSchedHour(v.replace(/\D/g, "").slice(0, 2))}
                />
                <Text style={{ fontSize: 22, fontWeight: "700", color: colors.muted }}>:</Text>
                <TextInput
                  style={{ flex: 1, borderWidth: 1, borderRadius: 10, borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, fontSize: 20, fontWeight: "700", textAlign: "center", paddingVertical: 10 }}
                  placeholder="MM" placeholderTextColor={colors.muted} keyboardType="number-pad"
                  maxLength={2} value={schedMinute}
                  onChangeText={(v: string) => setSchedMinute(v.replace(/\D/g, "").slice(0, 2))}
                />
                <View style={{ flexDirection: "row", borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                  {(["AM", "PM"] as const).map((ap) => (
                    <TouchableOpacity key={ap} onPress={() => setSchedAmPm(ap)}
                      style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: schedAmPm === ap ? accentColor : colors.background }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: schedAmPm === ap ? "#fff" : colors.muted }}>{ap}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Confirmation row */}
              {schedIso && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, borderRadius: 10, padding: 10,
                  backgroundColor: schedValid ? accentColor + "10" : "#EF444410", borderWidth: 1,
                  borderColor: schedValid ? accentColor + "30" : "#EF444430" }}>
                  <IconSymbol name={schedValid ? "calendar" : "exclamationmark.triangle.fill"} size={14} color={schedValid ? accentColor : "#EF4444"} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: schedValid ? accentColor : "#EF4444", flex: 1 }}>
                    {schedValid
                      ? `Scheduled for ${new Date(schedIso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${new Date(schedIso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
                      : "Must be at least 5 minutes from now"}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Co-passengers */}
        {mode === "share" && coPassengers.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              Co-Passengers
            </Text>
            {coPassengers.map((p) => (
              <View key={p.id} style={styles.coPassengerRow}>
                <View style={[styles.coAvatar, { backgroundColor: colors.primary + "20" }]}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                    {p.avatar}
                  </Text>
                </View>
                <Text style={{ flex: 1, marginLeft: 10, fontSize: 14, color: colors.foreground, fontWeight: "600" }}>
                  {p.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <IconSymbol name="star.fill" size={11} color={accentColor} />
                  <Text style={{ fontSize: 12, color: colors.muted }}>{p.rating}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Searching or no shared rides available */}
        {mode === "share" && matchingRides.length === 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isSearchingRides ? "#1E88FF15" : "#F59E0B15", alignItems: "center", justifyContent: "center" }}>
                {isSearchingRides ? (
                  <ActivityIndicator size="small" color="#1E88FF" />
                ) : (
                  <IconSymbol name="car.2.fill" size={16} color="#F59E0B" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                  {isSearchingRides ? "Looking for rides..." : "No Rides Available"}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {isSearchingRides
                    ? "Searching for shared rides along your route"
                    : "No shared rides found right now. Book your ride — other passengers may join along the way!"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Available Shared Rides Along Your Route */}
        {mode === "share" && matchingRides.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: "#16A34A" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#16A34A15", alignItems: "center", justifyContent: "center" }}>
                <IconSymbol name="car.2.fill" size={16} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                  Rides Going Your Way
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Join an existing ride & save more
                </Text>
              </View>
              <View style={{ backgroundColor: "#16A34A", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>
                  {matchingRides.length} found
                </Text>
              </View>
            </View>
            {matchingRides.slice(0, 5).map((ride: any, i: number) => {
              const pickupShort = (ride.ridePickupAddress ?? "Pickup").split(",")[0];
              const dropoffShort = (ride.rideDropoffAddress ?? "Dropoff").split(",")[0];
              const isInProgress = ride.status === "in_progress" || ride.status === "driver_arrived";
              const isWaitingApproval = joiningRideId === ride.rideId;
              return (
                <View
                  key={ride.rideId ?? i}
                  style={{
                    borderRadius: 12, borderWidth: 1, borderColor: isInProgress ? "#F59E0B" : colors.border,
                    padding: 12, marginBottom: 8, backgroundColor: colors.background,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                          {pickupShort} → {dropoffShort}
                        </Text>
                        {isInProgress && (
                          <View style={{ backgroundColor: "#F59E0B", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 9, fontWeight: "700", color: "#fff" }}>EN ROUTE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                        {ride.availableSeats ?? 2} seats · {ride.compatibilityScore ?? 50}% match
                        {ride.detourMinutes > 0 ? ` · +${ride.detourMinutes}min detour` : ""}
                      </Text>
                      {ride.driverName && (
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                          Driver: {ride.driverName}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#16A34A" }}>
                        ${(ride.estimatedFare ?? 0).toFixed(2)}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>your fare</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={{
                      marginTop: 8, backgroundColor: isWaitingApproval ? "#F59E0B15" : "#16A34A15", borderRadius: 10,
                      paddingVertical: 8, alignItems: "center", borderWidth: 1,
                      borderColor: isWaitingApproval ? "#F59E0B" : "#16A34A",
                      flexDirection: "row", justifyContent: "center", gap: 6,
                    }}
                    onPress={() => handleRequestJoin(ride)}
                    disabled={!!joiningRideId}
                  >
                    {isWaitingApproval ? (
                      <>
                        <ActivityIndicator size="small" color="#F59E0B" />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#F59E0B" }}>
                          Waiting for approval...
                        </Text>
                      </>
                    ) : (
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#16A34A" }}>
                        Request to Join
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Promo Code */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: promoApplied ? "#16A34A" : colors.border, borderWidth: promoApplied ? 1.5 : 1 }]}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
            Promo Code
          </Text>
          {promoApplied ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#16A34A20", alignItems: "center", justifyContent: "center" }}>
                  <IconSymbol name="checkmark.circle.fill" size={18} color="#16A34A" />
                </View>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#16A34A" }}>{promoLabel}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Saved ${promoDiscount.toFixed(2)}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleRemovePromo}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#EF4444" }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  style={[styles.promoInput, { borderColor: promoError ? "#EF4444" : colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  placeholder="Enter promo code"
                  placeholderTextColor={colors.muted}
                  value={promoCode}
                  onChangeText={(text: string) => { setPromoCode(text); setPromoError(""); }}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.promoBtn, { backgroundColor: colors.primary, opacity: isApplyingPromo || !promoCode.trim() ? 0.5 : 1 }]}
                  onPress={handleApplyPromo}
                  disabled={isApplyingPromo || !promoCode.trim()}
                >
                  {isApplyingPromo ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>Apply</Text>
                  )}
                </TouchableOpacity>
              </View>
              {promoError ? (
                <Text style={{ fontSize: 12, color: "#EF4444", marginTop: 6 }}>{promoError}</Text>
              ) : null}
            </>
          )}
        </View>

        {/* Fare breakdown */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>
            Fare Breakdown
          </Text>
          <View style={styles.fareRow}>
            <Text style={{ fontSize: 14, color: colors.muted }}>
              {mode === "share" ? "Your fare share" : "Base fare"}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
              ${baseFare.toFixed(2)}
            </Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={{ fontSize: 14, color: colors.muted }}>Platform fee</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
              ${platformFee.toFixed(2)}
            </Text>
          </View>
          {promoDiscount > 0 && (
            <View style={styles.fareRow}>
              <Text style={{ fontSize: 14, color: "#16A34A" }}>Promo discount</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#16A34A" }}>
                -${promoDiscount.toFixed(2)}
              </Text>
            </View>
          )}
          {creditsApplied > 0 && (
            <View style={styles.fareRow}>
              <Text style={{ fontSize: 14, color: "#16A34A" }}>Ride credits</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#16A34A" }}>
                -${(creditsApplied / 100).toFixed(2)}
              </Text>
            </View>
          )}
          <View style={[styles.fareLine, { backgroundColor: colors.border }]} />
          <View style={styles.fareRow}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
              {creditsApplied > 0 ? "You pay" : "Total"}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.primary }}>
              ${(youPayCents / 100).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Payment */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
            Payment Method
          </Text>
          {savedCards.length === 0 ? (
            <TouchableOpacity
              style={[styles.paymentRow, { borderColor: colors.border, borderStyle: "dashed" }]}
              onPress={() => router.push("/stripe-add-card" as Href)}
            >
              <IconSymbol name="plus.circle.fill" size={20} color={colors.primary} />
              <Text style={{ flex: 1, marginLeft: 12, fontSize: 14, color: colors.primary, fontWeight: "600" }}>
                Add a payment card
              </Text>
            </TouchableOpacity>
          ) : (
            savedCards.map((card: any) => {
              const cardId = String(card.id);
              const isSel = selectedPayment === cardId;
              const brand = card.brand ?? card.cardType ?? "card";
              const cardLabel = `${brand.charAt(0).toUpperCase() + brand.slice(1)} •••• ${card.last4}`;
              const expMonth = card.expMonth ?? card.expiryMonth;
              const expYear = card.expYear ?? card.expiryYear;
              const isExpired = expMonth && expYear
                ? new Date(expYear, expMonth, 1) <= new Date()
                : false;
              const expiryLabel = expMonth && expYear
                ? `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}`
                : null;
              return (
                <TouchableOpacity
                  key={card.id}
                  style={[
                    styles.paymentRow,
                    {
                      borderColor: isExpired ? "#EF4444" : isSel ? colors.primary : colors.border,
                      backgroundColor: isExpired ? "#EF444408" : isSel ? colors.primary + "08" : "transparent",
                      opacity: isExpired ? 0.75 : 1,
                    },
                  ]}
                  onPress={() => !isExpired && setSelectedPayment(cardId)}
                >
                  <View style={{
                    width: 34, height: 22, borderRadius: 4,
                    backgroundColor: isExpired ? "#9CA3AF" : (CARD_COLOR[brand] ?? colors.muted),
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <IconSymbol name="creditcard.fill" size={13} color="#fff" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: isExpired ? colors.muted : isSel ? colors.primary : colors.foreground }}>
                      {cardLabel}
                    </Text>
                    {expiryLabel && (
                      <Text style={{ fontSize: 11, color: isExpired ? "#EF4444" : colors.muted, marginTop: 1 }}>
                        {isExpired ? `Expired ${expiryLabel}` : `Exp ${expiryLabel}`}
                      </Text>
                    )}
                  </View>
                  {isExpired && (
                    <View style={{ backgroundColor: "#EF444420", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginRight: 6 }}>
                      <Text style={{ fontSize: 10, color: "#EF4444", fontWeight: "700" }}>EXPIRED</Text>
                    </View>
                  )}
                  {!isExpired && card.isDefault && (
                    <View style={{ backgroundColor: colors.primary + "15", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginRight: 6 }}>
                      <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "700" }}>DEFAULT</Text>
                    </View>
                  )}
                  {!isExpired && isSel && (
                    <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Confirm CTA — fixed at bottom with safe area insets */}
      <View style={[styles.bottomCTA, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View>
          <Text style={{ fontSize: 12, color: colors.muted }}>Total to pay</Text>
          <Text style={{ fontSize: 26, fontWeight: "800", color: colors.primary }}>
            ${totalFare.toFixed(2)}
          </Text>
          {promoDiscount > 0 && (
            <Text style={{ fontSize: 12, color: "#16A34A", fontWeight: "600" }}>
              You save ${promoDiscount.toFixed(2)}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: colors.primary, opacity: (!schedValid || isConfirming) ? 0.5 : 1 }]}
          onPress={handleConfirm}
          disabled={isConfirming || !schedValid}
          activeOpacity={0.85}
        >
          {isConfirming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <IconSymbol name="checkmark" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Confirm Booking</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  saveBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: "auto",
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  dotGreen: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#16A34A",
  },
  dotRed: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#EF4444",
  },
  routeLine: {
    width: 2,
    height: 30,
    marginVertical: 4,
    borderRadius: 1,
  },
  statsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 14,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    height: "80%",
    alignSelf: "center",
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  contactBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  coPassengerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  coAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  fareLine: {
    height: 1,
    marginVertical: 8,
  },
  promoInput: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  promoBtn: {
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 8,
  },
  bottomCTA: {
    // FIX: Removed position:absolute so the button is always in normal document flow
    // and visible without being clipped by the safe area or parent container
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 8,
    flex: 1,
    marginLeft: 16,
    minHeight: 52,
  },
});
