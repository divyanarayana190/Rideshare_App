# RideShare Production Payment Architecture
## Stripe Connect Marketplace — Complete Implementation Guide

---

# 1. PAYMENT SYSTEM OVERVIEW

## 1.1 Money Flow

```
┌──────────┐         ┌──────────────────────┐         ┌──────────┐
│  RIDER   │ ──$──►  │  STRIPE PLATFORM     │ ──$──►  │  DRIVER  │
│  (payer) │         │  (your app account)   │         │ (payee)  │
└──────────┘         │                      │         └──────────┘
                     │  Rider pays $20.00    │
                     │  ├── Platform fee: $4 │
                     │  └── Driver gets: $16 │
                     └──────────────────────┘
```

**How it works:**

1. **Rider** pays $20 for a ride (via saved card, Apple Pay, or Google Pay)
2. **Stripe** collects the $20 and holds it in your platform account
3. **Stripe** automatically transfers $16 to the driver's connected account
4. **Your platform** keeps $4 as commission (20% application fee)
5. **Driver** can withdraw $16 to their bank account (instant or standard payout)

## 1.2 Why Stripe Connect

Your current implementation has a critical flaw: **driver earnings are tracked in a wallet table in your DB** — this means real money never reaches drivers. Stripe Connect solves this:

| Feature | Your Current System | Stripe Connect |
|---------|-------------------|----------------|
| Rider charging | Mock payment intent | Real card charge |
| Driver payout | Internal wallet number | Real bank deposit |
| Tax reporting | Not handled | Stripe handles 1099s |
| Compliance | Not PCI compliant | PCI DSS Level 1 |
| Disputes | Not handled | Stripe manages |
| Multi-currency | Not supported | 135+ currencies |

## 1.3 Key Stripe Components

| Component | Purpose | When Used |
|-----------|---------|-----------|
| **Customer** | Represents a rider in Stripe | Rider signup |
| **Connected Account** | Represents a driver in Stripe | Driver signup |
| **SetupIntent** | Saves a card for future use (no charge) | Rider adds card |
| **PaymentIntent** | Charges a rider for a ride | Ride completion |
| **Transfer** | Moves money to driver's connected account | Automatic with destination charge |
| **Payout** | Moves money from connected account to bank | Driver withdrawal |
| **Webhook** | Stripe notifies your server of events | Payment success/failure |

## 1.4 Platform Fee Model

```
Destination Charge (recommended for rideshare):
  PaymentIntent($20) {
    transfer_data: { destination: driver_connected_account_id },
    application_fee_amount: 400,  // $4.00 in cents
  }

  Result:
    Rider charged:     $20.00
    Platform receives:  $4.00  (application_fee_amount)
    Driver receives:   $16.00  ($20 - $4)
    Stripe fee:         $0.88  (2.9% + $0.30, deducted from platform's $4)
    Platform net:       $3.12  ($4.00 - $0.88)
```

---

# 2. END-TO-END FLOW

## 2.1 Rider Signup → Stripe Customer

```
Rider signs up via OTP
    │
    ▼
Server: verifyOtp mutation
    │
    ├── Create user in MySQL (existing)
    │
    ├── Create Stripe Customer
    │   stripe.customers.create({
    │     email: user.email,
    │     phone: user.phone,
    │     name: `${firstName} ${lastName}`,
    │     metadata: { userId: user.id, platform: 'rideshare' }
    │   })
    │
    └── Save stripeCustomerId to user_profiles table
        UPDATE user_profiles SET stripe_customer_id = 'cus_xxx' WHERE user_id = ?
```

## 2.2 Driver Signup → Connected Account

```
Driver taps "Become a Driver"
    │
    ▼
Server: driver.submitOnboarding
    │
    ├── Create Stripe Connect Account (Express)
    │   stripe.accounts.create({
    │     type: 'express',
    │     country: 'US',
    │     email: driver.email,
    │     capabilities: {
    │       card_payments: { requested: true },
    │       transfers: { requested: true },
    │     },
    │     business_type: 'individual',
    │     metadata: { userId: driver.id, platform: 'rideshare' }
    │   })
    │
    ├── Save stripeConnectId to user_profiles table
    │
    ├── Generate Onboarding Link
    │   stripe.accountLinks.create({
    │     account: 'acct_xxx',
    │     refresh_url: 'https://app.rideshare.com/driver/onboarding/refresh',
    │     return_url: 'https://app.rideshare.com/driver/onboarding/complete',
    │     type: 'account_onboarding',
    │   })
    │
    └── Return onboarding URL to client
        Client opens URL in WebView / browser
        Driver enters: SSN, bank account, ID photo
        Stripe handles all KYC/identity verification
```

## 2.3 Rider Saves Card (SetupIntent)

```
Rider taps "Add Payment Method"
    │
    ▼
Client: Request SetupIntent from server
    │
    ▼
Server: paymentMethods.createSetupIntent
    │
    stripe.setupIntents.create({
      customer: 'cus_xxx',  // rider's Stripe customer ID
      payment_method_types: ['card'],
      usage: 'off_session',  // allows charging later without rider present
    })
    │
    ▼
Client: Collect card details using Stripe SDK
    │
    const { setupIntent, error } = await confirmSetupIntent(
      clientSecret,
      { paymentMethodType: 'Card' }
    );
    │
    ▼
Server: Save payment method to DB
    │
    ├── Stripe automatically attaches PaymentMethod to Customer
    ├── Save last4, card type, expiry to payment_methods table
    └── Set as default if first card
```

## 2.4 Ride Completion → Charge Rider

```
Driver taps "Complete Ride"
    │
    ▼
Server: driver.completeRide
    │
    ├── 1. Calculate final fare (fareEngine)
    │      baseFare + perKm + perMin + surge - discount
    │
    ├── 2. Get rider's default payment method
    │      SELECT * FROM payment_methods WHERE user_id = ? AND is_default = true
    │
    ├── 3. Calculate platform fee (20%)
    │      applicationFee = Math.round(fareInCents * 0.20)
    │
    ├── 4. Create PaymentIntent with destination charge
    │      stripe.paymentIntents.create({
    │        amount: fareInCents,           // e.g., 2000 ($20.00)
    │        currency: 'usd',
    │        customer: rider.stripeCustomerId,
    │        payment_method: rider.stripePaymentMethodId,
    │        off_session: true,             // rider not actively confirming
    │        confirm: true,                 // charge immediately
    │        application_fee_amount: applicationFee,  // e.g., 400 ($4.00)
    │        transfer_data: {
    │          destination: driver.stripeConnectId,    // driver's connected account
    │        },
    │        metadata: {
    │          rideId: ride.rideId,
    │          riderId: rider.id,
    │          driverId: driver.id,
    │        },
    │        idempotency_key: `ride_payment_${ride.rideId}`,
    │      })
    │
    ├── 5. Save payment record to DB
    │      INSERT INTO payments (paymentId, rideId, amount, status, stripePaymentIntentId, ...)
    │
    ├── 6. Update ride status to 'completed'
    │
    └── 7. Send receipt notification to rider + driver
```

