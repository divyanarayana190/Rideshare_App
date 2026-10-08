# RideShare — Production-Grade Stripe Payment System

---

## 1. PAYMENT SYSTEM OVERVIEW

### Money Flow

```
Rider (card/Apple Pay/Google Pay)
        │
        ▼
  ┌─────────────┐
  │   Stripe     │  PaymentIntent (destination charge)
  │   Platform   │
  └──────┬──────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Platform    Driver
  Fee     Connected
 (15%)    Account (85%)
            │
            ▼
       Driver Bank
       (auto payout)
```

### Why Stripe Connect

Stripe Connect is the only way to legally split payments between your platform and service providers (drivers). Without it, you'd need a money transmitter license in every state. Connect handles:

- KYC/identity verification for drivers
- Tax reporting (1099s)
- Legal money movement between parties
- Compliance with financial regulations

### Why PaymentIntent + SetupIntent

- **SetupIntent**: Collects and saves a card *without charging*. Used when rider adds a payment method. Stripe vaults the card — you never see the PAN.
- **PaymentIntent**: Charges the saved card *after ride completion*. This is critical — never charge before the ride ends because the final fare may change (surge, route change, tips).

### Platform Fee Model

Using `application_fee_amount` on destination charges:

- Rider pays $20.00 fare
- `application_fee_amount`: $3.00 (15% platform fee)
- `transfer_data.destination`: driver's connected account receives $17.00
- Stripe processing fee (~2.9% + $0.30 = $0.88) is deducted from the platform fee
- Platform net: $3.00 - $0.88 = $2.12
- Driver net: $17.00

---

## 2. END-TO-END FLOW

### Step 1: Rider Signup → Create Stripe Customer

```
1. Rider registers in app (phone/email)
2. Backend calls stripe.customers.create({ email, name, phone, metadata: { userId } })
3. Store stripe_customer_id in DB → stripe_customers table
4. Return customer_id to app (never expose to client)
```

### Step 2: Driver Signup → Create Connected Account

```
1. Driver registers in app
2. Backend calls stripe.accounts.create({
     type: 'express',
     country: 'US',
     email: driver.email,
     capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
     business_type: 'individual',
     metadata: { userId: driver.id }
   })
3. Store account_id in DB → connected_accounts table
4. Generate onboarding link (Step 3)
```

### Step 3: Driver Onboarding Flow

```
1. Backend calls stripe.accountLinks.create({
     account: connected_account_id,
     refresh_url: 'https://yourapp.com/driver/onboarding/refresh',
     return_url: 'https://yourapp.com/driver/onboarding/complete',
     type: 'account_onboarding'
   })
2. Driver opens link → enters SSN, bank account, ID verification
3. Stripe sends account.updated webhook when onboarding completes
4. Backend checks account.charges_enabled && account.payouts_enabled
5. Mark driver as payment_ready in DB
```

### Step 4: Rider Adds Card (SetupIntent)

```
1. App requests SetupIntent from backend
2. Backend calls stripe.setupIntents.create({
     customer: stripe_customer_id,
     usage: 'off_session',
     automatic_payment_methods: { enabled: true }
   })
3. Backend returns client_secret to app
4. App uses Stripe SDK: confirmSetupIntent(clientSecret, { paymentMethodType: 'Card' })
5. Stripe tokenizes card, attaches PaymentMethod to Customer
6. setup_intent.succeeded webhook fires
7. Backend stores payment_method_id in DB → payment_methods table
8. First card is set as default
```

### Step 5: Ride Booking (No Charge Yet)

```
1. Rider requests ride
2. Backend validates rider has a valid payment method
3. Backend creates a $1.00 authorization hold (optional, for fraud):
   stripe.paymentIntents.create({
     amount: 100, // $1.00 hold
     customer: stripe_customer_id,
     payment_method: default_pm_id,
     capture_method: 'manual',
     confirm: true,
     off_session: true,
   })
4. If hold succeeds → proceed with ride matching
5. If hold fails → reject ride request, prompt rider to update card
6. Cancel the hold after verification:
   stripe.paymentIntents.cancel(holdPaymentIntentId)
```

### Step 6: Ride Completion → Create PaymentIntent

```
1. Driver taps "Complete Ride"
2. Backend calculates final fare (base + distance + time + surge + tolls - promo)
3. Backend creates PaymentIntent with destination charge:
   stripe.paymentIntents.create({
     amount: finalFareInCents,
     currency: 'usd',
     customer: stripe_customer_id,
     payment_method: rider_default_pm_id,
     off_session: true,
     confirm: true,
     application_fee_amount: platformFeeInCents,
     transfer_data: { destination: driver_connected_account_id },
     metadata: { rideId, riderId, driverId },
     idempotency_key: `ride_${rideId}_payment`,
   })
4. Store payment record in DB → payments table
5. If payment succeeds → mark ride as paid
6. If payment fails → retry logic (see Section 8)
```

### Step 7: Driver Payout to Bank

```
1. Stripe automatically pays out to driver's bank account
2. Default: 2-business-day rolling payouts
3. Configurable per account:
   stripe.accounts.update(accountId, {
     settings: { payouts: { schedule: { interval: 'daily' } } }
   })
4. payout.paid webhook confirms money landed
5. Update driver earnings in DB
```

### Step 8: Refund Flow

```
1. Rider requests refund (or auto-refund on cancellation)
2. Backend determines refund amount:
   - Full refund: rider cancelled within 2 min
   - Partial refund: driver took wrong route
   - No refund: ride completed normally
3. Backend calls:
   stripe.refunds.create({
     payment_intent: original_payment_intent_id,
     amount: refundAmountInCents, // omit for full refund
     reason: 'requested_by_customer',
     metadata: { rideId, reason },
     reverse_transfer: true, // claws back from driver
     refund_application_fee: true, // returns platform fee too
   })
4. charge.refunded webhook fires
5. Update DB: refunds table + ride status
```

---

## 3. DATABASE DESIGN

### stripe_customers

