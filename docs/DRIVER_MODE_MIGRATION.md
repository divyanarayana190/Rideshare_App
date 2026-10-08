# Driver Mode Migration Guide

## Required environment variables

- `DATABASE_URL` — MySQL connection string
- `JWT_SECRET` — session signing (32+ chars in production)
- `STRIPE_SECRET_KEY` — payouts and tips (optional in dev)
- `STRIPE_WEBHOOK_SECRET` — production webhooks
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` — maps on mobile/web

## Database migration

Run after pulling Driver Mode changes:

```bash
pnpm db:push
```

### Railway production steps

1. Open your Railway project → **Variables** and confirm `DATABASE_URL` is set.
2. From your local machine (with Railway CLI linked) or a one-off Railway shell:
   ```bash
   # Link to project (once)
   railway link

   # Run migration against Railway MySQL (uses DATABASE_URL from Railway env)
   railway run pnpm db:push
   ```
3. Alternatively, run locally with Railway's public MySQL URL:
   ```bash
   DATABASE_URL="mysql://user:pass@host:port/db" pnpm db:push
   ```
4. Verify tables (optional):
   ```sql
   SHOW TABLES LIKE 'driver_schedule_settings';
   SHOW TABLES LIKE 'driver_availability_slots';
   SHOW COLUMNS FROM driver_sessions LIKE 'totalOnlineMinutes';
   SHOW COLUMNS FROM stripe_payments LIKE 'tipCents';
   ```
5. Restart the Railway server service so startup schema health logs reflect the new tables.

**Safety:** `drizzle-kit push` applies additive schema changes only. Always back up Railway MySQL before first production push.

### Tables/columns added

- `driver_sessions.totalOnlineMinutes`
- `driver_schedule_settings`
- `driver_availability_slots`

Existing tables reused (no duplicates):

- `user_profiles`, `driver_applications`, `rides`, `ride_requests`, `passenger_requests`
- `wallets`, `transactions`, `stripe_payments`, `stripe_transfers`, `connected_accounts`
- `notifications`

## Stripe Connect setup

1. Driver completes onboarding via **Earnings → Set up payouts**
2. Backend calls `driver.createStripeConnectAccount` then `driver.createStripeAccountLink`
3. After onboarding, `driver.getPayoutStatus` returns `payoutState: ready`
4. Cash out uses `driver.requestPayout({ amountCents })`

**Note:** Instant payout requires Stripe instant payout eligibility. Otherwise standard payout is used.

## Testing payouts

1. Complete a ride as driver (wallet credited ~80% fare)
2. Open Driver → Earnings → Payouts
3. Set up Stripe if prompted
4. Request payout when `availableBalanceCents > 0`

## Testing requests

1. Go online on Driver dashboard
2. Open Requests tab — feed from `driver.getRideRequests({ status: 'pending' })`
3. Accept via `driver.acceptDriverRequest({ requestId, requestType })`
4. Reject via `driver.rejectDriverRequest({ requestId, requestType, reason? })`

## Testing tips

1. Complete a ride as passenger
2. Rate ride with tip on `/rate-ride` or use `stripe.chargeRide({ rideId, tipCents })`
3. Driver earnings show tips via `driver.getTips` and `driver.getEarnings`

## Startup checks

Server logs schema health on boot. If schedule tables are missing:

```
[schema] Driver schedule tables missing — run: pnpm db:push
```

Schedule screen shows a friendly error instead of crashing.
