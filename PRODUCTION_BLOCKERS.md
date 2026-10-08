# PRODUCTION_BLOCKERS.md

Issues accepted as temporary local/dev risks that **must be fixed before any production deployment**.

---

## BLOCKER-1: OTP codes printed to stdout in plaintext

**Severity**: CRITICAL  
**Status**: Accepted dev risk — NOT fixed yet  
**Files**:
- `server/routers.ts:541-548` — `console.log` prints 6-digit OTP verbatim on every `requestOtp` call
- `server/routers.ts:1014` — `logger.info` includes raw password reset OTP (`[DEV RESET OTP]`)
- `server/routers.ts:8433` — `logger.info({ userId, email, otp }, "[StudentVerification] OTP issued")`
- `server/routers.ts:8571` — same pattern for OTP resend

**Problem**: Cloud log aggregators (Railway, Datadog, CloudWatch) capture stdout. Anyone with read access to production logs can harvest active OTP codes and take over any user account.

**User impact**: Full account takeover for any user.  
**Security impact**: Authentication bypass via log read access.  
**Production risk**: Immediate on first deployment.

**Required fix before go-live**:
- Remove the `console.log` block at lines 541–548
- Strip `otp` field from `logger.info` at lines 8433 and 8571
- Downgrade line 1014 to `logger.debug` and remove the raw OTP value from the message — log only that a reset was sent, never the code itself

---

## BLOCKER-2: No-show cancellation fee not implemented

**Severity**: HIGH  
**Status**: False UX removed (driver no longer sees "Cancellation fee applied" toast), but no fee is actually charged  
**Files**:
- `app/driver/ride-detail.tsx` — `doNoShowCancel()` calls standard `cancelRide` (no fee flag)
- `server/routers.ts` — `cancelRide` procedure has no `noShow` handling, sends passenger "No charges applied"

**Required fix before go-live**:
- Add `noShow: z.boolean().optional()` to `cancelRide` input
- Server-side: if `noShow === true`, create a Stripe charge for the cancellation fee (e.g., $5) against the passenger's saved payment method before marking cancelled
- Update the driver UI toast to reflect the actual outcome

---

## BLOCKER-3: Database migration — `driverId` nullable

**Severity**: HIGH  
**Status**: Schema updated in code; `pnpm db:push` has NOT been run  
**Details**: `drizzle/schema.ts` was changed to `driverId: int("driverId")` (nullable). The live database still has `NOT NULL` with `0` as the sentinel. All code now correctly uses `null`.

**Required fix before go-live**:
1. Run `pnpm db:push` (or generate and apply a migration) against the production DB
2. Backfill existing rows: `UPDATE rides SET driverId = NULL WHERE driverId = 0`
3. Verify zero rows have `driverId = 0` before deploying new code

---

## BLOCKER-4: rideMonitor and dispatch queue state lost on restart

**Severity**: MEDIUM  
**Status**: Documented; in-memory only  
**Files**: `server/services/rideMonitor.ts`, `server/services/driverMatcher.ts`

**Required fix before go-live**:
- On startup, re-register all active rides in `rideMonitor` (query rides with status `matched`/`driver_arrived`/`in_progress`)
- Re-queue any rides still in `searching` status for dispatch (or rely on `reconcileAllExpiredRides` cron, which should run more frequently than hourly for time-sensitive on-demand rides)