```sql
CREATE TABLE stripe_customers (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  user_id         INT NOT NULL UNIQUE,
  stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
  default_payment_method_id VARCHAR(255),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_stripe_customer_id (stripe_customer_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### connected_accounts

```sql
CREATE TABLE connected_accounts (
  id                    INT PRIMARY KEY AUTO_INCREMENT,
  user_id               INT NOT NULL UNIQUE,
  stripe_account_id     VARCHAR(255) NOT NULL UNIQUE,
  charges_enabled       BOOLEAN DEFAULT FALSE,
  payouts_enabled       BOOLEAN DEFAULT FALSE,
  onboarding_complete   BOOLEAN DEFAULT FALSE,
  details_submitted     BOOLEAN DEFAULT FALSE,
  country               VARCHAR(2) DEFAULT 'US',
  default_currency      VARCHAR(3) DEFAULT 'usd',
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_stripe_account_id (stripe_account_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### payment_methods

```sql
CREATE TABLE payment_methods (
  id                    INT PRIMARY KEY AUTO_INCREMENT,
  user_id               INT NOT NULL,
  stripe_pm_id          VARCHAR(255) NOT NULL UNIQUE,
  type                  ENUM('card', 'apple_pay', 'google_pay') NOT NULL,
  card_brand            VARCHAR(20),       -- visa, mastercard, amex
  card_last4            VARCHAR(4),
  card_exp_month        INT,
  card_exp_year         INT,
  is_default            BOOLEAN DEFAULT FALSE,
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_stripe_pm_id (stripe_pm_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### payments

```sql
CREATE TABLE payments (
  id                        INT PRIMARY KEY AUTO_INCREMENT,
  payment_id                VARCHAR(36) NOT NULL UNIQUE,  -- app-level UUID
  ride_id                   INT NOT NULL,
  rider_id                  INT NOT NULL,
  driver_id                 INT NOT NULL,
  stripe_payment_intent_id  VARCHAR(255) UNIQUE,
  stripe_charge_id          VARCHAR(255),
  amount_cents              INT NOT NULL,                 -- total charged
  platform_fee_cents        INT NOT NULL,                 -- app commission
  driver_amount_cents       INT NOT NULL,                 -- driver receives
  currency                  VARCHAR(3) DEFAULT 'usd',
  status                    ENUM('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded') DEFAULT 'pending',
  failure_reason            TEXT,
  payment_method_id         VARCHAR(255),
  idempotency_key           VARCHAR(255) UNIQUE,
  metadata                  JSON,
  paid_at                   TIMESTAMP NULL,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_ride_id (ride_id),
  INDEX idx_rider_id (rider_id),
  INDEX idx_driver_id (driver_id),
  INDEX idx_stripe_pi (stripe_payment_intent_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (rider_id) REFERENCES users(id),
  FOREIGN KEY (driver_id) REFERENCES users(id)
);
```

### transfers

```sql
CREATE TABLE transfers (
  id                    INT PRIMARY KEY AUTO_INCREMENT,
  payment_id            INT NOT NULL,
  stripe_transfer_id    VARCHAR(255) UNIQUE,
  driver_id             INT NOT NULL,
  amount_cents          INT NOT NULL,
  status                ENUM('pending', 'paid', 'failed', 'reversed') DEFAULT 'pending',
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_payment_id (payment_id),
  INDEX idx_driver_id (driver_id),
  FOREIGN KEY (payment_id) REFERENCES payments(id),
  FOREIGN KEY (driver_id) REFERENCES users(id)
);
```

### refunds

```sql
CREATE TABLE refunds (
  id                    INT PRIMARY KEY AUTO_INCREMENT,
  refund_id             VARCHAR(36) NOT NULL UNIQUE,
  payment_id            INT NOT NULL,
  ride_id               INT NOT NULL,
  stripe_refund_id      VARCHAR(255) UNIQUE,
  amount_cents          INT NOT NULL,
  reason                ENUM('rider_cancelled', 'driver_cancelled', 'wrong_route', 'overcharge', 'safety_issue', 'other') NOT NULL,
  status                ENUM('pending', 'succeeded', 'failed') DEFAULT 'pending',
  initiated_by          ENUM('rider', 'driver', 'support', 'system') NOT NULL,
  notes                 TEXT,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_payment_id (payment_id),
  INDEX idx_ride_id (ride_id),
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);
```

### webhook_events

```sql
CREATE TABLE webhook_events (
  id                    INT PRIMARY KEY AUTO_INCREMENT,
  stripe_event_id       VARCHAR(255) NOT NULL UNIQUE,   -- idempotency
  event_type            VARCHAR(100) NOT NULL,
  stripe_object_id      VARCHAR(255),                   -- pi_xxx, ch_xxx, etc.
  status                ENUM('received', 'processing', 'processed', 'failed') DEFAULT 'received',
  payload               JSON NOT NULL,
  error_message         TEXT,
  attempts              INT DEFAULT 0,
  processed_at          TIMESTAMP NULL,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_event_id (stripe_event_id),
  INDEX idx_event_type (event_type),
  INDEX idx_status (status),
  INDEX idx_object_id (stripe_object_id)
);
```

### Relationships

```
users 1──1 stripe_customers
users 1──1 connected_accounts
users 1──N payment_methods
rides 1──1 payments
payments 1──1 transfers
payments 1──N refunds
```

---

## 4. BACKEND API DESIGN

### RIDER Endpoints

#### POST /api/stripe/customer

```typescript
// Creates Stripe customer for rider
// Called once during rider registration

// Request: (uses authenticated user from session)
// No body needed — uses ctx.user

// Response:
{
  customerId: "cus_xxxxx",
  created: true
}

// tRPC:
createCustomer: protectedProcedure.mutation(async ({ ctx }) => {
  // Check if already exists
  const existing = await db.query.stripeCustomers.findFirst({
    where: eq(stripeCustomers.userId, ctx.user.id),
  });
  if (existing) return { customerId: existing.stripeCustomerId, created: false };

  const user = await getUserById(ctx.user.id);
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    phone: user.phone,
    metadata: { userId: String(ctx.user.id), platform: 'rideshare' },
  });

  await db.insert(stripeCustomers).values({
    userId: ctx.user.id,
    stripeCustomerId: customer.id,
  });

  return { customerId: customer.id, created: true };
})
```

#### POST /api/stripe/setup-intent

```typescript
// Creates SetupIntent for saving a card
// Returns client_secret for Stripe SDK

// Response:
{
  clientSecret: "seti_xxxxx_secret_xxxxx",
  setupIntentId: "seti_xxxxx"
}

// tRPC:
createSetupIntent: protectedProcedure.mutation(async ({ ctx }) => {
  const stripeCustomer = await getStripeCustomer(ctx.user.id);
  if (!stripeCustomer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Create Stripe customer first' });

  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomer.stripeCustomerId,
    usage: 'off_session',
    automatic_payment_methods: { enabled: true },
    metadata: { userId: String(ctx.user.id) },
  });

  return {
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
  };
})
```

#### GET /api/stripe/payment-methods

```typescript
// Lists rider's saved payment methods

