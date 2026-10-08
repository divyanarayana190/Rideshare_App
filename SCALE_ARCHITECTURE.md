# RideShare Production-Grade Scale Architecture
## Designed for 100,000 Concurrent Users

---

# 1. SYSTEM GOALS

## 1.1 Functional Requirements

| Domain | Requirements |
|--------|-------------|
| Auth | OTP-based signup/login (phone + email), JWT sessions, multi-device support, role-based access (rider/driver/admin) |
| Ride Booking | Solo rides, shared rides, mid-ride join, carpool marketplace, recurring rides |
| Driver Ops | Go online/offline, location broadcast, ride accept/decline, earnings tracking, onboarding |
| Matching | Geo-proximity driver discovery, shared ride route-similarity matching, safety-mode filtering |
| Real-Time | Driver location tracking, ETA updates, ride state transitions, in-ride chat, push notifications |
| Payments | Wallet (prepaid balance), card payments (Stripe), fare calculation with surge pricing, promo codes |
| Safety | Emergency SOS, women-only mode, emergency contacts, ride sharing with contacts |
| Admin | User management, analytics dashboard, notification broadcast, promo management |

## 1.2 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Availability | 99.95% uptime (≤22 min downtime/month) |
| Latency — Login/Signup | p50 < 200ms, p99 < 800ms |
| Latency — Ride Booking | p50 < 500ms, p99 < 2s |
| Latency — Driver Match | p50 < 3s, p99 < 10s |
| Latency — Location Update | p50 < 100ms, p99 < 300ms |
| Latency — Push Notification | p50 < 500ms, p99 < 2s |
| Throughput — Auth | 2,000 req/s sustained, 10,000 req/s burst |
| Throughput — Location Updates | 20,000 updates/s (drivers updating every 3s) |
| Throughput — Ride Bookings | 500 bookings/s sustained |
| Consistency | Strong consistency for payments/wallet, eventual consistency for location/analytics |
| Durability | Zero data loss for financial transactions |
| Security | Encrypted at rest + in transit, PII protection, audit logging |

## 1.3 Scaling Assumptions

```
100,000 concurrent users breakdown:
├── 70,000 riders (browsing, booking, in-ride)
│   ├── 50,000 idle/browsing
│   ├── 15,000 booking or waiting for driver
│   └── 5,000 in active rides
├── 25,000 drivers
│   ├── 15,000 online/available
│   ├── 8,000 en-route or in-ride
│   └── 2,000 idle/offline
└── 5,000 admin/internal users

Peak traffic assumptions:
├── Login storm: 5,000 logins/minute during morning rush
├── Booking spike: 3,000 bookings/minute during evening rush
├── Location updates: 15,000 drivers × 1 update/3s = 5,000 updates/s
├── SSE connections: 25,000 persistent (all active riders + drivers)
└── API calls: ~15,000 req/s total across all services
```

---

# 2. HIGH-LEVEL ARCHITECTURE

## 2.1 Architecture Diagram

```
                              ┌──────────────────┐
                              │   CloudFlare CDN  │
                              │   + DDoS Shield   │
                              └────────┬─────────┘
                                       │
                              ┌────────▼─────────┐
                              │  API Gateway /    │
                              │  Load Balancer    │
                              │  (AWS ALB / Nginx)│
                              └────────┬─────────┘
                                       │
                    ┌──────────────────┬┴──────────────────┐
                    │                  │                    │
           ┌───────▼──────┐  ┌───────▼───────┐  ┌────────▼───────┐
           │  Auth Service │  │  API Service  │  │  Realtime      │
           │  (stateless)  │  │  (tRPC/REST)  │  │  Gateway       │
           │  2-4 pods     │  │  6-12 pods    │  │  (SSE/WS)      │
           └───────┬───────┘  └───────┬───────┘  │  4-8 pods      │
                   │                  │           └────────┬───────┘
                   │                  │                    │
        ┌──────────┴──────────────────┴────────────────────┘
        │
┌───────▼────────┐  ┌──────────────┐  ┌─────────────────┐
│  Redis Cluster │  │  Message     │  │  MySQL Primary   │
│  (cache/       │  │  Queue       │  │  + Read Replicas │
│   sessions/    │  │  (Redis      │  │  (RDS/PlanetScale│
│   pub-sub)     │  │   Streams /  │  │   / Vitess)      │
│  3 nodes       │  │   BullMQ)    │  │  1 writer +      │
└────────────────┘  │              │  │  2-3 readers     │
                    └──────┬───────┘  └──────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼────────┐  ┌────────────▼──────────┐
    │  Worker Pods     │  │  Notification Worker  │
    │  (matching,      │  │  (push, SMS, email)   │
    │   fare calc,     │  │  2-4 pods             │
    │   analytics)     │  └───────────────────────┘
    │  2-6 pods        │
    └──────────────────┘
```

## 2.2 Service Decomposition

Your current monolith (`server/routers.ts` at 3,337 lines) should be split into logical service boundaries. At 100k users, you don't need full microservices — **modular monolith with separate scaling for hot paths** is the right approach.

### Service Split Strategy

| Service | Current Location | Scaling Need | Sync/Async |
|---------|-----------------|--------------|------------|
| **Auth Service** | `routers.ts` auth section | Independent — login storms | Sync (HTTP) |
| **Core API** | `routers.ts` rides/driver/wallet | Main workhorse, horizontal | Sync (tRPC) |
| **Matching Engine** | `driverMatcher.ts`, `sharedRideMatcher.ts` | CPU-bound, scale separately | Async (queue) |
| **Realtime Gateway** | `index.ts` SSE section | Connection-bound, scale by connections | SSE/WebSocket |
| **Notification Worker** | `notificationService.ts` | I/O-bound (Twilio, FCM), async | Async (queue consumer) |
| **Payment Worker** | `stripe.ts` | Critical path, isolated failure | Async (queue) |
| **Analytics Aggregator** | Inline queries | Background, non-critical | Async (cron/queue) |

### Request Flow

```
Mobile/Web Client
    │
    ├── HTTPS ──→ ALB ──→ Auth Service (login/signup/token verify)
    │                      │
    │                      └── Redis (session cache, OTP store)
    │                      └── MySQL (user lookup/creation)
    │
    ├── HTTPS ──→ ALB ──→ Core API (rides, wallet, profile, etc.)
    │                      │
    │                      ├── Redis (driver locations, surge cache)
    │                      ├── MySQL (rides, payments, etc.)
    │                      └── Queue → Matching Engine
    │                                  Notification Worker
    │                                  Payment Worker
    │
    └── SSE/WS ──→ ALB ──→ Realtime Gateway
                           │
                           └── Redis Pub/Sub (fanout events)
```

### Traffic Separation

```
Rider traffic  ──→ ALB path: /api/trpc/rides.*, /api/trpc/wallet.*
Driver traffic ──→ ALB path: /api/trpc/driver.*
Admin traffic  ──→ ALB path: /admin/*  (separate target group, lower priority)
Realtime       ──→ ALB path: /api/events, /ws  (sticky, long-lived connections)
```

---

# 3. LOAD BALANCING STRATEGY

## 3.1 Multi-Layer Load Balancing

```
Internet
    │
    ▼
┌──────────────────────────────┐
│  Layer 7: AWS ALB            │
│  - Path-based routing        │
│  - /api/trpc/* → API TG      │
│  - /api/events → Realtime TG │
│  - /admin/* → Admin TG       │
│  - TLS termination           │
│  - Request rate limiting      │
│  - Health checks: /healthz   │
└──────────────┬───────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
  API TG    Realtime TG  Admin TG
 (6-12)     (4-8)       (2-3)
```

## 3.2 Autoscaling Strategy

| Service | Metric | Scale-Out Trigger | Scale-In Trigger | Min | Max |
|---------|--------|-------------------|------------------|-----|-----|
| Auth | CPU + request count | CPU > 60% or 800 req/s/pod | CPU < 30% | 2 | 8 |
| Core API | CPU + latency | CPU > 65% or p99 > 1s | CPU < 25% | 4 | 16 |
| Realtime Gateway | Connection count | > 3,000 conns/pod | < 1,000 conns/pod | 3 | 12 |
| Matching Worker | Queue depth | > 100 pending jobs | Queue empty for 5m | 2 | 8 |
| Notification Worker | Queue depth | > 500 pending | Queue empty for 5m | 2 | 6 |

## 3.3 Stateless Auth (No Sticky Sessions)

Your current JWT cookie approach is already stateless — good. But with Redis session cache:

```
1. Client sends JWT cookie with every request
2. Any API pod validates JWT signature (no DB call)
3. If user data needed: check Redis cache first (TTL: 5 min)
4. Cache miss: query MySQL read replica → populate Redis
5. On logout: delete Redis key + clear cookie
```

No sticky sessions needed. Any pod can serve any request.

## 3.4 Spike Handling

**Login Storm (morning rush):**
```
Normal: 200 logins/min → Auth pods: 2
Spike:  5,000 logins/min → Auth pods auto-scale to 6
Strategy:
  - OTP generation is CPU-light → handle inline
  - OTP verification → Redis lookup (sub-ms)
  - User creation → MySQL write (use connection pool, max 20 conns/pod)
  - Pre-warm: schedule scale-up at 6:45 AM daily
```

**Booking Spike (evening rush):**
```
Normal: 500 bookings/min → API pods: 4
Spike:  3,000 bookings/min → API pods auto-scale to 12
Strategy:
  - Booking creation → MySQL write (fast, single insert)
  - Driver matching → queue immediately (async)
  - Don't block the booking response on matching
  - Return "searching for driver" instantly
```

## 3.5 Health Checks & Failover

```typescript
// /healthz endpoint — every pod
app.get('/healthz', async (req, res) => {
  const checks = {
    mysql: false,
    redis: false,
    uptime: process.uptime(),
  };
  try {
    await db.execute(sql`SELECT 1`);
    checks.mysql = true;
  } catch {}
  try {
    await redis.ping();
    checks.redis = true;
  } catch {}

  const healthy = checks.mysql && checks.redis;
  res.status(healthy ? 200 : 503).json(checks);
});
```

**ALB health check config:**
- Path: `/healthz`
- Interval: 10s
- Healthy threshold: 2
- Unhealthy threshold: 3
- Timeout: 5s

**Failover:** Deploy across 2+ Availability Zones. ALB automatically routes away from unhealthy pods/zones.

## 3.6 Graceful Degradation

| Failure | Degraded Behavior |
|---------|-------------------|
| Redis down | Auth falls back to DB-only (slower, still works). Location cache unavailable — use last-known from DB. |
| MySQL read replica down | Route reads to primary (higher load but functional) |
| Notification service down | Rides still work. Notifications queued in dead-letter, replayed on recovery. |
| Stripe down | Wallet payments work. Card payments show "temporarily unavailable". |
| Google Maps down | Use cached routes. Fare uses straight-line distance estimate. |

---

# 4. AUTHENTICATION AND SIGNUP AT SCALE

## 4.1 Current Architecture Problems

Your current auth has several scale blockers:

1. **In-memory OTP store** (`Map<string, OtpRecord>`) — lost on pod restart, not shared across pods
2. **No rate limiting infrastructure** — only in-memory counters
3. **JWT with 1-year expiry** — no rotation, no revocation
4. **No refresh token** — single long-lived token
5. **Cookie-only auth** — works for web, fragile for mobile

