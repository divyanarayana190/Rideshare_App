/**
 * RouteMapView – NATIVE (iOS / Android)
 * react-native-maps with Polyline route from OSRM and auto-fit region.
 */
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { IconSymbol } from "@/components/ui/icon-symbol";

export interface RouteMapViewProps {
  pickupLat: number;
  pickupLng: number;
  pickupLabel?: string;
  destLat: number;
  destLng: number;
  destLabel?: string;
  durationMin?: number;
  height?: number;
  style?: object;
  showRecenter?: boolean;
}

type LatLng = { latitude: number; longitude: number };

async function fetchRoute(
  pickupLat: number, pickupLng: number,
  destLat: number, destLng: number,
): Promise<LatLng[]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${destLng},${destLat}?overview=full&geometries=geojson`;
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

export default function RouteMapView({
  pickupLat, pickupLng, pickupLabel = "Pickup",
  destLat, destLng, destLabel = "Destination",
  height = 320,
  style,
  showRecenter = false,
}: RouteMapViewProps) {
  const fallback: LatLng[] = [
    { latitude: pickupLat, longitude: pickupLng },
    { latitude: destLat, longitude: destLng },
  ];
  const [routeCoords, setRouteCoords] = useState<LatLng[]>(fallback);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    fetchRoute(pickupLat, pickupLng, destLat, destLng).then(coords => {
      if (coords.length > 0) setRouteCoords(coords);
    });
  }, [pickupLat, pickupLng, destLat, destLng]);

  // Auto-fit the map to show pickup + destination
  useEffect(() => {
    if (!mapRef.current) return;
    const points: LatLng[] = [
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: destLat, longitude: destLng },
    ];
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [pickupLat, pickupLng, destLat, destLng]);

  const midLat = (pickupLat + destLat) / 2;
  const midLng = (pickupLng + destLng) / 2;
  const latDelta = Math.abs(destLat - pickupLat) * 1.6 + 0.02;
  const lngDelta = Math.abs(destLng - pickupLng) * 1.6 + 0.02;

  const fitRoute = () => {
    mapRef.current?.fitToCoordinates(
      [
        { latitude: pickupLat, longitude: pickupLng },
        { latitude: destLat, longitude: destLng },
      ],
      { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true },
    );
  };

  return (
    <View style={[{ height, overflow: "hidden" }, style]}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: midLat,
          longitude: midLng,
          latitudeDelta: latDelta,
          longitudeDelta: lngDelta,
        }}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#7C3AED"
            strokeWidth={4}
            lineDashPattern={routeCoords.length === 2 ? [12, 6] : undefined}
          />
        )}
        <Marker
          coordinate={{ latitude: pickupLat, longitude: pickupLng }}
          title={pickupLabel}
          pinColor="#16A34A"
        />
        <Marker
          coordinate={{ latitude: destLat, longitude: destLng }}
          title={destLabel}
          pinColor="#EF4444"
        />
      </MapView>
      {showRecenter && (
        <Pressable style={styles.recenterBtn} onPress={fitRoute} accessibilityLabel="Recenter map">
          <IconSymbol name="location.fill" size={18} color="#7C3AED" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  recenterBtn: {
    position: "absolute",
    right: 12,
    bottom: 12,
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
});