// Response:
{
  paymentMethods: [
    {
      id: "pm_xxxxx",
      type: "card",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2027,
      isDefault: true
    }
  ]
}

// tRPC:
listPaymentMethods: protectedProcedure.query(async ({ ctx }) => {
  const methods = await db.query.paymentMethods.findMany({
    where: and(
      eq(paymentMethods.userId, ctx.user.id),
      eq(paymentMethods.isActive, true),
    ),
    orderBy: desc(paymentMethods.createdAt),
  });

  return {
    paymentMethods: methods.map(m => ({
      id: m.stripePmId,
      type: m.type,
      brand: m.cardBrand,
      last4: m.cardLast4,
      expMonth: m.cardExpMonth,
      expYear: m.cardExpYear,
      isDefault: m.isDefault,
    })),
  };
})
```

#### POST /api/stripe/set-default-payment-method

```typescript
// Input:
{ paymentMethodId: "pm_xxxxx" }

// Response:
{ success: true }

// tRPC:
setDefaultPaymentMethod: protectedProcedure
  .input(z.object({ paymentMethodId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Verify ownership
    const pm = await db.query.paymentMethods.findFirst({
      where: and(
        eq(paymentMethods.userId, ctx.user.id),
        eq(paymentMethods.stripePmId, input.paymentMethodId),
      ),
    });
    if (!pm) throw new TRPCError({ code: 'NOT_FOUND' });

    // Unset all defaults
    await db.update(paymentMethods)
      .set({ isDefault: false })
      .where(eq(paymentMethods.userId, ctx.user.id));

    // Set new default
    await db.update(paymentMethods)
      .set({ isDefault: true })
      .where(eq(paymentMethods.id, pm.id));

    // Update Stripe customer default
    const stripeCustomer = await getStripeCustomer(ctx.user.id);
    await stripe.customers.update(stripeCustomer.stripeCustomerId, {
      invoice_settings: { default_payment_method: input.paymentMethodId },
    });

    return { success: true };
  })
```

### DRIVER Endpoints

#### POST /api/stripe/connect/create-account

```typescript
// Creates Stripe Connect Express account for driver

// Response:
{
  accountId: "acct_xxxxx",
  onboardingUrl: "https://connect.stripe.com/setup/e/xxxxx"
}

// tRPC:
createConnectedAccount: protectedProcedure.mutation(async ({ ctx }) => {
  const existing = await db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.userId, ctx.user.id),
  });
  if (existing) {
    // Return fresh onboarding link if not complete
    if (!existing.onboardingComplete) {
      const link = await stripe.accountLinks.create({
        account: existing.stripeAccountId,
        refresh_url: `${APP_URL}/driver/onboarding/refresh`,
        return_url: `${APP_URL}/driver/onboarding/complete`,
        type: 'account_onboarding',
      });
      return { accountId: existing.stripeAccountId, onboardingUrl: link.url };
    }
    return { accountId: existing.stripeAccountId, onboardingUrl: null };
  }

  const user = await getUserById(ctx.user.id);
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: user.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',
    individual: { email: user.email },
    metadata: { userId: String(ctx.user.id), platform: 'rideshare' },
  });

  await db.insert(connectedAccounts).values({
    userId: ctx.user.id,
    stripeAccountId: account.id,
  });

  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${APP_URL}/driver/onboarding/refresh`,
    return_url: `${APP_URL}/driver/onboarding/complete`,
    type: 'account_onboarding',
  });

  return { accountId: account.id, onboardingUrl: link.url };
})
```

#### GET /api/stripe/connect/status

```typescript
// Response:
{
  accountId: "acct_xxxxx",
  chargesEnabled: true,
  payoutsEnabled: true,
  onboardingComplete: true,
  requiresAction: false,
  dashboardUrl: "https://connect.stripe.com/express/xxxxx"
}

// tRPC:
getConnectedAccountStatus: protectedProcedure.query(async ({ ctx }) => {
  const acct = await db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.userId, ctx.user.id),
  });
  if (!acct) return null;

  const stripeAcct = await stripe.accounts.retrieve(acct.stripeAccountId);

  // Sync DB with Stripe
  if (stripeAcct.charges_enabled !== acct.chargesEnabled ||
      stripeAcct.payouts_enabled !== acct.payoutsEnabled) {
    await db.update(connectedAccounts)
      .set({
        chargesEnabled: stripeAcct.charges_enabled,
        payoutsEnabled: stripeAcct.payouts_enabled,
        detailsSubmitted: stripeAcct.details_submitted,
        onboardingComplete: stripeAcct.charges_enabled && stripeAcct.payouts_enabled,
      })
      .where(eq(connectedAccounts.id, acct.id));
  }

  // Generate dashboard link for onboarded drivers
  let dashboardUrl = null;
  if (stripeAcct.charges_enabled) {
    const loginLink = await stripe.accounts.createLoginLink(acct.stripeAccountId);
    dashboardUrl = loginLink.url;
  }

  return {
    accountId: acct.stripeAccountId,
    chargesEnabled: stripeAcct.charges_enabled,
    payoutsEnabled: stripeAcct.payouts_enabled,
    onboardingComplete: stripeAcct.charges_enabled && stripeAcct.payouts_enabled,
    requiresAction: stripeAcct.requirements?.currently_due?.length > 0,
    dashboardUrl,
  };
})
```

### PAYMENT Endpoints

#### POST /api/payments/charge-ride

