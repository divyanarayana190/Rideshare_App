// Maps service for location tracking and route calculation
// This module provides utilities for GPS, routing, and geofencing
// In production, integrate with Google Maps API or similar

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Route {
  distance: number; // in kilometers
  duration: number; // in minutes
  polyline: string; // encoded polyline for map display
}

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

// ============================================================================
// Location Services
// ============================================================================

export async function requestLocationPermission(): Promise<boolean> {
  try {
    // In production, use expo-location or react-native-geolocation
    console.log("[Maps] Location permission requested");
    return true;
  } catch (error) {
    console.error("[Maps] Error requesting location permission:", error);
    return false;
  }
}

export async function getCurrentLocation(): Promise<Coordinates | null> {
  try {
    // In production, use expo-location or react-native-geolocation
    // For now, return mock location (New York)
    return {
      latitude: 40.7128,
      longitude: -74.006,
    };
  } catch (error) {
    console.error("[Maps] Error getting current location:", error);
    return null;
  }
}

export async function watchLocation(
  callback: (location: LocationUpdate) => void,
  interval: number = 5000
): Promise<string | null> {
  try {
    // In production, use expo-location or react-native-geolocation
    // For now, simulate location updates
    const watchId = setInterval(() => {
      callback({
        latitude: 40.7128 + (Math.random() - 0.5) * 0.01,
        longitude: -74.006 + (Math.random() - 0.5) * 0.01,
        accuracy: 10,
        timestamp: Date.now(),
      });
    }, interval);

    return watchId.toString();
  } catch (error) {
    console.error("[Maps] Error watching location:", error);
    return null;
  }
}

export async function stopWatchingLocation(subscription: string): Promise<void> {
  try {
    if (subscription) {
      clearInterval(parseInt(subscription));
      console.log("[Maps] Stopped watching location");
    }
  } catch (error) {
    console.error("[Maps] Error stopping location watch:", error);
  }
}

// ============================================================================
// Route Calculation
// ============================================================================

export async function calculateRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<Route | null> {
  try {
    const lat1 = origin.latitude;
    const lon1 = origin.longitude;
    const lat2 = destination.latitude;
    const lon2 = destination.longitude;

    // Haversine formula for distance
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Estimate duration (average 40 km/h in city)
    const duration = Math.round((distance / 40) * 60);

    // Mock polyline (in production, get from routing API)
    const polyline = encodePolyline([origin, destination]);

    return {
      distance: parseFloat(distance.toFixed(2)),
      duration,
      polyline,
    };
  } catch (error) {
    console.error("[Maps] Error calculating route:", error);
    return null;
  }
}

export async function getDistanceBetweenPoints(
  point1: Coordinates,
  point2: Coordinates
): Promise<number> {
  try {
    const route = await calculateRoute(point1, point2);
    return route?.distance || 0;
  } catch (error) {
    console.error("[Maps] Error getting distance:", error);
    return 0;
  }
}

// ============================================================================
// Geocoding
// ============================================================================

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  try {
    // In production, use Google Geocoding API
    // For now, return mock coordinates
    console.log(`[Maps] Geocoding address: ${address}`);
    return {
      latitude: 40.7128,
      longitude: -74.006,
    };
  } catch (error) {
    console.error("[Maps] Error geocoding address:", error);
    return null;
  }
}

export async function reverseGeocodeLocation(
  coordinates: Coordinates
): Promise<string | null> {
  try {
    // In production, use Google Reverse Geocoding API
    // For now, return mock address
    console.log(`[Maps] Reverse geocoding: ${coordinates.latitude}, ${coordinates.longitude}`);
    return "123 Main Street, New York, NY 10001";
  } catch (error) {
    console.error("[Maps] Error reverse geocoding:", error);
    return null;
  }
}

// ============================================================================
// Polyline Encoding/Decoding
// ============================================================================

function encodePolyline(points: Coordinates[]): string {
  let encoded = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.latitude * 1e5);
    const lng = Math.round(point.longitude * 1e5);

    encoded += encodeValue(lat - prevLat);
    encoded += encodeValue(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

function encodeValue(value: number): string {
  value = value << 1;
  if (value < 0) value = ~value;

  let encoded = "";
  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  encoded += String.fromCharCode(value + 63);
  return encoded;
}

export function decodePolyline(encoded: string): Coordinates[] {
  const points: Coordinates[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += (result & 1) ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += (result & 1) ? ~(result >> 1) : result >> 1;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}

// ============================================================================
// Geofencing
// ============================================================================

export function isWithinRadius(
  center: Coordinates,
  point: Coordinates,
  radiusKm: number
): boolean {
  const R = 6371; // Earth's radius in km
  const dLat = ((point.latitude - center.latitude) * Math.PI) / 180;
  const dLon = ((point.longitude - center.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((center.latitude * Math.PI) / 180) *
      Math.cos((point.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance <= radiusKm;
}

export function calculateBearing(
  from: Coordinates,
  to: Coordinates
): number {
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = Math.atan2(y, x);

  return ((bearing * 180) / Math.PI + 360) % 360;
}