## 4.2 Scaled Auth Architecture

```
Client (mobile/web)
    │
    ├── POST /auth/request-otp
    │   │
    │   ▼
    │   Auth Service Pod (any)
    │   ├── Rate limit check → Redis INCR (key: otp:phone:+1234, TTL: 60s)
    │   ├── Generate OTP → Redis SET (key: otp:verify:+1234, value: 482916, TTL: 600s)
    │   └── Send OTP → Queue → Notification Worker → Twilio/Email
    │
    ├── POST /auth/verify-otp
    │   │
    │   ▼
    │   Auth Service Pod (any)
    │   ├── Redis GET otp:verify:+1234 → compare code
    │   ├── Redis INCR otp:attempts:+1234 (max 5)
    │   ├── MySQL: upsert user + profile
    │   ├── Generate access token (JWT, 15 min expiry)
    │   ├── Generate refresh token (opaque, 30 day expiry)
    │   ├── Redis SET session:{userId}:{deviceId} → refresh token hash (TTL: 30 days)
    │   └── Return: { accessToken, refreshToken } + Set-Cookie
    │
    ├── POST /auth/refresh
    │   │
    │   ▼
    │   Auth Service Pod (any)
    │   ├── Validate refresh token → Redis lookup
    │   ├── Issue new access token (15 min)
    │   ├── Optionally rotate refresh token
    │   └── Return new access token
    │
    └── POST /auth/logout
        │
        ▼
        Auth Service Pod (any)
        ├── Redis DEL session:{userId}:{deviceId}
        └── Clear cookie
```

## 4.3 Token Strategy

```
Access Token (JWT):
  - Expiry: 15 minutes
  - Payload: { userId, role, iat, exp }
  - Signed with RS256 (asymmetric key pair)
  - Validated locally on any pod (no DB/Redis call)
  - Short-lived → no revocation needed

Refresh Token (Opaque):
  - Expiry: 30 days
  - Stored in Redis: session:{userId}:{deviceId} → hash(refreshToken)
  - Rotate on each use (sliding expiry)
  - Revocable: delete Redis key on logout
  - Supports multi-device: each device gets own refresh token

Device tracking:
  - deviceId derived from: platform + fingerprint or client-generated UUID
  - Stored per session → allows "log out other devices"
```

## 4.4 Rate Limiting

```
Redis-based sliding window rate limiter:

OTP Request:
  - Per phone/email: 1 request per 60 seconds
  - Per IP: 10 requests per 5 minutes
  - Global: 100 requests per minute per pod

OTP Verify:
  - Per phone/email: 5 attempts per OTP (then invalidate)
  - Per IP: 20 attempts per 5 minutes

Login (token refresh):
  - Per user: 60 requests per minute
  - Per IP: 100 requests per minute

Implementation:
  Key: ratelimit:{action}:{identifier}
  Use Redis MULTI/EXEC:
    INCR key
    EXPIRE key {window_seconds}
  If count > limit → 429 Too Many Requests
```

## 4.5 Handling Login Storms

```
Morning rush: 5,000 users login within 2 minutes

Without optimization:
  5,000 × MySQL read (user lookup) = DB overloaded

With optimization:
  1. OTP verify → Redis (sub-ms) ✓
  2. User lookup → Redis cache first (key: user:{openId})
     - Hit rate after warm-up: ~70% (returning users)
     - Only 1,500 DB reads for new/cold users
  3. User creation (signup) → MySQL write
     - Batch-friendly: each insert is independent
     - Connection pool: 20 conns × 4 pods = 80 concurrent writes
     - At 5ms/write: 80 × 200/s = 16,000 writes/s capacity ✓
  4. JWT signing → CPU-only, no I/O
     - RS256 signing: ~2ms on modern CPU
     - 4 pods × 4 cores = can sign 8,000 tokens/s ✓
```

## 4.6 Security Hardening

```
Password/Secret Handling:
  - No passwords (OTP-based auth) ✓
  - JWT signing key: AWS Secrets Manager, rotated monthly
  - OTP codes: 6-digit numeric, cryptographically random

Brute Force Protection:
  - Progressive delays: after 3 failed attempts, add 1s delay per attempt
  - Account lockout: after 10 failed OTP attempts in 1 hour, lock for 30 min
  - IP blocking: after 50 failed attempts from same IP, block for 1 hour

Cookie Security:
  - HttpOnly: true (no JS access)
  - Secure: true (HTTPS only)
  - SameSite: Strict (CSRF protection)
  - Domain: .yourdomain.com

Mobile Auth:
  - Store refresh token in secure storage (Expo SecureStore)
  - Access token in memory only
  - On app launch: silent refresh → new access token
```

---

# 5. RIDE BOOKING FLOW AT SCALE

## 5.1 Complete Booking Flow

```
┌─────────┐     ┌──────────┐     ┌──────────────┐     ┌────────────┐
│  Rider   │     │ Core API │     │   Matching    │     │  Driver    │
│  App     │     │  Service  │     │   Engine     │     │  App       │
└────┬─────┘     └────┬─────┘     └──────┬───────┘     └────┬───────┘
     │                │                   │                  │
     │ POST /rides.create                 │                  │
     │ {pickup, dropoff,                  │                  │
     │  mode: solo/share}                 │                  │
     ├───────────────►│                   │                  │
     │                │                   │                  │
     │                │ 1. Validate input │                  │
     │                │ 2. Calculate fare │                  │
     │                │    (fareEngine)   │                  │
     │                │ 3. Create ride    │                  │
     │                │    (status:       │                  │
     │                │     searching)    │                  │
     │                │ 4. Enqueue match  │                  │
     │                │    job            │                  │
     │  ◄─────────────┤                   │                  │
     │  { rideId,     │                   │                  │
     │    status:     │  Queue: MATCH_REQ │                  │
     │    searching,  ├──────────────────►│                  │
     │    estFare }   │                   │                  │
     │                │                   │ 5. Query Redis:  │
     │                │                   │    nearby online  │
     │                │                   │    drivers       │
     │                │                   │ 6. Score & rank  │
     │                │                   │    candidates    │
     │                │                   │ 7. Dispatch to   │
     │                │                   │    top driver    │
     │                │                   │    (30s timeout) │
     │                │                   ├─────────────────►│
     │                │                   │  SSE: new_ride   │
     │                │                   │  request         │
     │                │                   │                  │
     │                │                   │    POST /driver  │
     │                │                   │    .acceptRide   │
     │                │                   │◄─────────────────┤
     │                │                   │                  │
     │                │                   │ 8. Atomic update:│
     │                │                   │    ride.status = │
     │                │                   │    matched       │
     │                │                   │    ride.driverId │
     │                │                   │    = driver.id   │
     │                │  SSE: ride_matched│                  │
     │  ◄─────────────┤◄─────────────────┤                  │
     │  {driver info, │                   │                  │
     │   ETA, vehicle}│                   │                  │
```

## 5.2 Race Condition Prevention

### Problem 1: Two drivers accepting the same ride

```sql
-- Use MySQL row-level locking with optimistic concurrency

-- In ride_requests table, add a `version` column
-- Driver acceptance uses compare-and-swap:

UPDATE ride_requests
SET status = 'accepted',
    accepted_at = NOW(),
    version = version + 1
WHERE ride_id = ?
  AND driver_id = ?
  AND status = 'pending'
  AND version = ?;  -- optimistic lock

-- If affected_rows = 0 → another driver already accepted
-- Return: "Ride no longer available"
```

**Better approach — Redis atomic dispatch:**

```typescript
// Use Redis SETNX for atomic ride claim
async function claimRide(rideId: string, driverId: number): Promise<boolean> {
  // SETNX = SET if Not eXists — atomic
  const claimed = await redis.set(
    `ride:claim:${rideId}`,
    driverId.toString(),
    'NX',  // only set if not exists
    'EX', 60  // expire in 60s (cleanup)
  );

  if (claimed === 'OK') {
    // This driver won the claim
    // Now update MySQL (no race — we hold the lock)
    await db.update(rides)
      .set({ driverId, status: 'matched', rideStep: 'driver_assigned' })
      .where(and(eq(rides.rideId, rideId), eq(rides.status, 'searching')));
    return true;
  }
  return false; // another driver got it
}
```

### Problem 2: Two passengers joining same shared ride (exceeding seat limit)

```typescript
async function joinSharedRide(rideId: string, passengerId: number, seats: number) {
  // Use Redis for atomic seat reservation
  const key = `ride:seats:${rideId}`;

  // Lua script for atomic check-and-decrement
  const luaScript = `
    local available = tonumber(redis.call('GET', KEYS[1]) or '0')
    local requested = tonumber(ARGV[1])
    if available >= requested then
      redis.call('DECRBY', KEYS[1], requested)
      return 1
    end
    return 0
  `;

  const reserved = await redis.eval(luaScript, 1, key, seats);

  if (reserved === 1) {
    // Seats reserved — now write to MySQL
    await db.insert(ridePassengers).values({
      rideId, passengerId, seatsOccupied: seats, status: 'confirmed'
    });
    return { success: true };
  }
  return { success: false, reason: 'No seats available' };
}
```

### Problem 3: Duplicate booking requests (double-tap)

```typescript
// Idempotency key — client generates UUID, sends with request
async function createRide(input: CreateRideInput, idempotencyKey: string) {
  // Check if this request was already processed
  const existing = await redis.get(`idempotent:ride:${idempotencyKey}`);
  if (existing) {
    return JSON.parse(existing); // return cached response
  }

  // Process the booking
  const ride = await processBooking(input);

  // Cache the response for 1 hour
  await redis.set(
    `idempotent:ride:${idempotencyKey}`,
    JSON.stringify(ride),
    'EX', 3600
  );

  return ride;
}
```

### Problem 4: Stale driver location causing wrong matches

```typescript
// Driver location in Redis with TTL
async function updateDriverLocation(driverId: number, lat: number, lng: number) {
  const key = `driver:loc:${driverId}`;
  await redis.set(key, JSON.stringify({ lat, lng, updatedAt: Date.now() }), 'EX', 15);
  // TTL: 15 seconds — if driver stops sending updates, they auto-expire

  // Also update geospatial index for nearby queries
  await redis.geoadd('drivers:online', lng, lat, driverId.toString());
}

async function findNearbyDrivers(lat: number, lng: number, radiusKm: number) {
  // Redis GEO query — sub-ms
  const nearby = await redis.georadius(
    'drivers:online', lng, lat, radiusKm, 'km',
    'WITHDIST', 'COUNT', 50, 'ASC'
  );

  // Filter out stale locations
  const fresh = [];
  for (const [driverId, dist] of nearby) {
    const loc = await redis.get(`driver:loc:${driverId}`);
    if (loc) {
      const parsed = JSON.parse(loc);
      // Only include if updated within last 15s
      if (Date.now() - parsed.updatedAt < 15000) {
        fresh.push({ driverId: parseInt(driverId), distance: parseFloat(dist), ...parsed });
      }
    }
  }
  return fresh;
}
```

## 5.3 State Machine Enforcement

