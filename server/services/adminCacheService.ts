/**
 * Admin aggregate cache — Redis when available, in-process fallback.
 */
import { cachedQuery, invalidateCache as redisInvalidate, isRedisAvailable } from "../redis";

const store = new Map<string, { value: unknown; expiresAt: number }>();
const REDIS_PREFIX = "admin:cache:";
let cacheHits = 0;
let cacheMisses = 0;

export function getCacheStats() {
  const total = cacheHits + cacheMisses;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total ? Math.round((cacheHits / total) * 1000) / 10 : 0,
    missRate: total ? Math.round((cacheMisses / total) * 1000) / 10 : 0,
  };
}

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) {
    cacheMisses++;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    cacheMisses++;
    return null;
  }
  cacheHits++;
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(prefix?: string): number {
  if (!prefix) {
    const n = store.size;
    store.clear();
    return n;
  }
  let n = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      n++;
    }
  }
  return n;
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const memHit = cacheGet<T>(key);
  if (memHit !== null) return memHit;

  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  const redisKey = `${REDIS_PREFIX}${key}`;

  try {
    const available = await isRedisAvailable();
    if (available) {
      return cachedQuery<T>(redisKey, ttlSec, async () => {
        const value = await fn();
        cacheSet(key, value, ttlMs);
        return value;
      });
    }
  } catch {
    /* fall through to memory */
  }

  const value = await fn();
  cacheSet(key, value, ttlMs);
  return value;
}

export async function cacheInvalidateAll(prefix?: string): Promise<number> {
  const memCount = cacheInvalidate(prefix);
  try {
    const available = await isRedisAvailable();
    if (available && prefix) {
      await redisInvalidate(`${REDIS_PREFIX}${prefix}`);
    }
  } catch {
    /* ignore */
  }
  return memCount;
}

export const CACHE_TTL = {
  executive: 60_000,
  analytics: 120_000,
  marketplace: 30_000,
  fraud: 120_000,
} as const;
