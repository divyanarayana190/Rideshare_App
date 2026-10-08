import express, { type NextFunction, type Request, type Response } from "express";
import { sdk } from "../_core/sdk";
import {
  getPlaceDetails,
  getRouteWithPolyline,
  searchPlaces,
  reverseGeocodePoint,
} from "../services/googleMaps";

const mapsRouter = express.Router();

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimitMaps(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX_REQUESTS) {
    res.status(429).json({ error: "Too many map requests — try again shortly" });
    return;
  }
  next();
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

mapsRouter.use(requireAuth);
mapsRouter.use(rateLimitMaps);

mapsRouter.get("/autocomplete", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim().slice(0, 200);
    if (!q) return res.json([]);

    const rawLat = req.query.lat ? parseFloat(String(req.query.lat)) : undefined;
    const rawLng = req.query.lng ? parseFloat(String(req.query.lng)) : undefined;
    const lat = rawLat !== undefined && Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90 ? rawLat : undefined;
    const lng = rawLng !== undefined && Number.isFinite(rawLng) && rawLng >= -180 && rawLng <= 180 ? rawLng : undefined;

    const results = await searchPlaces(q, lat, lng);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

mapsRouter.get("/reverse-geocode", async (req, res) => {
  try {
    const lat = parseFloat(String(req.query.lat ?? ""));
    const lng = parseFloat(String(req.query.lng ?? ""));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Valid lat and lng required" });
    }
    const result = await reverseGeocodePoint(lat, lng);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

mapsRouter.get("/place-details", async (req, res) => {
  try {
    const placeId = String(req.query.placeId ?? "").trim();
    if (!placeId) return res.status(400).json({ error: "placeId required" });

    const result = await getPlaceDetails(placeId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

mapsRouter.post("/route-estimate", express.json(), async (req, res) => {
  try {
    const result = await getRouteWithPolyline(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default mapsRouter;