```typescript
// Your rideStateMachine.ts is good — enforce it at the DB level too

const VALID_TRANSITIONS: Record<string, string[]> = {
  'searching':       ['matched', 'cancelled'],
  'matched':         ['driver_en_route', 'cancelled'],
  'driver_en_route': ['driver_arrived', 'cancelled'],
  'driver_arrived':  ['ride_started', 'cancelled'],
  'ride_started':    ['ride_in_progress', 'cancelled'],
  'ride_in_progress':['completed', 'cancelled'],
  'completed':       [],  // terminal
  'cancelled':       [],  // terminal
};

async function transitionRide(rideId: string, newStatus: string) {
  // Atomic transition with status check
  const result = await db.execute(sql`
    UPDATE rides
    SET status = ${newStatus},
        updated_at = NOW()
    WHERE ride_id = ${rideId}
      AND status IN (${sql.join(
        VALID_TRANSITIONS_REVERSE[newStatus].map(s => sql`${s}`),
        sql`,`
      )})
  `);

  if (result.rowsAffected === 0) {
    throw new Error(`Invalid state transition to ${newStatus} for ride ${rideId}`);
  }
}
```

---

# 6. REAL-TIME SYSTEM DESIGN

## 6.1 Transport Decision

| Feature | WebSocket | SSE | Long Polling |
|---------|-----------|-----|-------------|
| Direction | Bidirectional | Server → Client | Simulated bidirectional |
| Connection overhead | High (upgrade handshake) | Low (standard HTTP) | Very high (repeated connects) |
| Load balancer support | Needs L7 with WS support | Works with any L7 | Works everywhere |
| Reconnection | Manual | Built-in (EventSource) | Built-in |
| Scalability | Complex (sticky or Redis pub/sub) | Simple (stateless fanout) | Simple but inefficient |
| Mobile battery | Good (single connection) | Good | Bad (frequent wakeups) |
| Use case fit | Chat, bidirectional | Location updates, notifications | Fallback only |

**Recommendation: Hybrid approach**

```
SSE (primary):
  - Driver location updates to riders
  - Ride status changes
  - Push notifications
  - Admin live monitoring
  Reason: Simpler scaling, browser-native reconnect, works through most proxies

WebSocket (secondary):
  - In-ride chat messages (bidirectional)
  - Driver location upload (high-frequency, bidirectional)
  Reason: Chat needs bidirectional. Driver location needs low-overhead upload.
```

## 6.2 Scaled Realtime Architecture

```
┌─────────────┐     ┌─────────────┐
│ Rider App   │     │ Driver App  │
│ (SSE client)│     │ (WS client) │
└──────┬──────┘     └──────┬──────┘
       │                   │
       │   SSE: ride       │   WS: location
       │   updates         │   upload + ride
       │                   │   updates
       │                   │
┌──────▼───────────────────▼──────┐
│        ALB (Layer 7)             │
│  Connection idle timeout: 300s   │
│  Target: Realtime Gateway pods   │
└──────────────┬──────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│ RT Pod │ │ RT Pod │ │ RT Pod │   Each pod handles
│ 1      │ │ 2      │ │ 3      │   ~3,000-5,000
│        │ │        │ │        │   connections
└───┬────┘ └───┬────┘ └───┬────┘
    │          │          │
    └──────────┼──────────┘
               │
    ┌──────────▼──────────┐
    │   Redis Pub/Sub     │
    │                     │
    │   Channels:         │
    │   ride:{rideId}     │
    │   driver:{driverId} │
    │   user:{userId}     │
    │   admin:broadcast   │
    └─────────────────────┘
```

## 6.3 Pub/Sub Fanout Strategy

```typescript
// When a ride status changes — fanout to all participants
async function broadcastRideUpdate(rideId: string, event: RideEvent) {
  // Get all participants of this ride
  const participants = await getActiveRideParticipants(rideId);
  // Includes: driver, all passengers, admin observers

  // Publish to Redis — all Realtime Gateway pods receive this
  await redis.publish(`ride:${rideId}`, JSON.stringify(event));

  // Each RT pod checks if any of its connected clients are participants
  // If yes, push the event down their SSE/WS connection
}

// On each Realtime Gateway pod:
redis.subscribe('ride:*', (channel, message) => {
  const rideId = channel.split(':')[1];
  const event = JSON.parse(message);

  // Find local connections for this ride
  const localConnections = connectionRegistry.getByRide(rideId);
  for (const conn of localConnections) {
    conn.send(event);
  }
});
```

## 6.4 Driver Location Pipeline

```
Driver sends location every 3 seconds

Driver App
    │
    │ WS message: { lat, lng, heading, speed }
    ▼
Realtime Gateway Pod
    │
    ├── 1. Update Redis GEO index (for matching queries)
    │      GEOADD drivers:online {lng} {lat} {driverId}
    │
    ├── 2. Update Redis key (with TTL for staleness detection)
    │      SET driver:loc:{driverId} {lat,lng,ts} EX 15
    │
    ├── 3. If driver is on an active ride:
    │      Publish to Redis: ride:{rideId} channel
    │      → All rider SSE connections receive location
    │
    └── 4. Throttle DB writes: batch every 30s
         → Write to driver_sessions.current_lat/lng
         → Write to ride location history (for analytics)

Throughput:
  15,000 online drivers × 1 update/3s = 5,000 updates/s
  Redis: easily handles 100,000+ ops/s
  MySQL: only 500 writes/s (batched 30s intervals)
```

## 6.5 Connection State Management

```typescript
class ConnectionRegistry {
  // userId → Set<Connection>  (multi-device)
  private byUser = new Map<number, Set<SSEConnection>>();
  // rideId → Set<Connection>  (ride participants)
  private byRide = new Map<string, Set<SSEConnection>>();
  // Total connection count (for autoscaling metric)
  private totalConnections = 0;

  addConnection(userId: number, conn: SSEConnection) {
    if (!this.byUser.has(userId)) this.byUser.set(userId, new Set());
    this.byUser.get(userId)!.add(conn);
    this.totalConnections++;

    // Cleanup on disconnect
    conn.on('close', () => {
      this.byUser.get(userId)?.delete(conn);
      this.totalConnections--;
      // Remove from all ride subscriptions
      for (const [rideId, conns] of this.byRide) {
        conns.delete(conn);
        if (conns.size === 0) this.byRide.delete(rideId);
      }
    });
  }

  subscribeToRide(rideId: string, conn: SSEConnection) {
    if (!this.byRide.has(rideId)) this.byRide.set(rideId, new Set());
    this.byRide.get(rideId)!.add(conn);
  }
}
```

## 6.6 Reconnection & Durability

```typescript
// Client-side (React Native):
function useSSE(userId: string) {
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  useEffect(() => {
    const connect = () => {
      const url = `${API_URL}/api/events${lastEventId ? `?lastEventId=${lastEventId}` : ''}`;
      const eventSource = new EventSource(url, { withCredentials: true });

      eventSource.onmessage = (e) => {
        setLastEventId(e.lastEventId);
        handleEvent(JSON.parse(e.data));
      };

      eventSource.onerror = () => {
        eventSource.close();
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        setTimeout(connect, Math.min(retryDelay * 2, 30000));
      };

      return eventSource;
    };

    const es = connect();
    return () => es.close();
  }, []);
}

// Server-side: missed event replay
// Store recent events in Redis sorted set (score = timestamp)
async function getEventsAfter(userId: number, lastEventId: string) {
  const timestamp = extractTimestamp(lastEventId);
  return redis.zrangebyscore(`events:${userId}`, timestamp, '+inf');
}
```

---

# 7. DATABASE DESIGN FOR SCALE

## 7.1 Storage Selection

| Data Type | Storage | Why |
|-----------|---------|-----|
| Users, Rides, Payments, Wallets | **MySQL (primary)** | ACID transactions, relational integrity, your team knows it |
| Driver Locations (live) | **Redis GEO** | Sub-ms geospatial queries, 100k+ ops/s |
| Sessions, OTP, Rate Limits | **Redis** | TTL support, atomic operations, fast |
| Chat Messages | **MySQL** (now) → **ScyllaDB/Cassandra** (at 1M) | Write-heavy, time-series, partitioned by rideId |
| Analytics/Aggregates | **MySQL read replica** (now) → **ClickHouse** (at 1M) | OLAP queries, column-oriented |
| Ride Route Polylines | **S3/Object Storage** | Large blobs, rarely queried |
| Search (users, addresses) | **MySQL FULLTEXT** (now) → **Elasticsearch** (at 1M) | Full-text search, autocomplete |

## 7.2 MySQL Scaling Strategy

```
Stage 1 (current, <10k users):
  Single MySQL instance
  ├── All reads + writes

Stage 2 (10k-50k users):
  MySQL Primary + 1 Read Replica
  ├── Writes → Primary
  ├── Heavy reads → Replica (analytics, history, search)
  └── Transactional reads → Primary (booking, payment)

Stage 3 (50k-100k users):
  MySQL Primary + 2 Read Replicas
  ├── Writes → Primary
  ├── API reads → Replica 1
  ├── Analytics/Admin reads → Replica 2
  └── Connection pooling: PgBouncer equivalent for MySQL (ProxySQL)

Stage 4 (100k+ users):
  Vitess or PlanetScale (horizontal MySQL sharding)
  ├── Shard by user_id for user-scoped queries
  ├── Shard by region for geo-scoped queries
  └── Cross-shard queries via Vitess scatter-gather
```

## 7.3 Indexing Strategy

```sql
-- Critical indexes for 100k scale (add these to your schema)

-- Driver matching: find online drivers near a location
-- Already using Redis GEO, but backup index for DB queries:
CREATE INDEX idx_driver_sessions_status_location
  ON driver_sessions (status, current_lat, current_lng)
  WHERE status = 'online';

-- Ride queries: user's rides (frequent)
CREATE INDEX idx_rides_driver_status
  ON rides (driver_id, status, created_at DESC);

CREATE INDEX idx_ride_passengers_passenger
  ON ride_passengers (passenger_id, created_at DESC);

-- Payment queries
CREATE INDEX idx_payments_ride
  ON payments (ride_id, status);

CREATE INDEX idx_transactions_user_created
  ON transactions (user_id, created_at DESC);

-- Notification queries (most frequent read)
CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id, is_read, created_at DESC);

-- Ride requests (dispatch): find pending requests for a driver
CREATE INDEX idx_ride_requests_driver_status
  ON ride_requests (driver_id, status, expires_at);

-- Surge zones: active zones for fare calculation
CREATE INDEX idx_surge_zones_active
  ON surge_zones (active_from, active_until);
```

## 7.4 Geospatial Query Strategy

```
For nearby driver discovery (most performance-critical query):

Approach 1: Redis GEO (recommended for real-time)
  GEOADD drivers:online {lng} {lat} {driverId}
  GEORADIUS drivers:online {lng} {lat} 5 km WITHDIST COUNT 50 ASC

  Performance: < 1ms for 100,000 entries
  Update cost: O(log(N)) per GEOADD
  Query cost: O(N+log(M)) where M = total, N = results

Approach 2: Geohash Grid (for MySQL fallback)
  - Compute geohash prefix (6 chars = ~1.2km precision)
  - Store in driver_sessions.geohash column
  - Query: WHERE geohash LIKE 'dr5ru7%'
  - Adjacent cells: compute 8 neighbor geohashes, query all 9

  CREATE INDEX idx_driver_sessions_geohash
    ON driver_sessions (geohash, status);

  Performance: ~5ms with index, works up to 1M drivers
```

