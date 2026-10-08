import { useRouter, type Href } from "expo-router";
import { useState, useRef, useEffect, useMemo } from "react";

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useIsFocused } from "@/hooks/use-is-focused";
import * as ExpoLocation from "expo-location";
import { GradientView } from "@/components/GradientView";
import { CarpoolEmptyState } from "@/components/carpool/CarpoolEmptyState";
import { CarpoolFilterChips } from "@/components/carpool/CarpoolFilterChips";
import { CarpoolResultCard, type CarpoolMatch } from "@/components/carpool/CarpoolResultCard";
import { CarpoolSkeletonList } from "@/components/carpool/CarpoolSkeletonList";
import {
  CARPOOL_FILTERS,
  TIME_WINDOWS,
  getDepartureWindow,
  type CarpoolFilterMode,
  type TimeWindow,
} from "@/components/carpool/constants";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context-v2";
import { useRides } from "@/lib/rides-store";
import { useToastStore } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import { getSessionToken } from "@/lib/_core/auth";

const G = "#16A34A";
const R = "#EF4444";
const SEARCH_DEBOUNCE_MS = 500;

function showToast(title: string, msg?: string) {
  const lc = title.toLowerCase();
  const type = lc.includes("success") || lc.includes("joined") || lc.includes("sent")
    ? "success" as const
    : lc.includes("error") || lc.includes("enter") || lc.includes("missing")
      ? "error" as const
      : "info" as const;
  useToastStore.getState().show(msg ?? title, type);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const Rkm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Rkm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapEnrichedToMatch(raw: any): CarpoolMatch {
  return {
    rideId: raw.ride?.rideId ?? raw.rideId,
    pickup: raw.pickup ?? raw.ride?.pickupAddress ?? "",
    dropoff: raw.dropoff ?? raw.ride?.dropoffAddress ?? "",
    departureTime: raw.departureTime ?? raw.ride?.departureTime ?? null,
    price: raw.price ?? raw.fareShare ?? 0,
    seatsLeft: raw.seatsLeft ?? raw.seatsAvailable ?? 0,
    totalSeats: raw.totalSeats ?? raw.ride?.totalSeats ?? 3,
    riderName: raw.riderName ?? raw.driver?.name ?? "Driver",
    rating: raw.rating ?? raw.driver?.rating ?? 4.8,
    isVerified: raw.isVerified ?? raw.driver?.isVerified ?? false,
    isStudentVerified: raw.isStudentVerified ?? raw.driver?.isStudentVerified ?? false,
    school: raw.school ?? raw.driver?.school,
    genderPreference: raw.genderPreference,
    driverGender: raw.driverGender ?? raw.driver?.gender,
    safetyMode: raw.safetyMode ?? raw.ride?.safetyMode,
    routeOverlapPercent: raw.routeOverlapPercent ?? 0,
    pickupDistanceMiles: raw.pickupDistanceMiles ?? (raw.pickupDistKm ?? 0) * 0.621371,
    matchScore: raw.matchScore ?? raw.score ?? 0,
    approvalRequired: raw.approvalRequired ?? raw.ride?.approvalRequired ?? false,
    myJoinStatus: raw.myJoinStatus ?? null,
    isOwnRide: raw.isOwnRide ?? false,
  };
}

export default function FindSharedScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state, setBookingDraft } = useRides();
  const BASE = getApiBaseUrl();
  const { user } = useAuth();
  const isFemale = user?.gender === "female";
  const utils = trpc.useUtils();
  const isFocused = useIsFocused();

  const [pickupText, setPickupText] = useState((state.bookingDraft.pickup as any)?.address ?? "");
  const [dropoffText, setDropoffText] = useState((state.bookingDraft.dropoff as any)?.address ?? "");
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(
    (state.bookingDraft.pickup as any)?.lat
      ? { lat: (state.bookingDraft.pickup as any).lat, lng: (state.bookingDraft.pickup as any).lng }
      : null,
  );
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(
    (state.bookingDraft.dropoff as any)?.lat
      ? { lat: (state.bookingDraft.dropoff as any).lat, lng: (state.bookingDraft.dropoff as any).lng }
      : null,
  );
  const [searchCoords, setSearchCoords] = useState<{ pickup: { lat: number; lng: number }; dropoff: { lat: number; lng: number } } | null>(
    pickupCoords && dropoffCoords ? { pickup: pickupCoords, dropoff: dropoffCoords } : null,
  );
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [activeField, setActiveField] = useState<"pickup" | "dropoff" | null>(null);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);
  const autocompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterMode, setFilterMode] = useState<CarpoolFilterMode>("everyone");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("flexible");
  const [joiningRideId, setJoiningRideId] = useState<string | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);

  useEffect(() => {
    ExpoLocation.requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status !== "granted") {
          setLocationPermissionDenied(true);
          return;
        }
        return ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
          .then((pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
          .catch(() => setLocationPermissionDenied(true));
      })
      .catch(() => setLocationPermissionDenied(true));
  }, []);

  const canSearch = !!(pickupCoords && dropoffCoords);

  useEffect(() => {
    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);
    if (!canSearch) {
      setSearchCoords(null);
      return;
    }
    searchDebounceTimer.current = setTimeout(() => {
      setSearchCoords({ pickup: pickupCoords!, dropoff: dropoffCoords! });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);
    };
  }, [pickupCoords, dropoffCoords, canSearch]);

  const departureWindow = useMemo(() => getDepartureWindow(timeWindow), [timeWindow]);

  const { data, isLoading, isError, refetch, isFetching, isPlaceholderData } =
    trpc.carpool.searchCarpools.useQuery(
      {
        pickupLat: searchCoords?.pickup.lat ?? 0,
        pickupLng: searchCoords?.pickup.lng ?? 0,
        dropoffLat: searchCoords?.dropoff.lat ?? 0,
        dropoffLng: searchCoords?.dropoff.lng ?? 0,
        filterMode,
        departureAfter: departureWindow.departureAfter,
        departureBefore: departureWindow.departureBefore,
        maxResults: 30,
      },
      {
        enabled: !!searchCoords && isFocused,
        refetchInterval: isFocused && !!searchCoords ? 30_000 : false,
        staleTime: 15_000,
        placeholderData: (prev: typeof data) => prev,
      },
    );

  const matches: CarpoolMatch[] = useMemo(() => {
    const raw = (data as any)?.matches ?? (data as any)?.clusters?.flatMap((c: any) => [c.best, ...(c.alternatives ?? [])]) ?? [];
    let list = raw.map(mapEnrichedToMatch);
    if (filterMode === "lowest_price") {
      list = [...list].sort((a, b) => a.price - b.price);
    } else if (filterMode === "best_match" || filterMode === "everyone") {
      list = [...list].sort((a, b) => b.matchScore - a.matchScore);
    }
    return list;
  }, [data, filterMode]);

  const joinMut = trpc.carpool.requestJoin.useMutation();

  const handleJoinRide = async (match: CarpoolMatch) => {
    if (!pickupCoords || !dropoffCoords || match.isOwnRide) return;
    if (match.myJoinStatus === "pending" || match.myJoinStatus === "approved") return;
    setJoiningRideId(match.rideId);
    try {
      const result = await joinMut.mutateAsync({
        rideId: match.rideId,
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        pickupAddress: pickupText,
        dropoffLat: dropoffCoords.lat,
        dropoffLng: dropoffCoords.lng,
        dropoffAddress: dropoffText,
        distanceKm: haversineKm(pickupCoords.lat, pickupCoords.lng, dropoffCoords.lat, dropoffCoords.lng),
      });
      utils.carpool.searchCarpools.invalidate();
      utils.rides.myRides.invalidate();
      if (result.autoApproved) {
        showToast("Joined ride successfully");
      } else {
        showToast("Request sent to ride organizer");
      }
    } catch (e: any) {
      showToast("Error", e?.message ?? "Failed to join ride");
    } finally {
      setJoiningRideId(null);
    }
  };

  const handleCreateNew = () => {
    if (pickupCoords && dropoffCoords) {
      setBookingDraft({
        mode: "share",
        pickup: { lat: pickupCoords.lat, lng: pickupCoords.lng, address: pickupText, shortName: pickupText.split(",")[0] },
        dropoff: { lat: dropoffCoords.lat, lng: dropoffCoords.lng, address: dropoffText, shortName: dropoffText.split(",")[0] },
      });
    }
    router.push("/create-ride?flow=post" as Href);
  };

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getSessionToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchAutocomplete(query: string, refLat?: number, refLng?: number): Promise<any[]> {
    try {
      let url = `${BASE}/api/maps/autocomplete?q=${encodeURIComponent(query)}`;
      if (refLat != null && refLng != null) url += `&lat=${refLat}&lng=${refLng}`;
      const res = await fetch(url, { headers: await authHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      if (Array.isArray(json)) return json;
      return json.predictions ?? json.results ?? [];
    } catch {
      return [];
    }
  }

  async function fetchPlaceDetails(placeId: string) {
    try {
      const res = await fetch(`${BASE}/api/maps/place-details?placeId=${encodeURIComponent(placeId)}`, { headers: await authHeaders() });
      const json = await res.json();
      if (json.lat && json.lng) return { lat: json.lat, lng: json.lng, address: json.address ?? "" };
      return null;
    } catch {
      return null;
    }
  }

  function handleTextChange(text: string, field: "pickup" | "dropoff") {
    if (field === "pickup") { setPickupText(text); setPickupCoords(null); }
    else { setDropoffText(text); setDropoffCoords(null); }
    setActiveField(field);
    if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
    if (text.length < 2) { setSuggestions([]); setIsAutocompleteLoading(false); return; }
    setIsAutocompleteLoading(true);
    autocompleteTimer.current = setTimeout(async () => {
      const refLat = (field === "dropoff" ? pickupCoords?.lat : dropoffCoords?.lat) ?? userLoc?.lat;
      const refLng = (field === "dropoff" ? pickupCoords?.lng : dropoffCoords?.lng) ?? userLoc?.lng;
      const results = await fetchAutocomplete(text, refLat, refLng);
      setSuggestions(results);
      setIsAutocompleteLoading(false);
    }, 350);
  }

  async function handleSelectSuggestion(item: any) {
    const address = item.fullText || item.primaryText || "";
    const shortName = item.primaryText || item.fullText || address;
    const placeId: string = item.placeId ?? "";
    let coords: { lat: number; lng: number } | null = null;

    if (placeId.startsWith("photon:") || placeId.startsWith("nominatim:")) {
      const parts = placeId.split(":");
      if (parts.length >= 5) coords = { lat: parseFloat(parts[3]), lng: parseFloat(parts[4]) };
    } else if (placeId) {
      const details = await fetchPlaceDetails(placeId);
      if (details) coords = { lat: details.lat, lng: details.lng };
    }

    if (activeField === "pickup") {
      setPickupText(shortName);
      if (coords) setPickupCoords(coords);
    } else {
      setDropoffText(shortName);
      if (coords) setDropoffCoords(coords);
    }
    setSuggestions([]);
    setActiveField(null);
  }

  const handleSwap = () => {
    setPickupText(dropoffText);
    setDropoffText(pickupText);
    setPickupCoords(dropoffCoords);
    setDropoffCoords(pickupCoords);
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast("Location permission required");
        return;
      }
      const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setUserLoc({ lat, lng });
      setPickupCoords({ lat, lng });
      // Reverse-geocode coords → real address using the backend endpoint
      try {
        const res = await fetch(
          `${BASE}/api/maps/reverse-geocode?lat=${lat}&lng=${lng}`,
          { headers: await authHeaders() },
        );
        if (res.ok) {
          const geo = await res.json();
          setPickupText(geo.address ?? "Using current location");
        } else {
          setPickupText("Using current location");
        }
      } catch {
        setPickupText("Using current location");
      }
    } catch {
      showToast("Could not get current location");
    } finally {
      setLocating(false);
    }
  };

  const showInitialLoading = !!searchCoords && isLoading && !isPlaceholderData;
  const showResultsSection = !!searchCoords;
  const activeFilterLabel = CARPOOL_FILTERS.find(f => f.value === filterMode)?.label;
  const hasFilterEmpty = matches.length === 0 && filterMode !== "everyone" && filterMode !== "best_match" && filterMode !== "lowest_price";

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <GradientView style={s.header}>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as Href))}
          >
            <IconSymbol name="chevron.left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: 0.5 }}>
              Find a Carpool
            </Text>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>
              Find people already going your way
            </Text>
          </View>
          <View style={{ width: 38 }} />
        </GradientView>

        <View style={{ paddingHorizontal: 16, marginTop: -20 }}>
          <View style={[s.searchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: G }} />
              <TextInput
                style={[s.searchInput, { color: colors.foreground, borderColor: activeField === "pickup" ? colors.primary : colors.border }]}
                placeholder="Pickup location"
                placeholderTextColor={colors.muted}
                value={pickupText}
                onChangeText={(t: string) => handleTextChange(t, "pickup")}
                onFocus={() => setActiveField("pickup")}
              />
              {pickupCoords && <IconSymbol name="checkmark.circle.fill" size={18} color={G} />}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 4 }}>
              <View style={{ width: 1, height: 12, backgroundColor: colors.border, marginLeft: 4.5 }} />
              <TouchableOpacity style={s.swapBtn} onPress={handleSwap}>
                <IconSymbol name="arrow.up.arrow.down" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: R }} />
              <TextInput
                style={[s.searchInput, { color: colors.foreground, borderColor: activeField === "dropoff" ? colors.primary : colors.border }]}
                placeholder="Destination"
                placeholderTextColor={colors.muted}
                value={dropoffText}
                onChangeText={(t: string) => handleTextChange(t, "dropoff")}
                onFocus={() => setActiveField("dropoff")}
              />
              {dropoffCoords && <IconSymbol name="checkmark.circle.fill" size={18} color={G} />}
            </View>

            <TouchableOpacity
              style={[s.locBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={handleUseCurrentLocation}
              disabled={locating}
            >
              {locating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <IconSymbol
                  name={locationPermissionDenied ? "location.slash.fill" : "location.fill"}
                  size={14}
                  color={locationPermissionDenied ? colors.muted : colors.primary}
                />
              )}
              <Text style={{ fontSize: 12, fontWeight: "700", color: locationPermissionDenied ? colors.muted : colors.primary, marginLeft: 6 }}>
                {locationPermissionDenied ? "Location unavailable" : "Use current location"}
              </Text>
            </TouchableOpacity>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
              {TIME_WINDOWS.map((tw) => {
                const active = timeWindow === tw.value;
                return (
                  <TouchableOpacity
                    key={tw.value}
                    style={{
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderWidth: 1,
                      backgroundColor: active ? colors.primary + "15" : colors.background,
                      borderColor: active ? colors.primary : colors.border,
                    }}
                    onPress={() => setTimeWindow(tw.value)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: active ? colors.primary : colors.muted }}>
                      {tw.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {activeField && (suggestions.length > 0 || isAutocompleteLoading) && (
              <View style={[s.suggestionsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {isAutocompleteLoading && suggestions.length === 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 10 }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={{ fontSize: 13, color: colors.muted }}>Searching...</Text>
                  </View>
                ) : (
                  suggestions.slice(0, 5).map((item: any, idx: number) => (
                    <TouchableOpacity
                      key={item.placeId ?? idx}
                      style={[s.suggestionRow, { borderBottomColor: colors.border }]}
                      onPress={() => handleSelectSuggestion(item)}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary + "10", alignItems: "center", justifyContent: "center" }}>
                        <IconSymbol name="mappin" size={12} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                          {item.primaryText || item.fullText || item.description || ""}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            <TouchableOpacity onPress={() => canSearch && refetch()} disabled={!canSearch} style={{ marginTop: 12 }}>
              {canSearch ? (
                <GradientView style={s.findBtn}>
                  <IconSymbol name="magnifyingglass" size={16} color="#fff" />
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#fff", marginLeft: 8 }}>
                    {isFetching ? "Refreshing…" : "Find Rides"}
                  </Text>
                </GradientView>
              ) : (
                <View style={[s.findBtn, { backgroundColor: colors.muted + "30" }]}>
                  <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
                  <Text style={{ fontSize: 15, fontWeight: "800", color: colors.muted, marginLeft: 8 }}>Find Rides</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {isFemale && (
          <View style={[s.safetyBanner, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "25" }]}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, marginBottom: 4 }}>Protected Ride options</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              Women-only · Women drivers · Verified community · Share trip enabled
            </Text>
          </View>
        )}

        {showResultsSection && (
          <>
            <View style={{ paddingTop: 12 }}>
              <CarpoolFilterChips active={filterMode} onChange={setFilterMode} colors={colors} />
            </View>

            {showInitialLoading && <CarpoolSkeletonList colors={colors} />}

            {isError && !showInitialLoading && (
              <View style={{ alignItems: "center", paddingVertical: 36 }}>
                <IconSymbol name="exclamationmark.triangle" size={28} color={colors.muted} />
                <Text style={{ color: colors.foreground, fontWeight: "700", marginTop: 10 }}>Could not load rides</Text>
                <TouchableOpacity
                  style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 9, marginTop: 12 }}
                  onPress={() => refetch()}
                >
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {!showInitialLoading && !isError && matches.length > 0 && (
              <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
                {isFetching && isPlaceholderData && (
                  <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8, textAlign: "center" }}>
                    Updating matches…
                  </Text>
                )}
                {matches.map((match) => (
                  <CarpoolResultCard
                    key={match.rideId}
                    match={match}
                    colors={colors}
                    isJoining={joiningRideId === match.rideId}
                    onJoin={() => handleJoinRide(match)}
                  />
                ))}
              </View>
            )}

            {!showInitialLoading && !isError && matches.length === 0 && (
              <CarpoolEmptyState
                colors={colors}
                onCreateRide={handleCreateNew}
                filterLabel={hasFilterEmpty ? activeFilterLabel : undefined}
                onClearFilter={hasFilterEmpty ? () => setFilterMode("everyone") : undefined}
              />
            )}
          </>
        )}

        {!searchCoords && (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <TouchableOpacity onPress={handleCreateNew} activeOpacity={0.88}>
              <GradientView style={s.createCard}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: "#fff" }}>Create a Shared Ride</Text>
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>
                  Post your trip — others join and split the cost
                </Text>
              </GradientView>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 36,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  searchCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "500",
  },
  swapBtn: {
    marginLeft: "auto",
    marginRight: 4,
    padding: 6,
  },
  locBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  suggestionsBox: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    maxHeight: 220,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  findBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  safetyBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  createCard: {
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
  },
});