## 2.5 Driver Payout to Bank

```
Option A: Automatic payouts (recommended)
    Stripe automatically deposits to driver's bank account
    Default schedule: daily (T+2 business days)
    Configure per connected account:
      stripe.accounts.update('acct_xxx', {
        settings: { payouts: { schedule: { interval: 'daily' } } }
      })

Option B: Manual/instant payouts
    Driver taps "Cash Out Now"
    Server:
      stripe.payouts.create({
        amount: amountInCents,
        currency: 'usd',
        method: 'instant',  // instant to debit card, or 'standard' to bank
      }, {
        stripeAccount: driver.stripeConnectId,
      })
    Instant payout fee: 1% (min $0.50)
```

## 2.6 Refund Flow

```
Rider requests refund (or admin issues one)
    │
    ▼
Server: payments.refund
    │
    ├── Full refund:
    │   stripe.refunds.create({
    │     payment_intent: 'pi_xxx',
    │     reason: 'requested_by_customer',
    │     reverse_transfer: true,        // take money back from driver
    │     refund_application_fee: true,  // refund platform fee too
    │     metadata: { rideId, reason },
    │     idempotency_key: `refund_${rideId}_${Date.now()}`,
    │   })
    │
    ├── Partial refund (e.g., surge overcharge):
    │   stripe.refunds.create({
    │     payment_intent: 'pi_xxx',
    │     amount: partialAmountInCents,  // only refund part
    │     reverse_transfer: true,
    │     refund_application_fee: false,  // keep platform fee
    │   })
    │
    ├── Update payment status in DB
    │   UPDATE payments SET status = 'refunded', refundedAt = NOW()
    │
    └── Notify rider: "Refund of $X.XX processed"
```

---

# 3. DATABASE DESIGN

## 3.1 New/Updated Tables

```sql
-- ═══════════════════════════════════════════════════════════════════
-- Stripe Customer tracking (add to user_profiles)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE user_profiles
  ADD COLUMN stripe_customer_id VARCHAR(255) NULL,
  ADD COLUMN stripe_connect_id VARCHAR(255) NULL,
  ADD COLUMN stripe_connect_status ENUM('not_started', 'pending', 'active', 'restricted', 'disabled')
    NOT NULL DEFAULT 'not_started',
  ADD COLUMN stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for lookups
CREATE INDEX idx_profiles_stripe_customer ON user_profiles(stripe_customer_id);
CREATE INDEX idx_profiles_stripe_connect ON user_profiles(stripe_connect_id);


-- ═══════════════════════════════════════════════════════════════════
-- Payment Methods (update existing table)
-- ═══════════════════════════════════════════════════════════════════
-- Your existing payment_methods table is good, just ensure:
--   stripe_payment_method_id VARCHAR(255) — maps to Stripe 'pm_xxx'
--   card_type ENUM('visa','mastercard','amex','discover')
--   last4 CHAR(4)
--   expiry_month INT
--   expiry_year INT
--   is_default BOOLEAN
--   holder_name VARCHAR(100)


-- ═══════════════════════════════════════════════════════════════════
-- Payments (update existing table — add Stripe fields)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE payments
  ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL,
  ADD COLUMN stripe_charge_id VARCHAR(255) NULL,
  ADD COLUMN stripe_transfer_id VARCHAR(255) NULL,
  ADD COLUMN application_fee_amount INT NOT NULL DEFAULT 0,
  ADD COLUMN driver_payout_amount INT NOT NULL DEFAULT 0,
  ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  ADD COLUMN failure_reason VARCHAR(500) NULL,
  ADD COLUMN refund_amount INT NOT NULL DEFAULT 0,
  ADD COLUMN refunded_at DATETIME NULL;

CREATE INDEX idx_payments_stripe_pi ON payments(stripe_payment_intent_id);
CREATE INDEX idx_payments_ride ON payments(ride_id, status);


-- ═══════════════════════════════════════════════════════════════════
-- Webhook Events (idempotency tracking)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE stripe_webhook_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  stripe_account VARCHAR(255) NULL,      -- for Connect webhooks
  data JSON NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at DATETIME NULL,
  error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_webhook_event_id (event_id),
  INDEX idx_webhook_type (event_type, processed),
  INDEX idx_webhook_created (created_at)
);


-- ═══════════════════════════════════════════════════════════════════
-- Refunds (dedicated tracking)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE refunds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  refund_id VARCHAR(255) NOT NULL UNIQUE,
  payment_id VARCHAR(255) NOT NULL,
  ride_id VARCHAR(255) NOT NULL,
  stripe_refund_id VARCHAR(255) NULL,
  amount INT NOT NULL,                   -- in cents
  reason ENUM('requested_by_customer', 'driver_cancelled', 'safety_issue',
              'overcharge', 'duplicate', 'fraudulent', 'other') NOT NULL,
  status ENUM('pending', 'succeeded', 'failed') NOT NULL DEFAULT 'pending',
  initiated_by ENUM('rider', 'driver', 'admin', 'system') NOT NULL,
  initiated_by_user_id INT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,

  INDEX idx_refunds_payment (payment_id),
  INDEX idx_refunds_ride (ride_id),
  INDEX idx_refunds_status (status)
);


-- ═══════════════════════════════════════════════════════════════════
-- Driver Payouts (tracking Stripe payouts)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE driver_payouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payout_id VARCHAR(255) NOT NULL UNIQUE,
  driver_id INT NOT NULL,
  stripe_payout_id VARCHAR(255) NULL,
  amount INT NOT NULL,                   -- in cents
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  method ENUM('standard', 'instant') NOT NULL DEFAULT 'standard',
  status ENUM('pending', 'in_transit', 'paid', 'failed', 'cancelled')
    NOT NULL DEFAULT 'pending',
  arrival_date DATE NULL,
  failure_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,

  INDEX idx_payouts_driver (driver_id, status),
  INDEX idx_payouts_stripe (stripe_payout_id)
);
```

## 3.2 Entity Relationship

```
user_profiles
  ├── stripe_customer_id (1:1)  → Stripe Customer
  ├── stripe_connect_id (1:1)   → Stripe Connected Account
  │
  ├── payment_methods (1:many)
  │     └── stripe_payment_method_id → Stripe PaymentMethod
  │
  ├── payments (1:many, as rider)
  │     ├── stripe_payment_intent_id → Stripe PaymentIntent
  │     ├── stripe_charge_id → Stripe Charge
  │     └── stripe_transfer_id → Stripe Transfer
  │
  ├── refunds (via payments)
  │     └── stripe_refund_id → Stripe Refund
  │
  └── driver_payouts (1:many, as driver)
        └── stripe_payout_id → Stripe Payout
```