## 7.5 Partitioning Strategy

```sql
-- For tables that grow unboundedly, partition by time:

-- Notifications: partition by month
ALTER TABLE notifications
PARTITION BY RANGE (YEAR(created_at) * 100 + MONTH(created_at)) (
  PARTITION p202601 VALUES LESS THAN (202602),
  PARTITION p202602 VALUES LESS THAN (202603),
  -- ... add monthly
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- Transactions: partition by month
ALTER TABLE transactions
PARTITION BY RANGE (YEAR(created_at) * 100 + MONTH(created_at)) (
  PARTITION p202601 VALUES LESS THAN (202602),
  -- ...
);

-- Benefits:
-- 1. Queries with date range scan only relevant partitions
-- 2. Old data can be archived by dropping old partitions
-- 3. Each partition has smaller indexes → faster lookups
```

## 7.6 Connection Pool Configuration

```typescript
// Current: your mysql2 pool has default settings
// For 100k users, tune the connection pool:

const pool = mysql.createPool({
  host: env.DB_HOST,
  user: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,

  // Connection limits
  connectionLimit: 20,        // per pod (not per app)
  maxIdle: 5,                 // keep 5 warm connections
  idleTimeout: 60000,         // close idle after 60s
  waitForConnections: true,   // queue if all busy
  queueLimit: 100,            // max queued requests

  // Timeouts
  connectTimeout: 5000,       // 5s to establish connection
  acquireTimeout: 10000,      // 10s to acquire from pool

  // MySQL server settings (set on the server)
  // max_connections = 500 (across all pods)
  // wait_timeout = 300
  // interactive_timeout = 300
});

// With 12 API pods × 20 connections = 240 connections to MySQL
// MySQL max_connections = 500 → safe margin of 260 for admin/replication
```

---

# 8. CACHING STRATEGY

## 8.1 What to Cache

| Data | Redis Key Pattern | TTL | Invalidation |
|------|-------------------|-----|-------------|
| User profile | `user:{userId}` | 5 min | On profile update |
| Driver location | `driver:loc:{driverId}` | 15s | Auto-expire (TTL) |
| Online drivers geo | `drivers:online` (GEO) | — | GEOADD on location update, ZREM on offline |
| Active ride state | `ride:{rideId}` | 10 min | On state transition |
| Ride seat count | `ride:seats:{rideId}` | 30 min | On join/leave |
| Surge pricing | `surge:{geohash}` | 2 min | On recalculation |
| OTP codes | `otp:verify:{destination}` | 10 min | On verify or expire |
| Rate limits | `ratelimit:{action}:{id}` | 60s | Auto-expire |
| Session data | `session:{userId}:{deviceId}` | 30 days | On logout |
| Idempotency keys | `idempotent:{action}:{key}` | 1 hour | Auto-expire |
| Notification unread count | `notif:unread:{userId}` | 2 min | On new notification or markRead |
| Default payment method | `payment:default:{userId}` | 10 min | On payment method change |

## 8.2 Cache Stampede Protection

```typescript
// Problem: 1000 requests hit cache miss simultaneously
// All 1000 query the DB → DB overloaded

// Solution: Distributed lock with single-flight
async function getWithLock<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // Try cache first
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  // Try to acquire lock
  const lockKey = `lock:${key}`;
  const locked = await redis.set(lockKey, '1', 'NX', 'EX', 5);

  if (locked === 'OK') {
    // We got the lock — fetch from DB
    try {
      const data = await fetcher();
      await redis.set(key, JSON.stringify(data), 'EX', ttl);
      return data;
    } finally {
      await redis.del(lockKey);
    }
  } else {
    // Another request is fetching — wait and retry cache
    await sleep(50);
    const retried = await redis.get(key);
    if (retried) return JSON.parse(retried);
    // Still no cache — fetch directly (fallback)
    return fetcher();
  }
}
```

## 8.3 Cache Invalidation

```typescript
// Event-driven cache invalidation
// When data changes, publish invalidation event

async function updateUserProfile(userId: number, patch: Partial<UserProfile>) {
  await db.update(userProfiles).set(patch).where(eq(userProfiles.userId, userId));

  // Invalidate cache
  await redis.del(`user:${userId}`);

  // If payment method changed, invalidate that too
  if (patch.defaultPaymentMethodId) {
    await redis.del(`payment:default:${userId}`);
  }
}

// For notification count — use Redis INCR/DECR instead of cache
async function createNotification(userId: number, data: any) {
  await db.insert(notifications).values(data);
  await redis.incr(`notif:unread:${userId}`);
}

async function markNotificationRead(userId: number, notifId: number) {
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, notifId));
  await redis.decr(`notif:unread:${userId}`);
}
```

---

# 9. MESSAGE QUEUES / EVENT-DRIVEN DESIGN

## 9.1 Queue Technology Choice

For your scale (100k users), **BullMQ (Redis-based)** is the right choice:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| BullMQ (Redis) | Same infra as cache, Node.js native, priorities, retries, rate limiting | Redis memory-bound, not durable like Kafka | **Best for 100k** |
| Kafka | Extremely durable, replay, high throughput | Complex ops, Java ecosystem, overkill at 100k | Upgrade path at 1M |
| RabbitMQ | Mature, flexible routing, AMQP | Separate infra, less Node.js-native | Good alternative |
| AWS SQS | Managed, no ops | Latency (50-100ms), no priorities | Good for async-only |

## 9.2 Queue Design

```typescript
import { Queue, Worker } from 'bullmq';

// Queue definitions
const matchingQueue = new Queue('ride-matching', { connection: redis });
const notificationQueue = new Queue('notifications', { connection: redis });
const paymentQueue = new Queue('payments', { connection: redis });
const analyticsQueue = new Queue('analytics', { connection: redis });
const locationBatchQueue = new Queue('location-batch', { connection: redis });

// Priority levels
const PRIORITY = {
  CRITICAL: 1,   // payment failures, SOS alerts
  HIGH: 2,       // ride matching, driver dispatch
  NORMAL: 5,     // notifications, confirmations
  LOW: 10,       // analytics, non-urgent updates
};
```

## 9.3 Event Catalog

```
Domain Events:

Auth:
  UserSignedUp        → notificationQueue (welcome message)
  UserLoggedIn        → analyticsQueue (login tracking)

Rides:
  RideRequested       → matchingQueue (PRIORITY.HIGH)
  RideMatched         → notificationQueue (notify rider + driver)
  DriverDispatched    → notificationQueue (notify driver)
  DispatchTimeout     → matchingQueue (try next driver)
  DriverAccepted      → notificationQueue, analyticsQueue
  DriverArrived       → notificationQueue (notify rider)
  RideStarted         → analyticsQueue
  RideCompleted       → paymentQueue, notificationQueue, analyticsQueue
  RideCancelled       → paymentQueue (refund), notificationQueue

Shared Rides:
  JoinRequested       → notificationQueue (notify driver)
  JoinApproved        → notificationQueue, matchingQueue (recalc route)
  JoinRejected        → notificationQueue

Payments:
  PaymentProcessed    → notificationQueue (receipt)
  PaymentFailed       → notificationQueue (PRIORITY.CRITICAL)
  WalletTopUp         → analyticsQueue
  RefundIssued        → notificationQueue

Driver:
  DriverWentOnline    → analyticsQueue
  DriverWentOffline   → matchingQueue (remove from pool)
  LocationUpdated     → locationBatchQueue (PRIORITY.LOW, batch to DB)

Safety:
  SOSTriggered        → notificationQueue (PRIORITY.CRITICAL), analyticsQueue
  SOSResolved         → notificationQueue
```

## 9.4 Worker Implementation

```typescript
// Matching Worker
const matchingWorker = new Worker('ride-matching', async (job) => {
  switch (job.name) {
    case 'RideRequested': {
      const { rideId, pickup, dropoff, mode } = job.data;
      const drivers = await findNearbyDrivers(pickup.lat, pickup.lng, 5);
      const scored = scoreAndRankDrivers(drivers, pickup, dropoff);

      if (scored.length === 0) {
        await updateRideStatus(rideId, 'no_drivers');
        await notificationQueue.add('NoDriversAvailable', { rideId });
        return;
      }

      // Dispatch to top driver
      await dispatchToDriver(rideId, scored[0]);
      break;
    }

    case 'DispatchTimeout': {
      const { rideId, failedDriverId, attempt } = job.data;
      if (attempt >= 5) {
        await updateRideStatus(rideId, 'no_drivers');
        await notificationQueue.add('NoDriversAvailable', { rideId });
        return;
      }
      // Try next driver
      const nextDriver = await getNextCandidate(rideId, failedDriverId);
      if (nextDriver) {
        await dispatchToDriver(rideId, nextDriver);
      }
      break;
    }
  }
}, {
  connection: redis,
  concurrency: 10,  // process 10 matches simultaneously
  limiter: { max: 100, duration: 1000 },  // max 100 jobs/s
});

// Notification Worker
const notificationWorker = new Worker('notifications', async (job) => {
  const { userId, type, title, body, data } = job.data;

  // 1. Save to DB (persistent)
  await createNotification({ userId, type, title, body, data });

  // 2. Push via SSE (real-time in-app)
  await redis.publish(`user:${userId}`, JSON.stringify({ type, title, body, data }));

  // 3. Push via FCM/APNs (background/closed app)
  const pushToken = await redis.get(`pushtoken:${userId}`);
  if (pushToken) {
    await sendExpoPush(pushToken, { title, body, data });
  }

  // 4. SMS for critical alerts (SOS, payment failure)
  if (job.data.priority === 'CRITICAL') {
    const user = await getUserById(userId);
    if (user?.phone) {
      await sendSMS(user.phone, `${title}: ${body}`);
    }
  }
}, {
  connection: redis,
  concurrency: 20,  // high concurrency for I/O-bound work
});
```

## 9.5 Dead-Letter Queue & Retries

```typescript
// Configure retries with exponential backoff
const notificationQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,  // 2s, 4s, 8s
    },
    removeOnComplete: { count: 1000 },  // keep last 1000 completed
    removeOnFail: { count: 5000 },       // keep last 5000 failed
  },
});

// Dead-letter queue for permanently failed jobs
notificationWorker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
    // Move to dead-letter queue for manual inspection
    await deadLetterQueue.add('failed-notification', {
      originalJob: job.data,
      error: err.message,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade,
    });

    // Alert ops team
    logger.error('Notification permanently failed', {
      jobId: job.id,
      userId: job.data.userId,
      error: err.message,
    });
  }
});
```

## 9.6 Idempotent Consumers

```typescript
// Every job gets a unique eventId — consumer checks before processing
async function processIdempotent(eventId: string, processor: () => Promise<void>) {
  const key = `processed:${eventId}`;
  const alreadyProcessed = await redis.set(key, '1', 'NX', 'EX', 86400);

  if (alreadyProcessed !== 'OK') {
    // Already processed — skip
    return;
  }

  await processor();
}

// Usage in worker:
const paymentWorker = new Worker('payments', async (job) => {
  await processIdempotent(job.data.eventId, async () => {
    await processRidePayment(job.data.rideId);
  });
});
```

---

# 10. RELIABILITY, FAULT TOLERANCE, AND RESILIENCE