```typescript
// Input:
{
  rideId: "ride_xxxxx",
  tipAmountCents: 200  // optional
}

// Response:
{
  paymentId: "pay_xxxxx",
  stripePaymentIntentId: "pi_xxxxx",
  amountCents: 2200,
  platformFeeCents: 330,
  driverAmountCents: 1870,
  status: "succeeded"
}

// tRPC:
chargeRide: protectedProcedure
  .input(z.object({
    rideId: z.string(),
    tipAmountCents: z.number().int().min(0).default(0),
  }))
  .mutation(async ({ ctx, input }) => {
    // 1. Load ride
    const ride = await getRideByRideId(input.rideId);
    if (!ride) throw new TRPCError({ code: 'NOT_FOUND' });
    if (ride.status !== 'completed') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ride not completed' });

    // 2. Check for existing payment (idempotency)
    const existingPayment = await db.query.payments.findFirst({
      where: eq(payments.rideId, ride.id),
    });
    if (existingPayment?.status === 'succeeded') {
      return existingPayment; // already charged
    }

    // 3. Get rider's Stripe customer + default payment method
    const riderStripe = await getStripeCustomer(ride.riderId);
    if (!riderStripe) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Rider has no payment setup' });
    const pmId = riderStripe.defaultPaymentMethodId;
    if (!pmId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No default payment method' });

    // 4. Get driver's connected account
    const driverAcct = await db.query.connectedAccounts.findFirst({
      where: eq(connectedAccounts.userId, ride.driverId),
    });
    if (!driverAcct?.chargesEnabled) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Driver not payment-ready' });

    // 5. Calculate amounts
    const fareCents = Math.round(Number(ride.totalFare) * 100);
    const totalCents = fareCents + input.tipAmountCents;
    const PLATFORM_FEE_PERCENT = 0.15; // 15%
    const platformFeeCents = Math.round(fareCents * PLATFORM_FEE_PERCENT); // fee on fare only, not tip
    const driverAmountCents = totalCents - platformFeeCents;

    // 6. Idempotency key
    const idempotencyKey = `ride_${input.rideId}_charge_v1`;

    // 7. Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: riderStripe.stripeCustomerId,
      payment_method: pmId,
      off_session: true,
      confirm: true,
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: driverAcct.stripeAccountId,
      },
      metadata: {
        rideId: input.rideId,
        riderId: String(ride.riderId),
        driverId: String(ride.driverId),
        fareCents: String(fareCents),
        tipCents: String(input.tipAmountCents),
      },
    }, {
      idempotencyKey,
    });

    // 8. Store in DB
    const paymentId = genId('pay');
    await db.insert(payments).values({
      paymentId,
      rideId: ride.id,
      riderId: ride.riderId,
      driverId: ride.driverId,
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: paymentIntent.latest_charge as string,
      amountCents: totalCents,
      platformFeeCents,
      driverAmountCents,
      status: paymentIntent.status === 'succeeded' ? 'succeeded' : 'processing',
      paymentMethodId: pmId,
      idempotencyKey,
      paidAt: paymentIntent.status === 'succeeded' ? new Date() : null,
    });

    return {
      paymentId,
      stripePaymentIntentId: paymentIntent.id,
      amountCents: totalCents,
      platformFeeCents,
      driverAmountCents,
      status: paymentIntent.status,
    };
  })
```

#### POST /api/payments/refund

```typescript
// Input:
{
  rideId: "ride_xxxxx",
  amountCents: 1000,        // omit for full refund
  reason: "driver_cancelled"
}

// Response:
{
  refundId: "ref_xxxxx",
  stripeRefundId: "re_xxxxx",
  amountCents: 1000,
  status: "succeeded"
}

// tRPC:
refundPayment: protectedProcedure
  .input(z.object({
    rideId: z.string(),
    amountCents: z.number().int().min(0).optional(), // omit = full
    reason: z.enum(['rider_cancelled', 'driver_cancelled', 'wrong_route', 'overcharge', 'safety_issue', 'other']),
  }))
  .mutation(async ({ ctx, input }) => {
    const ride = await getRideByRideId(input.rideId);
    if (!ride) throw new TRPCError({ code: 'NOT_FOUND' });

    const payment = await db.query.payments.findFirst({
      where: and(eq(payments.rideId, ride.id), eq(payments.status, 'succeeded')),
    });
    if (!payment) throw new TRPCError({ code: 'NOT_FOUND', message: 'No successful payment found' });

    const refundAmount = input.amountCents ?? payment.amountCents;

    const stripeRefund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId!,
      amount: refundAmount,
      reason: 'requested_by_customer',
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: { rideId: input.rideId, reason: input.reason },
    });

    const refundId = genId('ref');
    await db.insert(refunds).values({
      refundId,
      paymentId: payment.id,
      rideId: ride.id,
      stripeRefundId: stripeRefund.id,
      amountCents: refundAmount,
      reason: input.reason,
      status: stripeRefund.status === 'succeeded' ? 'succeeded' : 'pending',
      initiatedBy: 'system',
    });

    // Update payment status
    const newStatus = refundAmount >= payment.amountCents ? 'refunded' : 'partially_refunded';
    await db.update(payments).set({ status: newStatus }).where(eq(payments.id, payment.id));

    return {
      refundId,
      stripeRefundId: stripeRefund.id,
      amountCents: refundAmount,
      status: stripeRefund.status,
    };
  })
```

### WEBHOOK Endpoint

```typescript
// POST /api/webhooks/stripe (raw body, no auth middleware)

app.post('/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return res.status(400).send('Invalid signature');
    }

    // Idempotency: check if already processed
    const existing = await db.query.webhookEvents.findFirst({
      where: eq(webhookEvents.stripeEventId, event.id),
    });
    if (existing?.status === 'processed') {
      return res.json({ received: true, duplicate: true });
    }

    // Store event
    await db.insert(webhookEvents).values({
      stripeEventId: event.id,
      eventType: event.type,
      stripeObjectId: (event.data.object as any).id,
      payload: event.data.object,
      status: 'received',
    }).onDuplicateKeyUpdate({ set: { attempts: sql`attempts + 1` } });

    // Process async (don't block webhook response)
    processWebhookEvent(event).catch(err => {
      console.error(`Failed to process webhook ${event.id}:`, err);
    });

    res.json({ received: true });
  }
);
```

---

## 5. STRIPE IMPLEMENTATION DETAILS

### Creating Customer

```typescript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-12-18.acacia' });

async function createStripeCustomer(user: { id: number; email: string; name: string; phone?: string }) {
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    phone: user.phone ?? undefined,
    metadata: {
      userId: String(user.id),
      platform: 'rideshare',
      env: process.env.NODE_ENV ?? 'development',
    },
  });
  return customer;
}
```

### Creating Connected Account

```typescript
async function createConnectedAccount(driver: { id: number; email: string; name: string }) {
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: driver.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',
    individual: {
      email: driver.email,
      first_name: driver.name.split(' ')[0],
      last_name: driver.name.split(' ').slice(1).join(' ') || undefined,
    },
    settings: {
      payouts: {
        schedule: { interval: 'daily' },  // drivers get paid daily
      },
    },
    metadata: {
      userId: String(driver.id),
      platform: 'rideshare',
    },
  });
  return account;
}
```