---

# 4. BACKEND API DESIGN

## 4.1 Rider Endpoints

```typescript
// ── server/routers.ts — payments section ──────────────────────────

payments: router({

  // Create or get Stripe customer for current rider
  ensureStripeCustomer: protectedProcedure
    .mutation(async ({ ctx }) => {
      const profile = await getUserProfile(ctx.user.id);
      if (profile?.stripeCustomerId) {
        return { customerId: profile.stripeCustomerId };
      }

      const customer = await stripe.customers.create({
        email: ctx.user.email || undefined,
        name: ctx.user.name || undefined,
        metadata: { userId: String(ctx.user.id), platform: 'rideshare' },
      });

      await updateUserProfile(ctx.user.id, {
        stripeCustomerId: customer.id,
      });

      return { customerId: customer.id };
    }),

  // Create SetupIntent for saving a card
  createSetupIntent: protectedProcedure
    .mutation(async ({ ctx }) => {
      const profile = await getUserProfile(ctx.user.id);
      if (!profile?.stripeCustomerId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Create Stripe customer first' });
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: profile.stripeCustomerId,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata: { userId: String(ctx.user.id) },
      });

      return {
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      };
    }),

  // Confirm card was saved (called after client-side confirmation)
  savePaymentMethod: protectedProcedure
    .input(z.object({
      setupIntentId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const setupIntent = await stripe.setupIntents.retrieve(input.setupIntentId);

      if (setupIntent.status !== 'succeeded') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'SetupIntent not confirmed' });
      }

      const pmId = setupIntent.payment_method as string;
      const pm = await stripe.paymentMethods.retrieve(pmId);

      // Save to DB
      await addPaymentMethod({
        userId: ctx.user.id,
        cardType: pm.card!.brand as any,
        last4: pm.card!.last4,
        holderName: pm.billing_details.name || ctx.user.name || 'Card Holder',
        expiryMonth: pm.card!.exp_month,
        expiryYear: pm.card!.exp_year,
        stripePaymentMethodId: pmId,
        isDefault: false,
      });

      return { success: true, last4: pm.card!.last4 };
    }),

  // Charge rider for completed ride
  chargeRide: protectedProcedure
    .input(z.object({
      rideId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // This is called internally by completeRide, not directly by clients
      // See Section 5 for full implementation
    }),

  // Request refund
  requestRefund: protectedProcedure
    .input(z.object({
      rideId: z.string(),
      reason: z.enum(['overcharge', 'driver_cancelled', 'safety_issue', 'other']),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const payment = await getPaymentByRideId(input.rideId);
      if (!payment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
      if (payment.status !== 'completed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payment not completed' });
      }

      // Create refund
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        reason: 'requested_by_customer',
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: { rideId: input.rideId, reason: input.reason },
      }, {
        idempotencyKey: `refund_${input.rideId}_${ctx.user.id}`,
      });

      // Record refund in DB
      await db.insert(refunds).values({
        refundId: genId('ref'),
        paymentId: payment.paymentId,
        rideId: input.rideId,
        stripeRefundId: refund.id,
        amount: payment.amount,
        reason: input.reason,
        status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
        initiatedBy: 'rider',
        initiatedByUserId: ctx.user.id,
        notes: input.notes || null,
      });

      await updatePayment(payment.paymentId, {
        status: 'refunded',
        refundAmount: payment.amount,
        refundedAt: new Date(),
      });

      return { success: true, refundId: refund.id };
    }),
}),
```

## 4.2 Driver Endpoints

```typescript
driver: router({
  // ... existing driver procedures ...

  // Create Stripe Connected Account for driver
  createConnectAccount: protectedProcedure
    .mutation(async ({ ctx }) => {
      const profile = await getUserProfile(ctx.user.id);
      if (profile?.stripeConnectId) {
        return { accountId: profile.stripeConnectId };
      }

      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: ctx.user.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { userId: String(ctx.user.id), platform: 'rideshare' },
      });

      await updateUserProfile(ctx.user.id, {
        stripeConnectId: account.id,
        stripeConnectStatus: 'pending',
      });

      return { accountId: account.id };
    }),

  // Generate Stripe onboarding URL
  getOnboardingLink: protectedProcedure
    .mutation(async ({ ctx }) => {
      const profile = await getUserProfile(ctx.user.id);
      if (!profile?.stripeConnectId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Create connect account first' });
      }

      const link = await stripe.accountLinks.create({
        account: profile.stripeConnectId,
        refresh_url: `${process.env.APP_URL}/driver/onboarding?refresh=true`,
        return_url: `${process.env.APP_URL}/driver/onboarding?complete=true`,
        type: 'account_onboarding',
      });

      return { url: link.url, expiresAt: link.expires_at };
    }),

  // Check driver's Stripe account status
  getConnectStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const profile = await getUserProfile(ctx.user.id);
      if (!profile?.stripeConnectId) {
        return { status: 'not_started', payoutsEnabled: false, chargesEnabled: false };
      }

      const account = await stripe.accounts.retrieve(profile.stripeConnectId);

      // Update local status
      const status = account.charges_enabled && account.payouts_enabled
        ? 'active'
        : account.details_submitted
          ? 'pending'
          : 'not_started';

      await updateUserProfile(ctx.user.id, {
        stripeConnectStatus: status,
        stripePayoutsEnabled: account.payouts_enabled,
      });

      return {
        status,
        payoutsEnabled: account.payouts_enabled,
        chargesEnabled: account.charges_enabled,
        detailsSubmitted: account.details_submitted,
        currentlyDue: account.requirements?.currently_due || [],
        pendingVerification: account.requirements?.pending_verification || [],
      };
    }),

  // Get driver's Stripe balance
  getStripeBalance: protectedProcedure
    .query(async ({ ctx }) => {
      const profile = await getUserProfile(ctx.user.id);
      if (!profile?.stripeConnectId) {
        return { available: 0, pending: 0 };
      }

      const balance = await stripe.balance.retrieve({
        stripeAccount: profile.stripeConnectId,
      });

      return {
        available: balance.available[0]?.amount || 0,
        pending: balance.pending[0]?.amount || 0,
        currency: balance.available[0]?.currency || 'usd',
      };
    }),

  // Request instant payout
  requestPayout: protectedProcedure
    .input(z.object({
      amount: z.number().int().min(100),  // minimum $1.00
      method: z.enum(['standard', 'instant']).default('standard'),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getUserProfile(ctx.user.id);
      if (!profile?.stripeConnectId || !profile.stripePayoutsEnabled) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payouts not enabled' });
      }

      const payout = await stripe.payouts.create({
        amount: input.amount,
        currency: 'usd',
        method: input.method,
      }, {
        stripeAccount: profile.stripeConnectId,
        idempotencyKey: `payout_${ctx.user.id}_${Date.now()}`,
      });

      // Record in DB
      await db.insert(driverPayouts).values({
        payoutId: genId('pyt'),
        driverId: ctx.user.id,
        stripePayoutId: payout.id,
        amount: input.amount,
        method: input.method,
        status: 'pending',
        arrivalDate: payout.arrival_date
          ? new Date(payout.arrival_date * 1000)
          : null,
      });

      return { payoutId: payout.id, arrivalDate: payout.arrival_date };
    }),
}),
```

