/**
 * Recurring Commutes — Advanced UI
 * Auto-post rides on your schedule
 */
import { useRouter, type Href } from "expo-router";
import { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useToastStore } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/lib/auth-context-v2";

// ─── Colors ──────────────────────────────────────────────────────────────────
const P = "#1E88FF";
const G = "#16A34A";
const R = "#EF4444";
const A = "#F59E0B";
const V = "#8B5CF6";
const T = "#0EA5E9";
const PK = "#EC4899";

// ─── Types ───────────────────────────────────────────────────────────────────
interface RecurringRide {
  recurringId: number;
  title: string;
  pickupAddress: string;
  dropoffAddress: string;
  departureTimeOfDay: string;
  daysOfWeek: number[];
  pricePerSeat: string | number | null;
  totalSeats: number | null;
  safetyMode: string | null;
  approvalRequired: boolean;
  isActive: boolean;
  maxOccurrences?: number | null;
  endDate?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function showAlert(title: string, msg: string) {
  const lc = title.toLowerCase();
  const type =
    lc.includes("success") || lc.includes("deleted")
      ? "success" as const
      : lc.includes("error") || lc.includes("missing") || lc.includes("invalid")
        ? "error" as const
        : "info" as const;
  useToastStore.getState().show(msg || title, type);
}

function showConfirm(msg: string, onOk: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(msg)) onOk();
  } else {
    Alert.alert("Confirm", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "OK", onPress: onOk },
    ]);
  }
}

function formatDays(days: number[]): string {
  if (days.length === 0) return "No days";
  if (days.length === 7) return "Every day";
  if (days.length === 5 && [1,2,3,4,5].every((d) => days.includes(d))) return "Weekdays";
  if (days.length === 2 && days.includes(0) && days.includes(6)) return "Weekends";
  return days.sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(", ");
}

