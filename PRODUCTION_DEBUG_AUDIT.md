# YOO Production Readiness Audit
Generated: 2026-06-29

---

## Executive Summary

YOO is a well-structured production rideshare platform with solid security foundations: JWT validation on startup, CORS enforcement, brute-force protection, admin RBAC enforced server-side, idempotent Stripe webhooks, and an atomic ride state machine. However, several **critical** gaps exist: OTP codes are printed to stdout/logs in plaintext (readable in cloud log aggregators), a legacy mock Stripe file (`server/services/stripe.ts`) returns fake payment confirmations and would silently succeed if ever imported by mistake, and Sentry is configured but never initialized. There are also high-severity issues around missing env vars for R2 storage, admin WebSocket having no RBAC-based data filtering, and unbounded query sizes in a few admin routes.

---

## Inventory

### Mobile App Screens

| File | Purpose |
|------|---------|
| `app/(tabs)/index.tsx` | Passenger home / book ride |
| `app/(tabs)/profile.tsx` | User profile |
| `app/(tabs)/trips.tsx` | Trip history |
| `app/active-ride.tsx` | Active ride tracking |
| `app/auth/sign-in-v2.tsx` | Sign-in / sign-up |
| `app/auth/sign-up.tsx` | Registration |
| `app/auth/verify-otp.tsx` | OTP verification |
| `app/auth/forgot-password.tsx` | Password reset |
| `app/auth/enroll-password.tsx` | Set password |
| `app/auth/sign-in.tsx` | Legacy sign-in |
| `app/oauth/callback.tsx` | OAuth callback |
| `app/create-ride.tsx` | Create/book ride |
| `app/confirm-ride.tsx` | Confirm ride booking |
| `app/book-ride.tsx` | Alternative booking flow |
| `app/find-shared.tsx` | Find shared ride |
| `app/ride-options.tsx` | Ride class selection |
| `app/ride-discovery.tsx` | Carpool discovery |
| `app/ride-detail.tsx` | Ride details (passenger) |
| `app/ride-history.tsx` | Ride history |
| `app/ride-receipt.tsx` | Receipt view |
| `app/trip-receipt.tsx` | Trip receipt |
| `app/rate-ride-v2.tsx` | Rate ride |
| `app/rate-ride.tsx` | Legacy rate ride |
| `app/active-ride.tsx` | Active ride with live map |
| `app/emergency-sos.tsx` | SOS / safety |
| `app/driver/(tabs)/dashboard.tsx` | Driver dashboard |
| `app/driver/(tabs)/index.tsx` | Driver main tab |
| `app/driver/request-detail.tsx` | Incoming ride request |
| `app/driver/ride-detail.tsx` | Active driver ride view |
| `app/driver/documents.tsx` | Driver document uploads |
| `app/driver/schedule.tsx` | Driver availability |
| `app/driver/driver-chat.tsx` | In-ride driver chat |
| `app/driver-onboarding.tsx` | Driver application flow |
| `app/driver-application-status.tsx` | Application status |
| `app/driver-license-verification.tsx` | Redirect shim |
| `app/payment-methods.tsx` | Saved cards |
| `app/stripe-add-card.tsx` | Add Stripe card |
| `app/stripe-cards.tsx` | Card management |
| `app/stripe-diagnostics.tsx` | Stripe health debug |
| `app/wallet.tsx` | Wallet / credits |
| `app/notifications.tsx` | Notification center |
| `app/chat-screen.tsx` | In-ride chat |
| `app/carpool-chat.tsx` | Carpool group chat |
| `app/carpool-detail.tsx` | Carpool ride detail |
| `app/edit-carpool.tsx` | Edit carpool listing |
| `app/multi-stop-ride.tsx` | Multi-stop booking |
| `app/recurring-rides.tsx` | Recurring ride setup |
| `app/promo-codes.tsx` | Promo codes |
| `app/referral.tsx` | Referral program |
| `app/loyalty-rewards.tsx` | Reward points |
| `app/student-verification.tsx` | .edu email verify |
| `app/help-support.tsx` | Help center |
| `app/live-chat.tsx` | Live chat with support |
| `app/safety-preferences.tsx` | Safety settings |
| `app/settings/` | Settings screens |
| `app/legal/` | Legal docs |
| `app/permissions/` | Permission prompts |
| `app/analytics-dashboard.tsx` | User analytics |
| `app/SharedRideMissionControl.tsx` | Carpool management |
| `app/preview-loading.tsx` | Loading screen |
| `app/dev/` | Dev-only screens |

### Server API Endpoints (tRPC)

Major routers and key procedures (206 protected + public procedures total):

