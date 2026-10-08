/**
 * PinMapView – Native (iOS / Android)
 *
 * react-native-maps with PROVIDER_GOOGLE — replaces the previous WebView/OSM build.
 * The "pin trick": the pin overlay is rendered in book-ride.tsx as an absolute View
 * above this component; this component only provides the draggable map surface.
 *
 * Events:
 *  onCenterChange  — fires with new lat/lng when map settles after user pan
 *  onDragStart     — fires once when user begins panning (for pin lift animation)
 *  onDragEnd       — fires when map settles after user pan (for pin drop animation)
 *  onMyLocation    — unused here; GPS is handled in book-ride.tsx directly
 *
 * recenterTo  — animated camera fly to new lat/lng/zoom
 * zoomCmd     — step zoom in/out while preserving current center
 */
import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";

export interface PinMapViewProps {
  lat: number;
  lng: number;
  zoom?: number;
  height?: number | string;
  onCenterChange?: (lat: number, lng: number) => void;
  onMyLocation?: (lat: number, lng: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  recenterTo?: { lat: number; lng: number; t: number; zoom?: number; isMyLocation?: boolean } | null;
  zoomCmd?: { delta: number; t: number } | null;
}

/** Approximate latitudeDelta for a given zoom level (Mercator projection). */
function zoomToLatDelta(zoom: number): number {
  return 180 / Math.pow(2, zoom - 1);
}

export default function PinMapView({
  lat,
  lng,
  zoom = 16,
  onCenterChange,
  onDragStart,
  onDragEnd,
  recenterTo,
  zoomCmd,
}: PinMapViewProps) {
  const mapRef = useRef<any>(null);
  const initialDelta = zoomToLatDelta(zoom);

  // Track current region so zoom commands can adjust relative to current center
  const currentRegionRef = useRef({
    latitude: lat,
    longitude: lng,
    latitudeDelta: initialDelta,
    longitudeDelta: initialDelta,
  });

  // Distinguish user drags from programmatic camera moves so pin animations
  // only fire for real touch gestures, not for recenterTo/zoomCmd.
  const isProgrammaticRef = useRef(false);
  const isDraggingRef = useRef(false);

  // Animate camera when recenterTo changes
  useEffect(() => {
    if (!recenterTo) return;
    const delta = zoomToLatDelta(recenterTo.zoom ?? 16);
    isProgrammaticRef.current = true;
    mapRef.current?.animateToRegion(
      { latitude: recenterTo.lat, longitude: recenterTo.lng, latitudeDelta: delta, longitudeDelta: delta },
      480,
    );
  }, [recenterTo?.t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step zoom in/out
  useEffect(() => {
    if (!zoomCmd) return;
    const { latitude, longitude, latitudeDelta, longitudeDelta } = currentRegionRef.current;
    const factor = zoomCmd.delta > 0 ? 0.5 : 2.0;
    isProgrammaticRef.current = true;
    mapRef.current?.animateToRegion(
      { latitude, longitude, latitudeDelta: latitudeDelta * factor, longitudeDelta: longitudeDelta * factor },
      300,
    );
  }, [zoomCmd?.t]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        latitude: lat,
        longitude: lng,
        latitudeDelta: initialDelta,
        longitudeDelta: initialDelta,
      }}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      moveOnMarkerPress={false}
      // onPanDrag fires only on user touch gestures — not programmatic animateToRegion.
      // We use it to detect drag start reliably without false positives from animations.
      onPanDrag={() => {
        if (!isDraggingRef.current) {
          isDraggingRef.current = true;
          onDragStart?.();
        }
      }}
      onRegionChangeComplete={(region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => {
        currentRegionRef.current = region;
        const wasDragging = isDraggingRef.current;
        isDraggingRef.current = false;
        isProgrammaticRef.current = false;
        if (wasDragging) {
          onDragEnd?.();
        }
        onCenterChange?.(region.latitude, region.longitude);
      }}
    />
  );
}