## 10.1 Circuit Breakers

```typescript
import CircuitBreaker from 'opossum';

// Stripe payment circuit breaker
const stripeBreaker = new CircuitBreaker(
  async (paymentIntent: any) => stripe.paymentIntents.create(paymentIntent),
  {
    timeout: 10000,        // 10s timeout per call
    errorThresholdPercentage: 50,  // open circuit if 50% fail
    resetTimeout: 30000,   // try again after 30s
    volumeThreshold: 10,   // minimum 10 calls before evaluating
  }
);

stripeBreaker.on('open', () => {
  logger.warn('Stripe circuit breaker OPEN — falling back to wallet');
  alertOps('Stripe is down — circuit breaker opened');
});

stripeBreaker.fallback(async (paymentIntent: any) => {
  // Fallback: queue for retry, use wallet if available
  await paymentQueue.add('StripeRetry', paymentIntent, {
    delay: 60000,  // retry in 1 min
    priority: PRIORITY.CRITICAL,
  });
  return { status: 'pending', fallback: true };
});

// Google Maps circuit breaker
const mapsBreaker = new CircuitBreaker(
  async (origin: string, dest: string) => googleMaps.directions(origin, dest),
  {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
  }
);

mapsBreaker.fallback(async (origin: string, dest: string) => {
  // Fallback: straight-line distance estimate
  const distance = haversineDistance(origin, dest);
  const duration = distance / 30 * 60; // assume 30 km/h average
  return { distance, duration, fallback: true };
});
```

## 10.2 Retry Strategy

```typescript
// Exponential backoff with jitter
function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelay: number; maxDelay: number }
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay } = options;

  return new Promise(async (resolve, reject) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        return resolve(result);
      } catch (err) {
        if (attempt === maxRetries) return reject(err);

        // Exponential backoff with jitter
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelay
        );
        await sleep(delay);
      }
    }
  });
}

// Usage
const user = await retryWithBackoff(
  () => db.select().from(users).where(eq(users.id, userId)),
  { maxRetries: 3, baseDelay: 100, maxDelay: 5000 }
);
```

## 10.3 Failure Scenarios & Responses

| Failure | Detection | Response | Recovery |
|---------|-----------|----------|----------|
| MySQL primary down | Health check fails, connection errors | Read replica promoted to primary (RDS Multi-AZ: auto-failover ~60s) | Reconnect pool, clear stale connections |
| Redis down | PING timeout | Auth: fall back to DB-only session checks. Matching: fall back to DB geo queries. SSE: reconnect, replay from DB. | Redis Sentinel or Cluster auto-failover |
| API pod crash | ALB health check (10s) | ALB routes to healthy pods. K8s restarts pod (30s). | Stateless — no data loss |
| Realtime pod crash | Connection drop | Client auto-reconnect (SSE: native, WS: custom). Resume from lastEventId. | Pod restart, connections redistribute |
| Queue worker crash | BullMQ: job timeout | Job returns to queue, picked up by another worker. | Worker pod restart, job reprocessed |
| Stripe outage | Circuit breaker opens | Queue card payments for retry. Allow wallet payments. Show "card payment temporarily unavailable". | Circuit breaker half-open probe every 30s |
| Twilio outage | Circuit breaker opens | OTP: fall back to email. Notifications: in-app only. | Queue SMS for retry when recovered |
| Google Maps outage | Circuit breaker opens | Use cached routes. Estimate fare with haversine. | Retry when Maps recovers |
| Full AZ failure | ALB: no healthy targets in AZ | ALB routes all traffic to surviving AZ. Auto-scale to handle 2x load. | AZ recovery, traffic rebalances |

## 10.4 Graceful Shutdown

```typescript
// In your server/_core/index.ts — improve shutdown handling
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received — starting graceful shutdown`);

  // 1. Stop accepting new connections
  server.close();

  // 2. Stop accepting new queue jobs
  await matchingWorker.close();
  await notificationWorker.close();

  // 3. Wait for in-flight requests (max 30s)
  await Promise.race([
    waitForInflightRequests(),
    sleep(30000),
  ]);

  // 4. Close SSE connections
  closeAllSSEConnections();

  // 5. Close database pool
  await closeDbPool();

  // 6. Close Redis
  await redis.quit();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

# 11. SECURITY

## 11.1 API Security

```typescript
// Security middleware stack (order matters)
app.use(helmet());                          // Security headers
app.use(cors({
  origin: ['https://app.rideshare.com', 'https://admin.rideshare.com'],
  credentials: true,
}));
app.use(rateLimit({                         // Global rate limit
  windowMs: 60 * 1000,
  max: 200,                                 // 200 req/min per IP
  standardHeaders: true,
  store: new RedisStore({ client: redis }),
}));
app.use(express.json({ limit: '1mb' }));    // Body size limit
```

## 11.2 Input Validation

Your Zod schemas in `routers.ts` are already good. Add these:

```typescript
// Sanitize all string inputs
const sanitizedString = z.string()
  .transform(s => s.trim())
  .pipe(z.string().min(1).max(500));

// Prevent NoSQL-like injection in search params
const safeSearchString = z.string()
  .transform(s => s.replace(/[%_]/g, '\\$&'))  // escape MySQL wildcards
  .pipe(z.string().max(100));

// Validate coordinates
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
```

## 11.3 RBAC for Admin Panel

```typescript
// Role-based access control
const ROLES = {
  user: ['read:own_profile', 'write:own_profile', 'create:ride', 'read:own_rides'],
  driver: ['read:own_profile', 'write:own_profile', 'read:ride_requests', 'write:ride_status', 'read:earnings'],
  admin: ['read:all_users', 'write:all_users', 'read:all_rides', 'send:notifications', 'manage:promos', 'view:analytics'],
  superadmin: ['*'],
};

function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.role || 'user';
    const userPerms = ROLES[userRole] || [];

    const hasPermission = permissions.every(p =>
      userPerms.includes(p) || userPerms.includes('*')
    );

    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

## 11.4 PII Protection

```typescript
// Never log PII
const sanitizeForLogs = (data: any) => ({
  ...data,
  phone: data.phone ? `***${data.phone.slice(-4)}` : undefined,
  email: data.email ? `${data.email[0]}***@${data.email.split('@')[1]}` : undefined,
  name: data.name ? `${data.name[0]}***` : undefined,
  cardNumber: undefined,  // never log
  cvv: undefined,         // never log
});

// Encrypt PII at rest (for sensitive fields)
// Use MySQL column-level encryption for: phone, email, emergency contacts
// Or use application-level encryption with AWS KMS
```

## 11.5 Audit Logging

```typescript
// Log all admin actions and sensitive operations
interface AuditEntry {
  timestamp: Date;
  userId: number;
  action: string;
  resource: string;
  resourceId: string;
  details: string;
  ip: string;
  userAgent: string;
}

async function logAudit(req: Request, action: string, resource: string, resourceId: string, details: string) {
  await db.insert(auditLogs).values({
    userId: req.user.id,
    action,
    resource,
    resourceId,
    details,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
    createdAt: new Date(),
  });
}
```

---

# 12. OBSERVABILITY AND MONITORING

## 12.1 Three Pillars

```
Metrics (Prometheus/Datadog):
  └── Numeric time-series: request rate, latency, error rate, queue depth

Logs (Structured JSON → ELK/Loki):
  └── Event records: request logs, error details, audit trail

Traces (OpenTelemetry → Jaeger/Tempo):
  └── Request path: API → Redis → MySQL → Queue → Worker
```

## 12.2 Key Metrics Per Service

### Auth Service
```
auth_login_total                  # Total login attempts
auth_login_success_total          # Successful logins
auth_login_failure_total          # Failed logins (wrong OTP, expired, etc.)
auth_otp_send_total               # OTP messages sent
auth_otp_send_latency_seconds     # Time to send OTP
auth_token_refresh_total          # Token refresh count
auth_active_sessions_gauge        # Current active sessions
```

### Core API
```
api_request_total{method,path,status}     # Total requests by endpoint
api_request_duration_seconds{method,path} # Request latency histogram
api_ride_booking_total{mode}              # Bookings by mode (solo/share)
api_ride_booking_duration_seconds         # Time from request to response
api_ride_cancellation_total{reason}       # Cancellations by reason
```

### Matching Engine
```
matching_job_total                        # Total matching jobs
matching_job_duration_seconds             # Time to find and dispatch
matching_drivers_found_gauge              # Nearby drivers per request
matching_dispatch_timeout_total           # Drivers who didn't respond
matching_success_rate                     # Rides matched / rides requested
matching_queue_depth_gauge                # Pending matching jobs
```

### Realtime Gateway
```
realtime_connections_gauge                # Active SSE/WS connections
realtime_messages_sent_total              # Events pushed to clients
realtime_connection_duration_seconds      # How long connections live
realtime_reconnections_total              # Client reconnections
realtime_location_updates_total           # Driver location messages/sec
```

### Database
```
db_query_duration_seconds{query_type}     # Query latency
db_connections_active_gauge               # Active pool connections
db_connections_idle_gauge                 # Idle pool connections
db_connections_waiting_gauge              # Requests waiting for connection
db_slow_queries_total                     # Queries > 1s
```

### Queue
```
queue_depth_gauge{queue_name}             # Pending jobs per queue
queue_processing_duration_seconds{queue}  # Job processing time
queue_failed_total{queue}                 # Failed jobs
queue_dlq_depth_gauge{queue}              # Dead-letter queue size
```

## 12.3 Alerting Rules

| Alert | Condition | Severity | Response |
|-------|-----------|----------|----------|
| High Error Rate | 5xx rate > 5% for 2 min | Critical | Page on-call |
| Slow Ride Booking | p99 > 5s for 5 min | High | Investigate DB/matching |
| Matching Failures | Success rate < 80% for 10 min | High | Check driver pool, surge |
| Queue Backup | Any queue depth > 1000 for 5 min | High | Scale workers |
| DB Connection Exhaustion | Waiting connections > 20 for 2 min | Critical | Check slow queries |
| Redis Memory | Usage > 80% | Warning | Evict, scale, or add memory |
| SSE Connection Spike | Connections > 80% pod capacity | Warning | Pre-scale RT pods |
| Payment Failures | Failure rate > 10% for 5 min | Critical | Check Stripe, circuit breaker |
| SOS Alert | Any SOSTriggered event | Critical | Immediate notification to safety team |

## 12.4 Structured Logging

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      userId: req.user?.id,
      ip: req.ip,
    }),
    err: pino.stdSerializers.err,
  },
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      type: 'request',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      userId: (req as any).user?.id,
    });
  });
  next();
});
```

---

# 13. DEPLOYMENT ARCHITECTURE

## 13.1 Kubernetes Deployment

```yaml
# Recommended: EKS (AWS) or GKE (GCP)
# Cluster: 2 AZs, 3-6 nodes (c6i.xlarge or equivalent)

# Namespace layout:
# rideshare-prod/
#   ├── auth-service      (Deployment, HPA, Service)
#   ├── core-api           (Deployment, HPA, Service)
#   ├── realtime-gateway   (Deployment, HPA, Service)
#   ├── matching-worker    (Deployment, HPA)
#   ├── notification-worker(Deployment, HPA)
#   ├── payment-worker     (Deployment, HPA)
#   ├── redis              (StatefulSet or ElastiCache)
#   └── mysql              (RDS / PlanetScale — external)
```

