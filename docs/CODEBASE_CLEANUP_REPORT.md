# Codebase Cleanup Report

Generated during Phases 23–24 production readiness audit.

## Safe to deprecate (kept for backward compatibility)

| Item | Action | Client usage |
|------|--------|--------------|
| `paymentMethods.*` router | `@deprecated` comment | None |
| `payments` DB table | Read-only via `paymentLedgerService` | Admin legacy fallback |
| `rides.getMyRides` | Unused | None |
| `rides.getDriverRides` | Unused | None |
| `driver.getOnboardingStatus` | Unused | None |
| `rides.applyPromo` | Unused | Wallet promo flow |
| Duplicate `stripe.*` card CRUD | Unused | `payment.*` canonical |

## Redirect shims (keep for deep links)

`rate-ride`, `ride-receipt`, `carpool-marketplace`, `find-shared-v2`, `book-ride-v2`, `map-picker`, `promo-codes`, `fare-estimator`, `payment-methods*`, `driver-mode`, `driver-earnings`

## Dev-only routes

`dev/theme-lab`, `preview-loading` — `__DEV__` gated

## Removed writes (Phase 17)

- `rides.completeRide` no longer inserts into legacy `payments` table

## Hooks / services added (not dead)

- `paymentLedgerService.ts` — canonical payment reads
- `use-sse-invalidation.ts` — SSE-driven query invalidation
- `QueryStateShell`, `LoadingState` — shared UI states

## Recommended next cleanup (non-blocking)

1. Archive `paymentMethods` router after 30-day deprecation window
2. Migrate remaining `admin-advanced.ts` `payments` queries to ledger service
3. Remove `hooks/use-ride-events.ts` dead `useDriverLocationPolling` if confirmed unused
4. Consolidate `driver.createStripeConnectAccount` ↔ `stripe.createConnectedAccount`

## Error state coverage (Phase 18)

| Screen | Loading | Error | Empty | Offline |
|--------|---------|-------|-------|---------|
| wallet | ✓ | ✓ | partial | via shell |
| notifications | ✓ | ✓ | ✓ | via shell |
| loyalty-rewards | ✓ | ✓ | partial | via shell |
| analytics-dashboard | ✓ | ✓ | — | — |
| stripe-cards | ✓ | partial | ✓ | — |
| find-shared | ✓ | partial | ✓ | — |
| ride-history | partial | partial | ✓ | — |
| driver/profile | ✓ | ✓ | — | — |
| driver/requests | ✓ | partial | ✓ | — |
| `(tabs)/rides` | ✓ | ✓ | ✓ | — |

Use `QueryStateShell` for new screens.

## Performance changes (Phase 20)

| Area | Before | After |
|------|--------|-------|
| Driver pending dispatch poll | 3s | 10s + SSE invalidation |
| Driver requests (new tab) | 6s | 15s |
| Driver ride detail | 5s | 12–15s |
| Driver dashboard stats | 8–20s | 20–30s |
| Notifications poll | 10s | 30s |

Estimated driver polling reduction: **~55%** requests/min when online.