## 4.3 Webhook Endpoint

```typescript
// ── server/_core/index.ts — add BEFORE body parsing middleware ───

// Stripe webhook needs raw body for signature verification
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      logger.error({ err: err.message }, 'Webhook signature verification failed');
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    // Idempotency: check if already processed
    const existing = await db.select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, event.id))
      .limit(1);

    if (existing.length > 0 && existing[0].processed) {
      res.json({ received: true, duplicate: true });
      return;
    }

    // Store event
    await db.insert(stripeWebhookEvents).values({
      eventId: event.id,
      eventType: event.type,
      stripeAccount: (event as any).account || null,
      data: event.data.object,
      processed: false,
    }).onDuplicateKeyUpdate({ set: { eventId: event.id } });

    // Process event
    try {
      await processWebhookEvent(event);

      await db.update(stripeWebhookEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(eq(stripeWebhookEvents.eventId, event.id));
    } catch (err: any) {
      logger.error({ eventId: event.id, err }, 'Webhook processing failed');
      await db.update(stripeWebhookEvents)
        .set({ error: err.message })
        .where(eq(stripeWebhookEvents.eventId, event.id));
    }

    // Always return 200 to Stripe (even on processing error)
    // Failed events will be retried via dead-letter queue
    res.json({ received: true });
  }
);
```

---

# 5. STRIPE IMPLEMENTATION DETAILS

## 5.1 Complete Ride Payment Function

```typescript
// server/services/stripePayments.ts

import Stripe from 'stripe';
import logger from '../logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
  maxNetworkRetries: 2,
  timeout: 30000,
});

const PLATFORM_FEE_PERCENT = 20; // 20% commission

interface ChargeRideParams {
  rideId: string;
  riderId: number;
  driverId: number;
  fareAmountCents: number;     // total fare in cents
  currency?: string;
}

export async function chargeRidePayment(params: ChargeRideParams) {
  const { rideId, riderId, driverId, fareAmountCents, currency = 'usd' } = params;

  // 1. Get rider's Stripe customer + default payment method
  const riderProfile = await getUserProfile(riderId);
  if (!riderProfile?.stripeCustomerId) {
    throw new Error('Rider has no Stripe customer');
  }

  const defaultPM = await getDefaultPaymentMethod(riderId);
  if (!defaultPM?.stripePaymentMethodId) {
    throw new Error('Rider has no payment method');
  }

  // 2. Get driver's connected account
  const driverProfile = await getUserProfile(driverId);
  if (!driverProfile?.stripeConnectId) {
    throw new Error('Driver has no Stripe connected account');
  }

  // 3. Calculate platform fee
  const applicationFee = Math.round(fareAmountCents * (PLATFORM_FEE_PERCENT / 100));
  const driverAmount = fareAmountCents - applicationFee;

  // 4. Create PaymentIntent with destination charge
  const paymentIntent = await stripe.paymentIntents.create({
    amount: fareAmountCents,
    currency,
    customer: riderProfile.stripeCustomerId,
    payment_method: defaultPM.stripePaymentMethodId,
    off_session: true,
    confirm: true,
    application_fee_amount: applicationFee,
    transfer_data: {
      destination: driverProfile.stripeConnectId,
    },
    metadata: {
      rideId,
      riderId: String(riderId),
      driverId: String(driverId),
      platformFee: String(applicationFee),
      driverPayout: String(driverAmount),
    },
    description: `Ride ${rideId}`,
    statement_descriptor_suffix: 'RIDESHARE',
  }, {
    idempotencyKey: `ride_payment_${rideId}`,
  });

  // 5. Record payment in DB
  const paymentId = genId('pay');
  await createPayment({
    paymentId,
    rideId,
    passengerId: riderId,
    amount: fareAmountCents,
    status: paymentIntent.status === 'succeeded' ? 'completed' : 'pending',
    paymentMethod: 'card',
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: paymentIntent.latest_charge as string,
    applicationFeeAmount: applicationFee,
    driverPayoutAmount: driverAmount,
    currency,
  });

  // 6. Log transaction
  await createTransaction({
    transactionId: genId('txn'),
    userId: riderId,
    type: 'debit',
    amount: fareAmountCents.toString(),
    relatedRideId: rideId,
    relatedPaymentId: paymentId,
  });

  logger.info({
    rideId,
    amount: fareAmountCents,
    platformFee: applicationFee,
    driverPayout: driverAmount,
    paymentIntentId: paymentIntent.id,
  }, 'Ride payment processed');

  return {
    paymentId,
    paymentIntentId: paymentIntent.id,
    amount: fareAmountCents,
    platformFee: applicationFee,
    driverPayout: driverAmount,
    status: paymentIntent.status,
  };
}

// Handle payment that requires authentication (SCA)
export async function handlePaymentRequiresAction(paymentIntentId: string) {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (pi.status === 'requires_action' || pi.status === 'requires_confirmation') {
    // Notify rider to open app and confirm payment
    // Send push notification with deep link
    return {
      requiresAction: true,
      clientSecret: pi.client_secret,
      status: pi.status,
    };
  }

  return { requiresAction: false, status: pi.status };
}
```

## 5.2 Wallet + Card Hybrid Payment

