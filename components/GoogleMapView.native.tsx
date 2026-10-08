/**
 * GoogleMapView – NATIVE (iOS / Android) implementation
 * Uses react-native-maps with PROVIDER_GOOGLE.
 */
import { Platform, StyleSheet, View } from "react-native";
import { useEffect } from "react";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

export interface DriverMarker {
  id: string;
  lat: number;
  lng: number;
}

export interface GoogleMapViewProps {
  userLat?: number;
  userLng?: number;
  drivers?: DriverMarker[];
  style?: object;
  zoom?: number;
  onMyLocation?: (lat: number, lng: number) => void;
  onMapReady?: (api: import("./GoogleMapView.web").MapViewCommands) => void;
}

// Approximate zoom → delta conversion
function zoomToDelta(zoom: number): number {
  return 360 / Math.pow(2, zoom);
}

export default function GoogleMapView({
  userLat = 40.7128,
  userLng = -74.006,
  drivers = [],
  style,
  zoom = 15,
  onMyLocation,
  onMapReady,
}: GoogleMapViewProps) {
  const delta = zoomToDelta(zoom);

  useEffect(() => {
    onMapReady?.({
      zoomIn: () => {},
      zoomOut: () => {},
      recenter: () => {},
    });
  }, [onMapReady]);

  return (
    <View style={[styles.container, style]}>
      <MapView
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFill}
        region={{
          latitude: userLat,
          longitude: userLng,
          latitudeDelta: delta,
          longitudeDelta: delta,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        onUserLocationChange={onMyLocation ? (e: any) => {
          const coord = e.nativeEvent?.coordinate;
          if (coord) onMyLocation(coord.latitude, coord.longitude);
        } : undefined}
        customMapStyle={[
          { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
          { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9e8f7" }] },
          { featureType: "poi", stylers: [{ visibility: "off" }] },
        ]}
      >
        {/* Nearby driver markers */}
        {drivers.map((d) => (
          <Marker
            key={d.id}
            coordinate={{ latitude: d.lat, longitude: d.lng }}
            title="Nearby driver"
            pinColor="#1E88FF"
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
});
