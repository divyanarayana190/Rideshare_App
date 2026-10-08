/**
 * DriverTrackingMapView – NATIVE (iOS / Android)
 * react-native-maps with animated driver marker, route polyline,
 * and auto-fitting region.
 *
 * Marker design:
 *  • Pickup   → green filled circle + "PICKUP" pill label to the right
 *  • Dest     → black teardrop pin + label pill to the right (no vertical stack)
 *  • Driver   → amber circle with car emoji
 */
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

export interface StopMarker {
  lat: number;
  lng: number;
  stopType: string;
  passengerName: string;
  sequence: number;
  status: string;
  isCurrentUser: boolean;
}

export interface DriverTrackingMapViewProps {
  pickupLat: number;
  pickupLng: number;
  pickupLabel?: string;
  destLat: number;
  destLng: number;
  destLabel?: string;
  driverLat?: number | null;
  driverLng?: number | null;
  driverHeading?: number | null;
  driverSpeedMs?: number | null;
  driverLabel?: string;
  durationMin?: number;
  height?: number;
  style?: object;
  stops?: StopMarker[];
  mapMode?: "approaching" | "in_ride";
  routeStartLat?: number | null;
  routeStartLng?: number | null;
  /** Google-encoded polyline from server — used for in_ride route without re-fetching OSRM */
  preloadedPolyline?: string | null;
  /** Pixels of bottom padding (sheet height + safe area) to leave clear when auto-fitting */
  bottomPadding?: number;
  /** True for finding_driver preview route — renders dashed; active routes are always solid */
  isDashed?: boolean;
  // Navigation enhancement props (used by web variant; native ignores them)
  isFullscreen?: boolean;
  nightMode?: boolean;
  completedRoutePoints?: { lat: number; lng: number }[];
  remainingRoutePoints?: { lat: number; lng: number }[];
  routeProgress?: number;
  isNearingDestination?: boolean;
  onRecenter?: () => void;
  onFullscreenToggle?: () => void;
  onNightModeToggle?: () => void;
}

type LatLng = { latitude: number; longitude: number };

/** Decode a Google-encoded polyline string into LatLng coordinates. */
function decodePolyline(encoded: string): LatLng[] {
  const poly: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    poly.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return poly;
}

async function fetchRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): Promise<LatLng[]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes?.[0]) return [];
    return (data.routes[0].geometry.coordinates as [number, number][]).map(
      ([lng, lat]) => ({ latitude: lat, longitude: lng }),
    );
  } catch {
    return [];
  }
}

