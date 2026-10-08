import logger from "../logger";

const GMAP_KEY: string = process.env.GOOGLE_MAPS_API_KEY ?? "";

if (!GMAP_KEY) {
  logger.warn("[googleMaps] GOOGLE_MAPS_API_KEY not set — using free Photon/Nominatim fallback");
}

export type AutocompletePrediction = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
  distanceKm?: number;
  placeType?: "transit" | "airport" | "restaurant" | "hotel" | "hospital" | "gas" | "address" | "poi" | "city";
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Score how well a result matches the query — higher = better */
function relevanceScore(fullText: string, query: string, distanceKm?: number): number {
  const q = query.toLowerCase().trim();
  const t = fullText.toLowerCase();
  let score = 0;
  if (t.startsWith(q)) score += 100;
  else if (t.includes(q)) score += 60;
  else {
    // Partial word match
    const words = q.split(/\s+/);
    const matched = words.filter(w => t.includes(w)).length;
    score += (matched / words.length) * 40;
  }
  // Proximity bonus: nearby = higher score
  if (distanceKm !== undefined) {
    score += Math.max(0, 20 - distanceKm * 0.5);
  }
  return score;
}

function detectPlaceType(tags: Record<string, string>, name: string): AutocompletePrediction["placeType"] {
  const n = name.toLowerCase();
  if (tags.aeroway || n.includes("airport") || n.includes("airfield")) return "airport";
  if (tags.railway === "station" || tags.public_transport || n.includes(" station") ||
    n.includes("transit") || n.includes(" path ") || n.includes("train") ||
    n.includes("subway") || n.includes("metro") || n.includes("bus terminal") ||
    n.includes("port authority") || n.includes("penn station") || n.includes("grand central"))
    return "transit";
  if (tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "fast_food") return "restaurant";
  if (tags.tourism === "hotel" || tags.amenity === "hotel") return "hotel";
  if (tags.amenity === "hospital" || tags.amenity === "clinic") return "hospital";
  if (tags.amenity === "fuel" || tags.shop === "gas") return "gas";
  if (tags.place === "city" || tags.place === "town" || tags.place === "village") return "city";
  return "poi";
}

/** Deduplicate results within 150m of each other — keep higher-scored */
function deduplicateByProximity(results: (AutocompletePrediction & { _lat: number; _lng: number; _score: number })[]): AutocompletePrediction[] {
  const kept: (AutocompletePrediction & { _lat: number; _lng: number; _score: number })[] = [];
  for (const r of results) {
    const near = kept.find(k => haversineKm(k._lat, k._lng, r._lat, r._lng) < 0.15);
    if (!near) {
      kept.push(r);
    } else if (r._score > near._score) {
      // Replace with better match
      const idx = kept.indexOf(near);
      kept[idx] = r;
    }
  }
  return kept.map(({ _lat: _l, _lng: _g, _score: _s, ...rest }) => rest);
}

// ─── Simple in-memory cache (5 min TTL) ──────────────────────────────────────

type CacheEntry = { results: AutocompletePrediction[]; ts: number };
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 500;

function cacheGet(key: string): AutocompletePrediction[] | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { searchCache.delete(key); return null; }
  return entry.results;
}

function cacheSet(key: string, results: AutocompletePrediction[]): void {
  if (searchCache.size >= CACHE_MAX) {
    // Evict oldest
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) searchCache.delete(oldest[0]);
  }
  searchCache.set(key, { results, ts: Date.now() });
}

// ─── Photon (Komoot / OpenStreetMap) ─────────────────────────────────────────

