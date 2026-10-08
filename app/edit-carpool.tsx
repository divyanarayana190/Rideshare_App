import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BG    = "#05071A";
const LAYER = "#0D1230";
const CARD  = "#121838";
const BORD  = "rgba(80,110,255,0.14)";
const DIVID = "rgba(255,255,255,0.06)";
const TX    = "#FFFFFF";
const TX2   = "rgba(255,255,255,0.60)";
const TX3   = "rgba(255,255,255,0.30)";
const BLUE  = "#3D74FF";
const GREEN = "#00D166";
const RED   = "#F04E4E";
const AMBER = "#F5A623";
const VIOLET= "#9B6DFF";
const CYAN  = "#0EA5E9";
const PINK  = "#F062B0";

function showAlert(t: string, m: string) {
  if (Platform.OS === "web") window.alert(`${t}\n${m}`);
  else Alert.alert(t, m);
}
function fmtDateISO(d: Date) {
  const y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0"), mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${mi}`;
}
function parseLocalISO(local: string): string {
  return new Date(local).toISOString();
}

// ─── SectionCard ─────────────────────────────────────────────────────────────
function SectionCard({ icon, title, color, children }: { icon: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <View style={[s.card, { borderTopColor: color, borderTopWidth: 2 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name={icon as any} size={15} color={color} />
        </View>
        <Text style={{ fontSize: 15, fontWeight: "800", color: TX, flex: 1 }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────
function ToggleRow({ label, sub, value, onChange, color = BLUE }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; color?: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12,
        backgroundColor: value ? color + "10" : CARD, borderWidth: 1,
        borderColor: value ? color + "40" : BORD }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: TX }}>{label}</Text>
        {sub && <Text style={{ fontSize: 11, color: TX3, marginTop: 2 }}>{sub}</Text>}
      </View>
      <View style={{ width: 44, height: 24, borderRadius: 12, justifyContent: "center", paddingHorizontal: 2, backgroundColor: value ? color : BORD }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: TX, transform: [{ translateX: value ? 20 : 0 }] }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── PillGroup ────────────────────────────────────────────────────────────────
function PillGroup<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string; icon?: string; color: string }[];
  value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
      {options.map(o => {
        const active = value === o.key;
        return (
          <TouchableOpacity key={o.key} onPress={() => onChange(o.key)}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
              borderWidth: 1.5, backgroundColor: active ? o.color + "20" : CARD, borderColor: active ? o.color : BORD }}>
            {o.icon && <IconSymbol name={o.icon as any} size={11} color={active ? o.color : TX3} />}
            <Text style={{ fontSize: 12, fontWeight: "700", color: active ? o.color : TX3 }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function EditCarpoolScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const utils   = trpc.useUtils();

  // Load current ride data
  const { data, isLoading } = trpc.carpool.getCarpoolDetail.useQuery(
    { rideId: rideId ?? "" },
    { enabled: !!rideId }
  );

  const editMut = trpc.carpool.editCarpool.useMutation();

  // Form state (initialised from loaded data)
  const [title,          setTitle]          = useState("");
  const [depLocal,       setDepLocal]       = useState(""); // datetime-local format
  const [pricePerSeat,   setPricePerSeat]   = useState("");
  const [totalSeats,     setTotalSeats]     = useState(3);
  const [approvalReq,    setApprovalReq]    = useState(true);
  const [rideNotes,      setRideNotes]      = useState("");
  const [luggageAllowed, setLuggageAllowed] = useState<"none" | "small" | "medium" | "large">("small");
  const [genderPref,     setGenderPref]     = useState<"any" | "female_only" | "male_only">("any");
  const [flexMins,       setFlexMins]       = useState(0);
  const [quietRide,      setQuietRide]      = useState(false);
  const [initialised,    setInitialised]    = useState(false);

  // Populate form once data loads
  useEffect(() => {
    if (!data || initialised) return;
    const ride    = data.ride as any;
    const meta    = (ride.fareBreakdown ?? {}) as any;
    setTitle(ride.carpoolTitle ?? "");
    if (ride.departureTime) setDepLocal(fmtDateISO(new Date(ride.departureTime)));
    setPricePerSeat(String(Number(ride.pricePerSeat ?? 5)));
    setTotalSeats(ride.totalSeats ?? 3);
    setApprovalReq(ride.approvalRequired ?? true);
    setRideNotes(meta.rideNotes ?? "");
    setLuggageAllowed(meta.luggageAllowed ?? "small");
    setGenderPref(meta.genderPreference ?? "any");
    setFlexMins(meta.flexibleDepartureMinutes ?? 0);
    setQuietRide(meta.quietRide ?? false);
    setInitialised(true);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps -- initialised is set (not read) here; adding it would reset form fields on every initialised change

  const currentPassengers = (data?.passengers ?? []).length;

  const handleSave = () => {
    if (!rideId) return;
    const price = parseFloat(pricePerSeat);
    if (isNaN(price) || price < 1) return showAlert("Invalid", "Price must be at least $1");
    if (totalSeats < currentPassengers) return showAlert("Invalid", `Cannot set seats below current passenger count (${currentPassengers})`);

    editMut.mutate(
      {
        rideId,
        title: title.trim() || undefined,
        departureTime: depLocal ? parseLocalISO(depLocal) : undefined,
        pricePerSeat: price,
        totalSeats,
        approvalRequired: approvalReq,
        rideNotes: rideNotes.trim() || undefined,
        luggageAllowed,
        genderPreference: genderPref,
        flexibleDepartureMinutes: flexMins,
        quietRide,
      },
      {
        onSuccess: () => {
          utils.carpool.getCarpoolDetail.invalidate({ rideId });
          utils.carpool.getMyPostedRides.invalidate();
          router.back();
        },
        onError: (err: any) => showAlert("Error", err.message ?? "Failed to save changes"),
      }
    );
  };

  if (isLoading || !initialised) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", paddingTop: insets.top }}>
        <StatusBar style="light" />
        <ActivityIndicator color={BLUE} size="large" />
        <Text style={{ color: TX3, marginTop: 10, fontSize: 13 }}>Loading ride…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: LAYER, borderBottomWidth: 1, borderBottomColor: DIVID, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <IconSymbol name="arrow.left" size={18} color={TX2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "900", color: TX }}>Edit Ride</Text>
          <Text style={{ fontSize: 11, color: TX3, marginTop: 1 }}>Changes notify approved passengers</Text>
        </View>
        <TouchableOpacity
          onPress={handleSave}
          disabled={editMut.isPending}
          style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: BLUE, opacity: editMut.isPending ? 0.6 : 1 }}
        >
          {editMut.isPending
            ? <ActivityIndicator color={TX} size="small" />
            : <Text style={{ fontSize: 14, fontWeight: "800", color: TX }}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Ride Title */}
        <SectionCard icon="text.quote" title="Ride Title" color={BLUE}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Daily NJIT Commute"
            placeholderTextColor={TX3}
            maxLength={80}
            style={[s.input, { borderColor: title.trim() ? BLUE + "50" : BORD }]}
          />
        </SectionCard>

        {/* Departure Time */}
        <SectionCard icon="clock.fill" title="Departure Time" color={AMBER}>
          <Text style={{ fontSize: 11, color: TX3, marginBottom: 8 }}>
            Current: {data?.ride.departureTime ? new Date(data.ride.departureTime as string).toLocaleString() : "Not set"}
          </Text>
          {Platform.OS === "web" ? (
            <input
              type="datetime-local"
              value={depLocal}
              onChange={(e: any) => setDepLocal(e.target.value)}
              min={fmtDateISO(new Date())}
              style={{
                backgroundColor: CARD, border: `1px solid ${BORD}`, borderRadius: 10,
                color: TX, padding: "10px 14px", fontSize: 14, width: "100%",
                outline: "none",
              } as any}
            />
          ) : (
            <TextInput
              value={depLocal}
              onChangeText={setDepLocal}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={TX3}
              style={[s.input, { borderColor: depLocal ? AMBER + "50" : BORD }]}
            />
          )}
        </SectionCard>

        {/* Pricing */}
        <SectionCard icon="dollarsign.circle.fill" title="Price & Seats" color={GREEN}>
          <Text style={s.label}>Price Per Seat ($)</Text>
          <TextInput
            value={pricePerSeat}
            onChangeText={setPricePerSeat}
            keyboardType="decimal-pad"
            placeholder="5.00"
            placeholderTextColor={TX3}
            style={[s.input, { borderColor: pricePerSeat ? GREEN + "50" : BORD, marginBottom: 14 }]}
          />
          <Text style={s.label}>Available Seats</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <TouchableOpacity key={n} onPress={() => setTotalSeats(n)}
                disabled={n < currentPassengers}
                style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1.5,
                  backgroundColor: totalSeats === n ? GREEN + "20" : CARD,
                  borderColor: totalSeats === n ? GREEN : n < currentPassengers ? DIVID : BORD,
                  opacity: n < currentPassengers ? 0.35 : 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: totalSeats === n ? GREEN : TX }}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {currentPassengers > 0 && (
            <Text style={{ fontSize: 11, color: AMBER, marginTop: 8 }}>
              {currentPassengers} passenger{currentPassengers > 1 ? "s" : ""} already joined — cannot reduce below that
            </Text>
          )}
        </SectionCard>

        {/* Preferences */}
        <SectionCard icon="slider.horizontal.3" title="Trip Preferences" color={VIOLET}>
          <Text style={[s.label, { marginBottom: 8 }]}>Luggage Allowed</Text>
          <PillGroup
            value={luggageAllowed}
            onChange={setLuggageAllowed}
            options={[
              { key: "none",   label: "None",   icon: "xmark.circle",  color: RED    },
              { key: "small",  label: "Small",  icon: "bag",           color: BLUE   },
              { key: "medium", label: "Medium", icon: "bag.fill",      color: AMBER  },
              { key: "large",  label: "Large",  icon: "suitcase.fill", color: VIOLET },
            ]}
          />
          <View style={{ height: 14 }} />

          <Text style={[s.label, { marginBottom: 8 }]}>Gender Preference</Text>
          <PillGroup
            value={genderPref}
            onChange={setGenderPref}
            options={[
              { key: "any",         label: "Anyone",     icon: "person.2.fill", color: BLUE },
              { key: "female_only", label: "Women Only", icon: "person.fill",   color: PINK },
              { key: "male_only",   label: "Men Only",   icon: "person.fill",   color: CYAN },
            ]}
          />
          <View style={{ height: 14 }} />

          <Text style={[s.label, { marginBottom: 8 }]}>Flexible Departure (±)</Text>
          <View style={{ flexDirection: "row", gap: 7 }}>
            {[0, 5, 10, 15, 30].map((m) => {
              const active = flexMins === m;
              return (
                <TouchableOpacity key={m} onPress={() => setFlexMins(m)}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, borderWidth: 1.5,
                    backgroundColor: active ? AMBER + "20" : CARD, borderColor: active ? AMBER : BORD }}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: active ? AMBER : TX2 }}>{m === 0 ? "Exact" : `${m}m`}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ height: 14 }} />

          <ToggleRow label="Quiet Ride" sub="Prefer a calm, silent trip" value={quietRide} onChange={setQuietRide} color={CYAN} />
        </SectionCard>

        {/* Approval */}
        <SectionCard icon="checkmark.shield.fill" title="Join Settings" color={BLUE}>
          <ToggleRow
            label="Require Approval"
            sub="Manually review each join request"
            value={approvalReq}
            onChange={setApprovalReq}
            color={BLUE}
          />
        </SectionCard>

        {/* Notes */}
        <SectionCard icon="note.text" title="Ride Notes" color={CYAN}>
          <TextInput
            value={rideNotes}
            onChangeText={setRideNotes}
            placeholder="Meeting point, rules, or any info for riders…"
            placeholderTextColor={TX3}
            multiline
            numberOfLines={3}
            maxLength={300}
            style={[s.input, { height: 80, textAlignVertical: "top", lineHeight: 20, borderColor: rideNotes.trim() ? CYAN + "50" : BORD }]}
          />
          <Text style={{ fontSize: 10, color: TX3, textAlign: "right", marginTop: 4 }}>{rideNotes.length}/300</Text>
        </SectionCard>

        {/* Destructive zone */}
        <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: RED + "30", backgroundColor: RED + "07", padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <IconSymbol name="exclamationmark.triangle.fill" size={14} color={RED} />
            <Text style={{ fontSize: 13, fontWeight: "800", color: RED }}>Cancel Ride</Text>
          </View>
          <Text style={{ fontSize: 12, color: TX3, lineHeight: 18, marginBottom: 12 }}>
            Cancelling will notify all approved passengers and remove the ride from search results. This cannot be undone.
          </Text>
          <TouchableOpacity
            onPress={() => {
              const msg = "Are you sure you want to cancel this ride? All passengers will be notified.";
              if (Platform.OS === "web") {
                if (!window.confirm(msg)) return;
                router.back();
              } else {
                Alert.alert("Cancel Ride?", msg, [
                  { text: "Keep Ride", style: "cancel" },
                  { text: "Cancel Ride", style: "destructive", onPress: () => router.back() },
                ]);
              }
            }}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: RED + "50", backgroundColor: RED + "12" }}
          >
            <IconSymbol name="xmark.circle.fill" size={14} color={RED} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: RED }}>Cancel This Ride</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 16, borderWidth: 1.5, backgroundColor: CARD,
    borderColor: BORD, padding: 16,
  },
  input: {
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: TX, backgroundColor: BG,
  },
  label: { fontSize: 11, fontWeight: "700", color: TX3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: BORD, alignItems: "center", justifyContent: "center",
  },
});
