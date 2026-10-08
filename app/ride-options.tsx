/**
 * Ride Options — premium passenger ride selection (mockup-aligned).
 * Data: rides.getRideOptions + payment.getDefaultPaymentMethod
 */
import RouteMapView from "@/components/RouteMapView";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useDefaultPaymentMethod } from "@/lib/hooks/use-payment-queries";
import { formatPaymentMethodLabel } from "@/lib/payment/format-payment-method";
import { useRides } from "@/lib/rides-store";
import { trpc } from "@/lib/trpc";
import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MAP_HEIGHT = 280;
const PURPLE = "#7C3AED";
const PURPLE_DARK = "#6B21A8";
const PURPLE_LIGHT = "#F5F3FF";

type FilterKey = "recommended" | "lowest" | "fastest" | "shared" | "premium";

type RideOption = {
  id: string;
  type: string;
  title: string;
  description: string;
  capacity: number;
  pickupEtaMinutes: number;
  pickupEtaMaxMinutes?: number;
  arrivalTime: string;
  fareCents: number;
  comparisonFareCents: number | null;
  avgFareCents: number;
  savingsPercent: number | null;
  badge: string | null;
  available: boolean;
  disabledReason: string | null;
  isShare: boolean;
  breakdown: {
    baseFare: number;
    distanceFee: number;
    timeFee: number;
    serviceFee: number;
    discount: number;
    surgeFee: number;
    totalFare: number;
  };
};

const FILTER_CHIPS: { key: FilterKey; label: string; icon: string }[] = [
  { key: "recommended", label: "Recommended", icon: "star.fill" },
  { key: "lowest", label: "Lowest Price", icon: "tag.fill" },
  { key: "fastest", label: "Fastest", icon: "bolt.fill" },
  { key: "shared", label: "Shared", icon: "person.2.fill" },
  { key: "premium", label: "Premium", icon: "crown.fill" },
];

const OPTION_ICONS: Record<string, { icon: string; bg: string; color: string }> = {
  share: { icon: "person.2.fill", bg: "#DCFCE7", color: "#16A34A" },
  priority: { icon: "bolt.fill", bg: "#EDE9FE", color: PURPLE },
  solo: { icon: "car.fill", bg: "#EDE9FE", color: PURPLE_DARK },
  waitsave: { icon: "clock.fill", bg: "#F3F4F6", color: "#6B7280" },
  premium: { icon: "crown.fill", bg: "#FEF3C7", color: "#D97706" },
};

function shortName(address: string) {
  return address.split(",")[0]?.trim() || address;
}

function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function filterOptions(options: RideOption[], filter: FilterKey): RideOption[] {
  // Never remove disabled options — show them greyed-out with reason.
  // Available options always sort above disabled ones.
  const avail = options.filter((o) => o.available);
  const disabled = options.filter((o) => !o.available);

  let sorted: RideOption[];
  if (filter === "shared") {
    sorted = avail.filter((o) => o.isShare);
  } else if (filter === "premium") {
    sorted = avail.filter((o) => o.type === "premium" || o.type === "waitsave");
  } else if (filter === "lowest") {
    sorted = [...avail].sort((a, b) => a.fareCents - b.fareCents);
  } else if (filter === "fastest") {
    sorted = [...avail].sort((a, b) => a.pickupEtaMinutes - b.pickupEtaMinutes);
  } else {
    // recommended: share first if savings, then solo, then rest by score
    sorted = [...avail].sort((a, b) => {
      const score = (o: RideOption) =>
        (o.isShare ? 100 : 0) + (o.type === "solo" ? 50 : 0) - o.fareCents / 100 - o.pickupEtaMinutes;
      return score(b) - score(a);
    });
  }

  // Disabled options always appended after available — sorted by type for consistency
  const typeOrder: Record<string, number> = { solo: 0, share: 1, priority: 2, waitsave: 3, premium: 4 };
  const sortedDisabled = [...disabled].sort(
    (a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9),
  );

  return [...sorted, ...sortedDisabled];
}

function ScheduleModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (iso: string | null) => void;
}) {
  const presets = [
    { label: "Now", value: null as string | null },
    { label: "In 30 min", value: new Date(Date.now() + 30 * 60_000).toISOString() },
    { label: "In 1 hour", value: new Date(Date.now() + 60 * 60_000).toISOString() },
    { label: "Tomorrow 9 AM", value: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    })() },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <View style={s.modalSheet}>
          <Text style={s.modalTitle}>Schedule a ride</Text>
          {presets.map((p) => (
            <TouchableOpacity
              key={p.label}
              style={s.modalRow}
              onPress={() => {
                onSelect(p.value);
                onClose();
              }}
            >
              <Text style={s.modalRowText}>{p.label}</Text>
              <IconSymbol name="chevron.right" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.modalCancel} onPress={onClose}>
            <Text style={s.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

function BreakdownSheet({
  option,
  onClose,
}: {
  option: RideOption | null;
  onClose: () => void;
}) {
  if (!option) return null;
  const b = option.breakdown;
  return (
    <Modal visible transparent animationType="slide">
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <View style={s.modalSheet}>
          <Text style={s.modalTitle}>{option.title} — Fare breakdown</Text>
          {[
            ["Base fare", b.baseFare],
            ["Distance", b.distanceFee],
            ["Time", b.timeFee],
            ["Service fee", b.serviceFee],
            b.surgeFee > 0 ? ["Surge / priority", b.surgeFee] : null,
            b.discount > 0 ? ["Discount", -b.discount] : null,
          ].filter(Boolean).map((row) => (
            <View key={(row as [string, number])[0]} style={s.breakdownRow}>
              <Text style={s.breakdownLabel}>{(row as [string, number])[0]}</Text>
              <Text style={s.breakdownVal}>
                {(row as [string, number])[1] < 0 ? "-" : ""}${Math.abs((row as [string, number])[1]).toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={[s.breakdownRow, s.breakdownTotal]}>
            <Text style={s.breakdownTotalLabel}>Total</Text>
            <Text style={s.breakdownTotalVal}>{formatUsd(option.fareCents)}</Text>
          </View>
          <Text style={s.breakdownNote}>
            Max {option.capacity} passengers · Pickup in{" "}
            {option.pickupEtaMaxMinutes
              ? `${option.pickupEtaMinutes}–${option.pickupEtaMaxMinutes} min`
              : `${option.pickupEtaMinutes} min`}
          </Text>
          <TouchableOpacity style={s.modalCancel} onPress={onClose}>
            <Text style={s.modalCancelText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function RideOptionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, setBookingDraft } = useRides();
  const { pickup, dropoff, mode: initialMode } = state.bookingDraft;

  const hasValidLocations = !!pickup && !!dropoff;

  const [selectedId, setSelectedId] = useState(initialMode === "share" ? "share" : "solo");
  const [filter, setFilter] = useState<FilterKey>("recommended");
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [breakdownOption, setBreakdownOption] = useState<RideOption | null>(null);

  const { defaultCard, stripeEnabled, isStripeLoading } = useDefaultPaymentMethod();

  const optionsQ = trpc.rides.getRideOptions.useQuery(
    {
      pickupLat: pickup?.lat ?? 0,
      pickupLng: pickup?.lng ?? 0,
      dropoffLat: dropoff?.lat ?? 0,
      dropoffLng: dropoff?.lng ?? 0,
      pickupAddress: pickup?.address ?? "",
      dropoffAddress: dropoff?.address ?? "",
      scheduledAt,
    },
    { enabled: hasValidLocations, staleTime: 30_000 },
  );

  useEffect(() => {
    if (!pickup || !dropoff) router.replace("/book-ride" as Href);
  }, [pickup, dropoff, router]);

  const filteredOptions = useMemo(
    () => filterOptions((optionsQ.data?.options ?? []) as RideOption[], filter),
    [optionsQ.data?.options, filter],
  );

  useEffect(() => {
    if (filteredOptions.length === 0) return;
    if (!filteredOptions.some((o) => o.id === selectedId)) {
      setSelectedId(filteredOptions[0]!.id);
    }
  }, [filteredOptions, selectedId]);

  if (!pickup || !dropoff) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "#fff" }}>
        <IconSymbol name="mappin.and.ellipse" size={48} color={PURPLE} />
        <Text style={{ fontSize: 22, fontWeight: "800", color: "#111827", marginTop: 16, textAlign: "center" }}>
          Choose your route first
        </Text>
        <Text style={{ fontSize: 14, color: "#6B7280", marginTop: 8, textAlign: "center", lineHeight: 20 }}>
          Pickup and dropoff are required before viewing ride options.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, backgroundColor: PURPLE_DARK, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 }}
          onPress={() => router.replace("/book-ride" as Href)}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Choose locations</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const route = optionsQ.data?.route;
  const insight = optionsQ.data?.pricingInsight;
  const selected = (optionsQ.data?.options as RideOption[] | undefined)?.find((o) => o.id === selectedId)
    ?? filteredOptions[0];

  const pickupShort = pickup.shortName || shortName(pickup.address);
  const dropoffShort = dropoff.shortName || shortName(dropoff.address);
  const distanceMi = route?.distanceMiles ?? 0;
  const durationMin = route?.durationMinutes ?? 0;

  const ctaDisabled =
    !selected ||
    !selected.available ||
    optionsQ.isLoading ||
    optionsQ.isError ||
    (stripeEnabled && !defaultCard && !selected.isShare);

  const handleSelect = () => {
    if (!selected || ctaDisabled) return;
    const fare = selected.fareCents / 100;
    // Map option type → vehicleClass for bookRide
    const vehicleClassMap: Record<string, "economy" | "standard" | "comfort" | "xl"> = {
      share: "standard",
      solo: "comfort",
      priority: "comfort",
      waitsave: "comfort",
      premium: "xl",
    };
    const vehicleClass = vehicleClassMap[selected.type] ?? "standard";

    setBookingDraft({
      pickup,
      dropoff,
      mode: selected.isShare ? "share" : "solo",
      estimatedFare: fare,
      scheduledAt,
      selectedOptionId: selected.id,
      lockedFareCents: selected.fareCents,
      vehicleClass,
      routeDistanceKm: route ? route.distanceMiles * 1.60934 : undefined,
      routeDurationMinutes: route?.durationMinutes,
      routePolyline: route?.polyline ?? null,
    });
    // All ride types go through confirm-ride for payment confirmation
    router.push("/confirm-ride" as Href);
  };

  const renderOption = (option: RideOption) => {
    const isSel = option.id === selectedId;
    const meta = OPTION_ICONS[option.type] ?? OPTION_ICONS.solo!;
    const fare = formatUsd(option.fareCents);
    const avg = formatUsd(option.avgFareCents);
    const comparison = option.comparisonFareCents != null
      ? formatUsd(option.comparisonFareCents)
      : null;

    return (
      <TouchableOpacity
        key={option.id}
        activeOpacity={option.available ? 0.85 : 1}
        disabled={!option.available}
        onPress={() => option.available && setSelectedId(option.id)}
        style={[
          s.optionCard,
          isSel && s.optionCardSelected,
          !option.available && s.optionCardDisabled,
        ]}
      >
        {isSel && (
          <View style={s.checkBadge}>
            <IconSymbol name="checkmark" size={12} color="#fff" />
          </View>
        )}

        <View style={[s.optionIcon, { backgroundColor: option.available ? meta.bg : "#F3F4F6" }]}>
          <IconSymbol name={meta.icon as any} size={22} color={option.available ? meta.color : "#9CA3AF"} />
        </View>

        <View style={s.optionBody}>
          <View style={s.optionTitleRow}>
            <Text style={[s.optionTitle, !option.available && { color: "#9CA3AF" }]}>{option.title}</Text>
            <View style={s.capacityPill}>
              <IconSymbol name="person.fill" size={10} color="#6B7280" />
              <Text style={s.capacityText}>{option.capacity}</Text>
            </View>
          </View>
          <Text style={[s.optionDesc, !option.available && { color: "#D1D5DB" }]}>{option.description}</Text>
          {option.badge && option.available && (
            <View style={[s.savePill, option.isShare && s.savePillGreen]}>
              <Text style={[s.savePillText, option.isShare && s.savePillTextGreen]}>
                {option.badge}
              </Text>
            </View>
          )}
          {option.available && (
            <Text style={s.optionEta}>
              Pickup in{" "}
              {option.pickupEtaMaxMinutes
                ? `${option.pickupEtaMinutes}–${option.pickupEtaMaxMinutes} min`
                : `${option.pickupEtaMinutes} min`}
            </Text>
          )}
          {!option.available && option.disabledReason && (
            <View style={s.unavailablePill}>
              <IconSymbol name="xmark.circle" size={11} color="#EF4444" />
              <Text style={s.disabledText}>{option.disabledReason}</Text>
            </View>
          )}
        </View>

        <View style={s.optionPrice}>
          {option.available ? (
            <>
              <View style={s.priceRow}>
                <IconSymbol name="arrow.down.right" size={11} color="#16A34A" />
                <Text style={s.priceMain}>{fare}</Text>
              </View>
              <Text style={s.priceSub}>
                {comparison ? `solo ${comparison}` : `avg. ${avg}`}
              </Text>
              <TouchableOpacity
                style={s.infoBtn}
                onPress={() => setBreakdownOption(option)}
                hitSlop={8}
              >
                <IconSymbol name="info.circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </>
          ) : (
            <Text style={s.unavailablePrice}>{fare}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      {/* Map header */}
      <View style={{ height: MAP_HEIGHT }}>
        <RouteMapView
          pickupLat={pickup.lat}
          pickupLng={pickup.lng}
          pickupLabel={pickupShort}
          destLat={dropoff.lat}
          destLng={dropoff.lng}
          destLabel={dropoffShort}
          durationMin={durationMin}
          height={MAP_HEIGHT}
          showRecenter
        />

        <View style={[s.mapOverlay, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.fab} onPress={() => router.back()}>
            <IconSymbol name="arrow.left" size={20} color="#1F2937" />
          </TouchableOpacity>

          <View style={s.routePill}>
            <Text style={s.routePillText} numberOfLines={1}>
              {pickupShort} → {dropoffShort}
            </Text>
            <IconSymbol name="chevron.right" size={12} color="#6B7280" />
          </View>

          {route && (
            <View style={s.distPill}>
              <Text style={s.distPillMain}>{distanceMi.toFixed(1)} mi</Text>
              <Text style={s.distPillSub}>{durationMin} min</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 160 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Pricing insight */}
        {optionsQ.isLoading ? (
          <View style={s.insightCard}>
            <ActivityIndicator color={PURPLE} />
            <Text style={s.insightLoading}>Loading ride options…</Text>
          </View>
        ) : optionsQ.isError ? (
          <View style={s.insightCard}>
            <Text style={s.insightTitle}>Couldn&apos;t load options</Text>
            <TouchableOpacity onPress={() => optionsQ.refetch()}>
              <Text style={s.retryLink}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        ) : insight ? (
          <View style={s.insightCard}>
            <View style={[
              s.insightIcon,
              { backgroundColor: insight.trend === "down" ? "#DCFCE7" : insight.trend === "up" ? "#FEE2E2" : "#F3F4F6" },
            ]}>
              <IconSymbol
                name={insight.trend === "down" ? "arrow.down.right" : insight.trend === "up" ? "arrow.up.right" : "chart.line.uptrend.xyaxis"}
                size={16}
                color={insight.trend === "down" ? "#16A34A" : insight.trend === "up" ? "#EF4444" : "#6B7280"}
              />
            </View>
            <View style={s.insightCopy}>
              <Text style={s.insightTitle}>{insight.title}</Text>
              <Text style={s.insightSub}>{insight.subtitle}</Text>
            </View>
          </View>
        ) : null}

        <Text style={s.sectionHead}>For you</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
          {FILTER_CHIPS.map((chip) => {
            const active = filter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setFilter(chip.key)}
              >
                <IconSymbol name={chip.icon as any} size={13} color={active ? "#fff" : "#374151"} />
                <Text style={[s.chipText, active && s.chipTextActive]}>{chip.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={s.optionsList}>
          {!optionsQ.isLoading && filteredOptions.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyTitle}>No ride options available</Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={s.retryLink}>Change pickup/dropoff</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredOptions.map(renderOption)
          )}
        </View>
      </ScrollView>

      {/* Sticky bottom */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <View style={s.bottomRow}>
          <TouchableOpacity
            style={s.bottomTile}
            onPress={() => router.push("/stripe-cards" as Href)}
          >
            <IconSymbol name="creditcard.fill" size={18} color={PURPLE} />
            <Text style={s.bottomTileText} numberOfLines={1}>
              {isStripeLoading
                ? "Loading…"
                : defaultCard
                  ? formatPaymentMethodLabel(defaultCard)
                  : "Add payment method"}
            </Text>
            <IconSymbol name="chevron.right" size={12} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={s.bottomTile} onPress={() => setShowSchedule(true)}>
            <IconSymbol name="calendar" size={18} color="#374151" />
            <Text style={s.bottomTileText} numberOfLines={1}>
              {scheduledAt ? "Scheduled" : "Schedule a ride"}
            </Text>
            <IconSymbol name="chevron.right" size={12} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.cta, ctaDisabled && s.ctaDisabled]}
          disabled={ctaDisabled}
          onPress={handleSelect}
          activeOpacity={0.9}
        >
          <View style={s.ctaLeft}>
            <Text style={s.ctaTitle}>
              {!selected ? "Select a Ride"
                : selected.type === "share" ? "Select Share Ride"
                : selected.type === "priority" ? "Select Priority Pickup"
                : selected.type === "waitsave" ? "Select Wait & Save"
                : selected.type === "premium" ? "Select Premium Ride"
                : `Select ${selected.title}`}
            </Text>
            <Text style={s.ctaSub}>You can review details next</Text>
          </View>
          {selected && (
            <Text style={s.ctaPrice}>{formatUsd(selected.fareCents)}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScheduleModal
        visible={showSchedule}
        onClose={() => setShowSchedule(false)}
        onSelect={setScheduledAt}
      />
      <BreakdownSheet option={breakdownOption} onClose={() => setBreakdownOption(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1 },

  mapOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  fab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  routePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  routePillText: { flex: 1, fontSize: 13, fontWeight: "700", color: "#1F2937" },
  distPill: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  distPillMain: { fontSize: 12, fontWeight: "800", color: "#1F2937" },
  distPillSub: { fontSize: 11, color: "#6B7280", fontWeight: "600" },

  insightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  insightCopy: { flex: 1 },
  insightTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  insightSub: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  insightLoading: { fontSize: 14, color: "#6B7280", marginLeft: 8 },
  retryLink: { fontSize: 14, fontWeight: "600", color: PURPLE, marginTop: 8 },

  sectionHead: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 12,
  },
  chipsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  chipText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  chipTextActive: { color: "#fff" },

  optionsList: { paddingHorizontal: 16, gap: 12, marginTop: 14 },
  optionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    padding: 14,
    gap: 12,
    position: "relative",
  },
  optionCardSelected: {
    borderColor: PURPLE,
    backgroundColor: PURPLE_LIGHT,
    transform: [{ scale: 1.01 }],
  },
  optionCardDisabled: { opacity: 0.6, borderStyle: "dashed" as const },
  checkBadge: {
    position: "absolute",
    top: -8,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  optionBody: { flex: 1, gap: 3, minWidth: 0 },
  optionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  capacityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  capacityText: { fontSize: 11, fontWeight: "600", color: "#6B7280" },
  optionDesc: { fontSize: 13, color: "#6B7280" },
  savePill: {
    alignSelf: "flex-start",
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 2,
  },
  savePillGreen: { backgroundColor: "#DCFCE7" },
  savePillText: { fontSize: 11, fontWeight: "700", color: PURPLE },
  savePillTextGreen: { color: "#15803D" },
  optionEta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  unavailablePill: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, marginTop: 4 },
  disabledText: { fontSize: 11, color: "#EF4444" },
  unavailablePrice: { fontSize: 14, color: "#9CA3AF", textDecorationLine: "line-through" as const },
  optionPrice: { alignItems: "flex-end", minWidth: 72 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  priceMain: { fontSize: 18, fontWeight: "800", color: "#111827" },
  priceSub: { fontSize: 12, color: "#6B7280" },
  infoBtn: { marginTop: 6 },

  emptyBox: { alignItems: "center", paddingVertical: 32 },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  bottomRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  bottomTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#fff",
  },
  bottomTileText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#374151" },

  cta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PURPLE_DARK,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaLeft: { flex: 1 },
  ctaTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  ctaSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
  ctaPrice: { color: "#fff", fontSize: 20, fontWeight: "900" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 16 },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  modalRowText: { fontSize: 16, fontWeight: "600", color: "#374151" },
  modalCancel: { marginTop: 16, alignItems: "center", paddingVertical: 12 },
  modalCancelText: { fontSize: 16, fontWeight: "600", color: PURPLE },

  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  breakdownLabel: { fontSize: 14, color: "#6B7280" },
  breakdownVal: { fontSize: 14, fontWeight: "600", color: "#374151" },
  breakdownTotal: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    marginTop: 8,
    paddingTop: 12,
  },
  breakdownTotalLabel: { fontSize: 16, fontWeight: "800", color: "#111827" },
  breakdownTotalVal: { fontSize: 16, fontWeight: "800", color: PURPLE_DARK },
  breakdownNote: { fontSize: 12, color: "#9CA3AF", marginTop: 12 },
});
