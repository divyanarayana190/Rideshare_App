/**
 * Live third-party service probes with latency + last success/failure tracking.
 */
import Stripe from "stripe";
import { isRedisAvailable, redis } from "../redis";
import logger from "../logger";

export type ProbeStatus = "healthy" | "degraded" | "down" | "unknown";

export type ServiceProbe = {
  name: string;
  status: ProbeStatus;
  latencyMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  message: string | null;
  checkedAt: string;
};

const state = new Map<string, { failures: number; lastOk: number | null; lastFail: number | null }>();
const CACHE_MS = 45_000;
let lastFullProbe = 0;
let cachedProbes: ServiceProbe[] = [];

function touch(name: string, ok: boolean) {
  const s = state.get(name) ?? { failures: 0, lastOk: null, lastFail: null };
  if (ok) {
    s.lastOk = Date.now();
  } else {
    s.failures++;
    s.lastFail = Date.now();
  }
  state.set(name, s);
  return s;
}

async function probeDatabase(): Promise<ServiceProbe> {
  const now = new Date().toISOString();
  const start = Date.now();
  try {
    const { db } = await import("../db");
    const { users } = await import("../../drizzle/schema");
    const { sql } = await import("drizzle-orm");
    await db.select({ c: sql<number>`1` }).from(users).limit(1);
    const ms = Date.now() - start;
    const s = touch("Database", true);
    return {
      name: "Database",
      status: ms < 500 ? "healthy" : ms < 2000 ? "degraded" : "down",
      latencyMs: ms,
      lastSuccessAt: s.lastOk ? new Date(s.lastOk).toISOString() : now,
      lastFailureAt: s.lastFail ? new Date(s.lastFail).toISOString() : null,
      failureCount: s.failures,
      message: `MySQL ping ${ms}ms`,
      checkedAt: now,
    };
  } catch (e: any) {
    const s = touch("Database", false);
    return {
      name: "Database",
      status: "down",
      latencyMs: null,
      lastSuccessAt: s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: now,
      failureCount: s.failures,
      message: e.message?.slice(0, 120) ?? "Connection failed",
      checkedAt: now,
    };
  }
}

async function probeRedis(): Promise<ServiceProbe> {
  const now = new Date().toISOString();
  const start = Date.now();
  try {
    const ok = await isRedisAvailable();
    const ms = Date.now() - start;
    const s = touch("Redis", ok);
    return {
      name: "Redis",
      status: ok ? (ms < 100 ? "healthy" : "degraded") : "down",
      latencyMs: ok ? ms : null,
      lastSuccessAt: ok ? now : s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: ok ? (s.lastFail ? new Date(s.lastFail).toISOString() : null) : now,
      failureCount: s.failures,
      message: ok ? `PONG ${ms}ms` : "Redis unavailable — in-memory fallback",
      checkedAt: now,
    };
  } catch (e: any) {
    const s = touch("Redis", false);
    return {
      name: "Redis",
      status: "down",
      latencyMs: null,
      lastSuccessAt: s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: now,
      failureCount: s.failures,
      message: e.message?.slice(0, 120),
      checkedAt: now,
    };
  }
}

async function probeStripe(): Promise<ServiceProbe> {
  const now = new Date().toISOString();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return {
      name: "Stripe",
      status: "degraded",
      latencyMs: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      message: "STRIPE_SECRET_KEY not configured",
      checkedAt: now,
    };
  }
  const start = Date.now();
  try {
    const stripe = new Stripe(key);
    await stripe.balance.retrieve();
    const ms = Date.now() - start;
    const s = touch("Stripe", true);
    return {
      name: "Stripe",
      status: ms < 2000 ? "healthy" : "degraded",
      latencyMs: ms,
      lastSuccessAt: now,
      lastFailureAt: s.lastFail ? new Date(s.lastFail).toISOString() : null,
      failureCount: s.failures,
      message: "Balance API OK",
      checkedAt: now,
    };
  } catch (e: any) {
    const s = touch("Stripe", false);
    return {
      name: "Stripe",
      status: "down",
      latencyMs: null,
      lastSuccessAt: s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: now,
      failureCount: s.failures,
      message: e.message?.slice(0, 120),
      checkedAt: now,
    };
  }
}

async function probeTwilio(): Promise<ServiceProbe> {
  const now = new Date().toISOString();
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return {
      name: "Twilio",
      status: "degraded",
      latencyMs: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      message: "Twilio credentials not configured",
      checkedAt: now,
    };
  }
  const start = Date.now();
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(8000),
    });
    const ms = Date.now() - start;
    const ok = r.ok;
    const s = touch("Twilio", ok);
    return {
      name: "Twilio",
      status: ok ? (ms < 2000 ? "healthy" : "degraded") : "down",
      latencyMs: ok ? ms : null,
      lastSuccessAt: ok ? now : s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: ok ? (s.lastFail ? new Date(s.lastFail).toISOString() : null) : now,
      failureCount: s.failures,
      message: ok ? "Account API OK" : `HTTP ${r.status}`,
      checkedAt: now,
    };
  } catch (e: any) {
    const s = touch("Twilio", false);
    return {
      name: "Twilio",
      status: "down",
      latencyMs: null,
      lastSuccessAt: s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: now,
      failureCount: s.failures,
      message: e.message?.slice(0, 120),
      checkedAt: now,
    };
  }
}