```typescript
// Support paying partially from wallet, rest from card

export async function chargeRideHybrid(params: ChargeRideParams & { useWallet: boolean }) {
  const { rideId, riderId, fareAmountCents, useWallet } = params;

  let walletDeduction = 0;
  let cardCharge = fareAmountCents;

  if (useWallet) {
    const wallet = await getOrCreateWallet(riderId);
    const walletBalanceCents = Math.round(parseFloat(wallet.balance) * 100);

    if (walletBalanceCents >= fareAmountCents) {
      // Full wallet payment — no card charge needed
      walletDeduction = fareAmountCents;
      cardCharge = 0;

      await updateWalletBalance(riderId, -(fareAmountCents / 100));
      await createTransaction({
        transactionId: genId('txn'),
        userId: riderId,
        type: 'debit',
        amount: (fareAmountCents / 100).toFixed(2),
        relatedRideId: rideId,
      });

      // Still need to pay driver via platform transfer
      const driverProfile = await getUserProfile(params.driverId);
      if (driverProfile?.stripeConnectId) {
        const driverAmount = fareAmountCents - Math.round(fareAmountCents * 0.20);
        await stripe.transfers.create({
          amount: driverAmount,
          currency: 'usd',
          destination: driverProfile.stripeConnectId,
          metadata: { rideId, type: 'wallet_payment' },
        });
      }

      return { paymentMethod: 'wallet', walletDeduction, cardCharge: 0 };
    } else {
      // Partial wallet — deduct what's available, charge rest to card
      walletDeduction = walletBalanceCents;
      cardCharge = fareAmountCents - walletBalanceCents;

      await updateWalletBalance(riderId, -(walletBalanceCents / 100));
    }
  }

  // Charge remaining to card
  if (cardCharge > 0) {
    const result = await chargeRidePayment({
      ...params,
      fareAmountCents: cardCharge,
    });
    return { ...result, walletDeduction, paymentMethod: 'hybrid' };
  }
}
```

---

# 6. REACT NATIVE IMPLEMENTATION

## 6.1 Setup

```bash
# Install Stripe React Native SDK
npx expo install @stripe/stripe-react-native
```

```typescript
// app/_layout.tsx — wrap app with StripeProvider
import { StripeProvider } from '@stripe/stripe-react-native';

export default function RootLayout() {
  return (
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}
      merchantIdentifier="merchant.com.rideshare"  // for Apple Pay
    >
      <AuthProvider>
        {/* ... rest of app */}
      </AuthProvider>
    </StripeProvider>
  );
}
```

## 6.2 Add Card Screen

```typescript
// app/add-card.tsx
import { CardField, useConfirmSetupIntent } from '@stripe/stripe-react-native';
import { trpc } from '@/lib/trpc';

export default function AddCardScreen() {
  const { confirmSetupIntent } = useConfirmSetupIntent();
  const createSetupIntent = trpc.payments.createSetupIntent.useMutation();
  const savePaymentMethod = trpc.payments.savePaymentMethod.useMutation();
  const [cardComplete, setCardComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSaveCard = async () => {
    setLoading(true);
    try {
      // 1. Get SetupIntent from server
      const { clientSecret, setupIntentId } = await createSetupIntent.mutateAsync();

      // 2. Confirm with Stripe SDK (collects card, sends to Stripe directly)
      const { setupIntent, error } = await confirmSetupIntent(clientSecret, {
        paymentMethodType: 'Card',
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      if (setupIntent?.status === 'Succeeded') {
        // 3. Tell server to save the payment method
        await savePaymentMethod.mutateAsync({ setupIntentId });
        Alert.alert('Success', 'Card saved!');
        router.back();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save card');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
        Add Payment Method
      </Text>

      <CardField
        postalCodeEnabled={true}
        placeholders={{ number: '4242 4242 4242 4242' }}
        cardStyle={{
          backgroundColor: '#FFFFFF',
          textColor: '#000000',
          borderWidth: 1,
          borderColor: '#E2E8F0',
          borderRadius: 12,
          fontSize: 16,
        }}
        style={{ width: '100%', height: 50, marginVertical: 20 }}
        onCardChange={(details) => {
          setCardComplete(details.complete);
        }}
      />

      <TouchableOpacity
        onPress={handleSaveCard}
        disabled={!cardComplete || loading}
        style={{
          backgroundColor: cardComplete ? '#3B5EF5' : '#CBD5E1',
          padding: 16,
          borderRadius: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>
          {loading ? 'Saving...' : 'Save Card'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

## 6.3 Apple Pay / Google Pay

```typescript
// In ride completion screen
import { useApplePay, useGooglePay } from '@stripe/stripe-react-native';

function RidePayment({ fareAmount, rideId }: { fareAmount: number; rideId: string }) {
  const { isApplePaySupported, presentApplePay, confirmApplePayPayment }
    = useApplePay();
  const { isGooglePaySupported, initGooglePay, presentGooglePay }
    = useGooglePay();

  const handleApplePay = async () => {
    const { error } = await presentApplePay({
      cartItems: [{ label: 'RideShare Ride', amount: fareAmount.toFixed(2) }],
      country: 'US',
      currency: 'USD',
    });

    if (error) return;

    // Get PaymentIntent from server
    const { clientSecret } = await chargeRide.mutateAsync({ rideId });

    const { error: confirmError } = await confirmApplePayPayment(clientSecret);
    if (confirmError) {
      Alert.alert('Payment failed', confirmError.message);
    } else {
      Alert.alert('Success', 'Payment complete!');
    }
  };

  return (
    <View>
      {isApplePaySupported && (
        <ApplePayButton onPress={handleApplePay} style={{ height: 50 }} />
      )}
    </View>
  );
}
```

---

# 7. WEBHOOK DESIGN

## 7.1 Required Events

```typescript
async function processWebhookEvent(event: Stripe.Event) {
  switch (event.type) {

    // ── Payment succeeded ──────────────────────────────────────
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const rideId = pi.metadata.rideId;
      if (!rideId) break;

      await updatePaymentByStripePI(pi.id, {
        status: 'completed',
        stripeChargeId: pi.latest_charge as string,
      });

      // Send receipt
      await sendNotification(parseInt(pi.metadata.riderId), {
        title: 'Payment Received',
        body: `$${(pi.amount / 100).toFixed(2)} charged for ride`,
        type: 'payment_received',
      });
      break;
    }

    // ── Payment failed ─────────────────────────────────────────
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const rideId = pi.metadata.rideId;
      if (!rideId) break;

      await updatePaymentByStripePI(pi.id, {
        status: 'failed',
        failureReason: pi.last_payment_error?.message || 'Payment failed',
      });

      // Notify rider to update payment method
      await sendNotification(parseInt(pi.metadata.riderId), {
        title: 'Payment Failed',
        body: 'Please update your payment method',
        type: 'payment_received',
        data: { action: 'update_payment', rideId },
      });

      logger.warn({ rideId, piId: pi.id, error: pi.last_payment_error?.message },
        'Ride payment failed');
      break;
    }

    // ── Refund processed ───────────────────────────────────────
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const pi = charge.payment_intent as string;

      await db.update(refunds)
        .set({ status: 'succeeded', completedAt: new Date() })
        .where(eq(refunds.stripeRefundId, charge.refunds?.data[0]?.id || ''));

      break;
    }

    // ── Connected account updated ──────────────────────────────
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;

      // Find driver by connect ID
      const profile = await db.select()
        .from(userProfiles)
        .where(eq(userProfiles.stripeConnectId, account.id))
        .limit(1);

      if (profile[0]) {
        const status = account.charges_enabled && account.payouts_enabled
          ? 'active'
          : account.details_submitted ? 'pending' : 'not_started';

        await updateUserProfile(profile[0].userId, {
          stripeConnectStatus: status,
          stripePayoutsEnabled: account.payouts_enabled,
        });

        if (status === 'active') {
          await sendNotification(profile[0].userId, {
            title: 'Account Verified',
            body: 'You can now receive payouts!',
            type: 'system',
          });
        }
      }
      break;
    }

    // ── Payout status updates ──────────────────────────────────
    case 'payout.paid': {
      const payout = event.data.object as Stripe.Payout;
      await db.update(driverPayouts)
        .set({ status: 'paid', completedAt: new Date() })
        .where(eq(driverPayouts.stripePayoutId, payout.id));
      break;
    }

    case 'payout.failed': {
      const payout = event.data.object as Stripe.Payout;
      await db.update(driverPayouts)
        .set({
          status: 'failed',
          failureReason: payout.failure_message || 'Payout failed',
        })
        .where(eq(driverPayouts.stripePayoutId, payout.id));

      // Notify driver
      const payoutRecord = await db.select()
        .from(driverPayouts)
        .where(eq(driverPayouts.stripePayoutId, payout.id))
        .limit(1);
      if (payoutRecord[0]) {
        await sendNotification(payoutRecord[0].driverId, {
          title: 'Payout Failed',
          body: 'Please check your bank account details',
          type: 'payment_received',
        });
      }
      break;
    }

    default:
      logger.debug({ eventType: event.type }, 'Unhandled webhook event');
  }
}
```

## 7.2 Idempotency Handling

```
Every webhook event has a unique event.id (e.g., evt_xxx)

