import * as Location from "expo-location";

export type RealRideLocation = {
  address: string;
  lat: number;
  lng: number;
  shortName: string;
};

function compactAddress(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ");
}

export async function requestLocationPermission() {
  const result = await Location.requestForegroundPermissionsAsync();
  if (result.status !== "granted") {
    throw new Error("Location permission denied");
  }
  return result;
}

export async function getCurrentRideLocation(): Promise<RealRideLocation> {
  await requestLocationPermission();

  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const lat = current.coords.latitude;
  const lng = current.coords.longitude;

  let shortName = "My Location";
  let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  try {
    const reverse = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });

    const first = reverse[0];
    if (first) {
      shortName = first.name || first.street || first.city || "My Location";

      address = compactAddress([
        first.name,
        first.street,
        first.city,
        first.region,
        first.postalCode,
        first.country,
      ]);
    }
  } catch {
    // fallback is coordinates
  }

  return {
    address,
    lat,
    lng,
    shortName,
  };
}

export async function reverseGeocodeRideLocation(
  lat: number,
  lng: number,
  fallbackLabel?: string,
): Promise<RealRideLocation> {
  let shortName = fallbackLabel || "Selected Location";
  let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  try {
    const reverse = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });

    const first = reverse[0];
    if (first) {
      shortName =
        first.name ||
        first.street ||
        first.city ||
        fallbackLabel ||
        "Selected Location";

      address = compactAddress([
        first.name,
        first.street,
        first.city,
        first.region,
        first.postalCode,
        first.country,
      ]);
    }
  } catch {
    // fallback is coordinates
  }

  return {
    address,
    lat,
    lng,
    shortName,
  };
}
