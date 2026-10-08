/**
 * Driver matching / dispatch queue metrics (in-process + DB-backed).
 */
let successfulMatches = 0;
let failedMatches = 0;
let dispatchTimeouts = 0;
const matchTimesMs: number[] = [];

export function recordDispatchAccepted(_rideId: string, matchTimeMs?: number) {
  successfulMatches++;
  if (matchTimeMs != null && matchTimeMs > 0) {
    matchTimesMs.push(matchTimeMs);
    if (matchTimesMs.length > 500) matchTimesMs.shift();
  }
}

export function recordDispatchFailed(_rideId: string) {
  failedMatches++;
}

export function recordDispatchTimeout(_rideId: string) {
  dispatchTimeouts++;
}

export function getDispatchRuntimeMetrics() {
  const total = successfulMatches + failedMatches;
  const avgMatchMs = matchTimesMs.length
    ? Math.round(matchTimesMs.reduce((a, b) => a + b, 0) / matchTimesMs.length)
    : 0;
  return {
    successfulMatches,
    failedMatches,
    dispatchTimeouts,
    matchSuccessRate: total ? Math.round((successfulMatches / total) * 1000) / 10 : 100,
    avgMatchTimeMs: avgMatchMs,
  };
}