async function photonSearch(
  input: string,
  userLat?: number,
  userLng?: number,
): Promise<(AutocompletePrediction & { _lat: number; _lng: number; _score: number })[]> {
  let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(input)}&limit=8&lang=en`;
  if (userLat !== undefined && userLng !== undefined) {
    url += `&lat=${userLat}&lon=${userLng}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "YOORideshare/2.0 (contact@yoo.app)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const data = await res.json();
    const features: any[] = data.features ?? [];

    const out: (AutocompletePrediction & { _lat: number; _lng: number; _score: number })[] = [];
    for (const f of features) {
      const p = f.properties ?? {};
      const [lng, lat] = f.geometry?.coordinates ?? [0, 0];
      if (!lat || !lng) continue;

      const name = p.name ?? "";
      const house = p.housenumber ?? "";
      const street = p.street ?? "";
      let primary: string;
      if (name) primary = name;
      else if (house && street) primary = `${house} ${street}`;
      else if (street) primary = street;
      else continue;

      const city = p.city ?? p.town ?? p.village ?? p.county ?? "";
      const state = p.state ?? "";
      const country = p.country ?? "";
      const secondaryParts: string[] = [];
      if (city) secondaryParts.push(city);
      if (state) secondaryParts.push(state);
      // Only show country if not US (since we're a US app)
      if (country && country !== "United States") secondaryParts.push(country);
      const secondary = secondaryParts.join(", ");
      const fullText = [primary, secondary].filter(Boolean).join(", ");

      const distanceKm = (userLat !== undefined && userLng !== undefined)
        ? haversineKm(userLat, userLng, lat, lng) : undefined;
      const placeType = detectPlaceType(p, primary + " " + (p.osm_value ?? ""));
      const _score = relevanceScore(fullText, input, distanceKm);

      out.push({
        placeId: `photon:${p.osm_type ?? "N"}:${p.osm_id ?? 0}:${lat}:${lng}`,
        primaryText: primary,
        secondaryText: secondary,
        fullText,
        distanceKm,
        placeType,
        _lat: lat,
        _lng: lng,
        _score,
      });
    }
    return out;
  } catch (err: any) {
    clearTimeout(timeout);
    return [];
  }
}

// ─── Nominatim (OpenStreetMap) ────────────────────────────────────────────────

async function nominatimSearch(
  input: string,
  userLat?: number,
  userLng?: number,
): Promise<(AutocompletePrediction & { _lat: number; _lng: number; _score: number })[]> {
  // Include broader US search + proximity boost
  let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&limit=8&addressdetails=1&countrycodes=us&dedupe=1&featuretype=settlement,highway,amenity,railway`;
  if (userLat !== undefined && userLng !== undefined) {
    // Viewbox of ~50km around user but not bounded — just boosts nearby
    const delta = 0.45;
    url += `&viewbox=${userLng - delta},${userLat + delta},${userLng + delta},${userLat - delta}&bounded=0`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "YOORideshare/2.0 (contact@yoo.app)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const data: any[] = await res.json();
    const out: (AutocompletePrediction & { _lat: number; _lng: number; _score: number })[] = [];

    for (const item of data) {
      const addr = item.address ?? {};
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      if (!lat || !lng) continue;

      const streetNum = addr.house_number ?? "";
      const street = addr.road ?? addr.pedestrian ?? addr.path ?? addr.footway ?? "";
      const poiName = item.name ?? "";
      let primary: string;
      if (poiName && poiName !== streetNum) primary = poiName;
      else if (streetNum && street) primary = `${streetNum} ${street}`;
      else if (street) primary = street;
      else primary = (item.display_name ?? "").split(",")[0].trim() || input;

      const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? "";
      const state = addr.state ?? "";
      const secondary = [city, state].filter(Boolean).join(", ");
      const fullText = item.display_name || [primary, secondary].filter(Boolean).join(", ");

      const distanceKm = (userLat !== undefined && userLng !== undefined)
        ? haversineKm(userLat, userLng, lat, lng) : undefined;
      const tags: Record<string, string> = {};
      if (item.type) tags[item.class ?? ""] = item.type;
      const placeType = detectPlaceType(tags, primary);
      const _score = relevanceScore(fullText, input, distanceKm);

      out.push({
        placeId: `photon:N:${item.osm_id}:${lat}:${lng}`,
        primaryText: primary,
        secondaryText: secondary,
        fullText,
        distanceKm,
        placeType,
        _lat: lat,
        _lng: lng,
        _score,
      });
    }
    return out;
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

// ─── Reverse geocode ──────────────────────────────────────────────────────────

async function reverseGeocode(lat: number, lng: number, placeId: string) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "YOORideshare/2.0 (contact@yoo.app)" },
    });
    if (!res.ok) throw new Error("reverse failed");
    const data = await res.json();
    const addr = data.address ?? {};

    const houseNum = addr.house_number ?? "";
    const street = addr.road ?? addr.pedestrian ?? addr.path ?? addr.footway ?? "";
    let shortName: string;
    if (houseNum && street) shortName = `${houseNum} ${street}`;
    else if (street) shortName = street;
    else if (data.name && data.name !== houseNum) shortName = data.name;
    else shortName = (data.display_name ?? "").split(",")[0] || "Selected Place";

    return {
      placeId,
      shortName,
      address: data.display_name || `${lat}, ${lng}`,
      lat: parseFloat(data.lat) || lat,
      lng: parseFloat(data.lon) || lng,
    };
  } catch {
    return { placeId, shortName: "Selected Place", address: `${lat}, ${lng}`, lat, lng };
  }
}

// ─── OSRM Route Estimate ──────────────────────────────────────────────────────

async function osrmRouteWithPolyline(params: {
  originLat: number; originLng: number;
  destinationLat: number; destinationLng: number;
}) {
  const fallback = haversineFallbackRoute(params);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${params.originLng},${params.originLat};${params.destinationLng},${params.destinationLat}?overview=full&geometries=polyline`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return fallback;
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return fallback;
    return {
      distanceKm: (route.distance ?? 0) / 1000,
      durationMin: (route.duration ?? 0) / 60,
      polyline: (route.geometry as string | undefined) ?? null,
    };
  } catch {
    return fallback;
  }
}

