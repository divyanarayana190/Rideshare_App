# Stripe Production Checklist

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `STRIPE_SECRET_KEY` | Yes | `sk_live_…` in production |
| `STRIPE_WEBHOOK_SECRET` | Yes | From Stripe Dashboard webhook endpoint |
| `STRIPE_PUBLISHABLE_KEY` | Yes | `pk_live_…` |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Client card entry |

Server validates `STRIPE_SECRET_KEY` format in production (`server/_core/env.ts`).

## Canonical payment flow

| Layer | Surface |
|-------|---------|
| Client cards | `trpc.payment.*` |
| Ride charges | `chargeRide()` → `stripe_payments` |
| Receipts | `trpc.stripe.getRidePayment` |
| Admin revenue | `paymentLedgerService` (stripe + legacy read fallback) |

**Deprecated:** `paymentMethods.*` router, legacy `payments` table writes.

## Connect (driver payouts)

- [ ] `stripe.createConnectedAccount` completes onboarding
- [ ] `connected_accounts.chargesEnabled = true`
- [ ] `connected_accounts.payoutsEnabled = true`
- [ ] Test ride → destination charge → transfer record in `stripe_transfers`

## Passenger charges

- [ ] Default payment method set (`stripe_payment_methods.isDefault`)
- [ ] `bookRide` reserves credits when `creditAmountCents` sent
- [ ] `driver.completeRide` charges each passenger via `chargeRide`
- [ ] Credits-only rides succeed without Stripe charge
- [ ] `cancelRide` releases reserved credits

## Tips & refunds

- [ ] `stripe.addTip` — driver assigned (`driverId > 0`)
- [ ] `stripe.refundRide` — idempotent via `stripe_refunds`
- [ ] Admin refund path uses Stripe payment intent

## Webhooks

- [ ] Endpoint: `https://<api>/api/webhooks/stripe`
- [ ] Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, `charge.refunded`
- [ ] `webhook_events` deduplicates by `stripeEventId`

## Wallet credits

- [ ] `wallet.addPromoCredit` grants credits
- [ ] `reserveCredits` at booking
- [ ] `applyReservedCredits` on successful charge
- [ ] `releaseReservedCredits` on cancel / charge failure

## Pre-launch test script

1. Add card → `payment.createSetupIntent` + confirm
2. Book solo ride with $5 credits applied
3. Driver completes → verify `stripe_payments.status = succeeded`
4. Passenger receipt shows card + credits breakdown
5. Trigger refund in Stripe test mode → verify `stripe_refunds`

## Monitoring

- Stripe Dashboard → Payments, Connect, Webhooks
- DB: `SELECT status, COUNT(*) FROM stripe_payments GROUP BY status`
- Failed webhooks: `webhook_events WHERE status = 'failed'`