export default function DriverTrackingMapView({
  pickupLat, pickupLng, pickupLabel = "Pickup",
  destLat, destLng, destLabel = "Destination",
  driverLat, driverLng, driverLabel = "Driver",
  height = 280,
  style,
  stops = [],
  mapMode = "in_ride",
  routeStartLat,
  routeStartLng,
  preloadedPolyline,
  bottomPadding = 0,
  isDashed = false,
}: DriverTrackingMapViewProps) {
  const hasDriver = driverLat != null && driverLng != null;

  const rsLat = mapMode === "approaching" ? (routeStartLat ?? driverLat ?? pickupLat) : pickupLat;
  const rsLng = mapMode === "approaching" ? (routeStartLng ?? driverLng ?? pickupLng) : pickupLng;
  const reLat = mapMode === "approaching" ? pickupLat : destLat;
  const reLng = mapMode === "approaching" ? pickupLng : destLng;

  // Fallback: straight line shows immediately, replaced when route loads
  const fallback: LatLng[] = [
    { latitude: rsLat!, longitude: rsLng! },
    { latitude: reLat, longitude: reLng },
  ];
  const [routeCoords, setRouteCoords] = useState<LatLng[]>(fallback);
  const [routeReady, setRouteReady] = useState(false);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    setRouteCoords([
      { latitude: rsLat!, longitude: rsLng! },
      { latitude: reLat, longitude: reLng },
    ]);
    setRouteReady(false);

    // Use preloaded Google polyline when available (in_ride mode) — avoids unreliable public OSRM
    if (preloadedPolyline && mapMode === "in_ride") {
      const decoded = decodePolyline(preloadedPolyline);
      if (decoded.length > 1) {
        setRouteCoords(decoded);
        setRouteReady(true);
        return;
      }
    }

    fetchRoute(rsLat!, rsLng!, reLat, reLng).then(coords => {
      if (coords.length > 1) {
        setRouteCoords(coords);
        setRouteReady(true);
      }
    });
  }, [rsLat, rsLng, reLat, reLng, preloadedPolyline, mapMode]);

  // Auto-fit region — fires on route endpoint changes, driver first acquired, or sheet snap.
  // driverLat/driverLng intentionally omitted: we don't refit on every GPS tick.
  useEffect(() => {
    if (!mapRef.current) return;
    const points: LatLng[] = [
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: destLat, longitude: destLng },
    ];
    if (hasDriver) points.push({ latitude: driverLat!, longitude: driverLng! });
    stops.forEach(s => {
      if (s.lat && s.lng) points.push({ latitude: s.lat, longitude: s.lng });
    });
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: 60, right: 60, bottom: bottomPadding + 60, left: 60 },
        animated: true,
      });
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- driverLat/driverLng excluded: refit only on step/snap changes, not every GPS tick; stops.length guards count changes
  }, [pickupLat, pickupLng, destLat, destLng, hasDriver, bottomPadding, stops.length]);

  // Fallback initial region
  const allLats = [pickupLat, destLat, ...(hasDriver ? [driverLat!] : [])];
  const allLngs = [pickupLng, destLng, ...(hasDriver ? [driverLng!] : [])];
  const midLat = (Math.min(...allLats) + Math.max(...allLats)) / 2;
  const midLng = (Math.min(...allLngs) + Math.max(...allLngs)) / 2;
  const latDelta = Math.max((Math.max(...allLats) - Math.min(...allLats)) * 1.7, 0.025);
  const lngDelta = Math.max((Math.max(...allLngs) - Math.min(...allLngs)) * 1.7, 0.025);

  // Truncate label to max 18 chars
  const shortPickup = (pickupLabel ?? "Pickup").slice(0, 18);
  const shortDest   = (destLabel   ?? "Destination").slice(0, 18);

  return (
    <View style={style ? [{ overflow: "hidden" }, style] : { height, overflow: "hidden" }}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: midLat, longitude: midLng, latitudeDelta: latDelta, longitudeDelta: lngDelta }}
        showsCompass={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        scrollEnabled={true}
        zoomEnabled={true}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {/* Route polyline */}
        <Polyline
          coordinates={routeCoords}
          strokeColor="#7C3AED"
          strokeWidth={4}
          lineDashPattern={!routeReady && isDashed ? [14, 7] : undefined}
        />

        {/* ── Pickup marker ── */}
        <Marker
          coordinate={{ latitude: pickupLat, longitude: pickupLng }}
          anchor={{ x: 0, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={mk.pickupRow}>
            <View style={mk.pickupCircle} />
            <View style={mk.pickupLabel}>
              <Text style={mk.pickupLabelText} numberOfLines={1}>{shortPickup}</Text>
            </View>
          </View>
        </Marker>

        {/* ── Destination marker ── */}
        <Marker
          coordinate={{ latitude: destLat, longitude: destLng }}
          anchor={{ x: 0, y: 1 }}
          tracksViewChanges={false}
        >
          <View style={mk.destRow}>
            <View style={mk.destPinCol}>
              <View style={mk.destPin}>
                <View style={mk.destPinDot} />
              </View>
              <View style={mk.destStem} />
            </View>
            <View style={mk.destLabel}>
              <Text style={mk.destLabelText} numberOfLines={1}>{shortDest}</Text>
            </View>
          </View>
        </Marker>

        {/* ── Driver marker ── */}
        {hasDriver && (
          <Marker
            coordinate={{ latitude: driverLat!, longitude: driverLng! }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={true}
          >
            <View style={mk.driverWrap}>
              <View style={mk.driverPulse} />
              <View style={mk.driverDot}>
                <Text style={mk.driverIcon}>🚗</Text>
              </View>
            </View>
          </Marker>
        )}

        {/* ── Shared ride stop markers ── */}
        {stops.map((stop, i) => {
          const isPickup = stop.stopType === "pickup";
          const bg = stop.isCurrentUser ? "#7C3AED" : (isPickup ? "#16A34A" : "#EF4444");
          return (
            <Marker
              key={`stop-${i}`}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={[mk.stopDot, { backgroundColor: bg }]}>
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{stop.sequence}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const mk = StyleSheet.create({
  // Pickup
  pickupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pickupCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#16A34A",
    borderWidth: 2.5,
    borderColor: "#fff",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  pickupLabel: {
    backgroundColor: "#16A34A",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 60,
    maxWidth: 130,
  },
  pickupLabelText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
  },

  // Destination
  destRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  destPinCol: {
    alignItems: "center",
  },
  destPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#111827",
    borderWidth: 2.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  destPinDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#fff",
  },
  destStem: {
    width: 2,
    height: 6,
    backgroundColor: "#111827",
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
  },
  destLabel: {
    backgroundColor: "#111827",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 60,
    maxWidth: 130,
    marginBottom: 8,
  },
  destLabelText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },

  // Driver
  driverWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  driverPulse: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(245,158,11,0.22)",
  },
  driverDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  driverIcon: { fontSize: 15 },

  // Stop
  stopDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