function haversineFallbackRoute(params: {
  originLat: number; originLng: number;
  destinationLat: number; destinationLng: number;
}) {
  const distKm = haversineKm(
    params.originLat, params.originLng,
    params.destinationLat, params.destinationLng,
  ) * 1.3;
  return {
    distanceKm: distKm,
    durationMin: distKm * 2.0,
    polyline: null as string | null,
  };
}

async function osrmRouteEstimate(params: {
  originLat: number; originLng: number;
  destinationLat: number; destinationLng: number;
}) {
  const full = await osrmRouteWithPolyline(params);
  return { distanceKm: full.distanceKm, durationMin: full.durationMin };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Public reverse geocode — uses Google Geocoding API when key present, falls back to Nominatim */
export async function reverseGeocodePoint(lat: number, lng: number): Promise<{
  shortName: string;
  address: string;
  lat: number;
  lng: number;
}> {
  if (GMAP_KEY) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GMAP_KEY}`,
      );
      if (res.ok) {
        const data = await res.json();
        const result = data.results?.[0];
        if (result) {
          const comps: any[] = result.address_components ?? [];
          const streetNum = comps.find((c: any) => c.types.includes("street_number"))?.long_name ?? "";
          const route     = comps.find((c: any) => c.types.includes("route"))?.short_name ?? "";
          const premise   = comps.find((c: any) => c.types.includes("premise"))?.long_name ?? "";
          let shortName: string;
          if (streetNum && route) shortName = `${streetNum} ${route}`;
          else if (route) shortName = route;
          else if (premise) shortName = premise;
          else shortName = (result.formatted_address ?? "").split(",")[0] || "Selected Place";
          return {
            shortName,
            address: result.formatted_address ?? `${lat}, ${lng}`,
            lat,
            lng,
          };
        }
      }
    } catch (err) {
      logger.warn({ err }, "[googleMaps] reverseGeocodePoint Google failed, falling back to Nominatim");
    }
  }
  return reverseGeocode(lat, lng, `pin:${lat}:${lng}`);
}

export async function searchPlaces(
  input: string,
  userLat?: number,
  userLng?: number,
): Promise<AutocompletePrediction[]> {
  const trimmed = input.trim();
  if (trimmed.length < 2) return [];

  // Cache key includes location bucket (1km grid) for proximity-aware caching
  const latBucket = userLat !== undefined ? Math.round(userLat * 10) : "x";
  const lngBucket = userLng !== undefined ? Math.round(userLng * 10) : "x";
  const cacheKey = `${trimmed.toLowerCase()}|${latBucket}|${lngBucket}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // ── Google Places (when API key present) ──────────────────────────────────
  if (GMAP_KEY) {
    try {
      const body: Record<string, unknown> = {
        input: trimmed,
        languageCode: "en",
        regionCode: "US",
      };
      if (userLat !== undefined && userLng !== undefined) {
        body.locationBias = {
          circle: {
            center: { latitude: userLat, longitude: userLng },
            radius: 50000, // 50km
          },
        };
      }

      const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GMAP_KEY,
          "X-Goog-FieldMask":
            "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types",
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        const results: AutocompletePrediction[] = (data.suggestions ?? [])
          .map((s: any) => s.placePrediction)
          .filter(Boolean)
          .map((p: any) => {
            const types: string[] = p.types ?? [];
            let placeType: AutocompletePrediction["placeType"] = "poi";
            if (types.some((t: string) => t.includes("airport"))) placeType = "airport";
            else if (types.some((t: string) => ["transit_station", "train_station", "bus_station", "subway_station"].includes(t))) placeType = "transit";
            else if (types.some((t: string) => ["restaurant", "cafe", "food"].includes(t))) placeType = "restaurant";
            else if (types.includes("lodging")) placeType = "hotel";
            else if (types.includes("hospital")) placeType = "hospital";
            else if (types.includes("gas_station")) placeType = "gas";
            else if (types.some((t: string) => ["locality", "administrative_area_level_1", "political"].includes(t))) placeType = "city";
            else if (types.includes("street_address") || types.includes("route")) placeType = "address";
            return {
              placeId: p.placeId,
              primaryText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
              secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
              fullText: p.text?.text ?? "",
              placeType,
            };
          });
        cacheSet(cacheKey, results);
        return results;
      }
    } catch (err) {
      logger.warn({ err }, "[Google autocomplete] error, falling back to OSM");
    }
  }

  // ── OSM Fallback: Photon + Nominatim in parallel ──────────────────────────
  const [photonResults, nominatimResults] = await Promise.all([
    photonSearch(trimmed, userLat, userLng),
    nominatimSearch(trimmed, userLat, userLng),
  ]);

  // Merge both result sets — Photon first (generally higher quality for POIs)
  const merged = [...photonResults, ...nominatimResults];

  // Deduplicate by proximity (150m)
  const deduped = deduplicateByProximity(merged);

  // Sort by relevance score descending
  deduped.sort((a: any, b: any) => {
    const sa = photonResults.find((r) => r.placeId === (a as any).placeId)?._score ?? relevanceScore(a.fullText, trimmed, a.distanceKm);
    const sb = photonResults.find((r) => r.placeId === (b as any).placeId)?._score ?? relevanceScore(b.fullText, trimmed, b.distanceKm);
    return sb - sa;
  });

  const final = deduped.slice(0, 8);
  cacheSet(cacheKey, final);
  return final;
}