Flow:
  1. Stripe sends event → POST /api/stripe/webhook
  2. Verify signature → reject if invalid
  3. Check stripe_webhook_events table → skip if already processed
  4. Insert event record (processed = false)
  5. Process event logic
  6. Mark processed = true
  7. Return 200

If processing fails:
  - Event stays in DB with processed = false + error message
  - Stripe retries webhook (up to 3 days, exponential backoff)
  - Next attempt: check table → not processed → retry processing
  - Same event.id → same DB check → safe idempotency

If server crashes mid-processing:
  - Event in DB with processed = false
  - Stripe retries → same event → reprocess safely
```

---

# 8. FAILURE HANDLING

## 8.1 Payment Failure Scenarios

| Scenario | Detection | Response | Recovery |
|----------|-----------|----------|----------|
| Card declined | PaymentIntent fails | Notify rider, mark ride as payment_pending | Rider updates card, retry charge |
| Insufficient funds | PaymentIntent fails | Same as above | Same |
| Card expired | PaymentIntent fails + webhook | Prompt rider to add new card | Retry with new payment method |
| SCA required (3D Secure) | PI status: requires_action | Send push notification with deep link | Rider opens app, confirms in-app |
| Network timeout to Stripe | API error | Retry with idempotency key (safe) | Automatic retry 3x |
| Driver has no connected account | Check before PI creation | Charge rider, hold funds on platform | Transfer when driver onboards |
| Double charge (duplicate request) | Idempotency key match | Stripe returns cached result | No duplicate charge |
| Webhook delivery failure | Stripe retry (72h) | No immediate action needed | Process on successful retry |

## 8.2 Retry Logic

```typescript
async function chargeWithRetry(params: ChargeRideParams, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await chargeRidePayment(params);
    } catch (err: any) {
      const isRetryable = [
        'rate_limit',
        'api_connection_error',
        'api_error',
      ].includes(err.type);

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff: 1s, 2s, 4s
      await sleep(1000 * Math.pow(2, attempt - 1));
      logger.warn({ attempt, rideId: params.rideId }, 'Retrying payment');
    }
  }
}
```

## 8.3 Cancellation Fee Logic

```typescript
async function handleRideCancellation(rideId: string, cancelledBy: 'rider' | 'driver') {
  const ride = await getRide(rideId);
  if (!ride) return;

  const minutesSinceBooked = (Date.now() - new Date(ride.createdAt).getTime()) / 60000;

  if (cancelledBy === 'rider') {
    if (ride.rideStep === 'driver_en_route' || ride.rideStep === 'driver_arrived') {
      // Rider cancels after driver is assigned — charge cancellation fee
      const cancellationFee = 500; // $5.00

      await chargeRidePayment({
        rideId,
        riderId: ride.passengerId, // adjust based on your schema
        driverId: ride.driverId!,
        fareAmountCents: cancellationFee,
      });

      logger.info({ rideId, fee: cancellationFee }, 'Cancellation fee charged');
    }
    // If cancelled within 2 minutes or before driver assigned — no fee
  }

  if (cancelledBy === 'driver') {
    // No charge to rider
    // Record driver cancellation (affects acceptance rate)
    // If pattern detected: flag for review
  }
}
```

---

# 9. SECURITY

## 9.1 Card Data Security

```
RULE: Your server NEVER sees, stores, or logs raw card numbers.

Flow:
  Client (React Native)
    ├── CardField component collects card details
    ├── Stripe SDK tokenizes directly to Stripe servers
    ├── Returns payment_method_id (pm_xxx) — a token, not card data
    └── Your server only receives and stores: pm_xxx, last4, brand, expiry

What you store:
  ✓ stripe_payment_method_id: 'pm_1N...'
  ✓ last4: '4242'
  ✓ card_type: 'visa'
  ✓ expiry_month: 12
  ✓ expiry_year: 2025

What you NEVER store:
  ✗ Full card number
  ✗ CVV / CVC
  ✗ Full expiry date
  ✗ Cardholder's billing address (unless needed)
```

## 9.2 Webhook Signature Verification

```typescript
// CRITICAL: Always verify webhook signatures
const sig = req.headers['stripe-signature'] as string;
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// This verifies:
// 1. The request came from Stripe (not a forged request)
// 2. The payload wasn't tampered with
// 3. The timestamp is recent (prevents replay attacks)
const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);

// IMPORTANT: Use express.raw() for webhook route, NOT express.json()
// express.json() parses the body and changes the raw bytes,
// breaking signature verification
```

## 9.3 API Security

```typescript
// 1. Payment endpoints require authentication
// Already handled by protectedProcedure in tRPC

// 2. Rate limit payment operations
// Add specific rate limits for payment endpoints:
//   - createSetupIntent: 5/hour per user
//   - chargeRide: 1 per ride (idempotency key)
//   - requestRefund: 3/day per user
//   - requestPayout: 5/day per driver

