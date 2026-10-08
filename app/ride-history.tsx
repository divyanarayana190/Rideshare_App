import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import DriverTrackingMapView from "@/components/DriverTrackingMapView";
import { StopsList, type StopItem } from "@/components/StopsList";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

// ── Complaint categories ─────────────────────────────────────────────────────
const COMPLAINT_CATEGORIES = [
  { id: "unsafe_driving", label: "Unsafe Driving", icon: "exclamationmark.triangle.fill" },
  { id: "rude_behavior", label: "Rude / Hostile Behavior", icon: "hand.raised.fill" },
  { id: "wrong_route", label: "Wrong Route Taken", icon: "map.fill" },
  { id: "overcharge", label: "Overcharge / Fare Dispute", icon: "dollarsign.circle.fill" },
  { id: "cleanliness", label: "Vehicle Cleanliness", icon: "sparkles" },
  { id: "other", label: "Other Issue", icon: "ellipsis.circle.fill" },
];

// ── Star rating ──────────────────────────────────────────────────────────────
function StarRating({ value, onChange, size = 36 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, backgroundColor: "#F8F9FA", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <TouchableOpacity
          key={s}
          onPress={() => onChange?.(s)}
          activeOpacity={0.6}
          style={{
            padding: 4,
            cursor: "pointer" as any,
          }}
        >
          <View>
            <Text style={{ fontSize: size }}>
              {s <= value ? "\u2B50" : "\u2606"}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Route map (cross-platform) ──────────────────────────────────────────────
function RouteMap({ pickupLat, pickupLng, dropoffLat, dropoffLng }: {
  pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number;
}) {
  if (Platform.OS === "web") {
    // Web: use Leaflet iframe
    const centerLat = (pickupLat + dropoffLat) / 2;
    const centerLng = (pickupLng + dropoffLng) / 2;
    const html = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>html,body,#map{margin:0;height:100%;width:100%}</style>
</head><body><div id="map"></div><script>
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${centerLat},${centerLng}],12);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
L.circleMarker([${pickupLat},${pickupLng}],{radius:8,color:'#16A34A',fillColor:'#16A34A',fillOpacity:1}).addTo(map).bindTooltip('Pickup',{permanent:true,direction:'top',offset:[0,-10]});
L.circleMarker([${dropoffLat},${dropoffLng}],{radius:8,color:'#EF4444',fillColor:'#EF4444',fillOpacity:1}).addTo(map).bindTooltip('Dropoff',{permanent:true,direction:'top',offset:[0,-10]});
L.polyline([[${pickupLat},${pickupLng}],[${dropoffLat},${dropoffLng}]],{color:'#6366F1',weight:4,dashArray:'8,8'}).addTo(map);
map.fitBounds([[${pickupLat},${pickupLng}],[${dropoffLat},${dropoffLng}]],{padding:[40,40]});
<\/script></body></html>`;
    return (
      <View style={styles.mapContainer}>
        <iframe srcDoc={html} style={{ width: "100%", height: "100%", border: "none", borderRadius: 16 } as any} />
      </View>
    );
  }

  // Native: use DriverTrackingMapView (react-native-maps)
  return (
    <View style={styles.mapContainer}>
      <DriverTrackingMapView
        pickupLat={pickupLat}
        pickupLng={pickupLng}
        pickupLabel="Pickup"
        destLat={dropoffLat}
        destLng={dropoffLng}
        destLabel="Dropoff"
        height={200}
      />
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
// Active ride statuses that should show live tracking
const ACTIVE_STATUSES = ["searching", "matched", "driver_assigned", "driver_en_route", "driver_arrived", "ride_started", "ride_in_progress", "in_progress"];
const ACTIVE_STEPS = ["finding_driver", "driver_assigned", "driver_en_route", "driver_arrived", "ride_started", "ride_in_progress"];

export default function RideHistoryDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // setActiveRide no longer needed — live tracking shown directly here

  const [showComplaint, setShowComplaint] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [complaintCategory, setComplaintCategory] = useState<string | null>(null);
  const [complaintText, setComplaintText] = useState("");

  const { data: ride, isLoading } = trpc.rides.getRide.useQuery(
    { rideId: id ?? "" },
    { enabled: !!id, refetchInterval: 3000 },
  );

  // Poll live driver GPS for active rides
  const rideIsActive = ride ? (ACTIVE_STATUSES.includes(ride.status) || ACTIVE_STEPS.includes(ride.rideStep ?? "")) : false;
  const { data: driverLocation } = trpc.rides.getDriverLocation.useQuery(
    { rideId: id ?? "" },
    { enabled: !!id && rideIsActive, refetchInterval: 3000, retry: false },
  );

  const cancelMutation = trpc.rides.cancelRide.useMutation();
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const ratingMutation = trpc.rides.submitRating.useMutation({
    onSettled: (_data: any, error: any) => { if (!error) setRatingSubmitted(true); },
  } as any);

  // Fetch stops for shared rides
  const { data: rideStopsData = [] } = trpc.rides.getRideStops.useQuery(
    { rideId: id ?? "" },
    { enabled: !!id && ride?.mode === "share" },
  );

  // No redirect — live tracking is shown directly on this page for active rides

  if (isLoading || !ride) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Ride Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const createdDate = new Date(ride.createdAt);
  const dateStr = createdDate.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  const timeStr = createdDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const isCancelled = ride.status === "cancelled";
  const isCompleted = ride.status === "completed";
  const isActive = ACTIVE_STATUSES.includes(ride.status) || ACTIVE_STEPS.includes(ride.rideStep ?? "");

  let duration = ride.estimatedMinutes ?? 0;
  if (ride.startedAt && ride.completedAt) {
    duration = Math.round(
      (new Date(ride.completedAt).getTime() - new Date(ride.startedAt).getTime()) / 60000,
    );
  }

  const statusColors: Record<string, string> = {
    completed: "#16A34A", cancelled: "#EF4444", searching: "#F59E0B",
    matched: "#F59E0B", driver_assigned: "#7C3AED", driver_en_route: "#7C3AED",
    driver_arrived: "#6366F1", ride_started: "#1E88FF", ride_in_progress: "#1E88FF",
    in_progress: "#1E88FF", finding_driver: "#F59E0B",
  };
  const statusLabels: Record<string, string> = {
    completed: "Completed", cancelled: "Cancelled", searching: "Searching",
    matched: "Matched", driver_assigned: "Driver Assigned", driver_en_route: "Driver En Route",
    driver_arrived: "Driver Arrived", ride_started: "In Progress", ride_in_progress: "In Progress",
    in_progress: "In Progress", finding_driver: "Searching",
  };

  const shortName = (addr: string) => (addr || "Unknown").split(",")[0].trim();

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Ride Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Map — live tracking for active rides, static for completed */}
        {isActive ? (() => {
          const rideStep = ride.rideStep ?? "finding_driver";
          const isDriverComing = rideStep === "driver_assigned" || rideStep === "driver_en_route";
          const isRideInProgress = rideStep === "ride_started" || rideStep === "ride_in_progress";
          const pickupLat = Number(ride.pickupLat);
          const pickupLng = Number(ride.pickupLng);
          const dropoffLat = Number(ride.dropoffLat);
          const dropoffLng = Number(ride.dropoffLng);

          // Map origin/destination change based on ride step
          const mapOrigin = (isDriverComing && driverLocation)
            ? { lat: driverLocation.lat, lng: driverLocation.lng, label: ride.driverInfo?.name ?? "Driver" }
            : (isRideInProgress && driverLocation)
            ? { lat: driverLocation.lat, lng: driverLocation.lng, label: "Current Location" }
            : { lat: pickupLat, lng: pickupLng, label: shortName(ride.pickupAddress) };

          const mapDest = isDriverComing
            ? { lat: pickupLat, lng: pickupLng, label: shortName(ride.pickupAddress) }
            : { lat: dropoffLat, lng: dropoffLng, label: shortName(ride.dropoffAddress) };

          const stepLabels: Record<string, string> = {
            finding_driver: "Searching for driver...",
            driver_assigned: "Driver is heading to you",
            driver_en_route: "Driver is heading to you",
            driver_arrived: "Driver is waiting at pickup",
            ride_started: "On the way to destination",
            ride_in_progress: "On the way to destination",
          };

          return (
            <>
              <View style={{ height: 280, position: "relative" }}>
                <DriverTrackingMapView
                  pickupLat={mapOrigin.lat}
                  pickupLng={mapOrigin.lng}
                  pickupLabel={mapOrigin.label}
                  destLat={mapDest.lat}
                  destLng={mapDest.lng}
                  destLabel={mapDest.label}
                  driverLat={driverLocation?.lat ?? null}
                  driverLng={driverLocation?.lng ?? null}
                  driverLabel={ride.driverInfo?.name ?? "Driver"}
                  durationMin={ride.estimatedMinutes ?? 15}
                  height={280}
                />
                {/* Live tracking badge on map */}
                <View style={{
                  position: "absolute", bottom: 12, alignSelf: "center",
                  backgroundColor: "#7C3AED", borderRadius: 20,
                  paddingHorizontal: 16, paddingVertical: 8,
                  shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
                  flexDirection: "row", alignItems: "center", gap: 6,
                }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#16A34A" }} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>
                    {stepLabels[rideStep] ?? "Live Tracking"}
                  </Text>
                </View>
              </View>
            </>
          );
        })() : (
          <RouteMap
            pickupLat={Number(ride.pickupLat)} pickupLng={Number(ride.pickupLng)}
            dropoffLat={Number(ride.dropoffLat)} dropoffLng={Number(ride.dropoffLng)}
          />
        )}

        {/* Status + date */}
        <View style={styles.statusRow}>
          {(() => {
            const displayStatus = ride.rideStep ?? ride.status;
            const sColor = statusColors[displayStatus] ?? "#999";
            const sLabel = statusLabels[displayStatus] ?? displayStatus;
            return (
              <View style={[styles.statusBadge, { backgroundColor: sColor + "18" }]}>
                <View style={[styles.statusDot, { backgroundColor: sColor }]} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: sColor }}>
                  {sLabel}
                </Text>
              </View>
            );
          })()}
          <Text style={{ fontSize: 13, color: colors.muted }}>{dateStr}</Text>
        </View>

        {/* Driver info banner for active rides */}
        {isActive && ride.driverInfo && (
          <View style={[styles.card, { backgroundColor: "#7C3AED10", borderColor: "#7C3AED" }]}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{
                width: 50, height: 50, borderRadius: 25,
                backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center",
              }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}>{ride.driverInfo.avatar}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
                  {ride.driverInfo.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                  <IconSymbol name="star.fill" size={12} color="#F59E0B" />
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {ride.driverInfo.rating.toFixed(1)} · {ride.driverInfo.vehicle}
                    {ride.driverInfo.vehicleColor ? ` · ${ride.driverInfo.vehicleColor}` : ""}
                  </Text>
                </View>
                {ride.driverInfo.licensePlate ? (
                  <View style={{
                    marginTop: 4, backgroundColor: colors.background,
                    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6,
                    alignSelf: "flex-start", borderWidth: 1, borderColor: "#ddd",
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, letterSpacing: 1 }}>
                      {ride.driverInfo.licensePlate}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  style={{
                    width: 40, height: 40, borderRadius: 20,
                    borderWidth: 1.5, borderColor: "#7C3AED",
                    alignItems: "center", justifyContent: "center",
                  }}
                  onPress={() => {
                    if (Platform.OS === "web") {
                      window.open("tel:+18005550100");
                    } else {
                      Linking.openURL("tel:+18005550100").catch(() =>
                        Alert.alert("Unable to call", "Contact support from Help Center instead.")
                      );
                    }
                  }}
                  accessibilityLabel="Call support"
                >
                  <IconSymbol name="phone.fill" size={16} color="#7C3AED" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    width: 40, height: 40, borderRadius: 20,
                    borderWidth: 1.5, borderColor: "#7C3AED",
                    alignItems: "center", justifyContent: "center",
                  }}
                  onPress={() => router.push(`/active-ride?rideId=${ride.rideId}` as Href)}
                  accessibilityLabel="Open ride chat"
                >
                  <IconSymbol name="message.fill" size={16} color="#7C3AED" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Waiting for driver banner */}
        {isActive && !ride.driverInfo && (
          <View style={[styles.card, { backgroundColor: "#F59E0B10", borderColor: "#F59E0B" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <ActivityIndicator color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                  Finding your driver...
                </Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                  Connecting you with a nearby driver
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Route card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.routeRow}>
            <View style={styles.routeDots}>
              <View style={[styles.dot, { backgroundColor: "#16A34A" }]} />
              <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
              <View style={[styles.dot, { backgroundColor: "#EF4444" }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.labelSm, { color: colors.muted }]}>PICKUP</Text>
              <Text style={[styles.addrText, { color: colors.foreground }]}>{shortName(ride.pickupAddress)}</Text>
              <Text style={[styles.labelSm, { color: colors.muted, marginTop: 16 }]}>DROPOFF</Text>
              <Text style={[styles.addrText, { color: colors.foreground }]}>{shortName(ride.dropoffAddress)}</Text>
            </View>
          </View>
        </View>

        {/* Multi-stop timeline (for shared rides with stops) */}
        {rideStopsData.length > 0 && (
          <StopsList
            stops={rideStopsData as StopItem[]}
            currentUserId={undefined}
          />
        )}

        {/* Fare card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Fare Details</Text>
          <View style={[styles.fareRow, { borderBottomColor: colors.border }]}>
            <Text style={{ color: colors.muted }}>Base fare</Text>
            <Text style={{ fontWeight: "600", color: colors.foreground }}>${Number(ride.totalFare).toFixed(2)}</Text>
          </View>
          {ride.surgeMultiplier && Number(ride.surgeMultiplier) > 1 && (
            <View style={[styles.fareRow, { borderBottomColor: colors.border }]}>
              <Text style={{ color: colors.muted }}>Surge ({Number(ride.surgeMultiplier).toFixed(1)}x)</Text>
              <Text style={{ fontWeight: "600", color: "#F59E0B" }}>Applied</Text>
            </View>
          )}
          <View style={styles.fareTotalRow}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>Total</Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.primary }}>
              ${Number(ride.totalFare).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Trip info card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Trip Info</Text>
          <View style={styles.tripGrid}>
            <View style={styles.tripItem}>
              <IconSymbol name="clock.fill" size={18} color={colors.primary} />
              <Text style={[styles.tripValue, { color: colors.foreground }]}>{timeStr}</Text>
              <Text style={[styles.tripLabel, { color: colors.muted }]}>Time</Text>
            </View>
            <View style={styles.tripItem}>
              <IconSymbol name="timer" size={18} color={colors.primary} />
              <Text style={[styles.tripValue, { color: colors.foreground }]}>{duration} min</Text>
              <Text style={[styles.tripLabel, { color: colors.muted }]}>Duration</Text>
            </View>
            <View style={styles.tripItem}>
              <IconSymbol name="point.topleft.down.to.point.bottomright.curvepath.fill" size={18} color={colors.primary} />
              <Text style={[styles.tripValue, { color: colors.foreground }]}>{Number(ride.distanceKm).toFixed(1)} km</Text>
              <Text style={[styles.tripLabel, { color: colors.muted }]}>Distance</Text>
            </View>
            <View style={styles.tripItem}>
              <IconSymbol name="car.fill" size={18} color={colors.primary} />
              <Text style={[styles.tripValue, { color: colors.foreground }]}>{ride.mode === "share" ? "Share" : "Solo"}</Text>
              <Text style={[styles.tripLabel, { color: colors.muted }]}>Mode</Text>
            </View>
          </View>

          {/* Safety mode badge — only for shared rides */}
          {ride.mode === "share" && (() => {
            const sm = (ride as any).safetyMode as string | null | undefined;
            if (!sm || sm === "none") return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, backgroundColor: colors.background, borderRadius: 10, padding: 10 }}>
                <IconSymbol name="person.2.fill" size={16} color={colors.muted} />
                <View>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>Open to All</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Any rider can join this carpool</Text>
                </View>
              </View>
            );
            const SAFETY_META: Record<string, { label: string; desc: string; icon: any; color: string }> = {
              women_drivers_only: { label: "Women Drivers", desc: "Only female drivers accepted", icon: "shield.fill", color: "#EC4899" },
              women_companions_only: { label: "Women Riders", desc: "All passengers must be female", icon: "person.2.fill", color: "#8B5CF6" },
              women_only: { label: "Women Only", desc: "Driver + all passengers must be female", icon: "lock.shield.fill", color: "#6366F1" },
            };
            const meta = SAFETY_META[sm] ?? { label: sm.replace(/_/g, " "), desc: "", icon: "shield.fill", color: "#6366F1" };
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, backgroundColor: meta.color + "12", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: meta.color + "30" }}>
                <IconSymbol name={meta.icon} size={16} color={meta.color} />
                <View>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: meta.color }}>{meta.label}</Text>
                  {!!meta.desc && <Text style={{ fontSize: 11, color: colors.muted }}>{meta.desc}</Text>}
                </View>
              </View>
            );
          })()}
        </View>

        {/* Driver card — only for completed/cancelled rides (active rides show it above) */}
        {ride.driverInfo && !isActive && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Your Driver</Text>
            <View style={styles.driverRow}>
              <View style={[styles.driverAvatar, { backgroundColor: "#6366F1" }]}>
                <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>{ride.driverInfo.avatar}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
                  {ride.driverInfo.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <IconSymbol name="star.fill" size={14} color="#F59E0B" />
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {ride.driverInfo.rating.toFixed(1)} {"\u00B7"} {ride.driverInfo.totalTrips} trips
                  </Text>
                </View>
              </View>
            </View>
            {(ride.driverInfo.vehicle || ride.driverInfo.licensePlate) && (
              <View style={[styles.vehicleInfo, { backgroundColor: colors.background }]}>
                <IconSymbol name="car.fill" size={16} color={colors.primary} />
                <Text style={{ color: colors.foreground, marginLeft: 8, flex: 1 }}>
                  {ride.driverInfo.vehicleColor} {ride.driverInfo.vehicle}
                </Text>
                {ride.driverInfo.licensePlate && (
                  <View style={[styles.plateBadge, { backgroundColor: colors.primary + "15" }]}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                      {ride.driverInfo.licensePlate}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Rate driver */}
            {isCompleted && ride.driverInfo && (
              <View style={{ marginTop: 16, alignItems: "center", paddingVertical: 8 }}>
                {ratingSubmitted ? (
                  <View style={{ alignItems: "center", paddingVertical: 12 }}>
                    <IconSymbol name="checkmark.circle.fill" size={36} color="#16A34A" />
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#16A34A", marginTop: 8 }}>
                      Thank you for your feedback!
                    </Text>
                    <View style={{ flexDirection: "row", gap: 2, marginTop: 6 }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <View key={s}><Text style={{ fontSize: 20 }}>{s <= rating ? "\u2B50" : "\u2606"}</Text></View>
                      ))}
                    </View>
                    {feedbackText ? (
                      <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, fontStyle: "italic" }}>
                        {`"${feedbackText}"`}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, marginBottom: 10 }}>
                      How was your ride with {ride.driverInfo.name}?
                    </Text>
                    <StarRating
                      value={rating}
                      onChange={(score) => setRating(score)}
                    />
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>Tap a star to rate</Text>

                    {/* Feedback box appears after selecting stars */}
                    {rating > 0 && (
                      <View style={{ width: "100%", marginTop: 14 }}>
                        <TextInput
                          value={feedbackText}
                          onChangeText={setFeedbackText}
                          placeholder={rating >= 4 ? "What did you like about the ride? (optional)" : "Tell us what could be improved (optional)"}
                          placeholderTextColor={colors.muted}
                          multiline
                          maxLength={300}
                          style={{
                            backgroundColor: colors.background,
                            color: colors.foreground,
                            borderColor: colors.border,
                            borderWidth: 1,
                            borderRadius: 12,
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            fontSize: 14,
                            minHeight: 80,
                            textAlignVertical: "top",
                          }}
                        />
                        <TouchableOpacity
                          style={{
                            backgroundColor: colors.primary,
                            borderRadius: 10,
                            paddingVertical: 12,
                            alignItems: "center",
                            marginTop: 10,
                            opacity: ratingMutation.isPending ? 0.6 : 1,
                          }}
                          disabled={ratingMutation.isPending}
                          onPress={() => {
                            ratingMutation.mutate({
                              rideId: ride.rideId,
                              ratedUserId: Number(ride.driverInfo!.id),
                              ratingType: "driver",
                              score: rating,
                              comment: feedbackText.trim() || undefined,
                            });
                          }}
                        >
                          {ratingMutation.isPending ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
                              Submit Rating
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}

                    {ratingMutation.isError && (
                      <View style={{ marginTop: 10, backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: "100%" }}>
                        <Text style={{ fontSize: 13, color: "#EF4444", textAlign: "center" }}>
                          {ratingMutation.error?.message ?? "Failed to submit rating. Please try again."}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {/* Cancel reason */}
        {isCancelled && ride.cancelReason && (
          <View style={[styles.card, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <IconSymbol name="xmark.circle.fill" size={20} color="#EF4444" />
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#DC2626" }}>Cancelled</Text>
            </View>
            <Text style={{ fontSize: 14, color: "#7F1D1D", marginTop: 8 }}>{ride.cancelReason}</Text>
          </View>
        )}

        {/* Cancel / Track for active rides */}
        {isActive && (
          <View style={{ paddingHorizontal: 16, marginTop: 14, gap: 10 }}>
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center" }}
              onPress={() => router.push("/active-ride" as any)}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Track Ride</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                borderRadius: 14, paddingVertical: 14, alignItems: "center",
                borderWidth: 1.5, borderColor: "#EF4444", flexDirection: "row", justifyContent: "center", gap: 8,
              }}
              onPress={async () => {
                try {
                  await cancelMutation.mutateAsync({ rideId: ride.rideId });
                  router.back();
                } catch (e) {
                  console.warn("Cancel error:", e);
                }
              }}
              disabled={cancelMutation.isPending}
            >
              <IconSymbol name="xmark" size={16} color="#EF4444" />
              <Text style={{ color: "#EF4444", fontSize: 15, fontWeight: "700" }}>
                {cancelMutation.isPending ? "Cancelling..." : "Cancel Ride"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          {isCompleted && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowComplaint(true)}
            >
              <IconSymbol name="exclamationmark.bubble.fill" size={18} color={colors.error} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginTop: 4 }}>
                Report Issue
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push("/book-ride" as any)}
          >
            <IconSymbol name="arrow.counterclockwise" size={18} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginTop: 4 }}>
              Rebook
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Complaint Modal */}
      <Modal visible={showComplaint} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Report an Issue</Text>
              <TouchableOpacity onPress={() => setShowComplaint(false)}>
                <IconSymbol name="xmark" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 12 }}>Select a category:</Text>
              {COMPLAINT_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryRow,
                    { borderColor: complaintCategory === cat.id ? colors.primary : colors.border },
                    complaintCategory === cat.id && { backgroundColor: colors.primary + "10" },
                  ]}
                  onPress={() => setComplaintCategory(cat.id)}
                >
                  <IconSymbol
                    name={cat.icon as any}
                    size={18}
                    color={complaintCategory === cat.id ? colors.primary : colors.muted}
                  />
                  <Text style={{
                    fontSize: 14, fontWeight: "600", marginLeft: 10,
                    color: complaintCategory === cat.id ? colors.primary : colors.foreground,
                  }}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}

              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 16, marginBottom: 8 }}>
                Additional details (optional):
              </Text>
              <TextInput
                style={[styles.textInput, { borderColor: colors.border, color: colors.foreground }]}
                placeholder="Describe the issue..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={4}
                value={complaintText}
                onChangeText={setComplaintText}
              />
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: complaintCategory ? 1 : 0.5 }]}
              disabled={!complaintCategory}
              onPress={() => {
                setShowComplaint(false);
                setComplaintCategory(null);
                setComplaintText("");
              }}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Submit Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  mapContainer: { height: 200, marginHorizontal: 16, marginTop: 16, borderRadius: 16, overflow: "hidden" },
  statusRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4,
  },
  statusBadge: {
    flexDirection: "row", alignItems: "center", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, gap: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  card: { marginHorizontal: 16, marginTop: 14, borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  routeRow: { flexDirection: "row" },
  routeDots: { alignItems: "center", width: 20, marginRight: 12, paddingTop: 4 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  routeLine: { width: 2, flex: 1, marginVertical: 4 },
  labelSm: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  addrText: { fontSize: 15, fontWeight: "600", marginTop: 2 },
  fareRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fareTotalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12,
  },
  tripGrid: { flexDirection: "row", flexWrap: "wrap" },
  tripItem: { width: "50%", alignItems: "center", paddingVertical: 12 },
  tripValue: { fontSize: 16, fontWeight: "700", marginTop: 6 },
  tripLabel: { fontSize: 12, marginTop: 2 },
  driverRow: { flexDirection: "row", alignItems: "center" },
  driverAvatar: {
    width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
  },
  vehicleInfo: {
    flexDirection: "row", alignItems: "center", marginTop: 12, borderRadius: 10, padding: 10,
  },
  plateBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  actionsRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 20, gap: 10 },
  actionBtn: {
    flex: 1, alignItems: "center", borderRadius: 14, borderWidth: 1, paddingVertical: 16,
  },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16,
  },
  categoryRow: {
    flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1,
    padding: 12, marginBottom: 8,
  },
  textInput: {
    borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: "top",
  },
  submitBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 16,
  },
});
