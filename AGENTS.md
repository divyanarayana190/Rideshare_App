# AGENTS.md — YOO Engineering Rules v3

## Mission

YOO is a production mobility platform, not a demo app.

Treat every change as if it affects real passengers, drivers, payments, safety operations, and admin workflows.

YOO stack:

- React Native + Expo
- Admin Panel
- Node.js / Express
- tRPC
- Drizzle ORM
- MySQL
- Redis
- Socket.IO
- Railway
- Stripe
- Twilio
- Cloudflare R2
- Google Maps
- Safety / SOS / Live Tracking

Build like a senior engineer at Uber or Lyft:

Simple where possible.
Production-safe where necessary.
Never fake critical systems.

---

## Core Rule

Before writing code, follow this ladder:

1. Does this need to exist?
2. Does this already exist in the codebase?
3. Can an existing service be extended?
4. Can an existing API be reused?
5. Can an existing database table/column be reused?
6. Can an existing UI component be reused?
7. Can the platform/browser/Node already do this?
8. Can this be solved with a small safe change?
9. Only then create new code.

Do not overbuild.

Do not underbuild:

- Safety
- SOS
- Payments
- Authentication
- RBAC
- Live tracking
- Compliance
- Driver verification
- Ride lifecycle

---

## Absolute Rules

Never add production mock data.

Never add placeholder logic.

Never hardcode:

- fake users
- fake rides
- fake revenue
- fake GPS
- fake alerts
- fake KPIs
- fake charts
- fake payments

If data is unavailable, show:

- `No data available yet`
- `Not enough historical data`
- `Service unavailable`
- `Waiting for live data`

---

## Reuse Rules

Before creating any new:

- file
- service
- API
- table
- hook
- component
- queue
- cron job
- dependency

Search the repository.

Reuse existing:

- Drizzle schema
- services
- routers
- admin routes
- tRPC procedures
- hooks
- UI components
- validators
- Socket.IO events
- notification services
- audit logging helpers

Never create parallel business logic.

---

## Domain Ownership

Each business domain has one owner.

### Ride Domain

Owns:

- ride lifecycle
- ride status transitions
- driver assignment
- passenger ride requests
- pickup/dropoff
- route updates
- completion/cancellation

### Driver Domain

Owns:

- driver onboarding
- driver approval
- driver documents
- driver availability
- driver sessions
- driver ratings

### Passenger Domain

Owns:

- passenger profile
- ride history
- ride requests
- preferences
- wallet/credits if applicable

### Safety Domain

Owns:

- SOS
- emergency alerts
- incidents
- live investigation
- safety timeline
- emergency packets

### Payments Domain

Owns:

- Stripe
- refunds
- payouts
- platform revenue
- GMV
- disputes
- payment status

### Notifications Domain

Owns:

- push notifications
- SMS
- email
- in-app notifications
- notification preferences

### Admin Domain

Owns:

- executive dashboard
- marketplace dashboard
- operations
- analytics
- fraud
- compliance
- infrastructure health
- admin actions

Business logic must not leak across unrelated domains.

---

## Ride Lifecycle Rules

Never invent ride states without updating the canonical lifecycle.

### Passenger Ride Lifecycle

Draft
→ Posted
→ Finding Driver
→ Driver Assigned
→ Driver Accepted
→ Driver Arriving
→ Passenger Onboard
→ Ride In Progress
→ Completed

OR

Cancelled

### Driver Lifecycle

Offline
→ Available
→ Matched
→ Navigating to Pickup
→ Waiting
→ Ride Started
→ Ride Completed
→ Available

### SOS Lifecycle

Normal
→ SOS Triggered
→ Acknowledged
→ Investigating
→ Escalated
→ Resolved

---

## Backend Rules

Admin and monitoring endpoints must not crash because one probe or dependency failed.

Return partial data when safe.

Return degraded status instead of 500 when possible.

Never expose secrets.

Never expose:

- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- ADMIN_JWT_SECRET
- STRIPE_SECRET_KEY
- TWILIO_AUTH_TOKEN
- R2_SECRET_ACCESS_KEY
- Google Maps API key

Use safe errors.

---

## Database Rules

Always check `drizzle/schema.ts` before schema changes.

Prefer existing tables.

Use Drizzle unless raw SQL is clearly necessary.

Raw SQL must:

- avoid SQL injection
- use parameters
- support MySQL `ONLY_FULL_GROUP_BY`
- be tested locally

