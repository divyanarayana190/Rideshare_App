# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## App Identity

This is **YOO** — a rideshare app ("Rideshare App"). Logo rendered via `components/YooIcon.tsx` (SVG).

## Commands

```bash
# Development (runs server + Expo metro bundler concurrently)
pnpm dev

# Server only (tsx watch, port 3001)
pnpm dev:server

# Expo only (web, port 8081)
pnpm dev:metro

# Type checking
pnpm check

# Lint
pnpm lint

# Tests (vitest, tests/**/*.test.ts)
pnpm test

# Run a single test file
pnpm vitest run tests/server/fareEngine.test.ts

# Database schema push (requires DATABASE_URL)
pnpm db:push

# Production build (esbuild → dist/)
pnpm build

# Admin panel (separate Vite app in admin-panel/)
cd admin-panel && pnpm dev
```

## Environment Variables

Server requires a `.env` file. Required in production: `JWT_SECRET`, `DATABASE_URL`, `STRIPE_WEBHOOK_SECRET`. Recommended: `REDIS_URL`, `GOOGLE_MAPS_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `STRIPE_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`.

Mobile/web client env vars use `EXPO_PUBLIC_` prefix (e.g., `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`).

The full env schema with defaults is in `server/_core/env.ts`.

## Architecture

### Monorepo Structure

| Path | What it is |
|------|-----------|
| `app/` | Expo Router screens (file-system routing) |
| `app/(tabs)/` | Bottom tab screens: Home, My Rides, Profile |
| `app/auth/` | Auth flow: sign-in, sign-up, OTP, OAuth |
| `server/` | Express + tRPC backend (Node.js) |
| `server/_core/` | Server bootstrap, tRPC context, auth middleware, OAuth, SDK |
| `server/routers.ts` | All tRPC procedures (single large file, ~40+ endpoints) |
| `server/routes/` | Plain Express routes: `maps.ts`, `admin.ts` |
| `server/services/` | Business logic services (see below) |
| `server/db.ts` | All database query helpers (MySQL via Drizzle ORM) |
| `drizzle/schema.ts` | Drizzle schema (source of truth for all DB tables) |
| `lib/` | Client-side utilities, stores, tRPC client, auth |
| `lib/_core/auth.ts` | Session token storage (SecureStore on native, localStorage on web) |
| `components/` | Shared React Native components |
| `admin-panel/` | Separate Vite + React admin dashboard |
| `shared/` | Shared constants and types between client and server |

### Client–Server Communication

- **tRPC** (via `@trpc/react-query`): all typed API calls go through `lib/trpc.ts` → `server/routers.ts`
- **Socket.IO**: real-time driver location, ride status, chat (`server/services/websocket.ts`)
- **SSE**: push notifications via `GET /api/events` (server-sent events, `notificationBus`)
- **Auth**: JWT stored in SecureStore (native) or localStorage (web), sent as `Authorization: Bearer` header

### Key Server Services

| Service | Role |
|---------|------|
| `rideStateMachine.ts` | Validates ride lifecycle transitions; maps `rideStep` → DB `status` |
| `driverMatcher.ts` | Dispatch queue: scores drivers (distance × rating × acceptance rate), 30s timeout per driver |
| `fareEngine.ts` | Fare formula: base + distance×rate + time×rate, surge up to 3×, 40% share discount |
| `sharedRideMatcher.ts` | Matches passengers into existing shared rides heading the same direction |
| `carpoolMatcher.ts` | Carpool marketplace matching |
| `notificationService.ts` | Fan-out: SSE + Socket.IO + Expo push (`notificationBus`) |
| `stripeService.ts` | Payment intents, Stripe Connect (driver payouts), webhook idempotency |
| `rideMonitor.ts` | Geofence detection: auto-advances ride step to `driver_arrived` at 50m |
| `websocket.ts` | Socket.IO server — handles location updates, ride join/leave, chat |

### Ride State Machine

`rideStep` drives all ride UI and backend logic. Valid transitions:

```
finding_driver → driver_assigned → driver_en_route → driver_arrived → ride_started → ride_in_progress → completed
                                                         ↑ (any step can cancel)                            ↓
                                                      cancelled                                         (terminal)
```

`rideStep` is the extended UI state; DB `status` is the coarser field. The mapping lives in `server/services/rideStateMachine.ts:STEP_TO_DB_STATUS`.

### Database

MySQL via Drizzle ORM. Schema in `drizzle/schema.ts`. Main tables: `users`, `userProfiles`, `userPreferences`, `rides`, `ridePassengers`, `driverLocations`, `stripePayments`, `wallets`, `transactions`, `ratings`, `promoCodes`, `referrals`, `emergencyAlerts`, `recurringRides`, `driverApplications`.

### Web vs. Native

Several components have platform-split implementations:
- `components/GoogleMapView.web.tsx` / `.native.tsx`
- `components/RouteMapView.web.tsx`
- `components/DriverTrackingMapView.web.tsx` / `.native.tsx`

Metro resolves `.web.tsx` for web builds automatically. The `.tsx` base files were removed; always use the platform-specific variants.

### Admin Panel

A standalone Vite app at `admin-panel/`. It has its own `package.json`, `tsconfig.json`, and dev server. Run `pnpm dev` inside `admin-panel/` separately from the main app.

### Background Crons (in-process)

Two cron loops run inside the Express server process:
- **Recurring rides**: hourly — creates ride instances for the next 2 days from `recurringRides` schedules
- **Ride reminders**: every 5 min — sends push notifications for rides departing in 25–35 minutes

### Path Alias

`@/` maps to the repo root (configured in `vitest.config.ts` and `tsconfig.json`).