export async function getPlaceDetails(placeId: string) {
  const trimmed = placeId.trim();
  if (!trimmed) throw new Error("placeId is required");

  // Local OSM placeIds — decode embedded lat/lng, reverse geocode for address
  if (trimmed.startsWith("photon:") || trimmed.startsWith("nominatim:")) {
    const parts = trimmed.split(":");
    if (parts.length < 5) throw new Error("Invalid placeId format");
    const lat = parseFloat(parts[3]);
    const lng = parseFloat(parts[4]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Invalid coordinates in placeId");
    return reverseGeocode(lat, lng, trimmed);
  }

  if (!GMAP_KEY) throw new Error("Google Maps API key not configured for this placeId type");

  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(trimmed)}`, {
    headers: {
      "X-Goog-Api-Key": GMAP_KEY,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google place details failed: ${text}`);
  }

  const data = await res.json();
  return {
    placeId: data.id,
    shortName: data.displayName?.text ?? "Selected Place",
    address: data.formattedAddress ?? "",
    lat: data.location?.latitude ?? 0,
    lng: data.location?.longitude ?? 0,
  };
}

export async function getRouteEstimate(params: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}) {
  if (!GMAP_KEY) return osrmRouteEstimate(params);

  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GMAP_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: params.originLat, longitude: params.originLng } } },
        destination: { location: { latLng: { latitude: params.destinationLat, longitude: params.destinationLng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    });

    if (!res.ok) return osrmRouteEstimate(params);
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return osrmRouteEstimate(params);

    return {
      distanceKm: Number(route.distanceMeters ?? 0) / 1000,
      durationMin: Number(String(route.duration ?? "0s").replace("s", "")) / 60,
    };
  } catch {
    return osrmRouteEstimate(params);
  }
}

/** Route with encoded polyline for map rendering.
 *  Uses Google Routes API (encodedPolyline) when key present, falls back to OSRM. */
export async function getRouteWithPolyline(params: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}): Promise<{ distanceKm: number; durationMin: number; polyline: string | null }> {
  if (GMAP_KEY) {
    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GMAP_KEY,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: params.originLat, longitude: params.originLng } } },
          destination: { location: { latLng: { latitude: params.destinationLat, longitude: params.destinationLng } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const route = data.routes?.[0];
        if (route) {
          return {
            distanceKm: Number(route.distanceMeters ?? 0) / 1000,
            durationMin: Number(String(route.duration ?? "0s").replace("s", "")) / 60,
            polyline: route.polyline?.encodedPolyline ?? null,
          };
        }
      }
    } catch (err) {
      logger.warn({ err }, "[googleMaps] getRouteWithPolyline Google failed, falling back to OSRM");
    }
  }
  return osrmRouteWithPolyline(params);
}