// 3. Amount validation
function validateAmount(amountCents: number): boolean {
  return Number.isInteger(amountCents) &&
         amountCents >= 100 &&      // minimum $1.00
         amountCents <= 50000;       // maximum $500.00
}

// 4. Never expose Stripe secret key
//    - Server-side only
//    - Stored in environment variable
//    - Never in client bundle
//    - Never in git repository
```

## 9.4 Fraud Prevention

```typescript
// 1. Stripe Radar (built-in)
//    Stripe automatically scores every charge for fraud risk
//    High-risk payments are blocked or flagged

// 2. Ride-level fraud checks
async function preFraudCheck(riderId: number, amount: number): Promise<boolean> {
  // Check for suspicious patterns:

  // a) Too many rides in short period
  const recentRides = await db.select({ count: count() })
    .from(rides)
    .where(and(
      eq(rides.passengerId, riderId),
      gte(rides.createdAt, new Date(Date.now() - 3600000)), // last hour
    ));
  if (recentRides[0].count > 10) return false; // suspicious

  // b) Amount exceeds normal range
  if (amount > 30000) return false; // $300+ ride — flag for review

  // c) Multiple failed payments recently
  const failedPayments = await db.select({ count: count() })
    .from(payments)
    .where(and(
      eq(payments.passengerId, riderId),
      eq(payments.status, 'failed'),
      gte(payments.createdAt, new Date(Date.now() - 86400000)), // last 24h
    ));
  if (failedPayments[0].count > 3) return false; // suspicious

  return true; // passed checks
}

// 3. Velocity limits
//    - Max 20 rides per day per rider
//    - Max $1000 in charges per day per rider
//    - Max 5 payment method additions per day per user
```

---

# 10. SCALING TO 100K USERS

## 10.1 Payment System Scale Characteristics

```
100k concurrent users:
  ├── ~5,000 active rides at any time
  ├── ~500 ride completions per minute (peak)
  ├── ~500 PaymentIntents created per minute
  ├── ~200 webhook events per minute
  ├── ~50 new card additions per minute
  ├── ~20 refund requests per minute
  └── ~100 driver payout checks per minute

Stripe API rate limits:
  ├── 100 read requests per second (per API key)
  ├── 100 write requests per second (per API key)
  └── Our peak: ~10 requests/second → well within limits
```

## 10.2 Database Optimization

```sql
-- Payment queries are always ride-scoped or user-scoped
-- These indexes handle 99% of queries:

CREATE INDEX idx_payments_ride_status ON payments(ride_id, status);
CREATE INDEX idx_payments_user_date ON payments(passenger_id, created_at DESC);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_intent_id);

-- Webhook events table grows fast — partition by month
ALTER TABLE stripe_webhook_events
PARTITION BY RANGE (YEAR(created_at) * 100 + MONTH(created_at)) (
  PARTITION p_current VALUES LESS THAN MAXVALUE
);