```yaml
# Example: Core API Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: core-api
  namespace: rideshare-prod
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 2
  selector:
    matchLabels:
      app: core-api
  template:
    metadata:
      labels:
        app: core-api
    spec:
      containers:
      - name: api
        image: rideshare/core-api:v1.2.3
        ports:
        - containerPort: 3001
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 1Gi
        readinessProbe:
          httpGet:
            path: /healthz
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3001
          initialDelaySeconds: 15
          periodSeconds: 20
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: url
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: core-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: core-api
  minReplicas: 4
  maxReplicas: 16
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 65
  - type: Pods
    pods:
      metric:
        name: http_request_duration_seconds_p99
      target:
        type: AverageValue
        averageValue: "1"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
      - type: Pods
        value: 4
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
```

## 13.2 CI/CD Pipeline

```
GitHub Push → GitHub Actions:
  1. Lint + Type Check (1 min)
  2. Unit Tests (2 min)
  3. Integration Tests (3 min)
  4. Docker Build + Push to ECR (2 min)
  5. Deploy to Staging (1 min)
  6. E2E Tests on Staging (5 min)
  7. Manual Approval Gate
  8. Canary Deploy to Production (10% traffic)
  9. Monitor for 15 min
  10. Full Rollout (100%)

Rollback: automated if error rate > 5% during canary
```

## 13.3 Environment Separation

```
Development:  Local Docker Compose (MySQL + Redis + API)
Staging:      K8s cluster (1 node, 1 replica each service)
Production:   K8s cluster (3-6 nodes, HPA-scaled replicas)

Config:       K8s ConfigMaps + Sealed Secrets
Secrets:      AWS Secrets Manager → External Secrets Operator → K8s Secrets
```

---

# 14. STEP-BY-STEP EVOLUTION PLAN

## Stage 1: Current MVP (now → 1,000 users)

```
What you have:
  ✓ Single Express server (monolith)
  ✓ MySQL database (single instance)
  ✓ In-memory OTP store
  ✓ SSE for real-time (basic)
  ✓ In-memory driver locations
  ✓ tRPC API
  ✓ Expo mobile app

What's wrong at this stage:
  ✗ In-memory state lost on restart (OTP, driver locations)
  ✗ No Redis
  ✗ No message queue
  ✗ No connection pooling config
  ✗ Single point of failure
  ✗ No monitoring
  ✗ No health checks
```

## Stage 2: Production-Ready (1,000 → 10,000 users)

```
Changes:
  1. Add Redis
     - Move OTP store to Redis
     - Move driver locations to Redis GEO
     - Add session cache
     - Add rate limiting
     Cost: $50-100/mo (ElastiCache t3.medium)

  2. Add MySQL Read Replica
     - Route analytics/history queries to replica
     - Keep transactional writes on primary
     Cost: $100-200/mo (RDS)

  3. Add BullMQ
     - Move driver matching to queue
     - Move notifications to queue
     - Move payment processing to queue
     Cost: $0 (uses same Redis)

  4. Add Health Checks
     - /healthz endpoint
     - ALB health checks
     - PM2 or Docker restart on crash

  5. Add Basic Monitoring
     - Structured logging (pino)
     - Error tracking (Sentry)
     - Uptime monitoring (UptimeRobot)
     Cost: $30-50/mo

  6. Deploy Behind Load Balancer
     - 2 API pods minimum
     - ALB with path-based routing
     Cost: $50/mo (ALB)

  7. JWT Token Rotation
     - Short-lived access tokens (15 min)
     - Refresh tokens in Redis
     - Multi-device support

  Infrastructure cost: ~$400-600/mo total
```

## Stage 3: Scale to 100,000 Concurrent Users

```
Changes:
  1. Service Separation
     - Auth service: independent deploy + scale
     - Realtime gateway: separate pod group
     - Workers: matching, notifications, payments
     Timeline: 2-3 months

  2. Database Scaling
     - MySQL primary + 2 read replicas
     - ProxySQL for connection pooling
     - Table partitioning (notifications, transactions)
     - Redis Cluster (3 nodes)
     Cost: $800-1500/mo

  3. Kubernetes Migration
     - EKS/GKE cluster
     - HPA autoscaling
     - Multi-AZ deployment
     - Rolling deployments
     Cost: $500-1000/mo (cluster) + $500-1500/mo (nodes)

  4. Advanced Caching
     - Multi-layer cache (local + Redis)
     - Cache stampede protection
     - Intelligent TTL strategy

  5. Full Observability
     - Prometheus + Grafana
     - Distributed tracing (OpenTelemetry)
     - SLO/SLA dashboards
     - PagerDuty alerting
     Cost: $200-500/mo

  6. Security Hardening
     - WAF (AWS WAF)
     - DDoS protection (CloudFlare)
     - Secret rotation
     - Audit logging
     Cost: $100-300/mo

  Infrastructure cost: ~$2,500-5,000/mo total
```

## Stage 4: Ready for 1,000,000 Users

```
Changes:
  1. Database Sharding (Vitess/PlanetScale)
  2. Kafka for event streaming (replace BullMQ for high-volume)
  3. ClickHouse for analytics (replace MySQL analytics queries)
  4. Elasticsearch for search
  5. Multi-region deployment
  6. CDN for static assets
  7. Dedicated matching service cluster
  8. ML-based surge pricing
  9. A/B testing infrastructure
  10. Feature flags system

  Infrastructure cost: ~$15,000-30,000/mo
```

---

# 15. REQUEST FLOW DIAGRAMS

## 15.1 Signup/Login Flow

```
Client                    Auth Service              Redis           MySQL
  │                           │                       │               │
  ├── requestOtp ────────────►│                       │               │
  │   {phone, purpose:signup} │                       │               │
  │                           ├── rate limit check ──►│               │
  │                           │   INCR otp:rate:phone │               │
  │                           │◄──── count ──────────│               │
  │                           │                       │               │
  │                           ├── generate OTP        │               │
  │                           ├── store OTP ─────────►│               │
  │                           │   SET otp:verify:phone│               │
  │                           │   {code, EX:600}      │               │
  │                           │                       │               │
  │                           ├── Queue: SendSMS ─────┼───────────────┤
  │   ◄── { success } ───────┤                       │               │
  │                           │                       │               │
  ├── verifyOtp ─────────────►│                       │               │
  │   {phone, code: 482916,  │                       │               │
  │    firstName, lastName,   │                       │               │
  │    gender, role}          │                       │               │
  │                           ├── GET otp:verify:phone┤               │
  │                           │◄──── {code} ─────────│               │
  │                           │                       │               │
  │                           ├── compare codes ✓     │               │
  │                           │                       │               │
  │                           ├── upsert user ────────┼──────────────►│
  │                           │                       │    INSERT users│
  │                           │                       │    INSERT      │
  │                           │                       │    user_profiles│
  │                           │                       │               │
  │                           ├── create session ────►│               │
  │                           │   SET session:uid:dev │               │
  │                           │                       │               │
  │                           ├── sign JWT            │               │
  │   ◄── { accessToken,     │                       │               │
  │         refreshToken,     │                       │               │
  │         Set-Cookie } ─────┤                       │               │
```

## 15.2 Rider Booking a Ride

```
Rider App        Core API          Queue        Matching       Redis      MySQL     Driver App
  │                 │                │             │              │          │           │
  ├─ create ride ──►│                │             │              │          │           │
  │  {pickup,       │                │             │              │          │           │
  │   dropoff,      │                │             │              │          │           │
  │   mode:solo}    │                │             │              │          │           │
  │                 ├── calc fare    │             │              │          │           │
  │                 │  (fareEngine)  │             │              │          │           │
  │                 │                │             │              │          │           │
  │                 ├── INSERT ride ─┼─────────────┼──────────────┼─────────►│           │
  │                 │  status:       │             │              │          │           │
  │                 │  searching     │             │              │          │           │
  │                 │                │             │              │          │           │
  │                 ├── enqueue ────►│             │              │          │           │
  │                 │  RideRequested │             │              │          │           │
  │ ◄── {rideId,    │                │             │              │          │           │
  │      searching, │                │             │              │          │           │
  │      estFare} ──┤                │             │              │          │           │
  │                 │                ├── dequeue ─►│              │          │           │
  │                 │                │             ├── GEORADIUS ─►│          │           │
  │                 │                │             │  drivers:     │          │           │
  │                 │                │             │  online       │          │           │
  │                 │                │             │◄── 12 nearby ┤          │           │
  │                 │                │             │              │          │           │
  │                 │                │             ├── score &    │          │           │
  │                 │                │             │   rank       │          │           │
  │                 │                │             │              │          │           │
  │                 │                │             ├── SETNX ────►│          │           │
  │                 │                │             │  ride:claim:  │          │           │
  │                 │                │             │  {rideId}     │          │           │
  │                 │                │             │              │          │           │
  │                 │                │             ├── INSERT ─────┼─────────►│           │
  │                 │                │             │  ride_request │          │           │
  │                 │                │             │  (30s expiry) │          │           │
  │                 │                │             │              │          │           │
  │                 │                │             ├── PUBLISH ───►│          │           │
  │                 │                │             │  driver:{id}  │          │           │
  │                 │                │             │              │  SSE ────►│           │
  │                 │                │             │              │  new_ride │           │
  │                 │                │             │              │  request  │           │
```

## 15.3 Driver Accepting Ride

```
Driver App       Core API           Redis            MySQL        Rider SSE
  │                 │                  │                │             │
  ├── acceptRide ──►│                  │                │             │
  │   {rideId}      │                  │                │             │
  │                 ├── SETNX ────────►│                │             │
  │                 │  ride:claim:     │                │             │
  │                 │  {rideId}        │                │             │
  │                 │◄──── OK ────────┤                │             │
  │                 │  (claimed!)      │                │             │
  │                 │                  │                │             │
  │                 ├── UPDATE ride ───┼───────────────►│             │
  │                 │  status=matched  │                │             │
  │                 │  driverId=X      │                │             │
  │                 │                  │                │             │
  │                 ├── UPDATE request─┼───────────────►│             │
  │                 │  status=accepted │                │             │
  │                 │                  │                │             │
  │                 ├── PUBLISH ──────►│                │             │
  │                 │  ride:{rideId}   │                │             │
  │                 │  {type:matched,  │      ┌────────┤             │
  │                 │   driver info}   │      │ fanout │             │
  │                 │                  │      └───────►│ SSE event   │
  │ ◄── success ───┤                  │                │ ride_matched│
  │                 │                  │                │             │
```

## 15.4 Shared Ride — Passenger Joining