- **auth**: `requestOtp`, `verifyOtp`, `registerWithPassword`, `loginWithPassword`, `requestPasswordReset`, `verifyPasswordResetOtp`, `resetPassword`, `socialAuth`, `logout`, `refreshSession`
- **rides**: `createRide`, `cancelRide`, `getRide`, `listRides`, `getUserRides`, `getActiveRide`, `updateRideStep`, `acceptDriverRequest`, `declineDriverRequest`, `completeRide`, `findSharedRides`, `joinRide`, `approveJoinRequest`, `rejectJoinRequest`
- **driver**: `goOnline`, `goOffline`, `updateLocation`, `getDashboardStats`, `getEarnings`, `getScheduledRides`, `getRideRequests`, `acceptRide`, `startRide`, `arriveAtPickup`, `completeRide`
- **payments**: `createSetupIntent`, `syncPaymentMethod`, `listPaymentMethods`, `setDefaultPaymentMethod`, `removePaymentMethod`, `addTip`, `getPaymentHistory`
- **stripe**: `createConnectedAccount`, `getOnboardingLink`, `getDashboardLink`, `syncConnectedAccount`, `chargeRide`
- **emergency**: `triggerSOS`, `updateAlert`, `resolveAlert`
- **notifications**: `getNotifications`, `markRead`, `markAllRead`, `deleteNotification`
- **wallet**: `getWallet`, `addCredits`, `getTransactions`
- **ratings**: `submitRating`, `getRatingHistory`
- **promos**: `validatePromo`, `applyPromo`
- **carpool**: `createCarpool`, `listCarpools`, `searchCarpools`, `joinCarpool`, `manageJoinRequests`
- **recurringRides**: `createRecurring`, `updateRecurring`, `deleteRecurring`, `listRecurring`
- **rewards**: `getPoints`, `getHistory`, `redeemPoints`
- **support**: `createTicket`, `listTickets`, `addMessage`, `closeTicket`, `getFAQ`
- **liveChat**: `requestChat`, `sendMessage`, `endChat`, `rateChat`
- **studentVerification**: `requestOTP`, `verifyOTP`, `getStatus`, `resendOTP`, `revoke`
- **legal**: `acceptLegal`, `checkAcceptance`, `getVersion`
- **driverApplications**: `submit`, `saveDraft`, `getStatus`, `withdraw`
- **account**: `requestDeletion`, `cancelDeletion`, `requestDataExport`
- **pricing**: `getSurge`, `estimateFare` (public), `getRideOptions` (public), `getPricingInsight` (public)

### Server Express Routes

**`/admin/*`** (admin.ts — 104 routes) — covers: auth/login, auth/setup, auth/me, users CRUD, drivers CRUD, rides list/detail/cancel, payments list/refund, ratings, promos, surge zones, notifications, support, live chat, FAQ, driver applications, files/signed-urls, audit logs, platform-config, system alerts, alert-rules, analytics/stats, RBAC/roles, exports, webhooks

**`/admin/*`** (admin-advanced.ts — 74 routes) — covers: SLA metrics, driver intelligence, passenger intelligence, fraud, incidents, feature flags, AB tests, pricing rules, webhooks, infra health, safety ops, compliance, corporate, university, marketplace ops, live ride heatmap

**Other Express routes:**
- `GET /healthz` — health check (public)
- `GET /api/health` — legacy health (public)
- `POST /api/webhooks/stripe` — Stripe webhook (public, signature-verified)
- `GET /api/events` — SSE push (authenticated)
- `POST /api/upload` — file upload (authenticated)
- `GET /api/files/signed-url` — signed URL (authenticated)
- `POST /api/analytics/event` — event tracking (**unauthenticated**)
- `/api/maps/*` — proxy/geocode routes
- `/api/trpc/*` — tRPC handler
- OAuth routes via `registerOAuthRoutes`

### Admin Panel Pages

ABTestsPage, AdminRolesPage, AlertRulesPage, AnalyticsPage, AuditLogsPage, CorporateDashboardPage, DashboardPage, DriverApplicationsPage, DriverDetailPage, DriverIntelligencePage, DriversPage, FeatureFlagsPage, FinancePage, FraudPage, IncidentCommandPage, InfraHealthPage, LegalCompliancePage, LiveMapPage, LoginPage, MarketplaceCommandPage, MessagesPage, NotificationsPage, OperationsPage, PassengerDetailPage, PassengersPage, PaymentsPage, PricingRulesPage, PromosPage, RatingsPage, RidesPage, SafetyPage, SupportPage, UniversityDashboardPage, UserIntelligencePage, UsersPage, WebhooksPage

### Database Tables

users, userProfiles, userPreferences, driverSessions, driverScheduleSettings, driverAvailabilitySlots, rides, rideRequests, ridePassengers, rideStops, notifications, surgeZones, payments (deprecated), wallets, transactions, chatMessages, ratings, promoCodes, promoUsage, referrals, emergencyAlerts, recurringRides, carpoolJoinRequests, analytics, paymentMethods (deprecated), stripeCustomers, connectedAccounts, stripePaymentMethods, stripePayments, stripeTransfers, stripeRefunds, webhookEvents, creditWallets, creditGrants, creditRedemptions, creditLedger, abuseFlags, driverApplications, fileUploads, supportTickets, supportMessages, faqItems, liveChatSessions, liveChatMessages, pushTokens, passengerRequests, adminAuditLogs, platformConfig, systemAlerts, alertRules, incidents, incidentActions, pricingRules, featureFlags, abTests, fraudFlags, webhooks, webhookDeliveries, studentVerifications, legalAcceptances, legalPolicyVersions, accountDeletionRequests, dataExportRequests

**Total: 58 tables**

### Services