-- Clean up processed events older than 90 days
-- (Stripe retains events, we don't need to)
DELETE FROM stripe_webhook_events
WHERE processed = true AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
```

## 10.3 Webhook Processing at Scale

```
Problem: At scale, webhooks arrive faster than you can process them

Solution: Queue-based processing

  Stripe → POST /api/stripe/webhook
    │
    ├── Verify signature (fast, CPU-only)
    ├── Insert into stripe_webhook_events (fast, single INSERT)
    ├── Enqueue job: webhookQueue.add('process', { eventId })
    └── Return 200 immediately (< 50ms)

  Worker (separate process):
    │
    ├── Dequeue webhook job
    ├── Load event from DB
    ├── Process business logic (DB updates, notifications)
    └── Mark as processed

Benefits:
  - Webhook endpoint responds in < 50ms (Stripe happy)
  - Processing happens asynchronously
  - Failed processing retried automatically
  - No webhook timeout issues
```

---

# 11. STEP-BY-STEP IMPLEMENTATION PLAN

## Phase 1: Stripe Foundation (Week 1)

```
□ 1. Create Stripe account + enable Connect
□ 2. Install stripe package: pnpm add stripe
□ 3. Add env vars: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
□ 4. Replace mock stripe.ts with real Stripe SDK client
□ 5. Add stripe_customer_id, stripe_connect_id columns to user_profiles
□ 6. Create stripe_webhook_events table
□ 7. Implement ensureStripeCustomer (auto-create on signup)
□ 8. Test: create a Stripe customer via API
```

## Phase 2: Card Saving (Week 2)

```
□ 9.  Install @stripe/stripe-react-native in Expo
□ 10. Add StripeProvider to _layout.tsx
□ 11. Implement createSetupIntent endpoint
□ 12. Implement savePaymentMethod endpoint
□ 13. Build AddCard screen with CardField
□ 14. Test: save a test card (4242 4242 4242 4242)
□ 15. Verify card appears in payment_methods table + Stripe dashboard
```

## Phase 3: Charging Riders (Week 3)

```
□ 16. Implement chargeRidePayment function
□ 17. Integrate into completeRide flow
□ 18. Add idempotency keys
□ 19. Handle payment failures gracefully
□ 20. Test: complete a ride, verify charge in Stripe dashboard
□ 21. Test: verify payment record in DB
□ 22. Test: fail a payment (use 4000 0000 0000 0002 — always declines)
```

## Phase 4: Driver Connect (Week 4)

```
□ 23. Implement createConnectAccount endpoint
□ 24. Implement getOnboardingLink endpoint
□ 25. Implement getConnectStatus endpoint
□ 26. Integrate into driver-onboarding.tsx
□ 27. Test: create Express account, complete onboarding
□ 28. Verify money reaches driver's connected account
□ 29. Test: driver's Stripe balance shows correct amount
```

## Phase 5: Webhooks + Refunds (Week 5)

```
□ 30. Set up webhook endpoint (raw body parsing)
□ 31. Register webhook URL in Stripe dashboard
□ 32. Implement processWebhookEvent for key events
□ 33. Test webhooks with Stripe CLI: stripe listen --forward-to localhost:3001/api/stripe/webhook
□ 34. Implement requestRefund endpoint
□ 35. Test: refund a completed payment
□ 36. Verify refund appears in DB + Stripe dashboard
```

## Phase 6: Production Hardening (Week 6)

```
□ 37. Add fraud prevention checks
□ 38. Add payment-specific rate limiting
□ 39. Add payment failure retry queue
□ 40. Set up Stripe webhook endpoint in production
□ 41. Enable Stripe Radar rules
□ 42. Test all flows end-to-end with test cards
□ 43. Switch to live mode keys
□ 44. Process first real payment
```

---

# 12. COMMON MISTAKES TO AVOID

## Critical Mistakes

| # | Mistake | Why It's Bad | Fix |
|---|---------|-------------|-----|
| 1 | **Storing raw card numbers** | PCI violation, massive liability | Use Stripe tokenization only |
| 2 | **Charging before ride completes** | Disputed charges, refund storms | Only create PaymentIntent at ride completion |
| 3 | **No idempotency keys** | Double charges on retries | Always use `idempotencyKey: ride_payment_${rideId}` |
| 4 | **Ignoring webhook events** | Missed payment updates, stale DB | Process every event, mark as processed |
| 5 | **Not verifying webhook signatures** | Attackers can fake payment success | Always call `constructEvent()` with secret |
| 6 | **Calculating fees in cents wrong** | $20 = 2000 cents, not 20 | Always `Math.round(dollars * 100)` |
| 7 | **Not handling SCA/3DS** | European cards fail, require auth | Handle `requires_action` status |
| 8 | **Logging card data** | PCI violation | Redact all card fields in logger |
| 9 | **Using test keys in production** | No real charges, lost revenue | Separate env configs per environment |
| 10 | **Not testing failure cases** | App breaks on first decline | Test with Stripe decline test cards |

## Stripe Test Cards

```
Success:           4242 4242 4242 4242
Decline:           4000 0000 0000 0002
Insufficient:      4000 0000 0000 9995
Requires auth:     4000 0025 0000 3155
Expired:           4000 0000 0000 0069
Processing error:  4000 0000 0000 0119
```

---

# 13. FINAL OUTPUT

## 13.1 Architecture Summary

```
┌────────────────────────────────────────────────────────────────┐
│                  RIDESHARE PAYMENT ARCHITECTURE                 │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────┐                              ┌──────────────┐   │
│  │ Rider    │    Card details              │ Stripe API   │   │
│  │ App      │ ──────────────────────────►  │              │   │
│  │          │    (tokenized by SDK)         │ ┌──────────┐ │   │
│  │ Stripe   │                              │ │ Customer │ │   │
│  │ SDK      │    SetupIntent confirmed     │ │ cus_xxx  │ │   │
│  └─────┬────┘ ◄────────────────────────── │ └──────────┘ │   │
│        │                                   │              │   │
│        │ tRPC calls                        │ ┌──────────┐ │   │
│        ▼                                   │ │ Payment  │ │   │
│  ┌──────────┐                              │ │ Intent   │ │   │
│  │ Backend  │    PaymentIntent.create()     │ │ pi_xxx   │ │   │
│  │ Server   │ ──────────────────────────►  │ └──────────┘ │   │
│  │          │                              │              │   │
│  │ Express  │    destination charge         │ ┌──────────┐ │   │
│  │ + tRPC   │    + application_fee          │ │ Connect  │ │   │
│  │          │                              │ │ Account  │ │   │
│  │          │    Webhook events             │ │ acct_xxx │ │   │
│  │          │ ◄────────────────────────── │ │ (driver) │ │   │
│  └─────┬────┘                              │ └──────────┘ │   │
│        │                                   │              │   │
│        ▼                                   │    $20 ride   │   │
│  ┌──────────┐                              │    ├─$4 plat  │   │
│  │ MySQL    │                              │    └─$16 drv  │   │
│  │          │                              └──────────────┘   │
│  │ payments │                                                  │
│  │ refunds  │                              ┌──────────────┐   │
│  │ webhooks │                              │ Driver Bank  │   │
│  └──────────┘                              │ Account      │   │
│                                            │ (auto payout)│   │
│                                            └──────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

## 13.2 Payment Flow Diagram

```
Ride Completion Payment Flow:

  Driver taps          Server                Stripe              Rider
  "Complete Ride"
      │
      ├──► completeRide()
      │        │
      │        ├── Calculate final fare ($20.00)
      │        ├── Get rider's default payment method
      │        ├── Get driver's connected account
      │        ├── Calculate 20% platform fee ($4.00)
      │        │
      │        ├──────────────────────► PaymentIntent.create()
      │        │                        amount: 2000
      │        │                        application_fee: 400
      │        │                        transfer_data: acct_xxx
      │        │                        off_session: true
      │        │                        confirm: true
      │        │                        idempotency_key: ride_xxx
      │        │
      │        │   ◄──────────────────── pi_xxx (succeeded)
      │        │
      │        ├── INSERT payment record
      │        ├── INSERT transaction record
      │        ├── UPDATE ride.status = completed
      │        │
      │        │   Webhook: payment_intent.succeeded ──────────►
      │        │                                                │
      │  ◄─────┤   { success, receipt }                         │
      │        │                                                │
      │        │   ──────── Push notification ──────────────────► "Charged $20"
      │        │
      │        │   Stripe auto-transfer: $16 → driver acct_xxx
      │        │   Stripe auto-payout:   $16 → driver bank (T+2)
```

## 13.3 Production Readiness Checklist

```
Stripe Setup:
  □ Stripe account created and verified
  □ Connect enabled
  □ Webhook endpoint registered (production URL)
  □ Stripe Radar enabled
  □ Live API keys configured (separate from test)
  □ Webhook signing secret configured

Backend:
  □ Real Stripe SDK (not mock)
  □ Webhook signature verification
  □ Idempotency keys on all payment operations
  □ Payment failure handling
  □ Refund endpoint working
  □ SCA/3DS handling
  □ Amount validation (min/max)
  □ Fraud checks
  □ Rate limiting on payment endpoints
  □ PII/card data redacted from logs

Database:
  □ stripe_customer_id on user_profiles
  □ stripe_connect_id on user_profiles
  □ stripe_webhook_events table
  □ refunds table
  □ driver_payouts table
  □ Indexes on all Stripe ID columns
  □ Payment amount stored in cents (INT, not DECIMAL)

Mobile:
  □ Stripe SDK initialized
  □ CardField for card collection
  □ SetupIntent flow for saving cards
  □ Apple Pay configured (merchant ID)
  □ Google Pay configured
  □ Payment failure UI
  □ Receipt screen

Testing:
  □ Tested with all Stripe test cards
  □ Tested payment failure + recovery
  □ Tested refund flow
  □ Tested webhook delivery
  □ Tested driver onboarding
  □ Tested driver payout
  □ Tested cancellation fees
  □ Tested concurrent payments (no double charge)
  □ Load tested: 500 PaymentIntents/minute
  □ Tested with Stripe CLI: stripe listen --forward-to

Compliance:
  □ No raw card data stored anywhere
  □ Webhook signatures verified
  □ HTTPS only
  □ API keys in environment variables (not code)
  □ Audit log for all payment operations
  □ Stripe terms of service accepted
  □ Privacy policy updated (payment data)
```