```
Joiner App       Core API           Redis         MySQL        Driver       Orig.Rider
  │                 │                  │             │            │             │
  ├─ requestJoin ──►│                  │             │            │             │
  │  {rideId,       │                  │             │            │             │
  │   pickup,       ├── check seats ──►│             │            │             │
  │   dropoff}      │  ride:seats:     │             │            │             │
  │                 │  {rideId}        │             │            │             │
  │                 │◄── available ────┤             │            │             │
  │                 │                  │             │            │             │
  │                 ├── reserve seat ─►│             │            │             │
  │                 │  Lua: atomic     │             │            │             │
  │                 │  decrement       │             │            │             │
  │                 │◄── reserved ────┤             │            │             │
  │                 │                  │             │            │             │
  │                 ├── INSERT join ───┼────────────►│            │             │
  │                 │  request         │             │            │             │
  │                 │  (pending)       │             │            │             │
  │                 │                  │             │            │             │
  │                 ├── PUBLISH ──────►│             │            │             │
  │                 │  driver:{id}     │       ──────┼───► SSE   │             │
  │ ◄── pending ───┤  "new join req"  │             │  join_req  │             │
  │                 │                  │             │            │             │
  │       ... driver approves ...     │             │            │             │
  │                 │                  │             │            │             │
  │                 ├── UPDATE join ───┼────────────►│            │             │
  │                 │  status=approved │             │            │             │
  │                 │                  │             │            │             │
  │                 ├── INSERT ────────┼────────────►│            │             │
  │                 │  ride_passengers │             │            │             │
  │                 │  + ride_stops    │             │            │             │
  │                 │                  │             │            │             │
  │                 ├── award points   │             │            │             │
  │                 │  joiner: +10     │             │            │             │
  │                 │  originals: +5   │             │            │             │
  │                 │  driver: +5      │             │            │             │
  │                 │                  │             │            │             │
  │                 ├── PUBLISH ──────►│       ──────┼──► SSE    │── SSE ─────►│
  │ ◄── SSE ────────┤  ride:{rideId}  │             │  approved  │  new_stop   │
  │  approved       │  "join approved"│             │            │             │
```

## 15.5 Ride Completion + Payment

```
Driver App       Core API         Queue          Payment       MySQL      Rider
  │                 │                │             Worker         │          │
  ├─ completeRide ─►│                │               │            │          │
  │  {rideId}       │                │               │            │          │
  │                 ├── validate     │               │            │          │
  │                 │  state machine │               │            │          │
  │                 │                │               │            │          │
  │                 ├── UPDATE ride ─┼───────────────┼───────────►│          │
  │                 │  status=       │               │            │          │
  │                 │  completed     │               │            │          │
  │                 │                │               │            │          │
  │                 ├── enqueue ────►│               │            │          │
  │                 │  RideCompleted │               │            │          │
  │                 │                │               │            │          │
  │ ◄── success ───┤                ├── dequeue ───►│            │          │
  │                 │                │               │            │          │
  │                 │                │               ├── calc     │          │
  │                 │                │               │  final fare│          │
  │                 │                │               │            │          │
  │                 │                │               ├── if wallet:          │
  │                 │                │               │  UPDATE    │          │
  │                 │                │               │  wallet ──►│          │
  │                 │                │               │  debit     │          │
  │                 │                │               │            │          │
  │                 │                │               ├── if card: │          │
  │                 │                │               │  Stripe    │          │
  │                 │                │               │  capture   │          │
  │                 │                │               │            │          │
  │                 │                │               ├── INSERT ──┼─────────►│
  │                 │                │               │  payment + │          │
  │                 │                │               │  transaction│         │
  │                 │                │               │            │          │
  │                 │                │               ├── credit   │          │
  │                 │                │               │  driver    │          │
  │                 │                │               │  wallet ──►│          │
  │                 │                │               │            │          │
  │                 │                │               ├── Queue:   │          │
  │                 │                │               │  notify ───┼──► SSE  │
  │ ◄── SSE ────────┼────────────────┼───────────────┤  receipt   │  receipt │
  │  earnings       │                │               │            │          │
```

---

# 16. TECH STACK RECOMMENDATION

| Component | Recommendation | Why |
|-----------|---------------|-----|
| **Backend Framework** | **Node.js + Express + tRPC** (keep current) | Type-safe, your team knows it, good async I/O for 100k connections. Don't rewrite — optimize. |
| **API Gateway** | **AWS ALB** + **CloudFlare** (CDN + DDoS) | ALB handles path routing + TLS + health checks. CloudFlare adds DDoS protection + edge caching. Cost-effective at this scale. |
| **Message Queue** | **BullMQ** (Redis-based) | Same Redis infra, Node.js native, priorities, retries, rate limiting. Upgrade to Kafka only at 1M+. |
| **Relational DB** | **MySQL 8** on **AWS RDS Multi-AZ** | Your schema is MySQL. RDS handles backups, failover, replicas. Upgrade to PlanetScale for auto-sharding at 1M+. |
| **Cache + Realtime** | **Redis 7** on **AWS ElastiCache** (cluster mode) | Sessions, OTP, driver locations (GEO), pub/sub, rate limiting, queue backend. Single infra for 5 use cases. |
| **Realtime Transport** | **SSE** (primary) + **WebSocket** (chat only) | SSE: simpler scaling, native reconnect. WS: only for bidirectional chat. Both behind ALB. |
| **Object Storage** | **AWS S3** | Profile photos, ride route polylines, documents (driver license). CloudFront CDN for photos. |
| **Push Notifications** | **Expo Push** (current) | Already integrated. Handles FCM/APNs routing. Free tier sufficient. |
| **SMS** | **Twilio** (current) | Reliable OTP delivery. Add **AWS SNS** as failover. |
| **Payments** | **Stripe** (current) | PCI compliant, handles card storage, supports payouts to drivers. |
| **Monitoring** | **Grafana Cloud** (free tier) or **Datadog** | Prometheus metrics + Loki logs + Tempo traces. Grafana Cloud free tier: 10k metrics, 50GB logs. |
| **Error Tracking** | **Sentry** | Real-time error tracking with source maps. Free tier: 5k events/mo. |
| **Container Orchestration** | **AWS EKS** or **Railway/Render** (simpler) | EKS for full control. Railway/Render for faster deployment if ops team is small. |
| **CI/CD** | **GitHub Actions** | Free for public repos, reasonable for private. Docker build + K8s deploy. |
| **Infrastructure as Code** | **Terraform** or **Pulumi** (TypeScript) | Pulumi uses TypeScript — consistent with your stack. |

### Cost Estimate at 100k Users

```
AWS EKS Cluster:              $150/mo
EC2 Nodes (3× c6i.xlarge):    $450/mo
RDS MySQL (db.r6g.large + 2 replicas): $900/mo
ElastiCache Redis (3 nodes):   $300/mo
ALB:                           $50/mo
S3 + CloudFront:               $50/mo
CloudFlare Pro:                $20/mo
Monitoring (Grafana Cloud):    $0-100/mo
Sentry:                        $30/mo
Twilio SMS:                    $200/mo (est)
Stripe fees:                   Variable (2.9% + $0.30/txn)
─────────────────────────────────────
Total infrastructure:          ~$2,200-2,500/mo
```

---

# 17. CODE STRUCTURE / REPO STRUCTURE

## 17.1 Recommended Monorepo Structure

```
rideshare/
├── apps/
│   ├── mobile/                    # Expo React Native app
│   │   ├── app/                   # Expo Router pages
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── package.json
│   │
│   └── admin/                     # Admin panel (Vite + React)
│       ├── src/
│       └── package.json
│
├── server/
│   ├── src/
│   │   ├── core/                  # Server setup, middleware
│   │   │   ├── server.ts
│   │   │   ├── auth-middleware.ts
│   │   │   ├── rate-limiter.ts
│   │   │   └── health.ts
│   │   │
│   │   ├── modules/               # Domain modules (modular monolith)
│   │   │   ├── auth/
│   │   │   │   ├── auth.router.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── otp.service.ts
│   │   │   │   └── auth.types.ts
│   │   │   │
│   │   │   ├── rides/
│   │   │   │   ├── rides.router.ts
│   │   │   │   ├── rides.service.ts
│   │   │   │   ├── booking.service.ts
│   │   │   │   └── rides.types.ts
│   │   │   │
│   │   │   ├── matching/
│   │   │   │   ├── driver-matcher.ts
│   │   │   │   ├── shared-ride-matcher.ts
│   │   │   │   ├── route-matcher.ts
│   │   │   │   └── carpool-matcher.ts
│   │   │   │
│   │   │   ├── driver/
│   │   │   │   ├── driver.router.ts
│   │   │   │   ├── driver.service.ts
│   │   │   │   └── location.service.ts
│   │   │   │
│   │   │   ├── payments/
│   │   │   │   ├── payments.router.ts
│   │   │   │   ├── wallet.service.ts
│   │   │   │   ├── stripe.service.ts
│   │   │   │   └── fare-engine.ts
│   │   │   │
│   │   │   ├── notifications/
│   │   │   │   ├── notifications.router.ts
│   │   │   │   ├── notification.service.ts
│   │   │   │   └── push.service.ts
│   │   │   │
│   │   │   └── safety/
│   │   │       ├── safety.router.ts
│   │   │       └── sos.service.ts
│   │   │
│   │   ├── workers/               # Queue consumers
│   │   │   ├── matching.worker.ts
│   │   │   ├── notification.worker.ts
│   │   │   ├── payment.worker.ts
│   │   │   └── analytics.worker.ts
│   │   │
│   │   ├── realtime/              # SSE/WS gateway
│   │   │   ├── sse-handler.ts
│   │   │   ├── ws-handler.ts
│   │   │   ├── connection-registry.ts
│   │   │   └── pubsub.ts
│   │   │
│   │   └── db/                    # Database layer
│   │       ├── connection.ts
│   │       ├── redis.ts
│   │       └── queries/
│   │           ├── user.queries.ts
│   │           ├── ride.queries.ts
│   │           └── payment.queries.ts
│   │
│   └── package.json
│
├── packages/                      # Shared libraries
│   ├── shared-types/              # TypeScript types shared between client/server
│   │   ├── src/
│   │   │   ├── ride.types.ts
│   │   │   ├── user.types.ts
│   │   │   └── events.types.ts
│   │   └── package.json
│   │
│   └── shared-utils/              # Shared utilities
│       ├── src/
│       │   ├── geo.ts             # Haversine, geohash
│       │   ├── validation.ts      # Zod schemas
│       │   └── constants.ts
│       └── package.json
│
├── infra/                         # Infrastructure as code
│   ├── terraform/                 # or pulumi/
│   │   ├── main.tf
│   │   ├── rds.tf
│   │   ├── elasticache.tf
│   │   ├── eks.tf
│   │   ├── alb.tf
│   │   └── variables.tf
│   │
│   ├── k8s/                       # Kubernetes manifests
│   │   ├── base/
│   │   │   ├── api-deployment.yaml
│   │   │   ├── realtime-deployment.yaml
│   │   │   ├── worker-deployment.yaml
│   │   │   └── ingress.yaml
│   │   ├── staging/
│   │   │   └── kustomization.yaml
│   │   └── production/
│   │       └── kustomization.yaml
│   │
│   └── docker/
│       ├── Dockerfile.api
│       ├── Dockerfile.worker
│       └── docker-compose.dev.yml
│
├── drizzle/                       # Database schema + migrations
│   ├── schema.ts
│   ├── relations.ts
│   ├── migrations/
│   └── seed.ts
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-staging.yml
│       └── deploy-production.yml
│
├── package.json                   # Root workspace config
├── turbo.json                     # Turborepo config (monorepo build)
└── tsconfig.base.json
```

---

# 18. COMMON MISTAKES TO AVOID

## Critical Mistakes That Will Break Your App at Scale