accountLifecycleService, adminCacheService, adminPreferencesService, adminRbacService, alertEngineService, analyticsFunnelService, carpoolGuards, carpoolMatcher, complianceQueueService, corporateMobilityService, dispatchMetricsService, driverAccessService, driverApplicationService, driverDetailService, driverExpiryCron, driverMatcher, driverPayoutService, driverRequestActions, driverRequestFeed, driverRequestsService, driverScheduleService, driverStatsService, emailService, executiveMetricsService, exportFormatService, fareEngine, fileUploadService, fraudIntelligenceService, googleMaps, infraAlertService, infraOpsService, legalService, liveChatService, marketplaceOpsService, notificationService, paginationHelper, passengerBroadcast, passengerDetailService, paymentLedgerService, pushService, r2Service, requestMetricsService, rewardService, rideAccessService, rideExpiryCron, rideExpiryReconciliation, rideMonitor, rideOptionsService, rideStateMachine, routeMatcher, safetyOpsService, schemaHealth, sharedRideMatcher, socketMetricsService, stopManager, stripe (MOCK — legacy), stripeDiagnosticsService, stripeService, studentVerificationService, supportOpsService, supportService, thirdPartyProbeService, twilio, universityIntelligenceService, userNotifications, walletCreditService, websocket

### External Integrations

| Service | Status |
|---------|--------|
| Stripe SDK | Real implementation in `stripeService.ts`; legacy mock file `stripe.ts` also present |
| Twilio SMS | Connected via env vars; `sendDirectSms` wraps Twilio |
| Google Maps API | Proxied server-side at `/api/maps`; client-side key separate |
| Cloudflare R2 | `r2Service.ts` uses AWS SDK S3-compat; env vars missing from `.env.example` |
| Redis (ioredis) | Connected with graceful fallback to in-memory |
| Sentry SDK | Installed (`@sentry/react-native`) but **never initialized** |
| Expo Push | `expo-server-sdk` in `pushService.ts` |
| SMTP (nodemailer) | For student .edu OTP delivery |

### Background Jobs / Crons

| Job | Schedule | File |
|-----|----------|------|
| Recurring rides cron | Hourly | `server/_core/index.ts:startRecurringRidesCron` |
| Ride reminder cron | Every 5 min | `server/_core/index.ts:startRideReminderCron` |
| Missed ride cron | Configurable | `server/services/rideExpiryCron.ts` |
| Driver expiry cron | Daily | `server/services/driverExpiryCron.ts` |
| Alert engine cron | Every 5 min | `server/services/alertEngineService.ts` |
| Infra snapshot broadcast | Every 10s | `server/_core/index.ts` (setInterval) |

---

## Issues Found

### CRITICAL

---

**C-1: OTP codes printed to stdout in plaintext**
- **File**: `server/routers.ts:541-548`
- **Problem**: `console.log()` prints the 6-digit OTP code verbatim to stdout on every `requestOtp` call — including in production. Cloud log aggregators (Railway, Datadog, CloudWatch) capture stdout. Anyone with read access to logs can harvest active OTP codes and take over any user account.
- **Also**: `server/routers.ts:1014` logs password reset OTP at `logger.info` level (`[DEV RESET OTP]`). `server/routers.ts:8433,8571` log the student verification OTP at `logger.info` with the raw `otp` field.
- **User impact**: Full account takeover for any user account.
- **Security impact**: CRITICAL — authentication bypass via log access.
- **Production risk**: Immediate. Any Railway log viewer or team member can extract codes.
- **Fix**: Remove the `console.log` block at lines 541-548. Change `logger.info({ ... otp }, ...)` at lines 8433/8571 to not include the `otp` field. Change `logger.info(...)` at line 1014 to `logger.debug(...)` and never log the raw code — only log that a reset was sent.

---

**C-2: Legacy mock Stripe file in production service tree**
- **File**: `server/services/stripe.ts`
- **Problem**: This file exports `createPaymentIntent`, `confirmPaymentIntent`, `refundPayment`, `createConnectAccount`, `createPayout` — all returning fake IDs. Its `verifyWebhookSignature` always returns `true`. If any import accidentally points here instead of `stripeService.ts`, payments succeed silently with no money moving.
- **User impact**: Riders charged but driver never receives funds; refunds silently swallowed.
- **Security impact**: Financial loss; fraudulent "successful" charges.
- **Production risk**: High — file is in the active service directory and exports same function names as the real service.
- **Fix**: Delete `server/services/stripe.ts` or rename to `stripe.mock.ts` and move outside the `services/` directory. Add a lint rule or module alias preventing imports from `stripe.ts` in favor of `stripeService.ts`.

---

**C-3: Sentry installed but never initialized**
- **File**: `server/_core/env.ts:107`, `package.json` (`@sentry/react-native ^7.2.0`)
- **Problem**: `SENTRY_DSN` is parsed into `ENV.sentryDsn` but `Sentry.init()` is never called anywhere in either the server or the React Native app. All uncaught exceptions, rejected promises, and crashes go completely unobserved in production.
- **User impact**: Production crashes are invisible.
- **Security impact**: Security exceptions (auth failures, payment errors) never reach the security team.
- **Production risk**: Silent outages and data-loss bugs will not be caught.
- **Fix**: Add `Sentry.init({ dsn: ENV.sentryDsn })` near the top of `server/_core/index.ts` (guarded by `if (ENV.sentryDsn)`). Add Sentry initialization to `app/_layout.tsx`.

---

