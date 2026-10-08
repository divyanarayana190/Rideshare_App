// server/redis.ts — Redis connection with graceful shutdown
import Redis from "ioredis";
import logger from "./logger";

/** Single source of truth: process.env.REDIS_URL with local dev fallback */
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redis: Redis;

const isProduction = process.env.NODE_ENV === "production";

try {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) return null; // stop retrying after 5 attempts
      return Math.min(times * 500, 5000); // exponential backoff, max 5s
    },
    reconnectOnError(err) {
      return err.message.includes("READONLY");
    },
    lazyConnect: false,
    enableReadyCheck: true,
    connectTimeout: 5000,
  });

  let loggedConnection = false;
  let loggedError = false;
  redis.on("connect", () => {
    if (!loggedConnection) { logger.info("[redis] Connected"); loggedConnection = true; }
  });
  redis.on("error", (err) => {
    if (isProduction) {
      logger.error({ err: err.message }, "[redis] Connection error in production");
    } else {
      if (!loggedError) { logger.warn("[redis] Unavailable — running with in-memory fallback"); loggedError = true; }
    }
  });
  redis.on("ready", () => { loggedError = false; loggedConnection = false; logger.info("[redis] Ready"); });
} catch (err) {
  if (isProduction) {
    throw new Error(`[redis] Failed to initialise Redis in production: ${String(err)}`);
  }
  logger.warn("[redis] Failed to connect — running in fallback mode (in-memory)");
  redis = new Redis({ lazyConnect: true });
}

/** Check if Redis is available */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/** Audit: confirms backend reads REDIS_URL (password redacted). */
export function getRedisUrlAudit() {
  const fromEnv = process.env.REDIS_URL;
  const url = fromEnv || "redis://127.0.0.1:6379";
  let connectionTarget = "unconfigured";
  try {
    const u = new URL(url);
    const auth = u.password
      ? u.username
        ? `${u.username}:***@`
        : `:***@`
      : u.username
        ? `${u.username}@`
        : "";
    connectionTarget = `${u.protocol}//${auth}${u.host}${u.pathname}`;
  } catch {
    connectionTarget = "invalid-url";
  }
  return {
    configuredViaEnv: Boolean(fromEnv),
    envVarName: "REDIS_URL",
    connectionTarget,
    fallbackUsed: !fromEnv,
  };
}

function parseInfoField(blob: string, key: string): string | null {
  const m = blob.match(new RegExp(`${key}:(.+)`));
  return m ? m[1]!.trim() : null;
}

export type RedisTelemetry = {
  connected: boolean;
  pingMs: number | null;
  memoryUsedMb: number | null;
  memoryPeakMb: number | null;
  memoryUsagePct: number | null;
  connectedClients: number | null;
  keysCount: number | null;
  evictedKeys: number | null;
  uptimeSeconds: number | null;
  cacheHits: number | null;
  cacheMisses: number | null;
  cacheHitRate: number | null;
  cacheMissRate: number | null;
  queueBacklog: number | null;
  pubsubChannels: number | null;
  blockedClients: number | null;
  alerts: Array<{ level: "warning" | "critical"; message: string }>;
  config: ReturnType<typeof getRedisUrlAudit>;
};