### 1. In-Memory State (YOUR CURRENT #1 RISK)
```
Problem: OTP_STORE, driver locations, dispatch state — all in-memory
Impact: Lost on restart, not shared across pods, can't scale horizontally
Fix: Move ALL to Redis immediately
Priority: P0 — do this first
```

### 2. Single Database Connection Pool
```
Problem: Default mysql2 pool settings, no read/write splitting
Impact: At 10k users, DB connections exhaust, queries queue, timeouts cascade
Fix: Configure pool (20 conns/pod), add read replica, separate read/write
Priority: P0
```

### 3. Synchronous Matching in Request Path
```
Problem: Driver matching runs inside the booking API call
Impact: If matching takes 5s, the HTTP request blocks for 5s
Fix: Return booking immediately, match asynchronously via queue
Priority: P1
```

### 4. No Idempotency
```
Problem: Double-tap on "Book Ride" creates two rides
Impact: Duplicate rides, double charges, confused drivers
Fix: Client sends idempotency key, server caches in Redis
Priority: P1
```

### 5. Race Conditions in Ride Acceptance
```
Problem: No atomic claim when multiple drivers accept same ride
Impact: Multiple drivers drive to same pickup, ride double-assigned
Fix: Redis SETNX atomic claim (see Section 5.2)
Priority: P1
```

### 6. No Circuit Breakers for External Services
```
Problem: If Stripe is down, all ride completions fail
Impact: Cascade failure — completed rides can't process payment
Fix: Circuit breaker + fallback (wallet payment, queue for retry)
Priority: P1
```

### 7. No Rate Limiting
```
Problem: Only in-memory rate counters
Impact: Auth brute force, API abuse, OTP spam
Fix: Redis-based rate limiter (see Section 4.4)
Priority: P1
```

### 8. Monolithic 3,300-Line Router File
```
Problem: All API logic in one file — hard to maintain, can't scale independently
Impact: Every change risks breaking everything, can't deploy auth independently
Fix: Split into domain modules (Section 17.1), keep same process initially
Priority: P2
```

### 9. No Monitoring/Alerting
```
Problem: No metrics, no structured logs, no error tracking
Impact: You won't know about failures until users complain
Fix: Sentry (errors), Prometheus (metrics), structured logging
Priority: P1
```

### 10. SSE Without Reconnection State
```
Problem: No lastEventId tracking, no missed-event replay
Impact: Users miss ride updates if connection drops briefly
Fix: Track lastEventId, store recent events in Redis, replay on reconnect
Priority: P2
```

### 11. No Connection Draining on Deploy
```
Problem: Deploying kills active SSE connections and in-flight requests
Impact: Users see errors during every deployment
Fix: Graceful shutdown (Section 10.4), rolling deployments
Priority: P2
```

### 12. Cookie-Only Auth for Mobile
```
Problem: Cookies are fragile on mobile (WebView issues, cross-origin)
Impact: Random logouts, auth failures on some devices
Fix: Support both cookie and Authorization header, short-lived JWT + refresh token
Priority: P2
```

---

# 19. FINAL OUTPUT

## 19.1 Recommended Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION ARCHITECTURE                       │
│                        100,000 Concurrent Users                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────────────┐    │
│  │CloudFlare│───►│  AWS ALB     │───►│  Kubernetes Cluster    │    │
│  │CDN+DDoS  │    │  (Layer 7)   │    │  (2 AZs, 3-6 nodes)   │    │
│  └──────────┘    └──────────────┘    │                        │    │
│                                      │  ┌──────────────────┐  │    │
│                                      │  │ Auth (2-8 pods)  │  │    │
│                                      │  │ API (4-16 pods)  │  │    │
│                                      │  │ RT (3-12 pods)   │  │    │
│                                      │  │ Workers (2-8)    │  │    │
│                                      │  └──────────────────┘  │    │
│                                      └───────────┬────────────┘    │
│                                                  │                  │
│                         ┌────────────────────────┤                  │
│                         │                        │                  │
│                  ┌──────▼──────┐          ┌──────▼──────┐          │
│                  │ Redis       │          │ MySQL RDS   │          │
│                  │ Cluster     │          │ Multi-AZ    │          │
│                  │ (3 nodes)   │          │ + 2 replicas│          │
│                  │             │          │             │          │
│                  │ • Sessions  │          │ • Users     │          │
│                  │ • OTP       │          │ • Rides     │          │
│                  │ • Locations │          │ • Payments  │          │
│                  │ • Pub/Sub   │          │ • All ACID  │          │
│                  │ • Queues    │          │   data      │          │
│                  │ • Cache     │          │             │          │
│                  └─────────────┘          └─────────────┘          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 19.2 Scaling Checklist

```
Infrastructure:
  □ Redis deployed (ElastiCache / managed)
  □ MySQL read replica(s) configured
  □ Load balancer (ALB) deployed
  □ Multi-AZ deployment
  □ Autoscaling configured (HPA)
  □ CDN for static assets
  □ DNS with health checks

Application:
  □ OTP store moved to Redis
  □ Driver locations moved to Redis GEO
  □ Session cache in Redis
  □ Rate limiting via Redis
  □ JWT short-lived tokens + refresh tokens
  □ Connection pool configured (20/pod)
  □ Matching moved to async queue
  □ Notifications moved to async queue
  □ Payment processing moved to async queue
  □ Idempotency keys for booking
  □ Atomic ride claim (SETNX)
  □ Circuit breakers for external APIs
  □ Graceful shutdown handler
  □ Health check endpoint
  □ Structured logging

Monitoring:
  □ Error tracking (Sentry)
  □ Metrics collection (Prometheus)
  □ Dashboards (Grafana)
  □ Alerting rules configured
  □ Log aggregation
  □ Uptime monitoring

Security:
  □ Rate limiting on all endpoints
  □ Input validation (Zod)
  □ CORS configured
  □ Helmet security headers
  □ Secrets in secret manager
  □ Audit logging for admin actions
  □ PII sanitized from logs
```

## 19.3 Production Readiness Checklist

```
Before going live with 100k users:

Reliability:
  □ Tested with 2x expected load (200k simulated)
  □ Chaos tested: killed pods, DB failover, Redis restart
  □ Graceful degradation verified for each external dependency
  □ Backup and restore tested
  □ Runbook written for common incidents

Performance:
  □ p99 latency within targets under load
  □ No memory leaks under sustained load (24h soak test)
  □ Connection pool behavior verified at max capacity
  □ Queue depth stays below threshold under peak load

Security:
  □ Penetration test completed
  □ OWASP top 10 mitigated
  □ Rate limiting tested
  □ Auth token rotation working
  □ Secrets rotation tested

Operations:
  □ Zero-downtime deployment verified
  □ Rollback procedure tested
  □ On-call rotation established
  □ Incident response playbook written
  □ SLO/SLA defined and dashboarded
```

## 19.4 Priority-Ordered Implementation Plan

```
Phase 1: Foundation (Week 1-2)        ─── CRITICAL PATH
  1. Add Redis
  2. Move OTP to Redis
  3. Move driver locations to Redis
  4. Add rate limiting
  5. Configure DB connection pool

Phase 2: Async & Resilience (Week 3-4) ─── SCALE ENABLERS
  6. Add BullMQ queues
  7. Move matching to async worker
  8. Move notifications to async worker
  9. Add idempotency keys
  10. Add atomic ride claiming

Phase 3: Observability (Week 5-6)      ─── VISIBILITY
  11. Add Sentry error tracking
  12. Add structured logging
  13. Add health check endpoints
  14. Add Prometheus metrics
  15. Set up Grafana dashboards

Phase 4: Scale Infra (Week 7-8)        ─── HORIZONTAL SCALE
  16. MySQL read replica
  17. Deploy behind ALB (multi-pod)
  18. Docker containerization
  19. K8s or ECS deployment
  20. HPA autoscaling

Phase 5: Harden (Week 9-10)            ─── PRODUCTION GRADE
  21. Circuit breakers
  22. JWT token rotation
  23. Graceful shutdown
  24. Rolling deployments
  25. Load testing (k6 / Artillery)
```

## 19.5 First 10 Engineering Tasks

These are the exact tasks to start implementing today, in order:

```
Task 1: Install Redis and create connection module
  File: server/redis.ts
  - ioredis client with connection config
  - Graceful close on shutdown
  - Health check ping
  Time: 2 hours

Task 2: Move OTP store from in-memory Map to Redis
  File: server/routers.ts (auth section)
  - Replace OTP_STORE.set() → redis.set('otp:verify:...', code, 'EX', 600)
  - Replace OTP_STORE.get() → redis.get('otp:verify:...')
  - Replace OTP_STORE.delete() → redis.del('otp:verify:...')
  - Add attempt tracking: redis.incr('otp:attempts:...')
  Time: 3 hours

Task 3: Move driver locations to Redis GEO
  File: server/routers.ts (driver.updateLocation)
  - redis.geoadd('drivers:online', lng, lat, driverId)
  - redis.set('driver:loc:' + driverId, JSON.stringify({lat, lng, ts}), 'EX', 15)
  File: server/services/driverMatcher.ts
  - Replace DB query with redis.georadius('drivers:online', ...)
  Time: 4 hours

Task 4: Add Redis-based rate limiting
  File: server/core/rate-limiter.ts (new)
  - Sliding window using Redis INCR + EXPIRE
  - Apply to: requestOtp (1/60s/phone), verifyOtp (5/10min), API (200/min/IP)
  Time: 3 hours

Task 5: Configure MySQL connection pool properly
  File: server/db.ts
  - Set connectionLimit: 20
  - Set waitForConnections: true, queueLimit: 100
  - Add acquireTimeout, connectTimeout
  - Log pool stats for monitoring
  Time: 1 hour

Task 6: Add health check endpoint
  File: server/_core/index.ts
  - GET /healthz → check MySQL ping + Redis ping
  - Return 200 or 503 with details
  Time: 1 hour

Task 7: Install BullMQ and create queue infrastructure
  File: server/queues/index.ts (new)
  - Define queues: matching, notifications, payments
  - Configure retry policies and dead-letter
  Time: 2 hours

Task 8: Move driver matching to async queue
  File: server/routers.ts → server/workers/matching.worker.ts
  - rides.create: after inserting ride, enqueue 'RideRequested' job
  - Worker: process matching job, dispatch to driver
  - Return booking response immediately (don't wait for match)
  Time: 6 hours

Task 9: Add idempotency for ride booking
  File: server/routers.ts (rides.create)
  - Accept idempotencyKey from client
  - Check Redis: if key exists, return cached response
  - After processing: cache response in Redis (TTL: 1 hour)
  Time: 2 hours

Task 10: Add atomic ride claiming with Redis SETNX
  File: server/routers.ts (driver.acceptRide)
  - Before updating DB: redis.set('ride:claim:' + rideId, driverId, 'NX', 'EX', 60)
  - If 'OK': proceed with DB update
  - If null: return "Ride already taken"
  Time: 2 hours

Total estimated time: ~26 hours of focused engineering
```

---

*This architecture is designed to be built incrementally. You don't need to implement everything at once. Follow the staged plan: each phase unlocks the next level of scale. The first 10 tasks alone will take your app from "demo that breaks under load" to "production system that can handle 10,000 users reliably." Phases 3-5 take you to 100,000.*