**C-4: R2 storage credentials missing from `.env.example`**
- **File**: `.env.example` (missing), `server/_core/env.ts:120-124`
- **Problem**: Five R2 environment variables — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` — are read in `env.ts` and used by `r2Service.ts` (driver documents, license photos, insurance docs) but are entirely absent from `.env.example`. Deployments from a fresh clone will silently fail all file uploads and document viewing.
- **User impact**: Driver onboarding document uploads fail silently; admins cannot view uploaded documents.
- **Security impact**: If R2 bucket is not properly configured, uploaded files may be publicly accessible without signed URLs.
- **Production risk**: Driver application pipeline broken in any clean deployment.
- **Fix**: Add the five R2 vars to `.env.example` with placeholder values and comments. Also add validation in `env.ts` for production (currently not validated).

---

**C-5: `driverId: 0` stored in rides table**
- **Files**: `server/_core/index.ts:858`, `server/routers.ts:2114`, `server/routers.ts:4491`, `server/routers.ts:8730`
- **Problem**: Carpool and passenger-posted rides are created with `driverId: 0` — a sentinel meaning "no driver assigned yet." The `rides.driverId` column is `notNull()` with no default. This means foreign key integrity is not enforced, and queries that join `users` or `driverSessions` on `driverId` will either silently return no data or — if user id 0 is ever created — return the wrong user.
- **User impact**: Ride detail screens may show incorrect or missing driver info for carpool rides.
- **Security impact**: Medium — potential for data leaks if id 0 is ever a real user.
- **Production risk**: Data integrity issue; join queries may behave unexpectedly.
- **Fix**: Make `driverId` nullable in the schema and migrate existing rows where `driverId = 0` to `NULL`. Update all queries that filter `driverId != 0` to filter `driverId IS NOT NULL`.

---

### HIGH

---

**H-1: Admin WebSocket namespace lacks RBAC data filtering**
- **File**: `server/services/websocket.ts:384`, `admin-panel/src/hooks/useAdminSocket.ts`
- **Problem**: The admin Socket.IO namespace (`/admin`) authenticates via `ADMIN_JWT_SECRET || JWT_SECRET` but broadcasts driver locations, ride updates, and infra snapshots to *all* connected admin clients regardless of their RBAC role. A `support` role admin receives the same live data feed as a `super_admin`. Additionally, the admin namespace uses the user JWT secret as fallback when `ADMIN_JWT_SECRET` is not set — meaning a regular passenger JWT can authenticate to the admin Socket.IO namespace.
- **User impact**: Internal data over-exposure.
- **Security impact**: High — support agents see all driver GPS coordinates and infra data they are not authorized for. If `ADMIN_JWT_SECRET` is unset, any logged-in user can connect to the admin namespace.
- **Fix**: Enforce `ADMIN_JWT_SECRET` in the admin socket middleware (no fallback to `JWT_SECRET`). Filter broadcast data by the admin's role before sending.

---

**H-2: OTP authentication timing side-channel**
- **File**: `server/routers.ts:621-625` (verifyOtp)
- **Problem**: When OTP verification fails, the server does string comparison `record.code !== input.code` in plain JavaScript. While a single comparison is unlikely to be exploitable, the overall timing of the endpoint (DB lookup + comparison + increment) can differ slightly between "user exists with pending OTP" and "user does not exist." This is a minor timing oracle but exists.
- **Separate issue**: The `requestPasswordReset` endpoint at line 1014 logs the reset OTP at `logger.info` level even though it says `[DEV RESET OTP]` — this runs in production.
- **Fix**: Use `crypto.timingSafeEqual` for OTP comparison. Remove the `logger.info` for reset OTP codes (already noted in C-1).

---

**H-3: `POST /api/analytics/event` unauthenticated and unbounded**
- **File**: `server/_core/index.ts:582-588`
- **Problem**: The analytics event endpoint accepts arbitrary JSON `name`, `props`, and `ts` fields from any unauthenticated caller and writes them to the structured log. No authentication, no input size limit, no field validation. An attacker can flood logs with arbitrarily large `props` objects, inject misleading analytics events, or attempt log injection.
- **User impact**: None directly, but log injection can disrupt operations.
- **Security impact**: Log injection; potential log storage exhaustion.
- **Fix**: Add authentication (require valid JWT) or at minimum add strict input validation: `name` must be from an allowlist, `props` must be a small bounded object.

---

**H-4: Admin panel `VITE_API_URL` has no `.env.example`**
- **File**: `admin-panel/` (no `.env.example` present)
- **Problem**: The admin panel reads `VITE_API_URL` for all API calls and WebSocket connections. This variable is not documented anywhere. A production deployment of the admin panel with the wrong or missing `VITE_API_URL` silently falls back to `http://localhost:3001`, causing all admin operations to fail or — worse — connect to a dev server.
- **Fix**: Create `admin-panel/.env.example` with `VITE_API_URL=https://your-api.domain.com`.

---

**H-5: Two separate DB connection pools in admin routes (memory/connection leak)**
- **Files**: `server/routes/admin.ts:47-48`, `server/routes/admin-advanced.ts:46-48`
- **Problem**: Both `admin.ts` and `admin-advanced.ts` create their own `mysql.createPool()` and `drizzle()` instance at module load time, completely separate from the main DB pool in `server/db.ts`. This means the server runs **three** MySQL connection pools simultaneously, consuming 3× the configured `DB_POOL_SIZE` connections against the database. There is no `pool.end()` call in these files during graceful shutdown.
- **User impact**: Potential connection exhaustion on the MySQL server.
- **Production risk**: Reduced headroom for connections; graceful shutdown may hang.
- **Fix**: Import and reuse the `db` instance from `server/db.ts` in both admin route files.

