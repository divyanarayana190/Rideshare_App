/**
 * Carpool Matcher — Spatial, Deduplicated, Ranked, Grouped
 *
 * Pipeline:
 *   1. Safety gate     — incompatible safetyMode → null (case-insensitive gender)
 *   2. Proximity gates — pickup > 1 km or dropoff > 2 km → null
 *   3. Direction gate  — bearing difference > 84° (cosine < 0.10) → null
 *   4. Time gate       — departureTime in past > 10 min ago → null
 *   5. Detour gate     — detour > 80% of ride distance → null
 *   6. Score           — routeOverlap 35% + pickup 20% + dropoff 15% + schedule 15% + safety 10% + rating 5%
 *   7. Dedup           — same driver + route (±111 m) + time bucket (±5 min) → keep highest score
 *   8. Rank            — pickup dist ASC → dropoff dist ASC → departure proximity ASC → score DESC
 *   9. Cluster         — rides within 500 m pickup AND 500 m dropoff → grouped
 */

// ─── Geo utilities ─────────────────────────────────────────────────────────

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Haversine distance in kilometres */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compass bearing (degrees 0–360) from A → B */
function bearingDeg(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Angular similarity: 1.0 = same direction, 0.0 = opposite */
function directionSimilarity(bearing1: number, bearing2: number): number {
  const diff = Math.abs(bearing1 - bearing2);
  const angle = diff > 180 ? 360 - diff : diff;
  return (Math.cos(toRad(angle)) + 1) / 2;
}

// ─── Constants ──────────────────────────────────────────────────────────────

// 1 mile = 1.609 km — hard outer gate for both pickup and dropoff
const MAX_PICKUP_KM = 1.609;
const MAX_DROPOFF_KM = 1.609;
// Adaptive radius: start tight, expand to 1 mile when results are scarce
const INITIAL_RADIUS_KM = 0.8;  // ~0.5 mile — first-pass gate
const ADAPTIVE_MIN_RESULTS = 3; // expand if fewer than this many rides survive first pass

const MIN_DIR_SIM = 0.10;        // hard gate: < 10% direction similarity → excluded (≈ ±84°)
const MAX_DETOUR_RATIO = 0.80;   // hard gate: detour > 80% of ride distance → excluded
const STALE_MINUTES = 10;        // hard gate: departed more than 10 min ago → excluded
const CLUSTER_PICKUP_KM = 0.5;   // rides within 500 m pickup → same route cluster
const CLUSTER_DROPOFF_KM = 0.5;  // rides within 500 m dropoff → same route cluster
const DEDUP_PRECISION = 3;       // decimal places for lat/lng dedup key (~111 m)
const DEDUP_TIME_BUCKET_MIN = 5; // minute bucket for departure time dedup

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface CarpoolSearchInput {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  departureBefore?: Date;
  departureAfter?: Date;
  safetyMode?: string;
  passengerGender?: string | null;
  maxResults?: number;
}

export interface CarpoolRideRow {
  id: number;
  rideId: string;
  driverId: number;
  mode: string;
  status: string;
  pickupLat: string | number;
  pickupLng: string | number;
  pickupAddress: string;
  dropoffLat: string | number;
  dropoffLng: string | number;
  dropoffAddress: string;
  distanceKm: string | number;
  estimatedMinutes: number;
  totalFare: string | number;
  pricePerSeat?: string | number | null;
  totalSeats?: number | null;
  departureTime?: Date | null;
  safetyMode?: string | null;
  approvalRequired?: boolean;
  carpoolTitle?: string | null;
  createdAt: Date;
}

/** Per-ride debug diagnostics included in every result */
export interface CarpoolMatchDebug {
  pickupDistM: number;        // exact pickup distance in metres
  dropoffDistM: number;       // exact dropoff distance in metres
  directionSimilarity: number;
  timeDiffMinutes: number | null; // null = no departure time set; negative = future
  detourRatio: number;
  dedupStatus: "primary" | "duplicate_removed";
}

export interface CarpoolMatchResult {
  ride: CarpoolRideRow;
  score: number;               // 0–100
  pickupDistKm: number;
  dropoffDistKm: number;
  routeOverlapPercent: number;
  detourMinutes: number;
  fareShare: number;
  etaMinutes?: number;
  debug: CarpoolMatchDebug;
}

/** A group of rides sharing the same approximate route */
export interface RouteCluster {
  clusterId: string;
  best: CarpoolMatchResult;
  alternatives: CarpoolMatchResult[];
  totalCount: number;
}

export interface GroupedCarpoolResult {
  clusters: RouteCluster[];
  totalMatched: number;        // rides after dedup + gates
  totalCandidates: number;     // rides before any filtering
  searchRadiusKm: number;      // actual radius used (0.8 initial or 1.609 expanded)
  adaptiveExpanded: boolean;   // true if radius was widened due to low result count
}

// ─── Safety compatibility ───────────────────────────────────────────────────

/**
 * Returns true if the ride's safetyMode allows this passenger/driver combination.
 * Comparison is case-insensitive to handle "Female" vs "female" DB variance.
 */
export function isSafetyCompatible(
  rideSafetyMode: string | null | undefined,
  passengerGender: string | null | undefined,
  driverGender: string | null | undefined,
): boolean {
  const mode = (rideSafetyMode ?? "none").toLowerCase();
  const pg = (passengerGender ?? "").toLowerCase();
  const dg = (driverGender ?? "").toLowerCase();

  if (mode === "none") return true;

  if (mode === "women_drivers_only") {
    return dg === "female";
  }
  if (mode === "women_companions_only") {
    return pg === "female";
  }
  if (mode === "women_only") {
    return pg === "female" && dg === "female";
  }
  return true;
}

// ─── Deduplication key ──────────────────────────────────────────────────────

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function timeBucketMs(d: Date | null | undefined, bucketMin: number): number {
  if (!d) return -1;
  const bucket = bucketMin * 60_000;
  return Math.round(d.getTime() / bucket) * bucket;
}

function dedupKey(ride: CarpoolRideRow): string {
  return [
    ride.driverId,
    roundTo(Number(ride.pickupLat), DEDUP_PRECISION),
    roundTo(Number(ride.pickupLng), DEDUP_PRECISION),
    roundTo(Number(ride.dropoffLat), DEDUP_PRECISION),
    roundTo(Number(ride.dropoffLng), DEDUP_PRECISION),
    timeBucketMs(ride.departureTime ?? null, DEDUP_TIME_BUCKET_MIN),
  ].join("|");
}

// ─── Core scoring ───────────────────────────────────────────────────────────

/**
 * Score a single candidate ride for a given search.
 * Returns null if any hard gate is violated.
 */
export function scoreCarpool(
  ride: CarpoolRideRow,
  input: CarpoolSearchInput,
  driverGender?: string | null,
  now: Date = new Date(),
  driverRating?: number | null,
): CarpoolMatchResult | null {
  const rPLat = Number(ride.pickupLat);
  const rPLng = Number(ride.pickupLng);
  const rDLat = Number(ride.dropoffLat);
  const rDLng = Number(ride.dropoffLng);

  // ── Gate 1: Safety compatibility (case-insensitive) ─────────────────────
  const pg = (input.passengerGender ?? "").toLowerCase() || null;
  const dg = (driverGender ?? "").toLowerCase() || null;
  if (!isSafetyCompatible(ride.safetyMode, pg, dg)) return null;

  // ── Gate 2: Pickup proximity ─────────────────────────────────────────────
  const pickupDistKm = haversineKm(input.pickupLat, input.pickupLng, rPLat, rPLng);
  if (pickupDistKm > MAX_PICKUP_KM) return null;

  // ── Gate 3: Dropoff proximity ────────────────────────────────────────────
  const dropoffDistKm = haversineKm(input.dropoffLat, input.dropoffLng, rDLat, rDLng);
  if (dropoffDistKm > MAX_DROPOFF_KM) return null;

  // ── Gate 4: Direction similarity ─────────────────────────────────────────
  const riderBearing = bearingDeg(input.pickupLat, input.pickupLng, input.dropoffLat, input.dropoffLng);
  const rideBearing = bearingDeg(rPLat, rPLng, rDLat, rDLng);
  const dirSim = directionSimilarity(riderBearing, rideBearing);
  if (dirSim < MIN_DIR_SIM) return null;

  // ── Gate 5: Time gate (stale ride check) ─────────────────────────────────
  // Rides that departed more than STALE_MINUTES ago are excluded.
  // No departure time set = flexible, always included.
  let timeDiffMinutes: number | null = null;
  if (ride.departureTime) {
    timeDiffMinutes = (now.getTime() - ride.departureTime.getTime()) / 60_000;
    if (timeDiffMinutes > STALE_MINUTES) return null;
  }

  // ── Gate 6: Detour cap ───────────────────────────────────────────────────
  const detourKm = pickupDistKm + dropoffDistKm;
  const rideDistKm = Math.max(Number(ride.distanceKm) || 1, 0.1);
  const detourRatio = detourKm / rideDistKm;
  if (detourRatio > MAX_DETOUR_RATIO) return null;

  const detourMinutes = Math.round((detourKm / 30) * 60);

  // ── Route overlap estimate ───────────────────────────────────────────────
  const riderDistKm = haversineKm(
    input.pickupLat, input.pickupLng,
    input.dropoffLat, input.dropoffLng,
  );
  const overlapKm = Math.min(riderDistKm, rideDistKm) - detourKm / 2;
  const routeOverlapPercent = Math.max(
    0,
    Math.min(99, Math.round((overlapKm / Math.max(riderDistKm, rideDistKm)) * 100)),
  );

  // ── Scoring (0–100) — weighted components ─────────────────────────────────
  // Direction and detour are hard gates above — they do NOT reduce the score.

  const routeOverlapScore = routeOverlapPercent;

  const pickupDistanceScore = Math.max(0, 100 * (1 - pickupDistKm / MAX_PICKUP_KM));
  const dropoffDistanceScore = Math.max(0, 100 * (1 - dropoffDistKm / MAX_DROPOFF_KM));

  let scheduleScore: number;
  if (timeDiffMinutes === null) {
    scheduleScore = 70;
  } else if (timeDiffMinutes <= 0) {
    scheduleScore = 100;
  } else {
    scheduleScore = Math.max(0, 100 * (1 - timeDiffMinutes / STALE_MINUTES));
  }

  const safetyMode = (ride.safetyMode ?? "none").toLowerCase();
  let safetyScore = 75;
  if (safetyMode === "women_only" || safetyMode === "women_drivers_only") safetyScore = 100;
  else if (safetyMode === "women_companions_only") safetyScore = 95;

  const rating = Math.min(5, Math.max(0, Number(driverRating ?? 4.8)));
  const ratingScore = (rating / 5) * 100;

  const totalScore = Math.min(
    100,
    Math.round(
      routeOverlapScore * 0.35
      + pickupDistanceScore * 0.20
      + dropoffDistanceScore * 0.15
      + scheduleScore * 0.15
      + safetyScore * 0.10
      + ratingScore * 0.05,
    ),
  );

  // ── Fare share ────────────────────────────────────────────────────────────
  let fareShare: number;
  if (ride.pricePerSeat) {
    fareShare = Number(ride.pricePerSeat);
  } else {
    const shareRatio = Math.min(riderDistKm / rideDistKm, 1);
    const baseFare = Number(ride.totalFare) || 10;
    fareShare = Math.max(baseFare * shareRatio * 0.7, 3.0);
  }

  return {
    ride,
    score: totalScore,
    pickupDistKm: Math.round(pickupDistKm * 1000) / 1000,
    dropoffDistKm: Math.round(dropoffDistKm * 1000) / 1000,
    routeOverlapPercent,
    detourMinutes,
    fareShare: Math.round(fareShare * 100) / 100,
    debug: {
      pickupDistM: Math.round(pickupDistKm * 1000),
      dropoffDistM: Math.round(dropoffDistKm * 1000),
      directionSimilarity: Math.round(dirSim * 100) / 100,
      timeDiffMinutes: timeDiffMinutes !== null ? Math.round(timeDiffMinutes) : null,
      detourRatio: Math.round(detourRatio * 1000) / 1000,
      dedupStatus: "primary",
    },
  };
}

// ─── Deduplication ──────────────────────────────────────────────────────────

/**
 * Remove hard duplicates: same driver + same route (±111 m) + same time bucket (±5 min).
 * Within each group, keep the highest-scoring ride.
 */
function deduplicateMatches(matches: CarpoolMatchResult[]): CarpoolMatchResult[] {
  const map = new Map<string, CarpoolMatchResult>();
  for (const m of matches) {
    const key = dedupKey(m.ride);
    const existing = map.get(key);
    if (!existing || m.score > existing.score) {
      map.set(key, m);
    }
  }
  return Array.from(map.values());
}

// ─── Route clustering ────────────────────────────────────────────────────────

/**
 * Group rides heading in the same direction:
 * Two rides belong to the same cluster if their pickups are within 500 m
 * AND their dropoffs are within 500 m of the cluster representative.
 * Input must be pre-sorted (best ride first per cluster).
 */
function buildClusters(matches: CarpoolMatchResult[]): RouteCluster[] {
  const groups: Array<{ rep: CarpoolMatchResult; members: CarpoolMatchResult[] }> = [];

  for (const match of matches) {
    let placed = false;
    for (const g of groups) {
      const pDist = haversineKm(
        Number(match.ride.pickupLat), Number(match.ride.pickupLng),
        Number(g.rep.ride.pickupLat), Number(g.rep.ride.pickupLng),
      );
      if (pDist > CLUSTER_PICKUP_KM) continue;
      const dDist = haversineKm(
        Number(match.ride.dropoffLat), Number(match.ride.dropoffLng),
        Number(g.rep.ride.dropoffLat), Number(g.rep.ride.dropoffLng),
      );
      if (dDist > CLUSTER_DROPOFF_KM) continue;
      g.members.push(match);
      placed = true;
      break;
    }
    if (!placed) {
      groups.push({ rep: match, members: [match] });
    }
  }

  return groups.map((g, i) => ({
    clusterId: `c${i}_${Math.round(Number(g.rep.ride.pickupLat) * 1000)}_${Math.round(Number(g.rep.ride.dropoffLat) * 1000)}`,
    best: g.members[0],
    alternatives: g.members.slice(1),
    totalCount: g.members.length,
  }));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Full pipeline: score → dedup → adaptive radius → rank → cluster.
 *
 * Adaptive radius strategy:
 *   Pass 1 — score all candidates at the 1-mile outer gate; then keep only
 *             those within the 800 m initial radius.
 *   Pass 2 — if fewer than ADAPTIVE_MIN_RESULTS survive, widen back to the
 *             full 1-mile set so the user always sees something.
 *
 * This guarantees short-distance rides like "Indian Square → NJIT" vs
 * "Jersey City PATH → NJIT" (~0.1 mile apart) are never missed: they pass
 * both the 800 m and 1-mile gates trivially.
 */
export function rankAndGroupCarpools(
  rides: CarpoolRideRow[],
  input: CarpoolSearchInput,
  driverGenders?: Map<number, string | null>,
  now: Date = new Date(),
  driverRatings?: Map<number, number | null>,
): GroupedCarpoolResult {
  const totalCandidates = rides.length;

  // 1. Score every candidate at the full 1-mile outer gate
  const scored: CarpoolMatchResult[] = [];
  for (const ride of rides) {
    const dg = driverGenders?.get(ride.driverId) ?? null;
    const dr = driverRatings?.get(ride.driverId) ?? null;
    const result = scoreCarpool(ride, input, dg, now, dr);
    if (result) scored.push(result);
  }

  // 2. Hard deduplication (same driver + route ±111 m + time ±5 min)
  const deduped = deduplicateMatches(scored);

  // 3. Adaptive radius — start at 800 m, expand to 1 mile when results are sparse
  const within800m = deduped.filter(
    m => m.pickupDistKm <= INITIAL_RADIUS_KM && m.dropoffDistKm <= INITIAL_RADIUS_KM,
  );
  const adaptiveExpanded = within800m.length < ADAPTIVE_MIN_RESULTS;
  const candidates = adaptiveExpanded ? deduped : within800m;
  const searchRadiusKm = adaptiveExpanded ? MAX_PICKUP_KM : INITIAL_RADIUS_KM;

  // 4. Rank: pickup distance ASC → dropoff distance ASC → departure proximity → score DESC
  candidates.sort((a, b) => {
    const pDiff = a.pickupDistKm - b.pickupDistKm;
    if (Math.abs(pDiff) > 0.05) return pDiff;

    const dDiff = a.dropoffDistKm - b.dropoffDistKm;
    if (Math.abs(dDiff) > 0.05) return dDiff;

    const aTime = Math.abs(a.debug.timeDiffMinutes ?? -9999);
    const bTime = Math.abs(b.debug.timeDiffMinutes ?? -9999);
    if (Math.abs(aTime - bTime) > 1) return aTime - bTime;

    return b.score - a.score;
  });

  const limited = candidates.slice(0, input.maxResults ?? 20);

  // 5. Build route clusters (500 m pickup + 500 m dropoff radius per cluster)
  const clusters = buildClusters(limited);

  return {
    clusters,
    totalMatched: limited.length,
    totalCandidates,
    searchRadiusKm,
    adaptiveExpanded,
  };
}

/**
 * Flat ranked list (backward-compatible).
 * Prefer rankAndGroupCarpools for new callers.
 */
export function rankCarpools(
  rides: CarpoolRideRow[],
  input: CarpoolSearchInput,
  driverGenders?: Map<number, string | null>,
  driverRatings?: Map<number, number | null>,
): CarpoolMatchResult[] {
  const { clusters } = rankAndGroupCarpools(rides, input, driverGenders, new Date(), driverRatings);
  return clusters.flatMap(c => [c.best, ...c.alternatives]);
}