### Onboarding Link

```typescript
async function createOnboardingLink(stripeAccountId: string) {
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${APP_URL}/driver/onboarding?refresh=true`,
    return_url: `${APP_URL}/driver/onboarding?complete=true`,
    type: 'account_onboarding',
    collect: 'eventually_due',  // collect all info upfront
  });
  return link.url;  // expires in ~5 minutes, generate fresh each time
}
```

### SetupIntent

```typescript
async function createSetupIntent(stripeCustomerId: string, userId: number) {
  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    usage: 'off_session',  // CRITICAL: allows charging later without rider present
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',  // mobile app — no redirect-based methods
    },
    metadata: { userId: String(userId) },
  });
  return {
    clientSecret: setupIntent.client_secret!,
    id: setupIntent.id,
  };
}
```

### PaymentIntent with Destination Charge

```typescript
async function chargeRide(params: {
  amountCents: number;
  platformFeeCents: number;
  stripeCustomerId: string;
  paymentMethodId: string;
  driverStripeAccountId: string;
  rideId: string;
  riderId: number;
  driverId: number;
}) {
  const paymentIntent = await stripe.paymentIntents.create({
    // Core
    amount: params.amountCents,
    currency: 'usd',

    // Charge the rider's saved card
    customer: params.stripeCustomerId,
    payment_method: params.paymentMethodId,
    off_session: true,          // rider is not actively in app
    confirm: true,              // charge immediately

    // Marketplace split
    application_fee_amount: params.platformFeeCents,  // platform keeps this
    transfer_data: {
      destination: params.driverStripeAccountId,      // driver gets remainder
    },

    // Metadata for reconciliation
    metadata: {
      rideId: params.rideId,
      riderId: String(params.riderId),
      driverId: String(params.driverId),
    },

    // Receipt
    description: `RideShare ride ${params.rideId}`,
    statement_descriptor_suffix: 'RIDESHARE',
  }, {
    // Prevents double-charging if network retries
    idempotencyKey: `charge_ride_${params.rideId}`,
  });

  return paymentIntent;
}
```

### How the Fee Split Works

```
Rider charged:              $20.00 (2000 cents)
application_fee_amount:      $3.00  (300 cents)  → Platform receives this
transfer_data.destination:  $17.00 (1700 cents)  → Driver connected account

Stripe processing fee:       $0.88 (2.9% + $0.30)
Deducted from:              application_fee_amount

Platform net revenue:        $3.00 - $0.88 = $2.12
Driver net:                 $17.00 (paid out to bank daily)
```

---

## 6. REACT NATIVE IMPLEMENTATION

### Install SDK

```bash
npx expo install @stripe/stripe-react-native
```

### App Setup (in _layout.tsx)

```typescript
import { StripeProvider } from '@stripe/stripe-react-native';

function RootLayout() {
  return (
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}
      merchantIdentifier="merchant.com.rideshare" // Apple Pay
    >
      <App />
    </StripeProvider>
  );
}
```

### Save Card (SetupIntent Flow)

```typescript
import { useStripe } from '@stripe/stripe-react-native';

function AddCardScreen() {
  const { confirmSetupIntent } = useStripe();
  const createSetupIntent = trpc.stripe.createSetupIntent.useMutation();

  const handleAddCard = async () => {
    // 1. Get client_secret from backend
    const { clientSecret } = await createSetupIntent.mutateAsync();

    // 2. Confirm with Stripe SDK (opens card input sheet)
    const { error, setupIntent } = await confirmSetupIntent(clientSecret, {
      paymentMethodType: 'Card',
    });

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    if (setupIntent?.status === 'Succeeded') {
      Alert.alert('Success', 'Card saved successfully');
      // Backend webhook will store the payment method
    }
  };
}
```

### Card Input with CardField

```typescript
import { CardField, useStripe } from '@stripe/stripe-react-native';