---

**H-6: `stripe.ts` mock `verifyWebhookSignature` always returns `true`**
- **File**: `server/services/stripe.ts:226-238`
- **Problem**: The mock webhook verification function ignores all parameters and returns `true` unconditionally. If this file were imported instead of `stripeService.ts`, any HTTP request to `/api/webhooks/stripe` would pass signature verification regardless of payload origin.
- **Already covered in C-2 but worth separate emphasis**: This is not a theoretical risk — the file is importable and has the same function names.

---

**H-7: Student verification OTP logged in plaintext**
- **File**: `server/routers.ts:8433`, `server/routers.ts:8571`
- **Problem**: `logger.info({ userId, email, otp }, "[StudentVerification] OTP issued")` — the raw 6-digit OTP is included as a structured field at INFO level. Same issue as C-1 but for the student verification flow specifically.
- **Fix**: Remove `otp` from the logger call. Log only `{ userId, email }`.

---

**H-8: Race condition in seat decrement during carpool join**
- **File**: `server/routers.ts` (join carpool / approveJoinRequest flow), `server/db.ts` (decrementRideSeat)
- **Problem**: When a join request is approved, the flow: (1) checks `availableSeats > 0`, (2) updates `status` to approved, (3) calls `decrementRideSeat` — these are three separate DB operations without a transaction or row-level lock. Under concurrent approvals for the same ride, two approvals can both pass the seat check before either decrement completes, overbooking the ride.
- **User impact**: Ride overbooking; driver has more passengers than seats.
- **Fix**: Wrap the approval + decrement in a single transaction with a `SELECT ... FOR UPDATE` on the ride row, or use a conditional UPDATE: `UPDATE rides SET availableSeats = availableSeats - 1 WHERE id = ? AND availableSeats > 0` and check affected rows.

---

**H-9: WebSocket driver location broadcast to all ride participants without re-checking ban status**
- **File**: `server/services/websocket.ts` (driver_location handler)
- **Problem**: Once a driver connects to a ride room, their location is broadcast to all participants in that room for the duration of the ride. If a driver is banned mid-ride, their socket remains in the room and continues broadcasting location updates until disconnect.
- **Fix**: Check `isBanned` on driver location update events, or evict the driver's socket when the ban is applied.

---

### MEDIUM

---

**M-1: `admin-panel` has no `.env.example` for `VITE_API_URL`**
- Already listed in H-4. Medium severity if treated as documentation gap.

**M-2: Admin search uses `LIKE '%search%'` without sanitization**
- **Files**: `server/routes/admin.ts:459`, `server/routes/admin.ts:824`, `server/routes/admin-advanced.ts:2320`
- **Problem**: User-supplied search strings are interpolated directly into Drizzle `like()` calls as `%${search}%`. Drizzle parameterizes the value safely (no SQL injection), but a search string like `%_____` or a very long string causes a full table scan with a wildcard-heavy LIKE predicate. No input length limit is enforced on the `search` query parameter.
- **Fix**: Validate and cap `search` to 100 characters. Optionally escape `%` and `_` characters within the search term.

---

**M-3: Recurring ride cron creates rides with `distanceKm: "10"` hardcoded default**
- **Files**: `server/_core/index.ts:868`, `server/routers.ts:8742`
- **Problem**: When `rec.distanceKm` is null, the cron falls back to `"10"` km as the ride distance. This affects fare calculation accuracy for recurring rides without pre-computed distances, and will show incorrect ETAs to passengers.
- **Fix**: Require `distanceKm` on recurring ride creation, or compute it from Google Maps when null.

---

**M-4: Admin panel `DashboardPage` uses `any` types throughout**
- **File**: `admin-panel/src/pages/DashboardPage.tsx:49-57`
- **Problem**: All major state variables are typed `any[]` or `any`: `stats`, `revenue`, `ridesByStatus`, `activity`, `topDrivers`, `alerts`, `insights`, `executive`. Type errors on API shape changes will be invisible at build time.
- **Impact**: Medium — build-time safety gap in the primary admin view.
- **Fix**: Define TypeScript interfaces for each API response shape.

---

**M-5: `payments` table deprecated but still queried in admin routes**
- **Files**: `server/routes/admin.ts` (imports `payments`), `server/routes/admin-advanced.ts:506-518`
- **Problem**: The schema marks the legacy `payments` table as `@deprecated`. The admin finance routes still query it for promo refund amounts and Stripe fee estimates. This means financial reporting in the admin panel mixes data from two payment systems, potentially double-counting or undercounting.
- **Fix**: Migrate all financial queries to use `stripePayments` exclusively.

---

**M-6: In-memory dispatch queue and OTP store lost on server restart**
- **Files**: `server/services/driverMatcher.ts`, `server/routers.ts` (OTP fallback)
- **Problem**: The `dispatchQueue` (pending ride assignments) and the in-memory OTP fallback map are process-local. A server restart or Railway container restart drops all in-flight dispatches and any OTPs stored in memory (when Redis is unavailable). Rides in `finding_driver` state are cancelled on startup (good), but OTPs are silently lost without user notification.
- **Fix**: The startup stranded-ride recovery is correct. For OTPs, ensure Redis is always configured in production (enforce in `env.ts` for production). Document this behavior in operational runbook.

