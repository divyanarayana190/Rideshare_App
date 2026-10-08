import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import * as ExpoLocation from "expo-location";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { getApiBaseUrl } from "@/constants/oauth";
import { useRides } from "@/lib/rides-store";
import type { RideLocation } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context-v2";
import { useDriverAccess } from "@/lib/use-driver-access";
import { useToastStore } from "@/lib/stores";
import { getSessionToken } from "@/lib/_core/auth";

const BASE = getApiBaseUrl();

// ─── Design tokens ─────────────────────────────────────────────────────────
const BG          = "#0B1220";
const CARD_BG     = "rgba(255,255,255,0.06)";
const CARD_BORDER = "rgba(255,255,255,0.08)";
const DC          = "#1E88FF";   // driver blue
const BLUE        = "#1E88FF";
const PC          = "#00C853";   // passenger green
const TX          = "#FFFFFF";
const TX2         = "rgba(255,255,255,0.6)";
const TX3         = "rgba(255,255,255,0.35)";
const WARN        = "#F59E0B";
const ERR         = "#EF4444";
const VIOLET      = "#8B5CF6";
const CYAN        = "#0EA5E9";
const PRICE_MIN   = 3;
const PRICE_MAX   = 20;
const OFFER_MIN   = 3;
const OFFER_MAX   = 30;

type AnimVal = InstanceType<typeof Animated.Value>;

type Role       = "driver" | "passenger";
type SafetyMode = "none" | "women_drivers_only" | "women_companions_only" | "women_only";
type TimePreset = "now" | "plus15" | "smart" | "custom";