async function probeMaps(): Promise<ServiceProbe> {
  const now = new Date().toISOString();
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return {
      name: "Google Maps",
      status: "degraded",
      latencyMs: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      message: "GOOGLE_MAPS_API_KEY not configured",
      checkedAt: now,
    };
  }
  const start = Date.now();
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=40.7128,-74.0060&key=${key}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const ms = Date.now() - start;
    const body = (await r.json()) as { status?: string };
    const ok = r.ok && body.status === "OK";
    const s = touch("Google Maps", ok);
    return {
      name: "Google Maps",
      status: ok ? (ms < 2000 ? "healthy" : "degraded") : "down",
      latencyMs: ok ? ms : null,
      lastSuccessAt: ok ? now : s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: ok ? (s.lastFail ? new Date(s.lastFail).toISOString() : null) : now,
      failureCount: s.failures,
      message: ok ? "Geocode API OK" : body.status ?? `HTTP ${r.status}`,
      checkedAt: now,
    };
  } catch (e: any) {
    const s = touch("Google Maps", false);
    return {
      name: "Google Maps",
      status: "down",
      latencyMs: null,
      lastSuccessAt: s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: now,
      failureCount: s.failures,
      message: e.message?.slice(0, 120),
      checkedAt: now,
    };
  }
}

async function probeExpoPush(): Promise<ServiceProbe> {
  const now = new Date().toISOString();
  try {
    const { Expo } = await import("expo-server-sdk");
    const expo = new Expo();
    const ok = typeof expo.sendPushNotificationsAsync === "function";
    const s = touch("Expo Push", ok);
    return {
      name: "Expo Push",
      status: ok ? "healthy" : "degraded",
      latencyMs: 0,
      lastSuccessAt: ok ? now : s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: ok ? null : now,
      failureCount: s.failures,
      message: ok ? "Expo SDK initialized" : "SDK unavailable",
      checkedAt: now,
    };
  } catch (e: any) {
    const s = touch("Expo Push", false);
    return {
      name: "Expo Push",
      status: "down",
      latencyMs: null,
      lastSuccessAt: s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: now,
      failureCount: s.failures,
      message: e.message?.slice(0, 120),
      checkedAt: now,
    };
  }
}

async function probeR2(): Promise<ServiceProbe> {
  const now = new Date().toISOString();
  try {
    const { r2HealthCheck } = await import("./r2Service");
    const start = Date.now();
    const result = await r2HealthCheck();
    const ms = Date.now() - start;
    const ok = result.ok;
    const s = touch("Cloudflare R2", ok);
    return {
      name: "Cloudflare R2",
      status: ok ? "healthy" : "down",
      latencyMs: ms,
      lastSuccessAt: ok ? now : s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: ok ? (s.lastFail ? new Date(s.lastFail).toISOString() : null) : now,
      failureCount: s.failures,
      message: result.message,
      checkedAt: now,
    };
  } catch (e: any) {
    const s = touch("Cloudflare R2", false);
    return {
      name: "Cloudflare R2",
      status: "unknown",
      latencyMs: null,
      lastSuccessAt: s.lastOk ? new Date(s.lastOk).toISOString() : null,
      lastFailureAt: now,
      failureCount: s.failures,
      message: e.message?.slice(0, 120) ?? "R2 not configured",
      checkedAt: now,
    };
  }
}

async function probeRailway(): Promise<ServiceProbe> {
  const now = new Date().toISOString();
  const onRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
  const s = touch("Railway", true);
  return {
    name: "Railway",
    status: onRailway ? "healthy" : "unknown",
    latencyMs: null,
    lastSuccessAt: now,
    lastFailureAt: s.lastFail ? new Date(s.lastFail).toISOString() : null,
    failureCount: s.failures,
    message: onRailway
      ? `Environment: ${process.env.RAILWAY_ENVIRONMENT ?? "production"}`
      : "Not running on Railway (local/dev)",
    checkedAt: now,
  };
}

export async function probeAllServices(force = false): Promise<ServiceProbe[]> {
  if (!force && Date.now() - lastFullProbe < CACHE_MS && cachedProbes.length > 0) {
    return cachedProbes;
  }
  const probes = await Promise.all([
    probeDatabase(),
    probeRedis(),
    probeStripe(),
    probeTwilio(),
    probeMaps(),
    probeExpoPush(),
    probeR2(),
    probeRailway(),
  ]);
  cachedProbes = probes;
  lastFullProbe = Date.now();
  return probes;
}

export async function getRedisDetailedStats(queueBacklog = 0) {
  const { getRedisTelemetry } = await import("../redis");
  const t = await getRedisTelemetry(queueBacklog);
  // Legacy field names consumed by older UI paths
  return {
    ...t,
    responseTimeMs: t.pingMs,
  };
}