---

**M-7: Live map heatmap query fetches up to 2000 rides**
- **File**: `server/routes/admin-advanced.ts:462`
- **Problem**: The live ride heatmap query uses `.limit(2000)` and selects pickup coordinates for rides over the specified period. At scale, this becomes a slow query and returns a large JSON response on every map load.
- **Fix**: Add a tighter time window (e.g., last 24 hours max), use spatial clustering server-side before returning, or add Redis caching with a 60-second TTL.

---

**M-8: No index on `rides.driverId` alone (only composite)**
- **File**: `drizzle/schema.ts:281` (`driver_status_idx` on `(driverId, status)`)
- **Problem**: The only index covering `driverId` is `driver_status_idx(driverId, status)`. Queries filtering only by `driverId` (e.g., driver history, earnings queries) cannot use a leading-column index match efficiently when `status` is not in the filter.
- **Fix**: Add `index("rides_driver_idx").on(table.driverId)` or verify all driver-only queries also filter by status.

---

**M-9: `stripePayments` status update uses `as any` cast**
- **File**: `server/services/stripeService.ts:686`
- **Problem**: `.set({ status: newStatus as any })` — `newStatus` is constructed as a string literal but cast to `any` to bypass TypeScript's enum check. If `newStatus` were ever assigned an invalid value, it would silently write a bad enum to the DB.
- **Fix**: Use the correct Drizzle/schema type: `status: newStatus as "refunded" | "partially_refunded"`.

---

**M-10: Admin panel console.error calls leak stack traces**
- **Files**: Multiple admin panel pages (DashboardPage:92, AlertRulesPage:109, AdminRolesPage:31, etc.)
- **Problem**: `catch(console.error)` and `} catch (e) { console.error(e); }` patterns throughout the admin panel will output stack traces and API error details to the browser DevTools console in production. While not exploitable by end users, it's a data hygiene issue.
- **Fix**: Replace with a centralized error handler that shows user-facing toast notifications without logging internal details to the console in production builds.

---

### LOW

---

**L-1: `server/services/stripe.ts` comment says "Production code is in stripeService.ts" but the file has no deprecation guard**
- The file is importable and does not export a `throw` on import. See C-2.

**L-2: `console.log` OTP block uses ANSI escape codes (terminal-only output)**
- **File**: `server/routers.ts:541-548`
- The ANSI escape codes render correctly in a terminal but produce garbled output in cloud log aggregators. Already covered in C-1.

**L-3: `app/emergency-sos.tsx:91-95` has hardcoded fake emergency contacts as initial state**
- **File**: `app/emergency-sos.tsx:91-95`
- Initial state for `emergencyContacts` includes `"Trusted Contact 1"` with phone `+1 (555) 123-4567` and `"Trusted Contact 2"`. These are placeholder values. If a user triggers SOS without editing contacts, the SMS will go to non-existent numbers.
- **Fix**: Load contacts from the user's profile on mount; start with an empty list if none are configured. Show a prompt to add real contacts.

**L-4: `VITE_APP_ID` in root `.env.example` is only used by the admin panel Vite config but is listed in the root env file**
- Minor documentation inconsistency.

**L-5: `server/_core/env.ts:107` — Sentry DSN is parsed but ENV.sentryDsn is never read**
- The value is stored in `ENV.sentryDsn` but there is no code that reads it to initialize Sentry. See C-3.

**L-6: `app/auth/sign-in-v2.tsx` — multiple `console.error` calls**
- Non-critical but adds noise to production logs.

**L-7: `lib/_core/auth.ts:36` — `console.error` for SecureStore failures**
- Auth token operations log errors to console rather than using a structured logger.

**L-8: `server/db.ts:103` — `connectionLimit: 200` default is very high**
- Default pool is 200 connections but `env.ts` documents `DB_POOL_SIZE=20`. The two files have conflicting defaults. The `db.ts` fallback takes precedence if `DB_POOL_SIZE` is not set.
- **Fix**: Align defaults: use `parseInt(process.env.DB_POOL_SIZE || "20", 10)` in db.ts.

**L-9: `server/routers.ts` — missing `ADMIN_JWT_SECRET` entry in recommended vars list in `env.ts`**
- `ADMIN_JWT_SECRET` is referenced in `adminAuth.ts` but not included in `RECOMMENDED_IN_PRODUCTION` in `env.ts`. A deployment without it will fall back to `JWT_SECRET`, which is a less secure configuration.

**L-10: Test coverage gaps for SOS flow and carpool seat race condition**
- Tests exist for most core paths (39 test files covering auth, payments, ride state, driver access, etc.) but no test covers the SOS trigger-to-SMS chain end-to-end, and no test covers concurrent carpool join approval.

---

## Dead Code / Unused Files

