import React, { useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";

interface MapProps {
  driverLocation?: { latitude: number; longitude: number };
  passengerLocation?: { latitude: number; longitude: number };
  destination?: { latitude: number; longitude: number };
  route?: { distance: number; duration: number };
  onMapPress?: () => void;
  showControls?: boolean;
}

/**
 * Live Map Component
 * 
 * In production, replace this with react-native-maps:
 * 
 * import MapView, { Marker, Polyline } from 'react-native-maps';
 * 
 * <MapView
 *   style={styles.map}
 *   initialRegion={{
 *     latitude: driverLocation?.latitude || 40.7128,
 *     longitude: driverLocation?.longitude || -74.006,
 *     latitudeDelta: 0.0922,
 *     longitudeDelta: 0.0421,
 *   }}
 * >
 *   {driverLocation && (
 *     <Marker
 *       coordinate={driverLocation}
 *       title="Driver"
 *       description="Your driver is here"
 *     >
 *       <View style={styles.driverMarker}>
 *         <IconSymbol name="car.fill" size={24} color="#fff" />
 *       </View>
 *     </Marker>
 *   )}
 *   {passengerLocation && (
 *     <Marker
 *       coordinate={passengerLocation}
 *       title="You"
 *     >
 *       <View style={styles.passengerMarker}>
 *         <IconSymbol name="location.circle.fill" size={24} color="#0a7ea4" />
 *       </View>
 *     </Marker>
 *   )}
 *   {destination && (
 *     <Marker
 *       coordinate={destination}
 *       title="Destination"
 *     >
 *       <View style={styles.destinationMarker}>
 *         <IconSymbol name="mappin.circle.fill" size={24} color="#22C55E" />
 *       </View>
 *     </Marker>
 *   )}
 * </MapView>
 */

export function LiveMap({
  driverLocation,
  passengerLocation,
  destination,
  route,
  onMapPress,
  showControls = true,
}: MapProps) {
  const colors = useColors();
  const [mapZoom, setMapZoom] = useState(1);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/* Map Placeholder - Replace with react-native-maps in production */}
      <View style={[styles.mapPlaceholder, { backgroundColor: colors.background }]}>
        {/* Simulate map with location indicators */}
        <View style={styles.mapContent}>
          {/* Driver Location */}
          {driverLocation && (
            <View
              style={[
                styles.marker,
                styles.driverMarker,
                {
                  top: `${50 + (driverLocation.latitude - 40.7) * 100}%`,
                  left: `${50 + (driverLocation.longitude + 74) * 100}%`,
                },
              ]}
            >
              <View style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 4 }}>
                <IconSymbol name="car.fill" size={20} color="#fff" />
              </View>
            </View>
          )}

          {/* Passenger Location */}
          {passengerLocation && (
            <View
              style={[
                styles.marker,
                {
                  top: `${50 + (passengerLocation.latitude - 40.7) * 100}%`,
                  left: `${50 + (passengerLocation.longitude + 74) * 100}%`,
                },
              ]}
            >
              <View style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 4 }}>
                <IconSymbol name="location.circle.fill" size={20} color="#fff" />
              </View>
            </View>
          )}

          {/* Destination */}
          {destination && (
            <View
              style={[
                styles.marker,
                {
                  top: `${50 + (destination.latitude - 40.7) * 100}%`,
                  left: `${50 + (destination.longitude + 74) * 100}%`,
                },
              ]}
            >
              <View style={{ backgroundColor: colors.success, borderRadius: 12, padding: 4 }}>
                <IconSymbol name="mappin.circle.fill" size={20} color="#fff" />
              </View>
            </View>
          )}

          {/* Route Info */}
          {route && (
            <View style={[styles.routeInfo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View>
                <Text style={{ fontSize: 12, color: colors.muted }}>Distance</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                  {route.distance} km
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 12 }} />
              <View>
                <Text style={{ fontSize: 12, color: colors.muted }}>ETA</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                  {route.duration} min
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Map Attribution */}
        <Text style={{ fontSize: 10, color: colors.muted, padding: 8, textAlign: "center" }}>
          Map view - Tap to open full map (requires react-native-maps)
        </Text>
      </View>

      {/* Map Controls */}
      {showControls && (
        <View style={[styles.controls, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            style={[styles.controlBtn, { backgroundColor: colors.primary }]}
            onPress={() => setMapZoom(Math.min(mapZoom + 1, 5))}
          >
            <IconSymbol name="plus" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, { backgroundColor: colors.primary }]}
            onPress={() => setMapZoom(Math.max(mapZoom - 1, 1))}
          >
            <IconSymbol name="minus" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, { backgroundColor: colors.primary }]}
            onPress={onMapPress}
          >
            <IconSymbol name="location.circle.fill" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  mapContent: {
    flex: 1,
    width: "100%",
    position: "relative",
  },
  marker: {
    position: "absolute",
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: -20,
    marginTop: -20,
  },
  driverMarker: {
    zIndex: 10,
  },
  routeInfo: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  controls: {
    position: "absolute",
    bottom: 12,
    right: 12,
    gap: 8,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
