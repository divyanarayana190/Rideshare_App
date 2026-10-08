import { lazy, Suspense } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import type { GoogleMapViewProps, DriverMarker, MapViewCommands } from "./GoogleMapView";

export type { GoogleMapViewProps, DriverMarker, MapViewCommands };

const GoogleMapView = lazy(() => import("./GoogleMapView"));

export default function GoogleMapViewLazy(props: GoogleMapViewProps) {
  return (
    <Suspense
      fallback={(
        <View style={[styles.placeholder, props.style as object]}>
          <ActivityIndicator size="small" color="#1E88FF" />
        </View>
      )}
    >
      <GoogleMapView {...props} />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: "#eae6df",
    alignItems: "center",
    justifyContent: "center",
  },
});