| File | Status |
|------|--------|
| `server/services/stripe.ts` | Legacy mock — superseded entirely by `stripeService.ts`. No code in the active request path imports it. Should be deleted. |
| `app/auth/sign-in.tsx` | Appears to be the legacy sign-in screen, superseded by `sign-in-v2.tsx`. Confirm and delete. |
| `app/rate-ride.tsx` | Legacy rate ride screen, superseded by `rate-ride-v2.tsx`. Confirm and delete. |
| `components/DriverTrackingMapView.tsx` | Base file — platform variants `.web.tsx` and `.native.tsx` exist. The base file may cause Metro to resolve incorrectly on some platforms. Confirm and remove if web/native variants cover all cases. |
| `components/GoogleMapView.tsx` | Same as above — base file alongside platform variants. |
| `components/RouteMapView.tsx` | Same pattern. |
| `components/PinMapView.tsx` | Same pattern. |
| `server/test-fetch.ts` | Development test script committed to repo with `console.log` calls. Should not be in production codebase. |
| `server/seed-users.ts`, `server/seed-students.ts`, `server/seed-advanced.ts` | Seed scripts with `console.log` — fine for local dev but should not ship in the production Docker image. |
| `server/patch-student-phones.ts` | One-off migration script. |

---

## Mock/Placeholder Data Found

| Location | Description |
|----------|-------------|
| `server/services/stripe.ts` (entire file) | All payment functions return fake IDs (`pi_...`, `re_...`, `acct_...`, `po_...`, `pm_...`). `verifyWebhookSignature` always returns `true`. |
| `app/emergency-sos.tsx:91-95` | Emergency contacts seeded with `"Trusted Contact 1"`, `+1 (555) 123-4567`, `"Trusted Contact 2"`, `+1 (555) 987-6543` as initial state. |
| `server/seed-advanced.ts:143` | Webhook secret `"slack_webhook_secret_placeholder"` in seed data. |
| `server/seed-advanced.ts:150` | Webhook secret `"crm_secret_key_placeholder"` in seed data. |
| `server/seed-students.ts:174` | `otpHash: passwordHash` — comment says "placeholder hash — record is already verified". Acceptable for seed data only. |
| `fareEngine.ts` (in-memory surge zones) | `const activeSurgeZones: SurgeZone[] = []` — surge zones are in-memory with no DB persistence. The `surgeZones` table exists but the fare engine does not read from it. Admin UI can create surge zones in the DB but the fare engine ignores them. |

---

## Missing `.env` Variables

Variables referenced in code but absent from root `.env.example`:

| Variable | Used In | Impact |
|----------|---------|--------|
| `R2_ACCOUNT_ID` | `server/_core/env.ts:120` | File upload/download silently fails |
| `R2_ACCESS_KEY_ID` | `server/_core/env.ts:121` | File upload/download silently fails |
| `R2_SECRET_ACCESS_KEY` | `server/_core/env.ts:122` | File upload/download silently fails |
| `R2_BUCKET_NAME` | `server/_core/env.ts:123` | File upload/download silently fails |
| `R2_ENDPOINT` | `server/_core/env.ts:124` | File upload/download silently fails |
| `ADMIN_JWT_SECRET` | Present in `.env.example` ✓ | — |
| `OWNER_OPEN_ID` | `server/_core/env.ts:85` | OAuth owner detection; non-critical |
| `BUILT_IN_FORGE_API_URL` | `server/_core/env.ts:87` | Internal SDK; non-critical |
| `BUILT_IN_FORGE_API_KEY` | `server/_core/env.ts:88` | Internal SDK; non-critical |

Variables in `.env.example` but not validated in `env.ts` for production:

| Variable | Validated? |
|----------|------------|
| `GOOGLE_MAPS_API_KEY` | Recommended but not required |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Not validated — student verification email silently fails if unconfigured |
| `R2_*` | Not validated — file uploads silently fail |
| `SENTRY_DSN` | Parsed but never used |

---

## Phased Debug Plan

### Wave 1: Environment, Build, TypeScript, Lint, Tests

1. **Fix `.env.example`**: Add all five R2 vars with placeholder values and comments. Add `OWNER_OPEN_ID` and `SMTP_*` validation notes.
2. **Create `admin-panel/.env.example`** with `VITE_API_URL=https://your-api.domain.com`.
3. **Run `pnpm check`**: Resolve any TypeScript errors before deployment.
4. **Run `pnpm test`**: All 39 test files should pass against a configured test DB.
5. **Run `pnpm lint`**: Fix any ESLint warnings in production paths.
6. **Verify build**: `pnpm build` should produce a clean `dist/index.js` with no warnings.

### Wave 2: Authentication, OTP, Sessions, Permissions

1. **CRITICAL**: Remove `console.log` OTP block in `server/routers.ts:541-548`.
2. **CRITICAL**: Remove `otp` field from `logger.info` calls at lines 8433 and 8571.
3. **HIGH**: Change `logger.info` at line 1014 to `logger.debug` and remove the raw OTP from the log message.
4. Verify `ADMIN_JWT_SECRET` is set separately from `JWT_SECRET` in production; add to `RECOMMENDED_IN_PRODUCTION` in `env.ts`.
5. Verify `verifyOtp` uses constant-time comparison (use `crypto.timingSafeEqual` instead of `!==`).
6. Verify session version invalidation on password change is working (unit test covers this — verify it passes).
7. Verify admin Socket.IO namespace rejects regular user JWTs when `ADMIN_JWT_SECRET` is set.

### Wave 3: Passenger App Flow

