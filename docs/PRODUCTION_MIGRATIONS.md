# YOO Production Migrations

## Overview

Schema source of truth: `drizzle/schema.ts`  
Migration output: `drizzle/migrations/`  
Journal: `drizzle/migrations/meta/_journal.json`

Initial baseline migration: **`0000_fair_edwin_jarvis.sql`** (65 tables).

### Critical tables covered

| Group | Tables |
|-------|--------|
| Driver schedule | `driver_schedule_settings`, `driver_availability_slots` |
| Passenger requests | `passenger_requests` |
| Legal | `legal_acceptances`, `legal_policy_versions` |
| Push | `push_tokens` |
| Stripe | `stripe_customers`, `stripe_payment_methods`, `stripe_payments`, `stripe_transfers`, `stripe_refunds`, `connected_accounts`, `webhook_events` |
| Credits | `credit_wallets`, `credit_grants`, `credit_redemptions`, `credit_ledger` |
| Wallet | `wallets`, `transactions` |

## Commands

```bash
# Generate SQL from schema changes (dev)
pnpm db:generate

# Generate companion rollback SQL
pnpm db:generate:down

# Apply migrations (prod / CI)
pnpm db:migrate:prod

# One-time baseline for DBs created via db:push
pnpm db:baseline

# Dry-run rollback (staging)
pnpm db:rollback

# Execute rollback (DESTRUCTIVE — staging only)
pnpm db:rollback --apply

# Read-only schema verification
pnpm db:verify-schema
```

## Railway deployment workflow

`railway.toml` runs migrations before start:

```
startCommand = "pnpm db:migrate:prod && pnpm start"
healthcheckPath = "/healthz"
```

`db:migrate:prod` auto-baselines when:

- `users` table exists, and
- `__drizzle_migrations` is missing expected hashes

Then applies pending migrations only.

### First deploy on existing Railway DB (previously `db:push`)

1. Deploy with migrations committed.
2. `db:migrate:prod` detects existing schema → runs `db:baseline`.
3. Server starts; `/healthz` reports `schema: true`.

### Fresh Railway DB

1. Set `DATABASE_URL`.
2. Deploy — `db:migrate:prod` applies `0000_fair_edwin_jarvis.sql`.

## Rollback strategy

Each `.sql` migration has a companion `.down.sql` (reverse `DROP TABLE` order).

| Environment | Procedure |
|-------------|-----------|
| Staging | `pnpm db:rollback --apply` then redeploy previous app version |
| Production | **Do not** run down migration on live data. Restore DB snapshot instead. |

Rollback is for **staging validation** and **disaster recovery planning**, not routine production deploys.

## Emergency recovery

1. **Schema drift / missing tables**  
   - Check `GET /healthz` → `schemaMissingTables`  
   - Run `pnpm db:verify-schema` against `DATABASE_URL`  
   - Apply: `pnpm db:migrate:prod` or restore snapshot

2. **Migration failed mid-deploy**  
   - Railway rolls back deploy if healthcheck fails  
   - Fix SQL / baseline, redeploy  
   - If partial apply: restore DB backup, fix migration, redeploy

3. **False-positive baseline**  
   - `DELETE FROM __drizzle_migrations WHERE hash = '…'`  
   - Run `pnpm db:baseline` with correct migration file

4. **Complete reset (staging only)**  
   - `pnpm db:rollback --apply`  
   - `pnpm db:migrate:prod`

## Verification checklist

- [ ] `pnpm db:generate` produces migration for schema diff
- [ ] `pnpm db:migrate:prod` succeeds (or baselines + succeeds)
- [ ] `pnpm db:verify-schema` → Overall PASS
- [ ] `GET /healthz` → `schema: true`
- [ ] `pnpm db:rollback` dry-run lists 65 DROP statements