Every admin list endpoint must support:

- pagination
- filtering
- safe limits
- indexed query patterns

Never fetch unlimited admin rows.

Bad:

```ts
await db.select().from(rides);
```

Good:

```ts
await db.select().from(rides).limit(limit).offset(offset);
```

---

## Migration Rules

Before creating a migration, answer:

1. Can an existing table be reused?
2. Can an existing column be reused?
3. Is this migration safe for production data?
4. Is rollback possible?
5. Is a backfill needed?
6. Are indexes needed?

Every migration should include:

- forward plan
- rollback plan
- backfill plan if needed
- index review

---

## Payment Rules

Financial data must come from the canonical payment source.

Prefer:

```text
stripe_payments
```

Never fake:

- revenue
- GMV
- take rate
- refunds
- payouts
- disputes

Never assume payment success from ride completion alone.

Track:

- GMV
- platform revenue
- take rate
- driver payouts
- refunds
- failed payments
- disputes
- Stripe status

---

## Redis Rules

Use Redis for:

- live location
- latest driver state
- active ride state
- matching cache
- short-lived queues
- admin live telemetry

Do not use Redis as the only source for long-term evidence.

For SOS and safety, persist important snapshots to MySQL.

If Redis fails:

- degrade gracefully
- fallback to MySQL where possible
- create infra alert if needed

---

## Socket.IO Rules

Socket events must be:

- authenticated
- permission-aware
- consistently named
- cleaned up on disconnect
- safe on reconnect
- scoped to correct rooms

Do not broadcast sensitive data globally.

Use:

- ride-specific rooms
- driver-specific rooms
- passenger-specific rooms
- admin safety rooms

---

## Admin Panel Rules

Every admin page must handle:

- loading
- empty state
- error state
- malformed data
- missing optional fields
- slow network
- unauthorized access

No white screen crashes.

Use enum fallbacks.

Example:

```ts
const severity = SEV[value] ?? DEFAULT_SEVERITY;
```

Every sensitive admin action must have:

- server-side RBAC
- audit log
- safe error handling
- confirmation if destructive

---

## RBAC Rules

Frontend RBAC is not enough.

Server-side permissions are required for:

- approve driver
- reject driver
- suspend user
- unsuspend user
- refund payment
- export data
- view live GPS
- view SOS details
- generate emergency packet
- resolve incident
- escalate incident
- update pricing
- change feature flags
- access compliance data

---

## Audit Logging Rules

Audit every sensitive admin action.

Required fields:

- admin ID
- admin email
- action
- entity type
- entity ID
- timestamp
- IP
- user agent
- safe details

Audit required for:

- driver approval/rejection
- user suspension
- SOS case view
- SOS packet generated
- incident escalation
- incident resolution
- refund/payment action
- pricing change
- feature flag change
- legal/compliance export
- admin role change

---

## SOS Safety Rules

SOS is production-critical.

SOS Investigation Center must include:

- alert ID
- ride ID
- triggered by passenger/driver
- pickup
- dropoff
- current driver location
- passenger location if available and permitted
- heading
- speed
- GPS accuracy
- last update time
- route progress
- vehicle details
- driver details
- passenger details
- emergency contacts
- admin timeline
- notes
- escalation status
- emergency packet

Do not automatically contact police unless legal approval exists.

Use wording:

```text
Generate emergency report for emergency responders
```

Do not use wording:

```text
Automatically send to police
```

---

## Location Tracking Rules

Normal active ride:

- driver location every 3–5 seconds
- latest location in Redis
- DB snapshots only when needed

Active SOS ride:

- driver/passenger location every 1 second if possible
- broadcast to admin live
- latest location in Redis
- persist evidence snapshot every 5–10 seconds
- stale GPS warning after 10 seconds

Never store every 1-second update forever in MySQL.

---

## Maps Rules

Map logic must handle:

- missing coordinates
- invalid coordinates
- stale location
- no route response
- Google Maps failure
- permissions denied
- app backgrounding

No fake fallback coordinates like `0,0` or random NYC coordinates unless clearly development-only.

---

## API Contract Rules

Never remove response fields without compatibility review.

Prefer additive changes.

If API response changes:

- update frontend consumers
- update tests
- preserve backward compatibility
- document the change

Breaking changes require versioning.

---

## Performance Budgets

Target production goals:

