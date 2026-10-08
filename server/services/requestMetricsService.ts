/**
 * In-process API latency & error tracking (rolling window).
 */
type Sample = { ms: number; status: number; at: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_SAMPLES = 5000;
const samples: Sample[] = [];
const routeSamples = new Map<string, Sample[]>();

function bucket(path: string): string {
  if (path.startsWith("/admin")) return "/admin";
  if (path.startsWith("/api/trpc")) {
    if (path.includes("ride")) return "/rides";
    if (path.includes("driver")) return "/drivers";
    if (path.includes("payment")) return "/payments";
    if (path.includes("auth") || path.includes("login")) return "/auth";
    if (path.includes("map")) return "/maps";
    return "/trpc";
  }
  if (path.startsWith("/api/maps") || path.startsWith("/maps")) return "/maps";
  if (path.startsWith("/api/auth") || path.includes("oauth")) return "/auth";
  return path.split("?")[0]!.slice(0, 40) || "/other";
}

function prune(arr: Sample[]) {
  const cutoff = Date.now() - WINDOW_MS;
  while (arr.length > 0 && arr[0]!.at < cutoff) arr.shift();
  if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

export function recordRequest(path: string, status: number, durationMs: number) {
  const sample: Sample = { ms: durationMs, status, at: Date.now() };
  samples.push(sample);
  prune(samples);

  const key = bucket(path);
  const arr = routeSamples.get(key) ?? [];
  arr.push(sample);
  prune(arr);
  routeSamples.set(key, arr);
}

export function getRequestMetricsSummary() {
  const cutoff = Date.now() - WINDOW_MS;
  const recent = samples.filter((s) => s.at >= cutoff);
  const latencies = recent.map((s) => s.ms);
  const total = recent.length;
  const errors = recent.filter((s) => s.status >= 500).length;
  const clientErrors = recent.filter((s) => s.status >= 400 && s.status < 500).length;
  const timeouts = recent.filter((s) => s.status === 408 || s.ms > 30_000).length;
  const windowMinutes = WINDOW_MS / 60_000;

  const routes = ["/rides", "/drivers", "/payments", "/auth", "/maps", "/admin"];
  const byRoute = routes.map((route) => {
    const arr = (routeSamples.get(route) ?? []).filter((s) => s.at >= cutoff);
    const ms = arr.map((s) => s.ms);
    const err = arr.filter((s) => s.status >= 500).length;
    return {
      route,
      requestsPerMinute: Math.round((arr.length / windowMinutes) * 10) / 10,
      avgMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0,
      p95Ms: Math.round(percentile(ms, 95)),
      errorRate: arr.length ? Math.round((err / arr.length) * 1000) / 10 : 0,
      count: arr.length,
    };
  }).filter((r) => r.count > 0);

  return {
    avgMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
    requestsPerMinute: Math.round((total / windowMinutes) * 10) / 10,
    errorRate: total ? Math.round((errors / total) * 1000) / 10 : 0,
    successRate: total ? Math.round(((total - errors) / total) * 1000) / 10 : 100,
    clientErrorRate: total ? Math.round((clientErrors / total) * 1000) / 10 : 0,
    timeouts,
    windowMinutes,
    byRoute: byRoute.sort((a, b) => b.p95Ms - a.p95Ms),
    slowestEndpoints: byRoute.slice(0, 6),
  };
}