1. Test full booking flow: create ride → find driver → confirm → active ride → complete → receipt.
2. Verify `driverId: 0` rides (carpool, passenger-posted) do not cause join errors.
3. Test promo code application and credit wallet checkout path.
4. Verify ride cancellation properly refunds via Stripe.
5. Test `find-shared.tsx` → carpool join → approval flow end-to-end.
6. Verify emergency SOS screen does not show fake placeholder contacts.
7. Test recurring ride creation and verify the cron correctly materializes instances.

### Wave 4: Driver App Flow

1. Test driver onboarding: application → document upload to R2 → admin review → approval → Stripe Connect onboarding.
2. Verify `driverAccessService` correctly gates driver dashboard access behind `isDriver: true` AND approved application.
3. Test ride request flow: go online → receive dispatch notification → accept → en route → arrived → start ride → complete.
4. Verify driver expiry cron runs and sends warning/suspension correctly.
5. Test driver earnings calculation: verify 80% split is correctly applied in `stripeService.chargeRide`.

### Wave 5: Admin Panel

1. Verify admin login, session, and RBAC roles (super_admin, admin, ops, support) all enforce correct permissions.
2. Verify driver application review flow: approve, reject, request-action all trigger correct status updates.
3. Test refund flow from admin panel → `stripeService.refundRidePayment`.
4. Verify surge zone creation in admin writes to `surgeZones` DB table (note: `fareEngine.ts` reads from in-memory `activeSurgeZones`, not the DB — this is a **disconnect** to investigate).
5. Verify audit log captures all sensitive admin actions.
6. Test live map data — verify 2000-ride limit does not cause visible lag.

### Wave 6: Payments, Stripe, Refunds, Payouts

1. Verify `STRIPE_SECRET_KEY` is `sk_live_*` for production, `sk_test_*` for staging.
2. Verify Stripe webhook endpoint receives events (use `stripe listen --forward-to` for local testing).
3. Test payment success path: charge ride → PaymentIntent succeeds → driver transfer created.
4. Test refund path: admin initiates refund → `stripeRefunds` record created → `stripePayments.status` updated.
5. Verify credit wallet reserve/apply/release cycle works correctly for rides paid with credits.
6. **Delete or quarantine `server/services/stripe.ts`** before production deployment.
7. Verify dual-pool problem (H-5): confirm admin routes use shared `db` from `db.ts`.

### Wave 7: Live Location, Maps, Socket.IO, Redis

1. Verify Redis is connected and `REDIS_URL` is set in Railway service variables.
2. Test Socket.IO connect from mobile app — driver location updates should reach passenger screen within 3 seconds.
3. Verify WebSocket rooms are cleaned up on driver disconnect (no location leak after disconnect).
4. Test ride monitor geofence: driver enters 50m radius → `driver_arrived` auto-confirmed.
5. Verify admin Socket.IO namespace rejects user JWTs.
6. Check `cachedQuery` fallback behavior when Redis is temporarily unavailable — requests should still succeed.

### Wave 8: SOS, Safety, Incidents, Emergency Workflows

1. Test SOS trigger: fires tRPC mutation → creates `emergencyAlerts` row → sends SMS to emergency contacts.
2. Verify emergency contacts are loaded from user profile (not the placeholder hardcoded contacts).
3. Test unsafe driver report flow: creates alert, notifies admin via Socket.IO `sos_alert` event.
4. Verify admin panel Safety page shows active SOS alerts in real time.
5. Test SOS deactivation: user resolves alert → `status` updated to `resolved`.
6. Verify driver notification when passenger triggers SOS during active ride.

### Wave 9: Database Integrity, Migrations, Indexes

1. Verify all 58 tables exist in production with `pnpm db:verify-schema`.
2. Run `pnpm db:migrate:prod` in staging first and confirm zero errors.
3. Check `rides.driverId` for rows with value `0` — if any, migrate to `NULL` after making column nullable.
4. Verify composite indexes cover the most common query patterns (the schema looks well-indexed overall).
5. Verify `payments` (legacy) vs `stripePayments` (canonical) are not double-counted in any financial report.
6. Add missing single-column `driverId` index on `rides` table.

### Wave 10: Deployment Readiness, Railway, CORS, Production Security

1. Set all required Railway environment variables: `JWT_SECRET`, `DATABASE_URL`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `REDIS_URL`, `GOOGLE_MAPS_API_KEY`, `TWILIO_*`, `SMTP_*`, `R2_*`, `ADMIN_JWT_SECRET`, `CORS_ALLOWED_ORIGINS`, `SENTRY_DSN`.
2. Verify `CORS_ALLOWED_ORIGINS` includes your production domain — the server will refuse to start in production without it.
3. Verify `JWT_SECRET` is at least 32 chars and not a placeholder — server refuses to start in production if it fails.
4. Verify `STRIPE_WEBHOOK_SECRET` starts with `whsec_` — server refuses to start without it.
5. Deploy to staging, run full health check at `/healthz`, confirm all checks green.
6. Test Railway restart behavior: verify stranded ride recovery runs on startup and cancels orphaned `finding_driver` rides.
7. Verify helmet CSP headers are active in production — they are gated on `NODE_ENV === "production"`.
8. Verify rate limiting (2000 req/60s per IP) is appropriate for your load; adjust `MAX` constant if needed.
9. Delete or exclude `server/services/stripe.ts` from production bundle before go-live.
10. Initialize Sentry in both server and mobile app (C-3) so production errors are captured from day one.