function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${suffix}`;
}

// ─── Safety Options ──────────────────────────────────────────────────────────
const SAFETY_MODES: { value: string; label: string; desc: string; icon: IconSymbolName; color: string }[] = [
  { value: "none", label: "Everyone Welcome", desc: "Open to all riders", icon: "person.3.fill", color: P },
  { value: "women_drivers_only", label: "Women Driver", desc: "You identify as a woman driver", icon: "person.fill.checkmark", color: V },
  { value: "women_companions_only", label: "Women Riders", desc: "Only women passengers", icon: "person.2.fill", color: PK },
  { value: "women_only", label: "Women Only", desc: "Driver & all riders must be women", icon: "shield.fill", color: PK },
];

const PRICE_PRESETS = [3, 5, 7, 10, 12, 15, 20];

// ─── Recurring Card (List View) ──────────────────────────────────────────────
function RecurringCard({ ride, onToggle, onEdit, onDelete }: {
  ride: RecurringRide; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const colors = useColors();
  const isOn = ride.isActive;

  return (
    <View style={[st.listCard, {
      backgroundColor: colors.surface, borderColor: isOn ? P + "30" : colors.border,
      opacity: isOn ? 1 : 0.6,
    }]}>
      {/* Status strip */}
      <View style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 4, borderRadius: 2, backgroundColor: isOn ? G : colors.border }} />

      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, paddingLeft: 8 }}>
        <View style={[st.cardIconWrap, { backgroundColor: isOn ? P + "12" : colors.border + "50" }]}>
          <IconSymbol name="arrow.2.circlepath" size={16} color={isOn ? P : colors.muted} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }} numberOfLines={1}>
            {ride.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <View style={[st.miniChip, { backgroundColor: A + "12" }]}>
              <IconSymbol name="clock.fill" size={9} color={A} />
              <Text style={{ fontSize: 10, fontWeight: "700", color: A, marginLeft: 3 }}>
                {formatTime(ride.departureTimeOfDay)}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.muted }}>{formatDays(ride.daysOfWeek)}</Text>
          </View>
        </View>
        {/* Toggle */}
        <TouchableOpacity
          onPress={onToggle}
          style={[st.togglePill, { backgroundColor: isOn ? G : colors.border }]}
        >
          <View style={[st.toggleKnob, { transform: [{ translateX: isOn ? 20 : 0 }] }]} />
        </TouchableOpacity>
      </View>

      {/* Route */}
      <View style={[st.routeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: G }} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.foreground, fontWeight: "600" }} numberOfLines={1}>
            {ride.pickupAddress}
          </Text>
        </View>
        <View style={{ width: 1, height: 6, backgroundColor: colors.border, marginLeft: 3.5 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: R }} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.foreground, fontWeight: "600" }} numberOfLines={1}>
            {ride.dropoffAddress}
          </Text>
        </View>
      </View>

      {/* Badges */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <View style={[st.miniChip, { backgroundColor: P + "10" }]}>
          <IconSymbol name="person.2.fill" size={9} color={P} />
          <Text style={{ fontSize: 10, color: P, marginLeft: 3, fontWeight: "700" }}>{ride.totalSeats ?? 3} seats</Text>
        </View>
        {ride.pricePerSeat && (
          <View style={[st.miniChip, { backgroundColor: G + "10" }]}>
            <Text style={{ fontSize: 10, color: G, fontWeight: "700" }}>${Number(ride.pricePerSeat).toFixed(0)}/seat</Text>
          </View>
        )}
        {ride.safetyMode && ride.safetyMode !== "none" && (
          <View style={[st.miniChip, { backgroundColor: PK + "10" }]}>
            <IconSymbol name="shield.fill" size={9} color={PK} />
            <Text style={{ fontSize: 10, color: PK, marginLeft: 3, fontWeight: "700" }}>Safety</Text>
          </View>
        )}
        {ride.approvalRequired && (
          <View style={[st.miniChip, { backgroundColor: A + "10" }]}>
            <IconSymbol name="checkmark.shield.fill" size={9} color={A} />
            <Text style={{ fontSize: 10, color: A, marginLeft: 3, fontWeight: "700" }}>Approval</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity onPress={onEdit} style={[st.actionBtn, { backgroundColor: P + "10", borderColor: P + "25" }]}>
          <IconSymbol name="gear" size={13} color={P} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: P, marginLeft: 5 }}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={[st.actionBtn, { backgroundColor: R + "10", borderColor: R + "25" }]}>
          <IconSymbol name="trash.fill" size={13} color={R} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: R, marginLeft: 5 }}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Create / Edit Form ──────────────────────────────────────────────────────
function CreateForm({ onSuccess, editingRide }: { onSuccess: () => void; editingRide?: RecurringRide | null }) {
  const colors = useColors();
  const isEditing = !!editingRide;
  const { user } = useAuth();
  const isFemale = user?.gender === "female";
  const visibleSafetyModes = isFemale
    ? SAFETY_MODES
    : SAFETY_MODES.filter(m => !["women_drivers_only", "women_companions_only", "women_only"].includes(m.value));

  const [title, setTitle] = useState(editingRide?.title ?? "");
  const [pickup, setPickup] = useState(editingRide?.pickupAddress ?? "");
  const [dropoff, setDropoff] = useState(editingRide?.dropoffAddress ?? "");
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(
    editingRide ? { lat: 0, lng: 0 } : null
  );
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(
    editingRide ? { lat: 0, lng: 0 } : null
  );

  // Time — use 12h format with AM/PM
  const initH24 = parseInt(editingRide?.departureTimeOfDay?.split(":")[0] ?? "8", 10);
  const initM = editingRide?.departureTimeOfDay?.split(":")[1] ?? "30";
  const [depHour, setDepHour] = useState(String(initH24 > 12 ? initH24 - 12 : initH24 === 0 ? 12 : initH24));
  const [depMinute, setDepMinute] = useState(initM);
  const [depAmPm, setDepAmPm] = useState<"AM" | "PM">(initH24 >= 12 ? "PM" : "AM");

  const [selectedDays, setSelectedDays] = useState<number[]>(editingRide?.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [pricePerSeat, setPricePerSeat] = useState(editingRide?.pricePerSeat ? String(Number(editingRide.pricePerSeat)) : "10");
  const [totalSeats, setTotalSeats] = useState(editingRide?.totalSeats ?? 3);
  const [safetyMode, setSafetyMode] = useState(editingRide?.safetyMode ?? "none");
  const [approvalRequired, setApprovalRequired] = useState(editingRide?.approvalRequired ?? false);
  const [maxOccurrences, setMaxOccurrences] = useState("");   // "" = unlimited
  const [endDate, setEndDate] = useState("");                  // "" = no end date (YYYY-MM-DD)

  // Autocomplete
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeField, setActiveField] = useState<"pickup" | "dropoff" | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const BASE = getApiBaseUrl();

  async function fetchAutocomplete(query: string): Promise<any[]> {
    try {
      const res = await fetch(`${BASE}/api/maps/autocomplete?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data)) return data;
      return data.predictions ?? data.results ?? [];
    } catch { return []; }
  }

  async function fetchPlaceDetails(placeId: string): Promise<any> {
    const res = await fetch(`${BASE}/api/maps/place-details?placeId=${encodeURIComponent(placeId)}`);
    if (!res.ok) throw new Error("Place details failed");
    return res.json();
  }

  useEffect(() => {
    const query = activeField === "pickup" ? pickup : dropoff;
    if (query.length < 2) { setSuggestions([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await fetchAutocomplete(query);
        setSuggestions(results);
      } catch { setSuggestions([]); }
      finally { setIsSearching(false); }
    }, 350);
  }, [pickup, dropoff, activeField]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchAutocomplete is a plain async fn, not wrapped in useCallback; adding it would cause infinite re-runs

  const handleSelectSuggestion = async (raw: any) => {
    setIsSearching(true);
    setSuggestions([]);
    const field = activeField;
    try {
      const placeId: string = raw.placeId ?? "";
      const shortName = raw.primaryText || raw.fullText || "";
      let lat: number, lng: number;

      if (placeId.startsWith("photon:") || placeId.startsWith("nominatim:")) {
        const parts = placeId.split(":");
        if (parts.length < 5) throw new Error("Invalid placeId");
        lat = parseFloat(parts[3]);
        lng = parseFloat(parts[4]);
      } else {
        const details = await fetchPlaceDetails(placeId);
        lat = details.lat;
        lng = details.lng;
      }

      if (field === "pickup") {
        setPickup(shortName);
        setPickupCoords({ lat, lng });
      } else {
        setDropoff(shortName);
        setDropoffCoords({ lat, lng });
      }
      setActiveField(null);
    } catch {}
    finally { setIsSearching(false); }
  };

  const createMutation = trpc.carpool.createRecurringRide.useMutation();
  const editMutation = trpc.carpool.editRecurringRide.useMutation();

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const handleSubmit = () => {
    if (!title.trim()) return showAlert("Missing", "Please enter a title");
    if (!pickup.trim() || !dropoff.trim()) return showAlert("Missing", "Please enter pickup and dropoff");
    if (selectedDays.length === 0) return showAlert("Missing", "Select at least one day");

    let h = parseInt(depHour, 10);
    const m = parseInt(depMinute, 10);
    if (isNaN(h) || h < 1 || h > 12 || isNaN(m) || m < 0 || m > 59) {
      return showAlert("Invalid time", "Enter a valid time (1-12 hours, 0-59 minutes)");
    }
    // Convert to 24h
    if (depAmPm === "PM" && h < 12) h += 12;
    if (depAmPm === "AM" && h === 12) h = 0;
    const departureTimeOfDay = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    // Validate optional end-date
    let parsedEndDate: string | undefined;
    if (endDate.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim()) || isNaN(Date.parse(endDate.trim()))) {
        return showAlert("Invalid date", "End date must be in YYYY-MM-DD format");
      }
      if (new Date(endDate.trim()) <= new Date()) {
        return showAlert("Invalid date", "End date must be in the future");
      }
      parsedEndDate = endDate.trim();
    }

    const parsedMaxOcc = maxOccurrences.trim() ? parseInt(maxOccurrences.trim(), 10) : undefined;
    if (parsedMaxOcc !== undefined && (isNaN(parsedMaxOcc) || parsedMaxOcc < 1)) {
      return showAlert("Invalid", "Max occurrences must be a positive number");
    }

    const payload = {
      title: title.trim(),
      pickupAddress: pickup.trim(),
      dropoffAddress: dropoff.trim(),
      pickupLat: pickupCoords?.lat ?? 0,
      pickupLng: pickupCoords?.lng ?? 0,
      dropoffLat: dropoffCoords?.lat ?? 0,
      dropoffLng: dropoffCoords?.lng ?? 0,
      departureTimeOfDay,
      daysOfWeek: selectedDays,
      pricePerSeat: parseFloat(pricePerSeat) || 10,
      totalSeats,
      safetyMode,
      approvalRequired,
      maxOccurrences: parsedMaxOcc,
      endDate: parsedEndDate,
    };

    if (isEditing && editingRide) {
      editMutation.mutate(
        { recurringId: String(editingRide.recurringId), ...payload },
        {
          onSuccess: () => { showAlert("Success", "Schedule updated!"); onSuccess(); },
          onError: (err: any) => showAlert("Error", err.message),
        }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => onSuccess(),
        onError: (err: any) => showAlert("Error", err.message),
      });
    }
  };

  const price = parseFloat(pricePerSeat) || 0;
  const totalEarnings = price * totalSeats * selectedDays.length * 4; // monthly estimate

  // Completion
  const steps = [!!title.trim(), !!pickup.trim() && !!pickupCoords, !!dropoff.trim() && !!dropoffCoords, selectedDays.length > 0, parseInt(depHour) >= 1].filter(Boolean).length;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 14 }}
      showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

      {/* Progress */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < steps ? G : colors.border }} />
        ))}
        <Text style={{ fontSize: 10, color: colors.muted, marginLeft: 6, fontWeight: "600" }}>{steps}/5</Text>
      </View>

      {/* ── Route Card ──────────────────────────────────────── */}
      <View style={[st.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={st.formCardHeader}>
          <View style={[st.formCardIcon, { backgroundColor: P + "12" }]}>
            <IconSymbol name="map.fill" size={14} color={P} />
          </View>
          <Text style={[st.formCardTitle, { color: colors.foreground }]}>Route Details</Text>
          {pickupCoords && dropoffCoords && (
            <View style={[st.statusDot, { backgroundColor: G + "15" }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: G }} />
              <Text style={{ fontSize: 9, fontWeight: "700", color: G }}>Set</Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={[st.fieldLabel, { color: colors.muted }]}>Commute Name</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Newark → NYC Morning"
          placeholderTextColor={colors.muted}
          style={[st.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          maxLength={80}
        />

        {/* Pickup + Dropoff with connector */}
        <View style={{ position: "relative", marginTop: 12 }}>
          <View style={{ position: "absolute", left: 14, top: 38, bottom: 38, width: 2, backgroundColor: colors.border, zIndex: 0 }} />

          {/* Pickup */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, zIndex: 20 }}>
            <View style={[st.routeDot, { backgroundColor: G }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.fieldLabel, { color: colors.muted }]}>Pickup</Text>
              <TextInput
                value={pickup}
                onChangeText={(t: string) => { setPickup(t); setActiveField("pickup"); setPickupCoords(null); }}
                onFocus={() => setActiveField("pickup")}
                placeholder="Search pickup location"
                placeholderTextColor={colors.muted}
                style={[st.routeInput, {
                  backgroundColor: activeField === "pickup" ? G + "06" : colors.background,
                  borderColor: activeField === "pickup" ? G : pickupCoords ? G + "50" : colors.border,
                  color: colors.foreground,
                }]}
              />
            </View>
            {pickupCoords && <View style={{ marginTop: 14 }}><IconSymbol name="checkmark.circle.fill" size={18} color={G} /></View>}
          </View>

          {/* Suggestions - Pickup */}
          {activeField === "pickup" && (suggestions.length > 0 || isSearching) && (
            <View style={{ marginLeft: 38, zIndex: 30 }}>
              <SuggestionList suggestions={suggestions} isSearching={isSearching} onSelect={handleSelectSuggestion} colors={colors} />
            </View>
          )}

          {/* Swap */}
          <View style={{ alignItems: "center", zIndex: 3, marginVertical: 2 }}>
            <TouchableOpacity
              style={[st.swapBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => {
                setPickup(dropoff); setDropoff(pickup);
                setPickupCoords(dropoffCoords); setDropoffCoords(pickupCoords);
              }}
            >
              <IconSymbol name="arrow.up.arrow.down" size={12} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Dropoff */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, zIndex: 10 }}>
            <View style={[st.routeDot, { backgroundColor: R }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.fieldLabel, { color: colors.muted }]}>Destination</Text>
              <TextInput
                value={dropoff}
                onChangeText={(t: string) => { setDropoff(t); setActiveField("dropoff"); setDropoffCoords(null); }}
                onFocus={() => setActiveField("dropoff")}
                placeholder="Search dropoff location"
                placeholderTextColor={colors.muted}
                style={[st.routeInput, {
                  backgroundColor: activeField === "dropoff" ? R + "06" : colors.background,
                  borderColor: activeField === "dropoff" ? R : dropoffCoords ? R + "50" : colors.border,
                  color: colors.foreground,
                }]}
              />
            </View>
            {dropoffCoords && <View style={{ marginTop: 14 }}><IconSymbol name="checkmark.circle.fill" size={18} color={G} /></View>}
          </View>

          {/* Suggestions - Dropoff */}
          {activeField === "dropoff" && (suggestions.length > 0 || isSearching) && (
            <View style={{ marginLeft: 38, zIndex: 30 }}>
              <SuggestionList suggestions={suggestions} isSearching={isSearching} onSelect={handleSelectSuggestion} colors={colors} />
            </View>
          )}
        </View>
      </View>

      {/* ── Schedule Card ─────────────────────────────────── */}
      <View style={[st.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={st.formCardHeader}>
          <View style={[st.formCardIcon, { backgroundColor: A + "12" }]}>
            <IconSymbol name="calendar" size={14} color={A} />
          </View>
          <Text style={[st.formCardTitle, { color: colors.foreground }]}>Schedule</Text>
        </View>

        {/* Days of Week */}
        <Text style={[st.fieldLabel, { color: colors.muted, marginBottom: 8 }]}>Days of Week</Text>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
          {DAY_LABELS.map((label, idx) => {
            const active = selectedDays.includes(idx);
            const isWeekend = idx === 0 || idx === 6;
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => toggleDay(idx)}
                style={[st.dayChip, {
                  backgroundColor: active ? P : colors.background,
                  borderColor: active ? P : colors.border,
                }]}
              >
                <Text style={{ fontSize: 11, fontWeight: "800", color: active ? "#fff" : isWeekend ? A : colors.foreground }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Quick presets */}
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
          <TouchableOpacity
            onPress={() => setSelectedDays([1, 2, 3, 4, 5])}
            style={[st.presetChip, { backgroundColor: selectedDays.length === 5 && [1,2,3,4,5].every((d) => selectedDays.includes(d)) ? P + "12" : colors.background, borderColor: colors.border }]}
          >
            <Text style={{ fontSize: 10, fontWeight: "700", color: P }}>Weekdays</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSelectedDays([0, 6])}
            style={[st.presetChip, { backgroundColor: selectedDays.length === 2 && selectedDays.includes(0) && selectedDays.includes(6) ? A + "12" : colors.background, borderColor: colors.border }]}
          >
            <Text style={{ fontSize: 10, fontWeight: "700", color: A }}>Weekends</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
            style={[st.presetChip, { backgroundColor: selectedDays.length === 7 ? G + "12" : colors.background, borderColor: colors.border }]}
          >
            <Text style={{ fontSize: 10, fontWeight: "700", color: G }}>Every Day</Text>
          </TouchableOpacity>
        </View>

        {/* Departure Time — simple Hour : Minute : AM/PM */}
        <Text style={[st.fieldLabel, { color: colors.muted, marginBottom: 8 }]}>Departure Time</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 3, textAlign: "center" }}>Hour</Text>
            <TextInput
              value={depHour}
              onChangeText={(v: string) => {
                const clean = v.replace(/[^0-9]/g, "").slice(0, 2);
                const n = parseInt(clean);
                if (clean === "" || (n >= 0 && n <= 12)) setDepHour(clean);
              }}
              keyboardType="number-pad"
              placeholder="HH"
              placeholderTextColor={colors.muted}
              maxLength={2}
              style={[st.timeBox, { backgroundColor: colors.background, borderColor: depHour ? P : colors.border, color: colors.foreground }]}
            />
          </View>
          <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, marginTop: 12 }}>:</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 3, textAlign: "center" }}>Min</Text>
            <TextInput
              value={depMinute}
              onChangeText={(v: string) => {
                const clean = v.replace(/[^0-9]/g, "").slice(0, 2);
                const n = parseInt(clean);
                if (clean === "" || (n >= 0 && n <= 59)) setDepMinute(clean);
              }}
              keyboardType="number-pad"
              placeholder="MM"
              placeholderTextColor={colors.muted}
              maxLength={2}
              style={[st.timeBox, { backgroundColor: colors.background, borderColor: depMinute ? P : colors.border, color: colors.foreground }]}
            />
          </View>
          <View style={{ flex: 1.3 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 3, textAlign: "center" }}>Period</Text>
            <View style={[st.ampmWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setDepAmPm("AM")}
                style={[st.ampmBtn, { backgroundColor: depAmPm === "AM" ? P : "transparent", borderRadius: 7 }]}
              >
                <Text style={{ fontSize: 13, fontWeight: "800", color: depAmPm === "AM" ? "#fff" : colors.foreground }}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setDepAmPm("PM")}
                style={[st.ampmBtn, { backgroundColor: depAmPm === "PM" ? P : "transparent", borderRadius: 7 }]}
              >
                <Text style={{ fontSize: 13, fontWeight: "800", color: depAmPm === "PM" ? "#fff" : colors.foreground }}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Time preview */}
        {parseInt(depHour) >= 1 && parseInt(depHour) <= 12 && (
          <View style={[st.timePreviewBar, { backgroundColor: P + "08", borderColor: P + "20" }]}>
            <IconSymbol name="clock.fill" size={12} color={P} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: P, marginLeft: 5 }}>
              Departs at {depHour}:{(parseInt(depMinute) || 0) < 10 ? `0${parseInt(depMinute) || 0}` : depMinute} {depAmPm}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 10, color: colors.muted }}>
              {selectedDays.length} day{selectedDays.length !== 1 ? "s" : ""}/week
            </Text>
          </View>
        )}
      </View>

      {/* ── Pricing Card ──────────────────────────────────── */}
      <View style={[st.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={st.formCardHeader}>
          <View style={[st.formCardIcon, { backgroundColor: G + "12" }]}>
            <IconSymbol name="dollarsign.circle.fill" size={14} color={G} />
          </View>
          <Text style={[st.formCardTitle, { color: colors.foreground }]}>Pricing & Seats</Text>
        </View>

        {/* Price chips */}
        <Text style={[st.fieldLabel, { color: colors.muted, marginBottom: 6 }]}>Price Per Seat</Text>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {PRICE_PRESETS.map((p) => {
            const sel = pricePerSeat === String(p);
            return (
              <TouchableOpacity
                key={p}
                onPress={() => setPricePerSeat(String(p))}
                style={[st.priceChip, { backgroundColor: sel ? P : colors.background, borderColor: sel ? P : colors.border }]}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: sel ? "#fff" : colors.foreground }}>${p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>$</Text>
          <TextInput
            value={pricePerSeat}
            onChangeText={(v: string) => setPricePerSeat(v.replace(/[^\d.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="Custom"
            placeholderTextColor={colors.muted}
            style={[st.priceInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          />
          <Text style={{ fontSize: 12, color: colors.muted }}>/seat</Text>
        </View>

        {/* Seats */}
        <Text style={[st.fieldLabel, { color: colors.muted, marginTop: 14, marginBottom: 6 }]}>Available Seats</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[1, 2, 3, 4].map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setTotalSeats(s)}
              style={[st.seatBtn, {
                backgroundColor: totalSeats === s ? P : colors.background,
                borderColor: totalSeats === s ? P : colors.border,
              }]}
            >
              <IconSymbol name="person.fill" size={12} color={totalSeats === s ? "#fff" : colors.muted} />
              <Text style={{ fontSize: 14, fontWeight: "800", color: totalSeats === s ? "#fff" : colors.foreground }}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Earnings estimate */}
        {price > 0 && selectedDays.length > 0 && (
          <View style={[st.earningsRow, { backgroundColor: G + "08", borderColor: G + "20" }]}>
            <IconSymbol name="chart.line.uptrend.xyaxis" size={14} color={G} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={{ fontSize: 11, color: G, fontWeight: "700" }}>
                Est. monthly earnings: ${(totalEarnings * 0.8).toFixed(0)}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted }}>
                {totalSeats} seats × ${price}/seat × {selectedDays.length} days/wk × 4 wks (80% after fees)
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Safety Card ───────────────────────────────────── */}
      <View style={[st.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={st.formCardHeader}>
          <View style={[st.formCardIcon, { backgroundColor: V + "12" }]}>
            <IconSymbol name="shield.fill" size={14} color={V} />
          </View>
          <Text style={[st.formCardTitle, { color: colors.foreground }]}>Safety & Preferences</Text>
        </View>

        <View style={{ gap: 6, marginBottom: 12 }}>
          {visibleSafetyModes.map((m) => {
            const active = safetyMode === m.value;
            return (
              <TouchableOpacity
                key={m.value}
                onPress={() => setSafetyMode(m.value)}
                style={[st.safetyOpt, {
                  backgroundColor: active ? m.color + "08" : colors.background,
                  borderColor: active ? m.color : colors.border,
                  borderWidth: active ? 2 : 1,
                }]}
              >
                <View style={[st.safetyDot, { backgroundColor: active ? m.color : colors.border }]}>
                  <IconSymbol name={m.icon} size={12} color={active ? "#fff" : colors.muted} />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: active ? m.color : colors.foreground }}>{m.label}</Text>
                  <Text style={{ fontSize: 10, color: colors.muted }}>{m.desc}</Text>
                </View>
                <View style={[st.radio, { borderColor: active ? m.color : colors.border }]}>
                  {active && <View style={[st.radioFill, { backgroundColor: m.color }]} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Approval toggle */}
        <TouchableOpacity
          onPress={() => setApprovalRequired((v) => !v)}
          style={[st.approvalRow, {
            backgroundColor: colors.background,
            borderColor: approvalRequired ? P : colors.border,
          }]}
        >
          <View style={[st.approvalIcon, { backgroundColor: approvalRequired ? P + "12" : colors.border + "50" }]}>
            <IconSymbol name="checkmark.shield.fill" size={14} color={approvalRequired ? P : colors.muted} />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>Require Approval</Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>Review each rider before accepting</Text>
          </View>
          <View style={[st.togglePill, { backgroundColor: approvalRequired ? P : colors.border }]}>
            <View style={[st.toggleKnob, { transform: [{ translateX: approvalRequired ? 20 : 0 }] }]} />
          </View>
        </TouchableOpacity>

        {/* ── End Conditions ─────────────────────────────── */}
        <Text style={[st.fieldLabel, { color: colors.muted, marginTop: 14 }]}>Max Occurrences (optional)</Text>
        <TextInput
          value={maxOccurrences}
          onChangeText={setMaxOccurrences}
          placeholder="e.g. 20 (leave blank for unlimited)"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          style={[st.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          maxLength={5}
        />

        <Text style={[st.fieldLabel, { color: colors.muted, marginTop: 10 }]}>End Date (optional)</Text>
        <TextInput
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD (leave blank for ongoing)"
          placeholderTextColor={colors.muted}
          style={[st.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          maxLength={10}
        />
      </View>

      {/* ── Submit Button ─────────────────────────────────── */}
      <TouchableOpacity
        style={[st.submitBtn, {
          backgroundColor: P,
          opacity: (createMutation.isPending || editMutation.isPending) ? 0.7 : 1,
          shadowColor: P, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
        }]}
        onPress={handleSubmit}
        disabled={createMutation.isPending || editMutation.isPending}
      >
        {(createMutation.isPending || editMutation.isPending) ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <IconSymbol name={isEditing ? "checkmark.circle.fill" : "arrow.2.circlepath"} size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
              {isEditing ? "Update Schedule" : "Create Schedule"}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Suggestion List ─────────────────────────────────────────────────────────
function SuggestionList({ suggestions, isSearching, onSelect, colors }: {
  suggestions: any[]; isSearching: boolean; onSelect: (raw: any) => void; colors: any;
}) {
  if (!isSearching && suggestions.length === 0) return null;
  return (
    <View style={[st.suggestBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {isSearching && suggestions.length === 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", padding: 10, gap: 8 }}>
          <ActivityIndicator size="small" color={P} />
          <Text style={{ fontSize: 12, color: colors.muted }}>Searching...</Text>
        </View>
      ) : (
        suggestions.slice(0, 5).map((s: any, i: number) => (
          <TouchableOpacity
            key={s.placeId ?? i}
            style={[st.suggestRow, { borderBottomColor: colors.border }]}
            onPress={() => onSelect(s)}
          >
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: P + "10", alignItems: "center", justifyContent: "center" }}>
              <IconSymbol name="mappin" size={10} color={P} />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                {s.primaryText || s.fullText || s.description || ""}
              </Text>
              {(s.secondaryText || s.structured_formatting?.secondary_text) && (
                <Text style={{ fontSize: 10, color: colors.muted }} numberOfLines={1}>
                  {s.secondaryText || s.structured_formatting?.secondary_text}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function RecurringRidesScreen() {
  const colors = useColors();
  const router = useRouter();
  const [tab, setTab] = useState<"list" | "create">("list");
  const [editingRide, setEditingRide] = useState<RecurringRide | null>(null);

  const { data, isLoading, refetch } = trpc.carpool.getMyRecurringRides.useQuery(undefined);
  const toggleMutation = trpc.carpool.toggleRecurringRide.useMutation();
  const deleteMutation = trpc.carpool.deleteRecurringRide.useMutation();
  const rides: RecurringRide[] = (data ?? []) as RecurringRide[];

  const handleDelete = (ride: RecurringRide) => {
    showConfirm(`Delete "${ride.title}"?\n\nThis will stop auto-posting rides.`, () => {
      deleteMutation.mutate(
        { recurringId: String(ride.recurringId) },
        {
          onSuccess: () => { refetch(); showAlert("Deleted", "Schedule removed."); },
          onError: (err: any) => showAlert("Error", err.message),
        }
      );
    });
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={[st.header, { backgroundColor: P }]}>
        <View style={st.headerGlow} />
        <View style={st.headerContent}>
          <TouchableOpacity
            style={st.headerBack}
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as Href)}
          >
            <IconSymbol name="arrow.left" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#fff" }}>Recurring Commutes</Text>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>Auto-post rides on your schedule</Text>
          </View>
          <TouchableOpacity
            style={[st.headerAction, { backgroundColor: tab === "create" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)" }]}
            onPress={() => {
              if (tab === "create") { setTab("list"); setEditingRide(null); }
              else setTab("create");
            }}
          >
            <IconSymbol name={tab === "create" ? "xmark" : "plus"} size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab Bar ────────────────────────────────────────── */}
      <View style={[st.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {([
          { key: "list" as const, label: "My Schedules", icon: "list.bullet" as IconSymbolName },
          { key: "create" as const, label: editingRide ? "Edit Schedule" : "New Schedule", icon: "plus.circle" as IconSymbolName },
        ]).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[st.tabBtn, active && { borderBottomColor: P, borderBottomWidth: 2 }]}
              onPress={() => { setTab(t.key); if (t.key === "create" && editingRide && tab === "create") setEditingRide(null); }}
            >
              <IconSymbol name={t.icon} size={14} color={active ? P : colors.muted} />
              <Text style={{ fontSize: 13, fontWeight: active ? "700" : "500", color: active ? P : colors.muted, marginLeft: 5 }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content ────────────────────────────────────────── */}
      {tab === "list" ? (
        isLoading ? (
          <View style={st.center}>
            <ActivityIndicator size="large" color={P} />
            <Text style={{ color: colors.muted, marginTop: 12, fontSize: 13 }}>Loading schedules...</Text>
          </View>
        ) : rides.length === 0 ? (
          <View style={st.center}>
            <View style={[st.emptyCircle, { backgroundColor: P + "10" }]}>
              <IconSymbol name="arrow.2.circlepath" size={36} color={P} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginTop: 16 }}>
              No Schedules Yet
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 6, paddingHorizontal: 40 }}>
              {"Set up a daily commute and we'll auto-post your ride so passengers can find you."}
            </Text>
            <TouchableOpacity
              style={[st.emptyBtn, { backgroundColor: P }]}
              onPress={() => setTab("create")}
            >
              <IconSymbol name="plus" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginLeft: 6 }}>Create First Schedule</Text>
            </TouchableOpacity>

            {/* Benefits */}
            <View style={{ marginTop: 24, width: "100%", gap: 10 }}>
              {[
                { icon: "clock.fill" as IconSymbolName, color: A, text: "Rides auto-post 7 days in advance" },
                { icon: "person.3.fill" as IconSymbolName, color: G, text: "Passengers can plan and join ahead" },
                { icon: "dollarsign.circle.fill" as IconSymbolName, color: P, text: "Earn consistently every week" },
              ].map((b, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: b.color + "12", alignItems: "center", justifyContent: "center" }}>
                    <IconSymbol name={b.icon} size={14} color={b.color} />
                  </View>
                  <Text style={{ fontSize: 12, color: colors.foreground, flex: 1 }}>{b.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            data={rides}
            keyExtractor={(item: RecurringRide) => String(item.recurringId)}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
            renderItem={({ item }: { item: RecurringRide }) => (
              <RecurringCard
                ride={item}
                onToggle={() => toggleMutation.mutate(
                  { recurringId: String(item.recurringId), isActive: !item.isActive },
                  {
                    onSuccess: () => refetch(),
                    onError: (err: any) => showAlert("Error", err.message),
                  }
                )}
                onEdit={() => { setEditingRide(item); setTab("create"); }}
                onDelete={() => handleDelete(item)}
              />
            )}
            ListHeaderComponent={
              <View style={[st.infoBanner, { backgroundColor: T + "08", borderColor: T + "20" }]}>
                <IconSymbol name="info.circle.fill" size={14} color={T} />
                <Text style={{ flex: 1, marginLeft: 8, fontSize: 11, color: T, fontWeight: "600" }}>
                  Active schedules auto-post rides 7 days ahead. Toggle off to pause.
                </Text>
              </View>
            }
          />
        )
      ) : (
        <CreateForm
          key={editingRide ? String(editingRide.recurringId) : "new"}
          editingRide={editingRide}
          onSuccess={() => { refetch(); setEditingRide(null); setTab("list"); }}
        />
      )}
    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  header: { paddingTop: 8, paddingBottom: 16, paddingHorizontal: 16, overflow: "hidden" },
  headerGlow: { position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.08)" },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerBack: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerAction: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  emptyCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyBtn: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18, gap: 6 },
  infoBanner: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  // List card
  listCard: { borderRadius: 14, borderWidth: 1, padding: 14, paddingLeft: 10 },
  cardIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  miniChip: { flexDirection: "row", alignItems: "center", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  routeBlock: { borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, paddingVertical: 8, gap: 4 },
  // Form
  formCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  formCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  formCardIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  formCardTitle: { fontSize: 14, fontWeight: "800", flex: 1 },
  statusDot: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  fieldLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  routeDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  routeInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 12 },
  swapBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  dayChip: { flex: 1, borderWidth: 1.5, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  presetChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  timeBox: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 20, fontWeight: "800" as const, textAlign: "center" as const },
  ampmWrap: { flexDirection: "row", borderWidth: 1.5, borderRadius: 10, padding: 3, gap: 2 },
  ampmBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9 },
  timePreviewBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 10 },
  priceChip: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, minWidth: 44, alignItems: "center" },
  priceInput: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: "800" as const },
  seatBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: "center", justifyContent: "center", gap: 2 },
  earningsRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 12 },
  safetyOpt: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  safetyDot: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioFill: { width: 9, height: 9, borderRadius: 5 },
  approvalRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10 },
  approvalIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  togglePill: { width: 44, height: 24, borderRadius: 12, justifyContent: "center", paddingHorizontal: 2 },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 16 },
  suggestBox: { borderWidth: 1, borderRadius: 10, marginTop: 4, overflow: "hidden", zIndex: 100 },
  suggestRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1 },
});