function showAlert(t: string, m: string) {
  if (Platform.OS === "web") window.alert(`${t}\n${m}`);
  else Alert.alert(t, m);
}
function estimateSoloFare(km: number, min: number) {
  return Math.round((2.5 + km * 0.9 + min * 0.18) * 100) / 100;
}
function suggestedPrice(fare: number, seats: number) {
  return Math.ceil(((fare + 2.5) / seats) * 2) / 2;
}
function buildIso(hour: string, minute: string, ampm: "AM" | "PM", dayOffset = 0) {
  let h = parseInt(hour) || 0;
  const m = parseInt(minute) || 0;
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  // If same-day and already past, auto-bump to next day
  if (dayOffset === 0 && d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}
function probColor(p: number) {
  return p >= 80 ? PC : p >= 60 ? "#22C55E" : p >= 40 ? WARN : ERR;
}
function smartTime(): { hour: string; minute: string; ampm: "AM" | "PM"; label: string } {
  const h = new Date().getHours();
  if (h < 8)  return { hour: "8",  minute: "00", ampm: "AM", label: "8:00 AM peak" };
  if (h < 10) return { hour: "9",  minute: "00", ampm: "AM", label: "9:00 AM rush" };
  if (h < 17) return { hour: "5",  minute: "30", ampm: "PM", label: "5:30 PM commute" };
  return { hour: "8", minute: "00", ampm: "AM", label: "Tmrw 8:00 AM" };
}

const SAFETY_OPTS: { value: SafetyMode; label: string; icon: IconSymbolName; color: string }[] = [
  { value: "none",                  label: "Everyone",    icon: "person.3.fill",         color: DC      },
  { value: "women_drivers_only",    label: "Women Driver",icon: "person.fill.checkmark", color: VIOLET  },
  { value: "women_companions_only", label: "Women Riders",icon: "person.2.fill",         color: "#EC4899" },
  { value: "women_only",            label: "Women Only",  icon: "shield.fill",           color: "#EC4899" },
];

// ─── Sub-components ─────────────────────────────────────────────────────────

function SuggestionList({ suggestions, isSearching, onSelect, accent }: {
  suggestions: any[];
  isSearching: boolean;
  onSelect: (r: any) => void;
  accent: string;
}) {
  if (!isSearching && suggestions.length === 0) return null;
  return (
    <View style={{ borderWidth: 1, borderRadius: 10, marginTop: 4, overflow: "hidden", backgroundColor: "rgba(11,18,32,0.97)", borderColor: CARD_BORDER }}>
      {isSearching && suggestions.length === 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 }}>
          <ActivityIndicator size="small" color={accent} />
          <Text style={{ marginLeft: 10, fontSize: 13, color: TX3 }}>Searching…</Text>
        </View>
      ) : (
        suggestions.slice(0, 5).map((s: any, i: number) => (
          <TouchableOpacity key={i}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}
            onPress={() => onSelect(s)}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: accent + "15", alignItems: "center", justifyContent: "center" }}>
              <IconSymbol name="mappin" size={12} color={accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: TX }}>{s.primaryText}</Text>
              <Text style={{ fontSize: 10, color: TX3 }} numberOfLines={1}>{s.fullText}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function TimeChips({ preset, activeColor, onSelect, smartLabel }: {
  preset: TimePreset | null;
  activeColor: string;
  onSelect: (p: TimePreset) => void;
  smartLabel: string;
}) {
  const chips: { key: TimePreset; label: string; icon: IconSymbolName }[] = [
    { key: "now",    label: "Now",       icon: "bolt.fill"               },
    { key: "plus15", label: "+15 min",   icon: "clock.arrow.circlepath"  },
    { key: "smart",  label: smartLabel,  icon: "star.fill"               },
    { key: "custom", label: "Custom",    icon: "pencil"                  },
  ];
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
      {chips.map((c) => {
        const active = preset === c.key;
        return (
          <TouchableOpacity key={c.key} onPress={() => onSelect(c.key)}
            style={{ flex: 1, flexDirection: "column", alignItems: "center", paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
              backgroundColor: active ? activeColor + "20" : CARD_BG,
              borderColor: active ? activeColor : CARD_BORDER,
            }}
          >
            <IconSymbol name={c.icon} size={13} color={active ? activeColor : TX2} />
            <Text style={{ fontSize: 9, fontWeight: "700", color: active ? activeColor : TX2, marginTop: 3, textAlign: "center" }}>{c.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PriceSlider({ min, max, value, panHandler, anim, color, label, trackWidth }: {
  min: number; max: number; value: number;
  panHandler: ReturnType<typeof PanResponder.create>;
  anim: AnimVal;
  color: string;
  label: string;
  trackWidth: number;
}) {
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const thumbLeft = ratio * Math.max(trackWidth - 24, 0);
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: TX3, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</Text>
        <Text style={{ fontSize: 20, fontWeight: "900", color }}>${value.toFixed(2)}</Text>
      </View>
      <View style={{ height: 40, justifyContent: "center" }} {...panHandler.panHandlers}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: CARD_BORDER, overflow: "hidden" }}>
          <Animated.View style={{ height: "100%", backgroundColor: color,
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
        </View>
        <View style={{ position: "absolute", left: thumbLeft, top: 10, width: 20, height: 20, borderRadius: 10,
          backgroundColor: color, borderWidth: 2.5, borderColor: TX,
          shadowColor: color, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
        <Text style={{ fontSize: 10, color: TX3 }}>${min}</Text>
        <Text style={{ fontSize: 10, color: TX3 }}>${max}</Text>
      </View>
    </View>
  );
}

function SafetyPills({ mode, onChange, opts = SAFETY_OPTS }: { mode: SafetyMode; onChange: (m: SafetyMode) => void; opts?: typeof SAFETY_OPTS }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
      {opts.map((o) => {
        const active = mode === o.value;
        return (
          <TouchableOpacity key={o.value} onPress={() => onChange(o.value)}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20,
              borderWidth: 1.5, backgroundColor: active ? o.color + "20" : CARD_BG, borderColor: active ? o.color : CARD_BORDER }}
          >
            <IconSymbol name={o.icon} size={12} color={active ? o.color : TX3} />
            <Text style={{ fontSize: 11, fontWeight: "700", color: active ? o.color : TX3 }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TimeInputRow({ depHour, depMinute, depAmPm, activeColor, setDepHour, setDepMinute, setDepAmPm }: {
  depHour: string; depMinute: string; depAmPm: "AM" | "PM"; activeColor: string;
  setDepHour: (v: string) => void; setDepMinute: (v: string) => void; setDepAmPm: (v: "AM" | "PM") => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={st.label}>Hour</Text>
        <TextInput value={depHour}
          onChangeText={(v: string) => { const c = v.replace(/\D/g, "").slice(0, 2); const n = parseInt(c); if (c === "" || (n >= 0 && n <= 12)) setDepHour(c); }}
          keyboardType="number-pad" placeholder="HH" placeholderTextColor={TX2} maxLength={2}
          style={[st.timeInput, { borderColor: depHour ? activeColor : CARD_BORDER }]} />
      </View>
      <Text style={{ fontSize: 28, fontWeight: "800", color: TX, marginTop: 14 }}>:</Text>
      <View style={{ flex: 1 }}>
        <Text style={st.label}>Min</Text>
        <TextInput value={depMinute}
          onChangeText={(v: string) => { const c = v.replace(/\D/g, "").slice(0, 2); const n = parseInt(c); if (c === "" || (n >= 0 && n <= 59)) setDepMinute(c); }}
          keyboardType="number-pad" placeholder="MM" placeholderTextColor={TX2} maxLength={2}
          style={[st.timeInput, { borderColor: depMinute ? activeColor : CARD_BORDER }]} />
      </View>
      <View style={{ flex: 1.2 }}>
        <Text style={st.label}>Period</Text>
        <View style={{ flexDirection: "row", borderWidth: 1.5, borderRadius: 10, borderColor: CARD_BORDER, backgroundColor: CARD_BG, padding: 3, gap: 2 }}>
          {(["AM", "PM"] as const).map((p) => (
            <TouchableOpacity key={p} onPress={() => setDepAmPm(p)}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 8, backgroundColor: depAmPm === p ? activeColor : "transparent" }}>
              <Text style={{ fontSize: 14, fontWeight: "800", color: depAmPm === p ? TX : TX3 }}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function CreateRideScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { flow, communityId: communityIdParam } = useLocalSearchParams<{ flow?: string; communityId?: string }>();
  const presetCommunityId = communityIdParam ? Number(communityIdParam) : null;
  const isPostFlow = flow === "post";
  const isFindDriverFlow = flow === "find-driver" || flow === "broadcast";
  // find-driver is always passenger-only; post flow unlocks for approved drivers
  const lockedPassengerFlow = isFindDriverFlow;
  const { state } = useRides();
  const { user } = useAuth();
  const isFemale = user?.gender === "female";
  const visibleSafetyOpts = isFemale ? SAFETY_OPTS : SAFETY_OPTS.filter(o => o.value === "none");
  const draftPickup  = state.bookingDraft.pickup  as RideLocation | null;
  const draftDropoff = state.bookingDraft.dropoff as RideLocation | null;

  // Driver role gating — unified access check
  const { canAccessDriverMode: isApprovedDriver, isLoading: driverStatusLoading } = useDriverAccess(true);

  // Start as driver unless URL locks passenger Post-a-Ride / Find-a-Driver flow
  const [role, setRole] = useState<Role>(lockedPassengerFlow ? "passenger" : "driver");
  // passenger sub-mode: "organize" = post a group ride, "book" = broadcast to nearby drivers
  const [passengerMode, setPassengerMode] = useState<"organize" | "book">(
    isFindDriverFlow ? "book" : "organize",
  );
  useEffect(() => {
    if (isFindDriverFlow) {
      setRole("passenger");
      setPassengerMode("book");
    } else if (isPostFlow) {
      // Post-a-Ride: always start in passenger/organize mode.
      // Approved drivers can switch via the toggle; non-approved stay here.
      setPassengerMode("organize");
      setRole("passenger");
    }
  }, [isPostFlow, isFindDriverFlow]);
  useEffect(() => {
    if (lockedPassengerFlow) return; // find-driver always passenger
    if (isPostFlow) return;          // post flow: let driver toggle decide
    if (!driverStatusLoading && !isApprovedDriver) setRole("passenger");
  }, [driverStatusLoading, isApprovedDriver, lockedPassengerFlow, isPostFlow]);

  // Route
  const [pickup,       setPickup]       = useState<RideLocation | null>(draftPickup);
  const [dropoff,      setDropoff]      = useState<RideLocation | null>(draftDropoff);
  const [pickupQuery,  setPickupQuery]  = useState(draftPickup?.shortName ?? "");
  const [dropoffQuery, setDropoffQuery] = useState(draftDropoff?.shortName ?? "");
  const [activeField,  setActiveField]  = useState<"pickup" | "dropoff" | null>(null);
  const [userLoc,      setUserLoc]      = useState<{ lat: number; lng: number } | null>(null);
  const [distanceKm,   setDistanceKm]   = useState(0);
  const [estMins,      setEstMins]      = useState(0);
  const [soloFare,     setSoloFare]     = useState(0);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);

  // Shared form
  const [title,  setTitle]  = useState(() => draftPickup && draftDropoff ? `${draftPickup.shortName} → ${draftDropoff.shortName}` : "");
  const [depHour,      setDepHour]      = useState("");
  const [depMinute,    setDepMinute]    = useState("00");
  const [depAmPm,      setDepAmPm]      = useState<"AM" | "PM">("AM");
  const [depDayOffset, setDepDayOffset] = useState(0); // 0=today,1=tomorrow,2,3
  const [depIso,       setDepIso]       = useState("");
  const [timePreset,   setTimePreset]   = useState<TimePreset | null>(null);
  const [safetyMode,        setSafetyMode]        = useState<SafetyMode>("none");

  // Driver
  const [totalSeats,       setTotalSeats]       = useState(3);
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [pricePerSeat,     setPricePerSeat]     = useState("5");
  const [priceEdited,      setPriceEdited]      = useState(false);

  // Passenger
  const [passengerCount, setPassengerCount] = useState(1);
  const [offerPrice,     setOfferPrice]     = useState("8");
  const [offerEdited,    setOfferEdited]    = useState(false);

  // Organizer extended fields
  const [rideNotes,                setRideNotes]                = useState("");
  const [luggageAllowed,           setLuggageAllowed]           = useState<"none" | "small" | "medium" | "large">("small");
  const [genderPreference,         setGenderPreference]         = useState<"any" | "female_only" | "male_only">("any");
  const [flexibleDepartureMinutes, setFlexibleDepartureMinutes] = useState(0);
  const [quietRide,                setQuietRide]                = useState(false);
  const [stopovers,                setStopovers]                = useState<string[]>([]);
  const [stopoverInput,            setStopoverInput]            = useState("");

  // Community ride visibility
  const [rideVisibility, setRideVisibility] = useState<"public" | "community">(
    presetCommunityId ? "community" : "public",
  );
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | null>(
    Number.isFinite(presetCommunityId) && presetCommunityId! > 0 ? presetCommunityId : null,
  );
  const { data: myCommunities = [] } = trpc.communities.listMyCommunities.useQuery(
    { limit: 50 },
    { staleTime: 60_000 },
  );
  const activeCommunities = (myCommunities as any[]).filter((c) => c.membershipStatus === "active");

  // Success popup only used by Find-a-Driver broadcast (removed — direct nav instead)

  // Autocomplete
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slider state & refs
  const [sliderTrackWidth, setSliderTrackWidth] = useState(280);
  const sliderWidthRef   = useRef(280);
  const priceStartRef    = useRef(5);
  const offerStartRef    = useRef(8);
  const priceSliderAnim  = useRef(new Animated.Value(
    (5 - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)
  )).current;
  const offerSliderAnim  = useRef(new Animated.Value(
    (8 - OFFER_MIN) / (OFFER_MAX - OFFER_MIN)
  )).current;

  // Keep refs current so PanResponder closures are fresh
  useEffect(() => { priceStartRef.current = parseFloat(pricePerSeat) || PRICE_MIN; }, [pricePerSeat]);
  useEffect(() => { offerStartRef.current = parseFloat(offerPrice) || OFFER_MIN; }, [offerPrice]);

  // Sync slider anims when price changes from outside (suggestion button, route estimate)
  useEffect(() => {
    const r = (parseFloat(pricePerSeat) - PRICE_MIN) / (PRICE_MAX - PRICE_MIN);
    priceSliderAnim.setValue(Math.max(0, Math.min(1, r)));
  }, [pricePerSeat]); // eslint-disable-line react-hooks/exhaustive-deps -- priceSliderAnim is a stable Animated.Value ref
  useEffect(() => {
    const r = (parseFloat(offerPrice) - OFFER_MIN) / (OFFER_MAX - OFFER_MIN);
    offerSliderAnim.setValue(Math.max(0, Math.min(1, r)));
  }, [offerPrice]); // eslint-disable-line react-hooks/exhaustive-deps -- offerSliderAnim is a stable Animated.Value ref

  const pricePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e: any, gs: any) => {
        const delta = (gs.dx / sliderWidthRef.current) * (PRICE_MAX - PRICE_MIN);
        const val   = Math.round(Math.max(PRICE_MIN, Math.min(PRICE_MAX, priceStartRef.current + delta)) * 2) / 2;
        const ratio = (val - PRICE_MIN) / (PRICE_MAX - PRICE_MIN);
        priceSliderAnim.setValue(ratio);
        setPricePerSeat(String(val));
        setPriceEdited(true);
      },
    })
  ).current;

  const offerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e: any, gs: any) => {
        const delta = (gs.dx / sliderWidthRef.current) * (OFFER_MAX - OFFER_MIN);
        const val   = Math.round(Math.max(OFFER_MIN, Math.min(OFFER_MAX, offerStartRef.current + delta)) * 2) / 2;
        const ratio = (val - OFFER_MIN) / (OFFER_MAX - OFFER_MIN);
        offerSliderAnim.setValue(ratio);
        setOfferPrice(String(val));
        setOfferEdited(true);
      },
    })
  ).current;

  // Animations
  const pulseAnim     = useRef(new Animated.Value(1)).current;
  const toggleSlide   = useRef(new Animated.Value(0)).current;
  const roleColorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    ExpoLocation.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== "granted") return;
      ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
        .then(pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
        .catch(() => {});
    });
  }, []);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.03, duration: 1200, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- pulseAnim is a stable Animated.Value ref

  useEffect(() => {
    const v = role === "driver" ? 0 : 1;
    Animated.spring(toggleSlide,   { toValue: v, useNativeDriver: false, tension: 120, friction: 10 }).start();
    Animated.spring(roleColorAnim, { toValue: v, useNativeDriver: false, tension: 80,  friction: 12 }).start();
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps -- toggleSlide and roleColorAnim are stable Animated.Value refs

  useEffect(() => {
    const h = parseInt(depHour);
    if (h >= 1 && h <= 12) setDepIso(buildIso(depHour, depMinute, depAmPm, depDayOffset));
    else setDepIso("");
  }, [depHour, depMinute, depAmPm, depDayOffset]);

  useEffect(() => {
    if (soloFare > 0 && !priceEdited) setPricePerSeat(String(suggestedPrice(soloFare, totalSeats)));
  }, [totalSeats, soloFare, priceEdited]);

  useEffect(() => {
    if (soloFare > 0 && !offerEdited) setOfferPrice(String(Math.round(soloFare * 0.85 * 100) / 100));
  }, [soloFare, offerEdited]);

  useEffect(() => {
    if (!pickup || !dropoff) return;
    setDistanceKm(0);
    setEstMins(0);
    setRoutePolyline(null);
    fetch(`${BASE}/api/maps/route-estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originLat: pickup.lat, originLng: pickup.lng, destinationLat: dropoff.lat, destinationLng: dropoff.lng }),
    })
      .then(r => r.json())
      .then((res: { distanceKm: number; durationMin: number; polyline?: string | null }) => {
        const km   = Math.round(res.distanceKm * 10) / 10;
        const mins = Math.round(res.durationMin);
        setDistanceKm(km);
        setEstMins(mins);
        setRoutePolyline(res.polyline ?? null);
        const fare = estimateSoloFare(km, mins);
        setSoloFare(fare);
        if (!title.trim()) setTitle(`${pickup.shortName} → ${dropoff.shortName}`);
        if (!priceEdited) setPricePerSeat(String(suggestedPrice(fare, totalSeats)));
      })
      .catch(() => {});
  }, [pickup, dropoff]); // eslint-disable-line react-hooks/exhaustive-deps -- priceEdited/title/totalSeats intentionally omitted; adding would re-fetch on every price/title change

  useEffect(() => {
    const query = activeField === "pickup" ? pickupQuery : dropoffQuery;
    if (query.length < 2) { setSuggestions([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const refLat = (activeField === "pickup" ? dropoff?.lat : pickup?.lat) ?? userLoc?.lat;
        const refLng = (activeField === "pickup" ? dropoff?.lng : pickup?.lng) ?? userLoc?.lng;
        let url = `${BASE}/api/maps/autocomplete?q=${encodeURIComponent(query)}`;
        if (refLat != null && refLng != null) url += `&lat=${refLat}&lng=${refLng}`;
        const token = await getSessionToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(url, { headers });
        if (__DEV__ && !res.ok) console.warn("[autocomplete] non-OK response", res.status);
        setSuggestions(res.ok ? await res.json() : []);
      } catch { setSuggestions([]); }
      finally { setIsSearching(false); }
    }, 350);
  }, [pickupQuery, dropoffQuery, activeField]); // eslint-disable-line react-hooks/exhaustive-deps -- pickup/dropoff/userLoc intentionally omitted; adding would re-fire autocomplete on GPS updates

  const handleSelectSuggestion = useCallback(async (raw: any) => {
    setIsSearching(true);
    setSuggestions([]);
    const field = activeField;
    try {
      const placeId: string = raw.placeId ?? "";
      let loc: RideLocation;
      if (placeId.startsWith("photon:") || placeId.startsWith("nominatim:")) {
        const parts = placeId.split(":");
        if (parts.length < 5) throw new Error("bad placeId");
        loc = { address: raw.fullText || raw.primaryText, lat: parseFloat(parts[3]), lng: parseFloat(parts[4]), shortName: raw.primaryText || raw.fullText };
      } else {
        const token = await getSessionToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${BASE}/api/maps/place-details?placeId=${encodeURIComponent(placeId)}`, { headers });
        if (!res.ok) throw new Error("details failed");
        const d = await res.json();
        loc = { address: d.address, lat: d.lat, lng: d.lng, shortName: d.shortName };
      }
      if (field === "pickup")  { setPickup(loc);  setPickupQuery(loc.shortName); }
      else                     { setDropoff(loc); setDropoffQuery(loc.shortName); }
      setActiveField(null);
    } catch {
      const fb = raw.fullText ?? raw.primaryText ?? "";
      if (fb) { if (field === "pickup") setPickupQuery(fb); else setDropoffQuery(fb); }
    } finally { setIsSearching(false); }
  }, [activeField]);

  const applyTimePreset = (preset: TimePreset) => {
    setTimePreset(preset);
    const today = new Date().toDateString();
    if (preset === "now") {
      const d = new Date(Date.now() + 6 * 60 * 1000);
      const h = d.getHours(); const m = d.getMinutes();
      const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12;
      setDepHour(String(h12)); setDepMinute(m < 10 ? `0${m}` : String(m)); setDepAmPm(ampm);
      setDepDayOffset(d.toDateString() === today ? 0 : 1);
    } else if (preset === "plus15") {
      const d = new Date(Date.now() + 15 * 60 * 1000);
      const h = d.getHours(); const m = d.getMinutes();
      const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12;
      setDepHour(String(h12)); setDepMinute(m < 10 ? `0${m}` : String(m)); setDepAmPm(ampm);
      setDepDayOffset(d.toDateString() === today ? 0 : 1);
    } else if (preset === "smart") {
      const s = smartTime();
      setDepHour(s.hour); setDepMinute(s.minute); setDepAmPm(s.ampm);
      // smart time may be tomorrow if it's already late
      setDepDayOffset(s.label.startsWith("Tmrw") ? 1 : 0);
    }
  };

  // tRPC
  const createCarpool = trpc.carpool.createCarpool.useMutation();
  const createRequest = trpc.passengerRequest.create.useMutation();
  const postPassengerRide = trpc.rides.postPassengerRide.useMutation();

  const handleDriverSubmit = () => {
    if (!pickup)  return showAlert("Missing", "Set your pickup location");
    if (!dropoff) return showAlert("Missing", "Set your destination");
    if (!depIso)  return showAlert("Missing", "Select a departure time");
    const depDate = new Date(depIso);
    if (isNaN(depDate.getTime()) || depDate.getTime() < Date.now() + 5 * 60 * 1000)
      return showAlert("Invalid Time", "Departure must be at least 5 minutes from now");
    if (!title.trim()) return showAlert("Missing", "Enter a ride title");
    const price = parseFloat(pricePerSeat);
    if (isNaN(price) || price < 1) return showAlert("Invalid Price", "Price per seat must be at least $1");
    createCarpool.mutate(
      { title: title.trim(), pickupLat: pickup.lat, pickupLng: pickup.lng, pickupAddress: pickup.address,
        dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, dropoffAddress: dropoff.address,
        distanceKm: distanceKm || 10, estimatedMinutes: estMins || 30,
        departureTime: depIso, pricePerSeat: price, totalSeats, safetyMode, approvalRequired,
        posterRole: "driver",
        communityId: rideVisibility === "community" ? selectedCommunityId ?? undefined : undefined },
      { onSuccess: () => router.replace("/(tabs)/rides" as Href), onError: (err: any) => showAlert("Error", err.message) }
    );
  };

  const handleOrganizerSubmit = () => {
    if (!pickup)  return showAlert("Missing", "Set your pickup location");
    if (!dropoff) return showAlert("Missing", "Set your destination");
    if (distanceKm === 0 || estMins === 0) return showAlert("Please wait", "Route is still calculating. Try again in a moment.");
    if (!depIso)  return showAlert("Missing", "Select a departure time");
    const depDate = new Date(depIso);
    if (isNaN(depDate.getTime()) || depDate.getTime() < Date.now() + 5 * 60 * 1000)
      return showAlert("Invalid Time", "Departure must be at least 5 minutes from now");
    if (!title.trim()) return showAlert("Missing", "Enter a ride title");
    const price = parseFloat(pricePerSeat);
    if (isNaN(price) || price < 1) return showAlert("Invalid Price", "Price per seat must be at least $1");
    if (rideVisibility === "community" && !selectedCommunityId) {
      return showAlert("Community required", "Select a community for this ride");
    }
    // Passenger Post-a-Ride: rides table record, no broadcast request
    postPassengerRide.mutate(
      {
        pickupLat: pickup.lat, pickupLng: pickup.lng, pickupAddress: pickup.address,
        dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, dropoffAddress: dropoff.address,
        distanceKm,
        estimatedMinutes: estMins,
        scheduledFor: depIso,
        mode: "share",
        seatsRequested: totalSeats,
        fareOffered: price,
        approvalRequired,
        notes: rideNotes.trim() || undefined,
        title: title.trim() || undefined,
        safetyMode,
        luggageAllowed,
        genderPreference,
        flexibleDepartureMinutes,
        quietRide,
        stopoverAddresses: stopovers.length > 0 ? stopovers : undefined,
        routePolyline: routePolyline ?? undefined,
        communityId: rideVisibility === "community" ? selectedCommunityId ?? undefined : undefined,
      },
      {
        onSuccess: () => {
          void utils.rides.myRides.invalidate();
          useToastStore.getState().show("Ride posted successfully", "success");
          router.replace("/(tabs)/rides" as Href);
        },
        onError: (err: any) => showAlert("Error", err.message),
      }
    );
  };

  const handlePassengerSubmit = () => {
    if (!pickup)  return showAlert("Missing", "Set your pickup location");
    if (!dropoff) return showAlert("Missing", "Set your destination");
    if (!depIso)  return showAlert("Missing", "Select a departure time");
    const depDate = new Date(depIso);
    if (isNaN(depDate.getTime()) || depDate.getTime() < Date.now() + 5 * 60 * 1000)
      return showAlert("Invalid Time", "Departure must be at least 5 minutes from now");
    if (!title.trim()) return showAlert("Missing", "Enter a ride title");
    const price = parseFloat(offerPrice);
    if (isNaN(price) || price < 1) return showAlert("Invalid Price", "Offer price must be at least $1");
    createRequest.mutate(
      { pickupLat: pickup.lat, pickupLng: pickup.lng, pickupAddress: pickup.address,
        dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, dropoffAddress: dropoff.address,
        passengerCount, offerPrice: price,
        distanceKm: distanceKm || undefined, estimatedMinutes: estMins || undefined, radiusKm: 5 },
      {
        onSuccess: (data: { requestId: string; rideId?: string }) => {
          void utils.passengerRequest.getMyActiveRequests.invalidate();
          router.replace(
            `/ride-requested?requestId=${data.requestId}&pickupName=${encodeURIComponent(pickup?.shortName ?? "")}&dropoffName=${encodeURIComponent(dropoff?.shortName ?? "")}` as Href,
          );
        },
        onError: (err: any) => showAlert("Error", err.message),
      }
    );
  };

  // Derived
  const price          = parseFloat(pricePerSeat) || 0;
  const totalCollected = price * totalSeats;
  const driverEarns    = Math.round(totalCollected * 0.8 * 100) / 100;
  const offer          = parseFloat(offerPrice) || 0;
  const isOrganizerMode = role === "passenger" && passengerMode === "organize";
  const driverSteps    = [!!pickup, !!dropoff, !!depIso, !!title.trim(), price >= 1].filter(Boolean).length;
  const passSteps      = isOrganizerMode
    ? [!!pickup, !!dropoff, !!depIso, !!title.trim(), price >= 1].filter(Boolean).length
    : [!!pickup, !!dropoff, !!depIso, !!title.trim(), offer >= 1].filter(Boolean).length;
  const isReady        = role === "driver"
    ? driverSteps === 5
    : isOrganizerMode
      ? !!pickup && !!dropoff && distanceKm > 0 && !!depIso && !!title.trim() && price >= 1
      : !!pickup && !!dropoff && !!depIso && !!title.trim() && offer >= 1;
  const accent         = role === "driver" ? DC : PC;
  const steps          = role === "driver" ? driverSteps : passSteps;
  const headerBg       = roleColorAnim.interpolate({ inputRange: [0, 1], outputRange: [DC, PC] });

  // ── Main form ──────────────────────────────────────────────────────────
  const smart = smartTime();

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <View style={{ flex: 1, backgroundColor: BG }}>

        {/* Radial glow */}
        <View style={{ position: "absolute", top: -80, right: -80, width: 280, height: 280, borderRadius: 140,
          backgroundColor: accent + "12", transform: [{ scaleX: 1.4 }] }} pointerEvents="none" />

        {/* Header */}
        <Animated.View style={{ paddingTop: 10, paddingBottom: 18, paddingHorizontal: 16, backgroundColor: headerBg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity style={st.iconBtn} onPress={() => router.back()}>
              <IconSymbol name="arrow.left" size={20} color={TX} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={st.headerTitle}>
                {role === "driver" ? "Driver · Offer a Ride" : isOrganizerMode ? "Passenger · Post a Ride" : "Request a Ride"}
              </Text>
              <Text style={st.headerSub}>
                {role === "driver" ? "Offer seats & earn by sharing your route" : isOrganizerMode ? "Organize a group trip · split the cost" : "Broadcast to nearby drivers"}
              </Text>
            </View>
            <View style={st.iconBtn}>
              <IconSymbol name={role === "driver" ? "car.2.fill" : "person.fill"} size={18} color={TX} />
            </View>
          </View>
        </Animated.View>

        {/* Role Toggle — find-driver locks to passenger; post-a-ride unlocks for approved drivers */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
          {lockedPassengerFlow ? (
            <View style={{ height: 46, borderRadius: 13, backgroundColor: PC, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <IconSymbol name="person.fill" size={14} color={TX} />
              <Text style={{ fontSize: 13, fontWeight: "800", color: TX }}>Passenger · Find a Driver</Text>
            </View>
          ) : isApprovedDriver ? (
            /* ── Approved driver: full Driver / Passenger toggle ── */
            <View style={{ height: 46, borderRadius: 13, borderWidth: 1.5, borderColor: CARD_BORDER, backgroundColor: CARD_BG, flexDirection: "row", position: "relative", overflow: "hidden" }}>
              <Animated.View style={{ position: "absolute", top: 3, bottom: 3, width: "48%", borderRadius: 10,
                backgroundColor: roleColorAnim.interpolate({ inputRange: [0, 1], outputRange: [DC, PC] }),
                left: toggleSlide.interpolate({ inputRange: [0, 1], outputRange: ["2%", "51%"] }),
              }} />
              <TouchableOpacity style={st.toggleOpt} onPress={() => setRole("driver")} activeOpacity={0.8}>
                <IconSymbol name="steeringwheel" size={14} color={role === "driver" ? TX : TX3} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: role === "driver" ? TX : TX3, marginLeft: 6 }}>Driver</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.toggleOpt} onPress={() => setRole("passenger")} activeOpacity={0.8}>
                <IconSymbol name="person.fill" size={14} color={role === "passenger" ? TX : TX3} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: role === "passenger" ? TX : TX3, marginLeft: 6 }}>Passenger</Text>
              </TouchableOpacity>
            </View>
          ) : !driverStatusLoading ? (
            /* ── Non-driver: passenger-only pill + "Become a Driver" CTA ── */
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, height: 46, borderRadius: 13, backgroundColor: PC, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <IconSymbol name="person.fill" size={14} color={TX} />
                <Text style={{ fontSize: 13, fontWeight: "800", color: TX }}>Passenger Mode</Text>
              </View>
              <TouchableOpacity
                style={{ height: 46, borderRadius: 13, borderWidth: 1.5, borderColor: DC + "55", paddingHorizontal: 14, justifyContent: "center", backgroundColor: DC + "10" }}
                onPress={() => router.push("/driver-onboarding" as Href)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 11, fontWeight: "800", color: DC }}>Become a{"\n"}Driver →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Loading: skeleton placeholder ── */
            <View style={{ height: 46, borderRadius: 13, backgroundColor: CARD_BG, borderWidth: 1.5, borderColor: CARD_BORDER }} />
          )}
        </View>

        {/* Step bar */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 20, paddingVertical: 10 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < steps ? accent : CARD_BORDER }} />
          ))}
          <Text style={{ fontSize: 11, color: TX2, marginLeft: 8, fontWeight: "600" }}>{steps}/5</Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onLayout={(e: any) => {
            const w = e.nativeEvent.layout.width - 32 - 20;
            setSliderTrackWidth(w);
            sliderWidthRef.current = w;
          }}
        >
          {/* ── Route Card ────────────────────────────────────────────── */}
          <View style={st.card}>
            <View style={st.cardHeader}>
              <View style={[st.cardIcon, { backgroundColor: accent + "20" }]}>
                <IconSymbol name="map.fill" size={16} color={accent} />
              </View>
              <Text style={st.cardTitle}>Route</Text>
              {pickup && dropoff && (
                <View style={[st.badge, { backgroundColor: PC + "20" }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PC }} />
                  <Text style={{ fontSize: 10, fontWeight: "700", color: PC }}>Set</Text>
                </View>
              )}
            </View>

            {/* Title */}
            <View style={{ marginBottom: 12 }}>
              <Text style={st.label}>Ride Name</Text>
              <TextInput value={title} onChangeText={setTitle}
                placeholder={role === "driver" ? "e.g. Daily NJIT Commute" : "e.g. Morning ride to campus"}
                placeholderTextColor={TX2} maxLength={80}
                style={[st.input, { borderColor: title.trim() ? accent + "40" : CARD_BORDER }]} />
            </View>

            {/* Pickup / Dropoff */}
            <View style={{ position: "relative" }}>
              <View style={{ position: "absolute", left: 14, top: 42, bottom: 42, width: 2, backgroundColor: CARD_BORDER, zIndex: 0 }} />

              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, zIndex: 2 }}>
                <View style={[st.dot, { backgroundColor: PC, shadowColor: PC, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }]}>
                  <View style={st.dotInner} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.label}>Pickup</Text>
                  <TextInput value={pickupQuery}
                    onChangeText={(t: string) => { setPickupQuery(t); setActiveField("pickup"); }}
                    onFocus={() => setActiveField("pickup")}
                    placeholder="Where are you starting?"
                    placeholderTextColor={TX2}
                    style={[st.input, {
                      borderColor: activeField === "pickup" ? PC : pickup ? PC + "40" : CARD_BORDER,
                      backgroundColor: activeField === "pickup" ? PC + "08" : CARD_BG,
                    }]} />
                </View>
                {pickup && <View style={{ marginTop: 16 }}><IconSymbol name="checkmark.circle.fill" size={20} color={PC} /></View>}
              </View>
              {activeField === "pickup" && (
                <View style={{ marginLeft: 40, zIndex: 10 }}>
                  <SuggestionList suggestions={suggestions} isSearching={isSearching} onSelect={handleSelectSuggestion} accent={accent} />
                </View>
              )}

              <View style={{ alignItems: "center", zIndex: 3, marginVertical: 2 }}>
                <TouchableOpacity style={[st.swapBtn]}
                  onPress={() => { setPickup(dropoff); setDropoff(pickup); setPickupQuery(dropoffQuery); setDropoffQuery(pickupQuery); }}>
                  <IconSymbol name="arrow.up.arrow.down" size={14} color={TX3} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, zIndex: 2 }}>
                <View style={[st.dot, { backgroundColor: ERR, shadowColor: ERR, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }]}>
                  <View style={st.dotInner} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.label}>Destination</Text>
                  <TextInput value={dropoffQuery}
                    onChangeText={(t: string) => { setDropoffQuery(t); setActiveField("dropoff"); }}
                    onFocus={() => setActiveField("dropoff")}
                    placeholder="Where are you going?"
                    placeholderTextColor={TX2}
                    style={[st.input, {
                      borderColor: activeField === "dropoff" ? ERR : dropoff ? ERR + "40" : CARD_BORDER,
                      backgroundColor: activeField === "dropoff" ? ERR + "08" : CARD_BG,
                    }]} />
                </View>
                {dropoff && <View style={{ marginTop: 16 }}><IconSymbol name="checkmark.circle.fill" size={20} color={PC} /></View>}
              </View>
              {activeField === "dropoff" && (
                <View style={{ marginLeft: 40, zIndex: 10 }}>
                  <SuggestionList suggestions={suggestions} isSearching={isSearching} onSelect={handleSelectSuggestion} accent={accent} />
                </View>
              )}
            </View>

            {pickup && dropoff && distanceKm > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, borderWidth: 1, borderRadius: 10, padding: 10, borderColor: accent + "20", backgroundColor: accent + "06" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: accent + "15" }}>
                  <IconSymbol name="road.lanes" size={12} color={accent} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: accent }}>{distanceKm} km</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: WARN + "15" }}>
                  <IconSymbol name="clock.fill" size={12} color={WARN} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: WARN }}>~{estMins} min</Text>
                </View>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 11, color: TX3 }}>Solo: <Text style={{ fontWeight: "800", color: WARN }}>${soloFare.toFixed(2)}</Text></Text>
              </View>
            )}
          </View>

          {/* Ride visibility — shared for driver + passenger organizer */}
          {(role === "driver" || isOrganizerMode) && (
            <View style={st.card}>
              <View style={st.cardHeader}>
                <View style={[st.cardIcon, { backgroundColor: BLUE + "20" }]}>
                  <IconSymbol name="person.3.fill" size={16} color={BLUE} />
                </View>
                <Text style={st.cardTitle}>Ride Visibility</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: rideVisibility === "community" ? 12 : 0 }}>
                {(["public", "community"] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    onPress={() => setRideVisibility(v)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: rideVisibility === v ? BLUE : CARD_BORDER,
                      backgroundColor: rideVisibility === v ? BLUE + "18" : "transparent",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: rideVisibility === v ? BLUE : TX2, fontWeight: "700", fontSize: 13, textTransform: "capitalize" }}>
                      {v === "public" ? "Public" : "Community"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {rideVisibility === "community" && (
                activeCommunities.length === 0 ? (
                  <Text style={{ fontSize: 12, color: WARN }}>
                    Join a community first to post community-only rides.
                  </Text>
                ) : (
                  <View style={{ gap: 6 }}>
                    {activeCommunities.map((c: { id: number; name: string }) => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setSelectedCommunityId(c.id)}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: selectedCommunityId === c.id ? BLUE : CARD_BORDER,
                          backgroundColor: selectedCommunityId === c.id ? BLUE + "12" : "transparent",
                        }}
                      >
                        <Text style={{ color: TX, fontWeight: "600", fontSize: 13 }}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              )}
            </View>
          )}

          {/* ── Driver cards ──────────────────────────────────────────── */}
          {role === "driver" && (
            <>
              {/* Departure time */}
              <View style={st.card}>
                <View style={st.cardHeader}>
                  <View style={[st.cardIcon, { backgroundColor: WARN + "20" }]}>
                    <IconSymbol name="clock.fill" size={16} color={WARN} />
                  </View>
                  <Text style={st.cardTitle}>Departure Time</Text>
                  {depIso && <View style={[st.badge, { backgroundColor: PC + "20" }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PC }} /><Text style={{ fontSize: 10, fontWeight: "700", color: PC }}>Set</Text></View>}
                </View>
                {/* Date chips */}
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
                  {[
                    { offset: 0, label: "Today" },
                    { offset: 1, label: "Tomorrow" },
                    { offset: 2, label: new Date(Date.now() + 2 * 86_400_000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) },
                    { offset: 3, label: new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) },
                  ].map((c) => (
                    <TouchableOpacity key={c.offset} onPress={() => setDepDayOffset(c.offset)}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10, borderWidth: 1.5,
                        backgroundColor: depDayOffset === c.offset ? DC + "20" : CARD_BG,
                        borderColor: depDayOffset === c.offset ? DC : CARD_BORDER }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: depDayOffset === c.offset ? DC : TX2, textAlign: "center" }}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TimeChips preset={timePreset} activeColor={DC} onSelect={applyTimePreset} smartLabel={smart.label} />
                {(timePreset === "custom" || timePreset === null) && (
                  <TimeInputRow depHour={depHour} depMinute={depMinute} depAmPm={depAmPm} activeColor={DC}
                    setDepHour={setDepHour} setDepMinute={setDepMinute} setDepAmPm={setDepAmPm} />
                )}
                {depIso ? (() => {
                  const d = new Date(depIso); const past = d.getTime() < Date.now() + 5 * 60 * 1000;
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8, backgroundColor: past ? ERR + "08" : DC + "08", borderColor: past ? ERR + "30" : DC + "20" }}>
                      <IconSymbol name={past ? "exclamationmark.triangle.fill" : "clock.fill"} size={14} color={past ? ERR : DC} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: past ? ERR : DC, marginLeft: 6, flex: 1 }}>
                        {past ? "Time is in the past — pick a future time" : `Departing ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`}
                      </Text>
                    </View>
                  );
                })() : (
                  <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8, backgroundColor: WARN + "08", borderColor: WARN + "20" }}>
                    <IconSymbol name="info.circle.fill" size={14} color={WARN} />
                    <Text style={{ fontSize: 12, color: WARN, marginLeft: 6 }}>Tap a chip above or enter custom time</Text>
                  </View>
                )}
              </View>

              {/* Seats & Pricing */}
              <View style={st.card}>
                <View style={st.cardHeader}>
                  <View style={[st.cardIcon, { backgroundColor: PC + "20" }]}>
                    <IconSymbol name="dollarsign.circle.fill" size={16} color={PC} />
                  </View>
                  <Text style={st.cardTitle}>Seats & Pricing</Text>
                </View>

                <Text style={[st.label, { marginBottom: 8 }]}>Available Seats</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                  {[1, 2, 3].map((s) => (
                    <TouchableOpacity key={s} onPress={() => setTotalSeats(s)}
                      style={{ flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: "center",
                        backgroundColor: totalSeats === s ? DC + "20" : CARD_BG, borderColor: totalSeats === s ? DC : CARD_BORDER }}>
                      <Text style={{ fontSize: 20, fontWeight: "800", color: totalSeats === s ? DC : TX }}>{s}</Text>
                      <Text style={{ fontSize: 9, color: totalSeats === s ? DC + "AA" : TX3 }}>{s === 1 ? "seat" : "seats"}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <PriceSlider min={PRICE_MIN} max={PRICE_MAX} value={price} panHandler={pricePanResponder}
                  anim={priceSliderAnim} color={DC} label="Price Per Seat" trackWidth={sliderTrackWidth} />

                <View style={{ borderWidth: 1, borderRadius: 12, padding: 14, borderColor: CARD_BORDER, backgroundColor: "rgba(0,0,0,0.2)", marginTop: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: TX3, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Earnings Breakdown</Text>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: CARD_BORDER, overflow: "hidden", flexDirection: "row", marginBottom: 12 }}>
                    <View style={{ flex: 0.8, backgroundColor: PC, borderRadius: 3 }} />
                    <View style={{ flex: 0.2, backgroundColor: WARN }} />
                  </View>
                  {[
                    { label: "Per passenger",           value: `$${price.toFixed(2)}`,              color: DC  },
                    { label: `Total (${totalSeats}×)`,  value: `$${totalCollected.toFixed(2)}`,     color: TX  },
                    { label: "Platform fee (20%)",      value: `-$${(totalCollected * 0.2).toFixed(2)}`, color: WARN },
                    { label: "Your earnings",           value: `$${driverEarns.toFixed(2)}`,        color: PC, large: true },
                  ].map(({ label, value, color, large }, i, arr) => (
                    <View key={label}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
                        <Text style={{ fontSize: large ? 13 : 12, fontWeight: large ? "800" : "400", color: large ? PC : TX3 }}>{label}</Text>
                        <Text style={{ fontSize: large ? 16 : 14, fontWeight: large ? "900" : "700", color }}>{value}</Text>
                      </View>
                      {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: CARD_BORDER }} />}
                    </View>
                  ))}
                </View>
              </View>

              {/* Safety */}
              <View style={st.card}>
                <View style={st.cardHeader}>
                  <View style={[st.cardIcon, { backgroundColor: VIOLET + "20" }]}>
                    <IconSymbol name="shield.fill" size={16} color={VIOLET} />
                  </View>
                  <Text style={st.cardTitle}>Safety</Text>
                </View>
                <SafetyPills mode={safetyMode} onChange={setSafetyMode} opts={visibleSafetyOpts} />
                <View style={{ height: 1, backgroundColor: CARD_BORDER, marginVertical: 12 }} />
                <TouchableOpacity onPress={() => setApprovalRequired(v => !v)}
                  style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12,
                    borderColor: approvalRequired ? DC : CARD_BORDER, backgroundColor: approvalRequired ? DC + "08" : CARD_BG }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: approvalRequired ? DC + "20" : CARD_BORDER + "50" }}>
                    <IconSymbol name="checkmark.shield.fill" size={16} color={approvalRequired ? DC : TX3} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: TX }}>Require Approval</Text>
                    <Text style={{ fontSize: 10, color: TX3 }}>Review & accept each join request manually</Text>
                  </View>
                  <View style={{ width: 44, height: 24, borderRadius: 12, justifyContent: "center", paddingHorizontal: 2, backgroundColor: approvalRequired ? DC : CARD_BORDER }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: TX, transform: [{ translateX: approvalRequired ? 20 : 0 }] }} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Tips */}
              <View style={{ borderWidth: 1, borderRadius: 14, padding: 14, borderColor: CYAN + "25", backgroundColor: CYAN + "06" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <IconSymbol name="lightbulb.fill" size={16} color={CYAN} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: CYAN }}>Pro Tips</Text>
                </View>
                {["Set competitive pricing to attract riders quickly", "Morning commute rides fill 3× faster", "Rides with approval required get 40% more trusted riders"].map((t, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, color: CYAN }}>•</Text>
                    <Text style={{ fontSize: 11, color: CYAN, flex: 1 }}>{t}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── Passenger cards ───────────────────────────────────────── */}
          {role === "passenger" && (
            <>
              {/* Sub-mode toggle: hidden for find-driver (locked) and post-a-ride (always organize) */}
              {!lockedPassengerFlow && !isPostFlow && (
              <View style={{ height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: CARD_BORDER, backgroundColor: CARD_BG, flexDirection: "row", overflow: "hidden", marginBottom: 4 }}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                    backgroundColor: passengerMode === "organize" ? PC + "22" : "transparent", borderRadius: 10 }}
                  onPress={() => setPassengerMode("organize")} activeOpacity={0.8}
                >
                  <IconSymbol name="plus.circle.fill" size={14} color={passengerMode === "organize" ? PC : TX3} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: passengerMode === "organize" ? PC : TX3 }}>Post a Ride</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                    backgroundColor: passengerMode === "book" ? WARN + "22" : "transparent", borderRadius: 10 }}
                  onPress={() => setPassengerMode("book")} activeOpacity={0.8}
                >
                  <IconSymbol name="antenna.radiowaves.left.and.right" size={14} color={passengerMode === "book" ? WARN : TX3} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: passengerMode === "book" ? WARN : TX3 }}>Find a Driver</Text>
                </TouchableOpacity>
              </View>
              )}

              {/* Context banner */}
              <View style={{ borderRadius: 10, padding: 10, marginBottom: 4,
                backgroundColor: isOrganizerMode ? PC + "0C" : WARN + "0C",
                borderWidth: 1, borderColor: isOrganizerMode ? PC + "28" : WARN + "28" }}>
                <Text style={{ fontSize: 12, color: isOrganizerMode ? PC : WARN, lineHeight: 18 }}>
                  {isOrganizerMode
                    ? "Post your trip and invite others to share the cost. You manage who joins."
                    : "Broadcast your trip to nearby drivers. A driver will accept and pick you up."}
                </Text>
              </View>

              {/* Departure time */}
              <View style={st.card}>
                <View style={st.cardHeader}>
                  <View style={[st.cardIcon, { backgroundColor: WARN + "20" }]}>
                    <IconSymbol name="clock.fill" size={16} color={WARN} />
                  </View>
                  <Text style={st.cardTitle}>{isOrganizerMode ? "Departure Time" : "When do you need it?"}</Text>
                  {depIso && <View style={[st.badge, { backgroundColor: PC + "20" }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PC }} /><Text style={{ fontSize: 10, fontWeight: "700", color: PC }}>Set</Text></View>}
                </View>
                {/* Date chips */}
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
                  {[
                    { offset: 0, label: "Today" },
                    { offset: 1, label: "Tomorrow" },
                    { offset: 2, label: new Date(Date.now() + 2 * 86_400_000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) },
                    { offset: 3, label: new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) },
                  ].map((c) => (
                    <TouchableOpacity key={c.offset} onPress={() => setDepDayOffset(c.offset)}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10, borderWidth: 1.5,
                        backgroundColor: depDayOffset === c.offset ? PC + "20" : CARD_BG,
                        borderColor: depDayOffset === c.offset ? PC : CARD_BORDER }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: depDayOffset === c.offset ? PC : TX2, textAlign: "center" }}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TimeChips preset={timePreset} activeColor={PC} onSelect={applyTimePreset} smartLabel={smart.label} />
                {(timePreset === "custom" || timePreset === null) && (
                  <TimeInputRow depHour={depHour} depMinute={depMinute} depAmPm={depAmPm} activeColor={PC}
                    setDepHour={setDepHour} setDepMinute={setDepMinute} setDepAmPm={setDepAmPm} />
                )}
                {depIso ? (() => {
                  const d = new Date(depIso); const past = d.getTime() < Date.now() + 5 * 60 * 1000;
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8, backgroundColor: past ? ERR + "08" : PC + "08", borderColor: past ? ERR + "30" : PC + "20" }}>
                      <IconSymbol name={past ? "exclamationmark.triangle.fill" : "clock.fill"} size={14} color={past ? ERR : PC} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: past ? ERR : PC, marginLeft: 6, flex: 1 }}>
                        {past ? "Time is in the past — pick a future time" : `Departing ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`}
                      </Text>
                    </View>
                  );
                })() : (
                  <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8, backgroundColor: WARN + "08", borderColor: WARN + "20" }}>
                    <IconSymbol name="info.circle.fill" size={14} color={WARN} />
                    <Text style={{ fontSize: 12, color: WARN, marginLeft: 6 }}>Tap a chip above or enter custom time</Text>
                  </View>
                )}
              </View>

              {/* ORGANIZE MODE: Seats & Price per seat */}
              {isOrganizerMode && (
                <>
                  <View style={st.card}>
                    <View style={st.cardHeader}>
                      <View style={[st.cardIcon, { backgroundColor: PC + "20" }]}>
                        <IconSymbol name="person.2.fill" size={16} color={PC} />
                      </View>
                      <Text style={st.cardTitle}>Available Seats</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {[1, 2, 3, 4].map((n) => (
                        <TouchableOpacity key={n} onPress={() => setTotalSeats(n)}
                          style={{ flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: "center",
                            backgroundColor: totalSeats === n ? PC + "20" : CARD_BG, borderColor: totalSeats === n ? PC : CARD_BORDER }}>
                          <Text style={{ fontSize: 20, fontWeight: "800", color: totalSeats === n ? PC : TX }}>{n}</Text>
                          <Text style={{ fontSize: 9, color: totalSeats === n ? PC + "AA" : TX3 }}>seats</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={st.card}>
                    <View style={st.cardHeader}>
                      <View style={[st.cardIcon, { backgroundColor: PC + "20" }]}>
                        <IconSymbol name="dollarsign.circle.fill" size={16} color={PC} />
                      </View>
                      <Text style={st.cardTitle}>Fare Split</Text>
                    </View>
                    <PriceSlider min={PRICE_MIN} max={PRICE_MAX} value={price} panHandler={pricePanResponder}
                      anim={priceSliderAnim} color={PC} label="Price per seat" trackWidth={sliderTrackWidth} />
                    <View style={{ borderWidth: 1, borderRadius: 12, padding: 14, borderColor: CARD_BORDER, backgroundColor: "rgba(0,0,0,0.2)", marginTop: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: TX3, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Split Breakdown</Text>
                      {soloFare > 0 && price >= 1 ? (
                        <>
                          {[
                            { label: "Solo fare",       value: `$${soloFare.toFixed(2)}`,                   color: TX   },
                            { label: "Your price/seat", value: `$${price.toFixed(2)}`,                      color: PC   },
                            { label: "Each person pays", value: `$${price.toFixed(2)}`,                     color: PC   },
                            { label: "You save",        value: `$${Math.max(0, soloFare - price).toFixed(2)}`, color: "#00D166", large: true },
                          ].map(({ label, value, color, large }, i, arr) => (
                            <View key={label}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
                                <Text style={{ fontSize: large ? 13 : 12, fontWeight: large ? "800" : "400", color: large ? color : TX3 }}>{label}</Text>
                                <Text style={{ fontSize: large ? 16 : 14, fontWeight: large ? "900" : "700", color }}>{value}</Text>
                              </View>
                              {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: CARD_BORDER }} />}
                            </View>
                          ))}
                        </>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, backgroundColor: PC + "08", borderColor: PC + "20" }}>
                          <IconSymbol name="info.circle.fill" size={14} color={PC} />
                          <Text style={{ fontSize: 12, color: PC, marginLeft: 6 }}>Set route & price to see fare split</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={st.card}>
                    <View style={st.cardHeader}>
                      <View style={[st.cardIcon, { backgroundColor: BLUE + "20" }]}>
                        <IconSymbol name="person.crop.circle.badge.checkmark" size={16} color={BLUE} />
                      </View>
                      <Text style={st.cardTitle}>Join Approval</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setApprovalRequired(v => !v)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12,
                        backgroundColor: approvalRequired ? DC + "12" : CARD_BG, borderWidth: 1,
                        borderColor: approvalRequired ? DC + "35" : CARD_BORDER }}
                    >
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                        borderColor: approvalRequired ? DC : TX3,
                        backgroundColor: approvalRequired ? DC : "transparent",
                        alignItems: "center", justifyContent: "center" }}>
                        {approvalRequired && <IconSymbol name="checkmark" size={12} color={TX} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: TX }}>Approve each request</Text>
                        <Text style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
                          {approvalRequired ? "You'll review and approve joiners" : "Anyone can join automatically"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* ── Trip Preferences ── */}
                  <View style={st.card}>
                    <View style={st.cardHeader}>
                      <View style={[st.cardIcon, { backgroundColor: VIOLET + "20" }]}>
                        <IconSymbol name="slider.horizontal.3" size={16} color={VIOLET} />
                      </View>
                      <Text style={st.cardTitle}>Trip Preferences</Text>
                    </View>

                    {/* Luggage */}
                    <Text style={[st.label, { marginBottom: 8 }]}>Luggage Allowed</Text>
                    <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
                      {(["none", "small", "medium", "large"] as const).map((opt) => {
                        const icons = { none: "xmark.circle", small: "bag", medium: "bag.fill", large: "suitcase.fill" };
                        const active = luggageAllowed === opt;
                        return (
                          <TouchableOpacity key={opt} onPress={() => setLuggageAllowed(opt)}
                            style={{ flex: 1, alignItems: "center", gap: 3, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5,
                              backgroundColor: active ? VIOLET + "20" : CARD_BG, borderColor: active ? VIOLET : CARD_BORDER }}>
                            <IconSymbol name={icons[opt] as any} size={14} color={active ? VIOLET : TX3} />
                            <Text style={{ fontSize: 9, fontWeight: "700", color: active ? VIOLET : TX3, textTransform: "capitalize" }}>{opt}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Gender Preference */}
                    <Text style={[st.label, { marginBottom: 8 }]}>Gender Preference</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                      {([
                        { key: "any",         label: "Anyone",      icon: "person.2.fill",    color: BLUE  },
                        { key: "female_only", label: "Women Only",  icon: "person.fill",      color: "#F062B0" },
                        { key: "male_only",   label: "Men Only",    icon: "person.fill",      color: CYAN  },
                      ] as const).map(({ key, label, icon, color }) => {
                        const active = genderPreference === key;
                        return (
                          <TouchableOpacity key={key} onPress={() => setGenderPreference(key)}
                            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5,
                              backgroundColor: active ? color + "20" : CARD_BG, borderColor: active ? color : CARD_BORDER }}>
                            <IconSymbol name={icon} size={12} color={active ? color : TX3} />
                            <Text style={{ fontSize: 10, fontWeight: "700", color: active ? color : TX3 }}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Flexible window */}
                    <Text style={[st.label, { marginBottom: 8 }]}>Flexible Departure Window</Text>
                    <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
                      {[0, 5, 10, 15, 30].map((mins) => {
                        const active = flexibleDepartureMinutes === mins;
                        return (
                          <TouchableOpacity key={mins} onPress={() => setFlexibleDepartureMinutes(mins)}
                            style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, borderWidth: 1.5,
                              backgroundColor: active ? WARN + "20" : CARD_BG, borderColor: active ? WARN : CARD_BORDER }}>
                            <Text style={{ fontSize: 12, fontWeight: "800", color: active ? WARN : TX2 }}>{mins === 0 ? "Exact" : `±${mins}m`}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Quiet ride */}
                    <TouchableOpacity
                      onPress={() => setQuietRide(v => !v)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12,
                        backgroundColor: quietRide ? CYAN + "10" : CARD_BG, borderWidth: 1,
                        borderColor: quietRide ? CYAN + "40" : CARD_BORDER }}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center",
                        backgroundColor: quietRide ? CYAN + "25" : CARD_BORDER + "80" }}>
                        <IconSymbol name="speaker.slash.fill" size={13} color={quietRide ? CYAN : TX3} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: TX }}>Quiet Ride</Text>
                        <Text style={{ fontSize: 11, color: TX3, marginTop: 1 }}>Prefer a calm, quiet trip</Text>
                      </View>
                      <View style={{ width: 44, height: 24, borderRadius: 12, justifyContent: "center", paddingHorizontal: 2, backgroundColor: quietRide ? CYAN : CARD_BORDER }}>
                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: TX, transform: [{ translateX: quietRide ? 20 : 0 }] }} />
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* ── Ride Notes ── */}
                  <View style={st.card}>
                    <View style={st.cardHeader}>
                      <View style={[st.cardIcon, { backgroundColor: CYAN + "20" }]}>
                        <IconSymbol name="note.text" size={16} color={CYAN} />
                      </View>
                      <Text style={st.cardTitle}>Ride Notes</Text>
                      <Text style={{ fontSize: 11, color: TX3 }}>Optional</Text>
                    </View>
                    <TextInput
                      value={rideNotes}
                      onChangeText={setRideNotes}
                      placeholder="Add meeting point, rules, or any info for riders…"
                      placeholderTextColor={TX3}
                      multiline
                      numberOfLines={3}
                      maxLength={300}
                      style={[st.input, { height: 80, textAlignVertical: "top", lineHeight: 20, borderColor: rideNotes.trim() ? CYAN + "50" : CARD_BORDER }]}
                    />
                    <Text style={{ fontSize: 10, color: TX3, textAlign: "right", marginTop: 4 }}>{rideNotes.length}/300</Text>
                  </View>

                  {/* ── Stopovers ── */}
                  <View style={st.card}>
                    <View style={st.cardHeader}>
                      <View style={[st.cardIcon, { backgroundColor: WARN + "20" }]}>
                        <IconSymbol name="mappin.and.ellipse" size={16} color={WARN} />
                      </View>
                      <Text style={st.cardTitle}>Stopovers</Text>
                      <Text style={{ fontSize: 11, color: TX3 }}>Optional · max 3</Text>
                    </View>
                    {stopovers.map((stop, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, padding: 10, borderRadius: 10, backgroundColor: WARN + "0C", borderWidth: 1, borderColor: WARN + "25" }}>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: WARN + "25", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 10, fontWeight: "800", color: WARN }}>{i + 1}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 12, color: TX }} numberOfLines={1}>{stop}</Text>
                        <TouchableOpacity onPress={() => setStopovers(p => p.filter((_, j) => j !== i))}>
                          <IconSymbol name="xmark.circle.fill" size={16} color={TX3} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {stopovers.length < 3 && (
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TextInput
                          value={stopoverInput}
                          onChangeText={setStopoverInput}
                          placeholder="e.g. Newark Penn Station"
                          placeholderTextColor={TX3}
                          style={[st.input, { flex: 1, borderColor: stopoverInput.trim() ? WARN + "50" : CARD_BORDER }]}
                        />
                        <TouchableOpacity
                          onPress={() => {
                            const v = stopoverInput.trim();
                            if (v) { setStopovers(p => [...p, v]); setStopoverInput(""); }
                          }}
                          style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: WARN + "20", borderWidth: 1.5, borderColor: WARN + "40", alignItems: "center", justifyContent: "center", marginTop: 20 }}
                        >
                          <IconSymbol name="plus" size={16} color={WARN} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* BOOK MODE: Passengers & Offer */}
              {!isOrganizerMode && (
                <View style={st.card}>
                  <View style={st.cardHeader}>
                    <View style={[st.cardIcon, { backgroundColor: PC + "20" }]}>
                      <IconSymbol name="dollarsign.circle.fill" size={16} color={PC} />
                    </View>
                    <Text style={st.cardTitle}>Passengers & Offer</Text>
                  </View>

                  <Text style={[st.label, { marginBottom: 8 }]}>Passengers Riding</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                    {[1, 2, 3, 4].map((n) => (
                      <TouchableOpacity key={n} onPress={() => setPassengerCount(n)}
                        style={{ flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: "center",
                          backgroundColor: passengerCount === n ? PC + "20" : CARD_BG, borderColor: passengerCount === n ? PC : CARD_BORDER }}>
                        <Text style={{ fontSize: 20, fontWeight: "800", color: passengerCount === n ? PC : TX }}>{n}</Text>
                        <Text style={{ fontSize: 9, color: passengerCount === n ? PC + "AA" : TX3 }}>pax</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <PriceSlider min={OFFER_MIN} max={OFFER_MAX} value={offer} panHandler={offerPanResponder}
                    anim={offerSliderAnim} color={PC} label="Your Offer Price" trackWidth={sliderTrackWidth} />

                  <View style={{ borderWidth: 1, borderRadius: 12, padding: 14, borderColor: CARD_BORDER, backgroundColor: "rgba(0,0,0,0.2)", marginTop: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: TX3, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Match Probability</Text>
                    {soloFare > 0 && offer >= 1 ? (() => {
                      const p2 = Math.round(Math.min(90, 20 + (offer / soloFare) * 55));
                      const pc2 = probColor(p2);
                      return (
                        <>
                          <View style={{ height: 5, borderRadius: 3, backgroundColor: CARD_BORDER, overflow: "hidden", marginBottom: 12 }}>
                            <View style={{ width: `${p2}%` as any, height: "100%", backgroundColor: pc2, borderRadius: 3 }} />
                          </View>
                          {[
                            { label: "Your offer",        value: `$${offer.toFixed(2)}`,                     color: PC   },
                            { label: "Estimated solo",    value: `$${soloFare.toFixed(2)}`,                  color: TX   },
                            { label: "Offer vs solo",     value: `${Math.round((offer / soloFare) * 100)}%`, color: WARN },
                            { label: "Match probability", value: `${p2}%`,                                   color: pc2, large: true },
                          ].map(({ label, value, color, large }, i, arr) => (
                            <View key={label}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
                                <Text style={{ fontSize: large ? 13 : 12, fontWeight: large ? "800" : "400", color: large ? pc2 : TX3 }}>{label}</Text>
                                <Text style={{ fontSize: large ? 16 : 14, fontWeight: large ? "900" : "700", color }}>{value}</Text>
                              </View>
                              {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: CARD_BORDER }} />}
                            </View>
                          ))}
                        </>
                      );
                    })() : (
                      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, backgroundColor: WARN + "08", borderColor: WARN + "20" }}>
                        <IconSymbol name="info.circle.fill" size={14} color={WARN} />
                        <Text style={{ fontSize: 12, color: WARN, marginLeft: 6 }}>Set route & offer to see match probability</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Safety */}
              <View style={st.card}>
                <View style={st.cardHeader}>
                  <View style={[st.cardIcon, { backgroundColor: VIOLET + "20" }]}>
                    <IconSymbol name="shield.fill" size={16} color={VIOLET} />
                  </View>
                  <Text style={st.cardTitle}>Safety</Text>
                </View>
                <SafetyPills mode={safetyMode} onChange={setSafetyMode} opts={visibleSafetyOpts} />
              </View>

              {/* Tips */}
              <View style={{ borderWidth: 1, borderRadius: 14, padding: 14, borderColor: CYAN + "25", backgroundColor: CYAN + "06" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <IconSymbol name="lightbulb.fill" size={16} color={CYAN} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: CYAN }}>
                    {isOrganizerMode ? "Organizing Tips" : "Pro Tips"}
                  </Text>
                </View>
                {(isOrganizerMode
                  ? ["Post your recurring commute and fill seats every trip", "Verified riders join 2× more often — enable approval to screen", "Rides with a title and safety mode get 40% more join requests"]
                  : ["Higher offers get accepted 3× faster by nearby drivers", "Morning requests fill within 2 minutes on average", "Your request broadcasts to all drivers within 5 km"]
                ).map((t, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, color: CYAN }}>•</Text>
                    <Text style={{ fontSize: 11, color: CYAN, flex: 1 }}>{t}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        {/* Smart CTA */}
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: CARD_BORDER, backgroundColor: BG }}>
          {!isReady && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4, marginBottom: 8 }}>
              {!pickup       && <View style={st.missingTag}><Text style={{ fontSize: 10, color: ERR,  fontWeight: "600" }}>Set pickup</Text></View>}
              {!dropoff      && <View style={st.missingTag}><Text style={{ fontSize: 10, color: ERR,  fontWeight: "600" }}>Set destination</Text></View>}
              {!depIso       && <View style={st.warnTag}><Text style={{ fontSize: 10, color: WARN, fontWeight: "600" }}>Choose time</Text></View>}
              {!title.trim() && <View style={st.warnTag}><Text style={{ fontSize: 10, color: WARN, fontWeight: "600" }}>Add title</Text></View>}
              {(role === "driver" || isOrganizerMode) && price < 1 && <View style={st.warnTag}><Text style={{ fontSize: 10, color: WARN, fontWeight: "600" }}>Set price</Text></View>}
              {role === "passenger" && !isOrganizerMode && offer < 1 && <View style={st.warnTag}><Text style={{ fontSize: 10, color: WARN, fontWeight: "600" }}>Set offer</Text></View>}
            </View>
          )}
          <Animated.View style={{ transform: [{ scale: isReady ? pulseAnim : 1 }] }}>
            <TouchableOpacity
              style={[st.cta, {
                backgroundColor: isReady ? accent : accent + "25",
                borderWidth: isReady ? 0 : 1.5, borderColor: isReady ? "transparent" : accent + "60",
                opacity: (createCarpool.isPending || createRequest.isPending || postPassengerRide.isPending) ? 0.7 : 1,
                shadowColor: isReady ? accent : "transparent",
                shadowOpacity: isReady ? 0.5 : 0,
                shadowRadius: 18, shadowOffset: { width: 0, height: 6 },
              }]}
              onPress={role === "driver" ? handleDriverSubmit : isOrganizerMode ? handleOrganizerSubmit : handlePassengerSubmit}
              disabled={!isReady || createCarpool.isPending || createRequest.isPending || postPassengerRide.isPending}
            >
              {(createCarpool.isPending || createRequest.isPending || postPassengerRide.isPending) ? (
                <ActivityIndicator color={TX} />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <IconSymbol
                    name={role === "driver" ? "car.2.fill" : isOrganizerMode ? "plus.circle.fill" : "antenna.radiowaves.left.and.right"}
                    size={20} color={TX}
                  />
                  <Text style={[st.ctaText, { color: TX }]}>
                    {role === "driver" ? "Offer Driver Ride" : isOrganizerMode ? "Post Group Ride" : "Request Ride"}
                  </Text>
                  {isReady && (
                    <View style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: TX }}>
                        {(role === "driver" || isOrganizerMode) ? `$${price.toFixed(2)}/seat` : `$${offer.toFixed(2)}`}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  card:       { borderWidth: 1, borderRadius: 16, padding: 16, backgroundColor: CARD_BG, borderColor: CARD_BORDER },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  cardIcon:   { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle:  { fontSize: 15, fontWeight: "800", color: TX, flex: 1 },
  badge:      { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  label:      { fontSize: 11, fontWeight: "600", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3, color: TX2 },
  input:      { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: TX, backgroundColor: CARD_BG },
  timeInput:  { borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 22, fontWeight: "800" as const, textAlign: "center" as const, color: TX, backgroundColor: CARD_BG },
  dot:        { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  dotInner:   { width: 10, height: 10, borderRadius: 5, backgroundColor: TX },
  swapBtn:    { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: CARD_BORDER, alignItems: "center", justifyContent: "center", backgroundColor: BG },
  iconBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle:{ fontSize: 18, fontWeight: "800", color: TX },
  headerSub:  { fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  toggleOpt:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", zIndex: 1 },
  cta:        { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 16 },
  ctaText:    { color: TX, fontWeight: "800", fontSize: 16, marginLeft: 8 },
  missingTag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.12)" },
  warnTag:    { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, backgroundColor: "rgba(245,158,11,0.12)" },
});
