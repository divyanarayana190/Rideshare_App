# YOO Operations Runbook

## Health endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /healthz` | MySQL, Redis, schema health — Railway healthcheck |
| `GET /api/health` | Legacy alias |

Schema failure returns **503** with `schemaMissingTables` in body.

## Logging

Server uses structured `pino` logger (`server/logger.ts`):

- `logger.info` — startup, cron, successful operations
- `logger.warn` — recoverable failures, throttled events
- `logger.error` — schema drift, payment failures
- `logger.fatal` — refuses production start (bad JWT, etc.)

Client: use `lib/dev-log.ts` (`devLog`) — stripped in production builds.

## Error monitoring (Sentry)

- Initialized in `app/_layout.tsx` via `initSentry()`
- Requires `extra.sentryDsn` in `app.config.ts`
- `setSentryUser()` on login
- `captureError()` for non-fatal client errors

## Database monitoring

```bash
pnpm db:verify-schema
pnpm db:verify-schema --json
```

Startup: `logDriverSchemaHealthOnStartup()` logs missing tables.

## Stripe monitoring

- Webhook: `POST /api/webhooks/stripe` (signature required)
- Idempotency: `webhook_events.stripeEventId` unique
- Payments ledger: `stripe_payments` (see `paymentLedgerService`)

## Notification monitoring

- SSE: `GET /api/events` (JWT)
- Push tokens: `push_tokens` table
- Deep links: `resolveNotificationHref()` in `lib/notification-routing.ts`

## Ride lifecycle

- State machine: `server/services/rideStateMachine.ts`
- Expiry cron: `rideExpiryCron.ts`
- Geofence: `rideMonitor.ts`

## On-call playbooks

### Payments failing

1. Check Stripe dashboard + `webhook_events` for failures
2. Verify `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
3. Query `stripe_payments` for ride `status = failed`

### Drivers not receiving requests

1. Check `driver_sessions.status = online`
2. Verify Socket.IO + SSE (`/api/events`)
3. Check `passenger_requests` broadcast status

### Schema drift after deploy

1. `pnpm db:verify-schema`
2. `pnpm db:migrate:prod` or `pnpm db:baseline`
3. Redeploy if healthcheck failing

## Railway deploy sequence

1. Merge migrations + app code
2. Set env vars (see STRIPE_PRODUCTION_CHECKLIST.md)
3. Deploy — auto-runs `db:migrate:prod`
4. Confirm `/healthz` 200
5. Smoke test: book ride, driver accept, complete, receipt