function CardInputScreen() {
  const { confirmSetupIntent } = useStripe();
  const [cardComplete, setCardComplete] = useState(false);

  return (
    <View>
      <CardField
        postalCodeEnabled={true}
        placeholders={{ number: '4242 4242 4242 4242' }}
        cardStyle={{
          backgroundColor: '#FFFFFF',
          textColor: '#000000',
          borderColor: '#E0E0E0',
          borderWidth: 1,
          borderRadius: 8,
          fontSize: 16,
        }}
        style={{ width: '100%', height: 50, marginVertical: 16 }}
        onCardChange={(details) => setCardComplete(details.complete)}
      />
      <TouchableOpacity
        disabled={!cardComplete}
        onPress={handleAddCard}
      >
        <Text>Save Card</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### Apple Pay / Google Pay

```typescript
import { useApplePay, useGooglePay } from '@stripe/stripe-react-native';

function PaymentScreen({ fareCents }: { fareCents: number }) {
  const { presentApplePay, confirmApplePayPayment, isApplePaySupported } = useApplePay();
  const { initGooglePay, presentGooglePay, isGooglePaySupported } = useGooglePay();

  const handleApplePay = async () => {
    const { error } = await presentApplePay({
      cartItems: [{ label: 'RideShare Ride', amount: String(fareCents / 100) }],
      country: 'US',
      currency: 'USD',
    });
    if (error) return;

    // Get PaymentIntent from backend
    const { clientSecret } = await chargeRideMutation.mutateAsync({ ... });
    const { error: confirmError } = await confirmApplePayPayment(clientSecret);

    if (confirmError) {
      Alert.alert('Payment failed', confirmError.message);
    } else {
      Alert.alert('Payment successful');
    }
  };
}
```

### Error Handling

```typescript
const handlePaymentError = (error: StripeError) => {
  switch (error.code) {
    case 'Canceled':
      // User cancelled — do nothing
      break;
    case 'Failed':
      if (error.declineCode === 'insufficient_funds') {
        Alert.alert('Insufficient funds', 'Please try a different card');
      } else if (error.declineCode === 'expired_card') {
        Alert.alert('Card expired', 'Please update your card details');
      } else {
        Alert.alert('Payment failed', 'Please try again or use a different card');
      }
      break;
    case 'Timeout':
      Alert.alert('Timeout', 'Payment is still processing. We will notify you.');
      break;
    default:
      Alert.alert('Error', error.message ?? 'Something went wrong');
  }
};
```

---

## 7. WEBHOOK DESIGN

### Required Events

| Event | When | Action |
|-------|------|--------|
| `payment_intent.succeeded` | Ride charge succeeds | Mark payment as succeeded, notify rider & driver |
| `payment_intent.payment_failed` | Ride charge fails | Mark payment as failed, retry or notify rider |
| `charge.refunded` | Refund processed | Update refund status, notify rider |
| `setup_intent.succeeded` | Card saved | Store payment method in DB |
| `account.updated` | Driver onboarding changes | Update onboarding status |
| `payout.paid` | Driver bank transfer lands | Update driver earnings log |
| `payout.failed` | Driver bank transfer fails | Alert driver, flag for support |
| `payment_method.detached` | Card removed from customer | Mark inactive in DB |

### Webhook Processor

```typescript
async function processWebhookEvent(event: Stripe.Event) {
  const eventId = event.id;

  try {
    await db.update(webhookEvents)
      .set({ status: 'processing' })
      .where(eq(webhookEvents.stripeEventId, eventId));

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case 'setup_intent.succeeded':
        await handleSetupIntentSucceeded(event.data.object as Stripe.SetupIntent);
        break;

      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      case 'payout.paid':
        await handlePayoutPaid(event.data.object as Stripe.Payout);
        break;

      case 'payout.failed':
        await handlePayoutFailed(event.data.object as Stripe.Payout);
        break;

      case 'payment_method.detached':
        await handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod);
        break;

      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    await db.update(webhookEvents)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(webhookEvents.stripeEventId, eventId));

  } catch (error) {
    await db.update(webhookEvents)
      .set({ status: 'failed', errorMessage: String(error) })
      .where(eq(webhookEvents.stripeEventId, eventId));
    throw error;
  }
}
```

### Handler: setup_intent.succeeded

```typescript
async function handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent) {
  const pmId = setupIntent.payment_method as string;
  const customerId = setupIntent.customer as string;
  const userId = Number(setupIntent.metadata.userId);

  // Fetch full payment method details from Stripe
  const pm = await stripe.paymentMethods.retrieve(pmId);

  // Check if already stored
  const existing = await db.query.paymentMethods.findFirst({
    where: eq(paymentMethods.stripePmId, pmId),
  });
  if (existing) return;

  // Check if user has any existing payment methods
  const existingMethods = await db.query.paymentMethods.findMany({
    where: and(eq(paymentMethods.userId, userId), eq(paymentMethods.isActive, true)),
  });
  const isFirst = existingMethods.length === 0;

  await db.insert(paymentMethods).values({
    userId,
    stripePmId: pmId,
    type: pm.type === 'card' ? 'card' : 'card', // extend for apple_pay etc.
    cardBrand: pm.card?.brand ?? null,
    cardLast4: pm.card?.last4 ?? null,
    cardExpMonth: pm.card?.exp_month ?? null,
    cardExpYear: pm.card?.exp_year ?? null,
    isDefault: isFirst, // first card is default
  });

  // Set as default on Stripe customer too
  if (isFirst) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pmId },
    });
    await db.update(stripeCustomers)
      .set({ defaultPaymentMethodId: pmId })
      .where(eq(stripeCustomers.stripeCustomerId, customerId));
  }
}
```

### Idempotency

```typescript
// Every webhook handler must be idempotent:
// 1. Check webhook_events table — skip if already processed
// 2. Use database transactions for multi-step updates
// 3. Use Stripe event.id as unique key (never process same event twice)
// 4. Always check current state before modifying (e.g., don't mark "succeeded" if already "refunded")

async function handlePaymentSucceeded(pi: Stripe.PaymentIntent) {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.stripePaymentIntentId, pi.id),
  });

  // Guard: already processed or doesn't exist
  if (!payment) return;
  if (payment.status === 'succeeded') return; // idempotent
  if (payment.status === 'refunded') return;  // don't override refund

  await db.update(payments)
    .set({ status: 'succeeded', paidAt: new Date(), stripeChargeId: pi.latest_charge as string })
    .where(eq(payments.id, payment.id));
}
```

---

## 8. FAILURE HANDLING

### Payment Fails at Ride Completion

```typescript
async function handlePaymentFailure(rideId: string, error: Stripe.StripeError) {
  // 1. Log the failure
  await db.update(payments)
    .set({ status: 'failed', failureReason: error.message })
    .where(eq(payments.rideId, rideId));

  // 2. Determine retry strategy
  const retryableDeclineCodes = ['insufficient_funds', 'processing_error', 'try_again_later'];

  if (retryableDeclineCodes.includes(error.decline_code ?? '')) {
    // Schedule retry in 1 hour, then 4 hours, then 24 hours
    await schedulePaymentRetry(rideId, { attempt: 1, maxAttempts: 3 });
  } else {
    // Non-retryable: expired card, stolen card, etc.
    // Notify rider to update payment method
    await notifyRider(rideId, 'payment_failed', {
      message: 'Your ride payment failed. Please update your payment method.',
      action: 'update_payment_method',
    });
  }
}
```

### Retry Logic

```typescript
async function retryRidePayment(rideId: string, attempt: number) {
  const MAX_ATTEMPTS = 3;
  const ride = await getRideByRideId(rideId);
  if (!ride) return;

  try {
    // Try with a NEW idempotency key (different attempt)
    const result = await chargeRide({
      ...rideParams,
      idempotencyKey: `charge_ride_${rideId}_attempt_${attempt}`,
    });

    if (result.status === 'succeeded') {
      // Clear retry queue
      return;
    }
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      const delayMs = Math.pow(2, attempt) * 3600_000; // 1h, 4h, 16h
      await schedulePaymentRetry(rideId, { attempt: attempt + 1, delayMs });
    } else {
      // All retries exhausted — flag for manual review
      await flagForManualReview(rideId, 'payment_failed_all_retries');
      await notifyRider(rideId, 'payment_requires_action', {
        message: 'We were unable to process your payment. Please contact support.',
      });
    }
  }
}
```

### Driver Cancellation

```
1. If ride cancelled BEFORE pickup: no charge, no refund needed
2. If ride cancelled AFTER pickup but BEFORE start: charge cancellation fee ($5)
3. If ride cancelled DURING ride: charge for distance traveled
```

### Preventing Double Charges

```typescript
// ALWAYS use idempotency keys based on rideId
// Stripe deduplicates within 24 hours for same idempotency key
// Additionally, check DB before creating PaymentIntent:

const existing = await db.query.payments.findFirst({
  where: and(
    eq(payments.rideId, ride.id),
    inArray(payments.status, ['succeeded', 'processing']),
  ),
});
if (existing) {
  throw new TRPCError({ code: 'CONFLICT', message: 'Payment already exists for this ride' });
}
```

---

## 9. SECURITY

### Never Store Card Data

```
- Card numbers NEVER touch your server
- Stripe SDK tokenizes on client → sends token to Stripe
- You only store: pm_xxx ID, last4, brand, expiry
- PCI compliance level: SAQ-A (lowest, no card data handling)
```

### Webhook Signature Validation

```typescript
// ALWAYS verify webhook signatures — never skip this
const event = stripe.webhooks.constructEvent(
  req.body,          // raw body (not parsed JSON)
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET!,
);

// Express setup — MUST use raw body parser for webhook route:
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handler);
// NOT app.use(express.json()) for this route
```

### API Security

```typescript
// 1. All payment endpoints require authentication
// 2. Verify ownership: rider can only charge their own rides
// 3. Verify state: can only charge completed rides
// 4. Rate limit payment endpoints: 10 req/min per user
// 5. Never expose Stripe secret key to client
// 6. Use separate API keys for test vs production

// Ownership check example:
if (ride.riderId !== ctx.user.id && !ctx.user.isAdmin) {
  throw new TRPCError({ code: 'FORBIDDEN' });
}
```

### Fraud Prevention

```typescript
// 1. Authorization hold on ride request ($1 hold, cancel after verification)
// 2. Stripe Radar (built-in ML fraud detection) — enabled by default
// 3. Velocity checks:
//    - Max 5 rides per hour per rider
//    - Max $500/day per rider
//    - Flag new accounts with high-value rides
// 4. Address Verification (AVS) — enabled on Stripe Dashboard
// 5. 3D Secure for high-risk transactions:

const paymentIntent = await stripe.paymentIntents.create({
  ...params,
  payment_method_options: {
    card: {
      request_three_d_secure: 'automatic', // Stripe decides when to trigger
    },
  },
});
```

---

## 10. SCALING TO 100K USERS

### Database

```
- Connection pooling: use mysql2 pool (min: 5, max: 50)
- Index on: stripe_payment_intent_id, ride_id, user_id, status, created_at
- Partition payments table by month after 10M rows
- Read replicas for payment history queries
- Write primary for payment creation/updates
```

### Concurrent PaymentIntents

```
- Stripe handles 10,000+ concurrent PaymentIntents natively
- Your bottleneck is DB writes, not Stripe API
- Use database transactions for payment creation:
    BEGIN → check no existing payment → insert payment → COMMIT
- Use SELECT ... FOR UPDATE to prevent race conditions
```

### Webhook Processing

```
- Webhooks arrive async — don't block HTTP response
- Return 200 immediately, process in background
- Use a job queue (BullMQ + Redis) for webhook processing:
    webhook arrives → store in DB → enqueue job → return 200
    worker picks up job → processes → marks complete
- This handles:
    - Burst webhook delivery
    - Server restarts (jobs persist in Redis)
    - Retry on processing failure
```

```typescript
// Webhook queue setup
import { Queue, Worker } from 'bullmq';

const webhookQueue = new Queue('stripe-webhooks', { connection: redis });

// In webhook handler:
await webhookQueue.add('process', { eventId: event.id, type: event.type }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 1000,
});

// Worker:
const worker = new Worker('stripe-webhooks', async (job) => {
  const event = await db.query.webhookEvents.findFirst({
    where: eq(webhookEvents.stripeEventId, job.data.eventId),
  });
  if (!event || event.status === 'processed') return;
  await processWebhookEvent(JSON.parse(event.payload));
}, { connection: redis, concurrency: 10 });
```

### Rate Limiting

```typescript
// Per-user rate limits on payment endpoints:
// - createSetupIntent: 5/hour
// - chargeRide: 20/hour (mostly automated)
// - refund: 5/hour

// Global rate limits:
// - Stripe API: 100 req/s in live mode (request increase if needed)
// - Webhook endpoint: no limit (Stripe manages delivery rate)
```

---

## 11. STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 1: Foundation (Week 1)

```
1. Set up Stripe account (test mode)
2. Install stripe npm package on backend
3. Create Drizzle schema for all 8 payment tables
4. Run drizzle-kit push to create tables
5. Create stripe.ts service file with Stripe client init
6. Implement: createStripeCustomer (auto-called on rider signup)
7. Implement: createConnectedAccount + onboarding link
8. Test: create customer, create account, complete onboarding in test mode
```

### Phase 2: Card Management (Week 2)

```
1. Install @stripe/stripe-react-native in app
2. Add StripeProvider to _layout.tsx
3. Implement: createSetupIntent backend endpoint
4. Build: AddCard screen with CardField component
5. Implement: setup_intent.succeeded webhook handler
6. Implement: listPaymentMethods, setDefaultPaymentMethod
7. Build: PaymentMethods screen (list, set default, remove)
8. Test: save card, list cards, set default
```

### Phase 3: Ride Payments (Week 3)

```
1. Implement: chargeRide endpoint (PaymentIntent with destination charge)
2. Wire into ride completion flow (driver taps "Complete")
3. Implement: payment_intent.succeeded webhook
4. Implement: payment_intent.payment_failed webhook
5. Build: ride receipt screen showing fare breakdown
6. Implement: retry logic for failed payments
7. Test end-to-end: complete ride → charge → verify split
```

### Phase 4: Refunds & Edge Cases (Week 4)

```
1. Implement: refundPayment endpoint
2. Implement: charge.refunded webhook
3. Build: refund request UI for riders
4. Implement: cancellation fee logic
5. Implement: tip flow (add tip after ride)
6. Handle: card declined, expired, insufficient funds
7. Test: refund flows, cancellation scenarios
```

### Phase 5: Production Hardening (Week 5)

```
1. Switch from test to live Stripe keys
2. Set up production webhook endpoint with HTTPS
3. Configure Stripe Radar rules
4. Add payment monitoring/alerting
5. Load test: simulate 1000 concurrent payments
6. Add admin dashboard for payment disputes
7. Set up Stripe Connect Express dashboard for drivers
8. Test with real $0.50 charges to verify end-to-end
```

### Phase 6: Scale & Monitor (Week 6)

```
1. Set up BullMQ webhook queue
2. Add payment analytics (daily revenue, failure rates)
3. Add automated reconciliation (compare Stripe vs DB)
4. Set up PagerDuty alerts for payment failures > 5%
5. Document runbooks for payment incidents
6. Train support team on Stripe Dashboard
```

---

## 12. COMMON MISTAKES TO AVOID

| # | Mistake | Why It's Bad | Fix |
|---|---------|--------------|-----|
| 1 | Charging before ride completion | Fare isn't final yet (surge, route change) | Only create PaymentIntent after ride ends |
| 2 | Storing raw card numbers | PCI violation, massive liability | Use Stripe tokens/PaymentMethods only |
| 3 | Skipping webhook handling | You won't know if payment actually succeeded | Always implement core webhooks |
| 4 | Not using idempotency keys | Double charges on network retries | `idempotencyKey: ride_${rideId}_charge` |
| 5 | Calculating fees on client | User can tamper with amounts | Calculate all fees server-side |
| 6 | Not validating webhook signatures | Anyone can fake webhook calls | Always use `constructEvent()` |
| 7 | Using `express.json()` for webhooks | Breaks signature verification | Use `express.raw()` for webhook route |
| 8 | Hardcoding fee percentages | Can't A/B test or change fees | Store in config/DB, not code |
| 9 | No retry for failed payments | Lost revenue from temporary failures | Implement exponential backoff retry |
| 10 | Letting drivers receive 100% | No revenue for your platform | Always set `application_fee_amount` |
| 11 | Not checking `charges_enabled` | Payment to unverified driver fails | Check before creating PaymentIntent |
| 12 | Missing `off_session: true` | Payment fails if rider closed app | Always set for post-ride charges |
| 13 | Same idempotency key for retries | Stripe returns cached first result | Use `ride_${id}_attempt_${n}` |
| 14 | Not handling `requires_action` | 3D Secure payments hang forever | Handle SCA in app with confirmPayment |

---

## 13. FINAL OUTPUT

### Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                    RIDESHARE APP                         │
├───────────────┬─────────────────┬───────────────────────┤
│  React Native │   Node Backend  │      MySQL DB          │
│  (Stripe SDK) │  (Stripe Node)  │  (Drizzle ORM)        │
│               │                 │                        │
│  CardField    │  /stripe/*      │  stripe_customers      │
│  ApplePay     │  /payments/*    │  connected_accounts    │
│  GooglePay    │  /webhooks/*    │  payment_methods       │
│               │                 │  payments              │
│  SetupIntent  │  Stripe Connect │  transfers             │
│  confirm()    │  PaymentIntent  │  refunds               │
│               │  Webhooks       │  webhook_events        │
└───────┬───────┴────────┬────────┴──────────┬────────────┘
        │                │                   │
        ▼                ▼                   ▼
   ┌─────────┐    ┌────────────┐     ┌────────────┐
   │  Stripe  │    │   Redis    │     │  BullMQ    │
   │   API    │    │  (cache)   │     │  (queues)  │
   └─────────┘    └────────────┘     └────────────┘
```

### Payment Flow Diagram

```
RIDE REQUEST                        RIDE COMPLETION
    │                                     │
    ▼                                     ▼
[Validate PM exists]              [Calculate final fare]
    │                                     │
    ▼                                     ▼
[$1 auth hold]                    [Check idempotency]
    │                                     │
    ├── FAIL → Reject ride                ▼
    │                             [stripe.paymentIntents.create]
    ├── OK → Match driver          amount: $20.00
    │                              application_fee: $3.00
    ▼                              transfer_data.destination: acct_driver
[Cancel $1 hold]                          │
    │                              ┌──────┴──────┐
    ▼                              │             │
[Ride in progress]              SUCCESS       FAILED
    │                              │             │
    ▼                              ▼             ▼
[Driver completes] ──────► [Update DB]    [Retry queue]
                           [Notify both]  [Notify rider]
                                          [3 attempts]
                                               │
                                        ┌──────┴──────┐
                                     SUCCEEDS     ALL FAIL
                                        │             │
                                        ▼             ▼
                                   [Update DB]  [Manual review]
                                                [Support ticket]
```

### Production Readiness Checklist

```
ENV & KEYS
  [ ] STRIPE_SECRET_KEY (live) in env, not committed to git
  [ ] STRIPE_PUBLISHABLE_KEY (live) in app config
  [ ] STRIPE_WEBHOOK_SECRET (live) configured
  [ ] Test keys removed from production builds

DATABASE
  [ ] All 8 payment tables created with indexes
  [ ] Foreign keys and constraints in place
  [ ] Connection pooling configured (min 5, max 50)
  [ ] Backup strategy for payment data

STRIPE SETUP
  [ ] Live mode activated on Stripe Dashboard
  [ ] Stripe Connect enabled for your platform
  [ ] Webhook endpoint registered (HTTPS only)
  [ ] All 8 webhook events subscribed
  [ ] Stripe Radar enabled with default rules
  [ ] Statement descriptor set ("RIDESHARE")

BACKEND
  [ ] All payment endpoints behind authentication
  [ ] Idempotency keys on all PaymentIntent creates
  [ ] Webhook signature validation (constructEvent)
  [ ] Raw body parser on webhook route
  [ ] Retry logic for failed payments
  [ ] Error handling for all Stripe API calls
  [ ] Rate limiting on payment endpoints

FRONTEND
  [ ] StripeProvider wrapping app
  [ ] CardField for card input
  [ ] Apple Pay configured (merchant ID)
  [ ] Google Pay configured
  [ ] Error handling for all payment flows
  [ ] Loading states during payment processing

MONITORING
  [ ] Alert on payment failure rate > 5%
  [ ] Alert on webhook processing failures
  [ ] Daily reconciliation: Stripe balance vs DB
  [ ] Stripe Dashboard access for support team
  [ ] Logging for all payment events (no card data)

COMPLIANCE
  [ ] PCI SAQ-A self-assessment completed
  [ ] Privacy policy mentions payment processing
  [ ] Terms of service cover payment/refund policy
  [ ] Driver payout terms documented
  [ ] Tax reporting (1099) configured in Stripe Connect
```