/** Live Redis telemetry from PING + INFO + DBSIZE (no mock values). */
export async function getRedisTelemetry(queueBacklog = 0): Promise<RedisTelemetry> {
  const config = getRedisUrlAudit();
  const baseDisconnected: RedisTelemetry = {
    connected: false,
    pingMs: null,
    memoryUsedMb: null,
    memoryPeakMb: null,
    memoryUsagePct: null,
    connectedClients: null,
    keysCount: null,
    evictedKeys: null,
    uptimeSeconds: null,
    cacheHits: null,
    cacheMisses: null,
    cacheHitRate: null,
    cacheMissRate: null,
    queueBacklog,
    pubsubChannels: null,
    blockedClients: null,
    alerts: [{ level: "critical", message: "Redis disconnected — in-memory fallback active" }],
    config,
  };

  const connected = await isRedisAvailable();
  if (!connected) return baseDisconnected;

  const pingStart = Date.now();
  try {
    await redis.ping();
  } catch {
    return baseDisconnected;
  }
  const pingMs = Date.now() - pingStart;

  try {
    const [memoryInfo, statsInfo, clientsInfo, serverInfo, keysCount] = await Promise.all([
      redis.info("memory"),
      redis.info("stats"),
      redis.info("clients"),
      redis.info("server"),
      redis.dbsize(),
    ]);

    const usedBytes = parseInt(parseInfoField(memoryInfo, "used_memory") ?? "0", 10);
    const peakBytes = parseInt(parseInfoField(memoryInfo, "used_memory_peak") ?? "0", 10);
    const maxBytes = parseInt(parseInfoField(memoryInfo, "maxmemory") ?? "0", 10);
    const evicted = parseInt(parseInfoField(statsInfo, "evicted_keys") ?? "0", 10);
    const connectedClients = parseInt(parseInfoField(clientsInfo, "connected_clients") ?? "0", 10);
    const pubsub = parseInt(parseInfoField(clientsInfo, "pubsub_channels") ?? "0", 10);
    const blockedClients = parseInt(parseInfoField(clientsInfo, "blocked_clients") ?? "0", 10);
    const uptimeSeconds = parseInt(parseInfoField(serverInfo, "uptime_in_seconds") ?? "0", 10);
    const cacheHits = parseInt(parseInfoField(statsInfo, "keyspace_hits") ?? "0", 10);
    const cacheMisses = parseInt(parseInfoField(statsInfo, "keyspace_misses") ?? "0", 10);
    const cacheTotal = cacheHits + cacheMisses;

    const memoryUsagePct = maxBytes > 0 ? Math.round((usedBytes / maxBytes) * 1000) / 10 : null;
    const cacheHitRate = cacheTotal > 0 ? Math.round((cacheHits / cacheTotal) * 1000) / 10 : null;
    const cacheMissRate = cacheTotal > 0 ? Math.round((cacheMisses / cacheTotal) * 1000) / 10 : null;

    const alerts: RedisTelemetry["alerts"] = [];
    if (memoryUsagePct != null && memoryUsagePct > 90) {
      alerts.push({ level: "critical", message: `Redis memory at ${memoryUsagePct}%` });
    } else if (memoryUsagePct != null && memoryUsagePct > 80) {
      alerts.push({ level: "warning", message: `Redis memory at ${memoryUsagePct}%` });
    }
    if (blockedClients > 0) {
      alerts.push({ level: "warning", message: `${blockedClients} blocked Redis client(s)` });
    }

    return {
      connected: true,
      pingMs,
      memoryUsedMb: Math.round((usedBytes / 1024 / 1024) * 10) / 10,
      memoryPeakMb: Math.round((peakBytes / 1024 / 1024) * 10) / 10,
      memoryUsagePct,
      connectedClients,
      keysCount,
      evictedKeys: evicted,
      uptimeSeconds,
      cacheHits,
      cacheMisses,
      cacheHitRate,
      cacheMissRate,
      queueBacklog,
      pubsubChannels: pubsub,
      blockedClients,
      alerts,
      config,
    };
  } catch (err) {
    logger.warn({ err }, "[redis] INFO telemetry failed");
    return {
      ...baseDisconnected,
      connected: true,
      pingMs,
      alerts: [{ level: "warning", message: "Connected but INFO telemetry unavailable" }],
    };
  }
}

/** Gracefully close Redis connection */
export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info("[redis] Disconnected cleanly");
  } catch {
    redis.disconnect();
  }
}

/**
 * Cache helper for hot-path queries. Falls back to fetcher if Redis unavailable.
 * @param key Redis key
 * @param ttlSeconds Cache TTL in seconds
 * @param fetcher Function to fetch data if not cached
 */
export async function cachedQuery<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const available = await isRedisAvailable();
    if (available) {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    }
    const result = await fetcher();
    if (available && result != null) {
      await redis.setex(key, ttlSeconds, JSON.stringify(result));
    }
    return result;
  } catch {
    // Redis error — fallback to direct fetch
    return fetcher();
  }
}

/**
 * Invalidate a cached key
 */
export async function invalidateCache(key: string): Promise<void> {
  try {
    const available = await isRedisAvailable();
    if (available) await redis.del(key);
  } catch { /* ignore */ }
}

export { redis };
export default redis;