- Admin page load: under 500ms
- Executive Dashboard: under 1s
- Ride matching: under 3s
- Driver location latency: under 2s
- SOS live update: under 1s
- API p95: under 300ms

Avoid:

- full table scans
- N+1 queries
- unlimited result sets
- duplicate polling
- unnecessary dependencies
- excessive socket broadcasts

---

## Observability Rules

Every critical workflow must be measurable.

Add structured logs for:

- ride created
- driver accepted
- ride started
- ride completed
- ride cancelled
- SOS triggered
- SOS acknowledged
- SOS resolved
- payment completed
- refund issued
- driver suspended
- admin action

Every production feature should answer:

- Can we measure it?
- Can we detect failure?
- Can we debug it?
- Can we audit it?

---

## Feature Flags

Experimental or risky features must be behind feature flags.

Examples:

- AI matching
- SOS Center
- university portal
- corporate portal
- dynamic pricing
- driver earnings v2
- new ride UI

Never hardcode rollout logic.

---

## Dependency Rules

Before adding a package:

1. Is it already installed?
2. Can Node/browser/native platform do it?
3. Can existing code do it?
4. Is the package maintained?
5. Is the security risk acceptable?
6. Is the bundle cost acceptable?

Do not add packages for simple tasks.

---

## TypeScript Rules

- Avoid `any`
- Prefer typed API responses
- Validate nullable fields
- Avoid unsafe enum indexing
- Avoid blind casts
- Keep `pnpm check` passing

If `any` is unavoidable, explain why.

---

## Testing Rules

Add/update tests for:

- ride lifecycle
- driver approval
- ride request/join flow
- SOS flow
- RBAC enforcement
- payment calculation
- refund logic
- admin sensitive actions
- infra health graceful degradation
- API contract changes

Never skip tests for:

- safety
- payments
- auth
- RBAC
- SOS
- live tracking

---

## Environment Rules

Never commit `.env`.

Commit:

- `.env.example`
- `docs/SETUP.md`

Developers should run:

```bash
cp .env.example .env
```

Use separate credentials for:

- local
- staging
- production

Do not share production secrets with all contributors.

---

## Git Rules

Before committing:

```bash
git status
git diff
pnpm check
```

Commit format examples:

```text
feat(admin): add sos investigation center
fix(admin): prevent incident enum crash
fix(infra): support mysql only_full_group_by
refactor(driver): reuse ride detail service
test(safety): add sos packet coverage
```

---

## AI Implementation Workflow

For every feature:

1. Restate the goal.
2. Search existing code.
3. List reusable files/services/components.
4. Identify DB/API/UI impact.
5. Explain whether new files are necessary.
6. Implement the smallest production-safe change.
7. Add/update tests.
8. Run checks.
9. Report changed files and verification.

For bugs:

1. Identify exact error.
2. Find root cause.
3. Fix at correct layer.
4. Add defensive handling.
5. Check related pages/routes.
6. Run `pnpm check`.
7. Report exact fix.

---

## AI Self-Review Before Final Answer

Before saying a task is complete, verify:

- Existing code reused
- No duplicate logic
- No unnecessary dependency
- Existing schema reused
- Existing API extended where possible
- Real DB/API data used
- No mock data
- No placeholder code
- Backward compatible
- TypeScript passes
- `pnpm check` passes
- Tests updated if needed
- Security reviewed
- Performance reviewed
- Audit logging added if sensitive
- RBAC enforced server-side if admin/sensitive

If any item is not satisfied, say why.

---

## Production Readiness Checklist

A task is not complete unless:

- no mock data
- no placeholder logic
- real DB/API data
- loading state works
- empty state works
- error state works
- TypeScript passes
- `pnpm check` passes
- no unlimited DB queries
- no secrets exposed
- backward compatibility preserved
- sensitive actions audited
- RBAC enforced server-side where needed

---

## YOO Priorities

Highest priority:

1. Safety / SOS
2. Ride lifecycle correctness
3. Driver/passenger trust
4. Payment accuracy
5. Marketplace matching
6. Admin operations visibility
7. Production reliability
8. University/corporate expansion

Never sacrifice safety or correctness for fewer lines of code.

---

## Final Rule

Build the minimum system that is:

- correct
- safe
- secure
- observable
- maintainable
- scalable enough for the current stage

For normal UI work: keep it small.

For safety, payments, auth, RBAC, SOS, and live tracking: keep it complete.
