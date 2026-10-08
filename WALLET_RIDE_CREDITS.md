# Wallet Ride Credits System -- Design Document

## 1. Overview

The Ride Credits system is a promotional credit mechanism within the RideShare app that incentivizes shared ride usage. Credits are non-monetary, non-transferable, non-withdrawable tokens that can only be applied toward ride fares. They are earned by completing shared rides and expire after 14 days.

**Core Principles:**
- Credits are NOT real money; they are promotional incentives
- Cannot be withdrawn, transferred, or converted to cash
- Earned exclusively by completing shared rides
- Expire after 14 days from grant date
- Maximum 50% of any ride fare can be paid with credits
- Credits are deducted before the Stripe charge is created
- Immutable ledger-based audit trail
- FIFO expiry-priority redemption (earliest-expiring credits used first)

---

## 2. Credit Lifecycle

```
[Shared Ride Completed]
        |
        v
  +-----------+     14 days     +----------+
  |  PENDING  | ------------->  |  ACTIVE  |
  +-----------+   (instant)     +----------+
                                  |       |
                          +-------+       +--------+
                          |                        |
                    [Used on ride]          [14 days pass]
                          |                        |
                          v                        v
                  +----------------+        +-----------+
                  | PARTIALLY_USED |        |  EXPIRED  |
                  +----------------+        +-----------+
                          |
                    [Fully consumed]
                          |
                          v
                  +------------+
                  | FULLY_USED |
                  +------------+
```

Grant statuses: `pending` -> `active` -> `partially_used` | `fully_used` | `expired` | `reversed`

---

## 3. Credit Earning Rules

### Eligibility Requirements
- Ride mode MUST be `share` (solo rides do not earn credits)
- Ride status MUST be `completed`
- Ride fare MUST be >= $5.00 (500 cents)
- Ride distance MUST be >= 1.0 km
- Passenger must not have been flagged for abuse

### Credit Calculation Formula
```
creditAmountCents = min(
  floor(fareAmountCents * CREDIT_RATE),
  MAX_CREDIT_PER_RIDE_CENTS
)

Where:
  CREDIT_RATE = 0.10  (10% of fare)
  MAX_CREDIT_PER_RIDE_CENTS = 200  ($2.00)
```

### Examples
| Fare   | Calculation       | Credit Earned |
|--------|-------------------|---------------|
| $5.00  | 500 * 0.10 = 50   | $0.50         |
| $12.00 | 1200 * 0.10 = 120 | $1.20         |
| $25.00 | 2500 * 0.10 = 250 | $2.00 (capped)|
| $50.00 | 5000 * 0.10 = 500 | $2.00 (capped)|

### Velocity Limits
- Daily cap: $6.00 (600 cents) per user per calendar day
- Weekly cap: $20.00 (2000 cents) per user per rolling 7-day window
- Max active balance: $50.00 (5000 cents) total unredeemed credits

---

## 4. Credit Redemption Rules

### Application Constraints
- Maximum 50% of ride fare payable with credits
- Credits applied BEFORE Stripe charge is created
- Stripe is charged only the remaining amount after credit deduction
- Minimum Stripe charge: $0.50 (Stripe minimum)

### Redemption Formula
```
maxApplicable = min(
  availableCredits,
  floor(fareAmountCents * MAX_REDEEM_PERCENT / 100)
)

stripeChargeCents = fareAmountCents - creditsApplied

Where:
  MAX_REDEEM_PERCENT = 50
```

### Example: $20 Ride with $8.00 Credits Available
```
maxApplicable = min(800, floor(2000 * 50 / 100)) = min(800, 1000) = 800
creditsApplied = 800 ($8.00)
stripeChargeCents = 2000 - 800 = 1200 ($12.00)
```

### FIFO Expiry-Priority Redemption
Credits are consumed in order of earliest expiration first. This ensures grants about to expire are used before newer grants.

```sql
SELECT id, remainingCents, expiresAt
FROM credit_grants
WHERE userId = ? AND status IN ('active', 'partially_used') AND expiresAt > NOW()
ORDER BY expiresAt ASC
FOR UPDATE;
```

---

## 5. Credit Expiry

### Expiry Policy
- Credits expire 14 days after grant activation
- Expiry is checked hourly via a scheduled job
- Only `active` and `partially_used` grants can expire
- Reserved credits (held for an in-progress ride) do NOT expire until released
- Expired credits are permanently lost

### Expiry Cron Job
```sql
-- Run every hour
UPDATE credit_grants
SET status = 'expired',
    expiredAt = NOW(),
    remainingCents = 0
WHERE status IN ('active', 'partially_used')
  AND expiresAt <= NOW();

-- For each expired grant, update the user's wallet
UPDATE credit_wallets cw
INNER JOIN (
  SELECT userId, SUM(remainingCents) as expiredAmount
  FROM credit_grants
  WHERE expiredAt = [batch_timestamp]
  GROUP BY userId
) expired ON cw.userId = expired.userId
SET cw.availableBalance = cw.availableBalance - expired.expiredAmount,
    cw.totalExpired = cw.totalExpired + expired.expiredAmount;
```

---

## 6. Database Schema

### Table: `credit_wallets`
Aggregate balance tracking per user, separate from the main cash wallet.

| Column           | Type           | Description                          |
|------------------|----------------|--------------------------------------|
| id               | INT PK AUTO    | Primary key                          |
| userId           | INT UNIQUE     | FK to users.id                       |
| availableBalance | DECIMAL(10,2)  | Credits available for use            |
| reservedBalance  | DECIMAL(10,2)  | Credits reserved for active rides    |
| totalEarned      | DECIMAL(10,2)  | Lifetime credits earned              |
| totalRedeemed    | DECIMAL(10,2)  | Lifetime credits used                |
| totalExpired     | DECIMAL(10,2)  | Lifetime credits expired             |
| createdAt        | TIMESTAMP      | Record creation time                 |
| updatedAt        | TIMESTAMP      | Last update time                     |

### Table: `credit_grants`
Individual credit awards with expiry tracking.

| Column          | Type          | Description                                    |
|-----------------|---------------|------------------------------------------------|
| id              | INT PK AUTO   | Primary key                                    |
| grantId         | VARCHAR(36) UQ| UUID for external reference                    |
| userId          | INT           | FK to users.id                                 |
| rideId          | INT NULL      | FK to rides.id (ride that earned this credit)  |
| amountCents     | INT           | Original grant amount in cents                 |
| remainingCents  | INT           | Remaining unused amount in cents               |
| reason          | ENUM          | Why credit was granted                         |
| status          | ENUM          | pending/active/partially_used/fully_used/expired/reversed |
| expiresAt       | TIMESTAMP     | When this grant expires                        |
| activatedAt     | TIMESTAMP     | When grant became active                       |
| fullyUsedAt     | TIMESTAMP     | When fully consumed                            |
| expiredAt       | TIMESTAMP     | When expired                                   |
| reversedAt      | TIMESTAMP     | When reversed (e.g., ride refund)              |
| idempotencyKey  | VARCHAR(255)  | Prevents duplicate grants                      |
| metadata        | JSON          | Additional context data                        |
| createdAt       | TIMESTAMP     | Record creation time                           |

Indexes: `(userId, status)`, `(expiresAt, status)`, `(rideId)`

### Table: `credit_redemptions`
Usage of credits against ride payments.

| Column          | Type          | Description                          |
|-----------------|---------------|--------------------------------------|
| id              | INT PK AUTO   | Primary key                          |
| redemptionId    | VARCHAR(36) UQ| UUID for external reference          |
| userId          | INT           | FK to users.id                       |
| rideId          | INT           | FK to rides.id                       |
| grantId         | INT           | FK to credit_grants.id               |
| amountCents     | INT           | Amount redeemed from this grant      |
| status          | ENUM          | reserved/applied/released/reversed   |
| reservedAt      | TIMESTAMP     | When credits were reserved           |
| appliedAt       | TIMESTAMP     | When applied after payment success   |
| releasedAt      | TIMESTAMP     | When released (payment failed)       |
| reversedAt      | TIMESTAMP     | When reversed                        |
| idempotencyKey  | VARCHAR(255)  | Prevents duplicate redemptions       |
| createdAt       | TIMESTAMP     | Record creation time                 |

### Table: `credit_ledger`
Immutable audit trail for all credit movements.

| Column              | Type          | Description                          |
|---------------------|---------------|--------------------------------------|
| id                  | INT PK AUTO   | Primary key                          |
| ledgerId            | VARCHAR(36) UQ| UUID for external reference          |
| userId              | INT           | FK to users.id                       |
| entryType           | ENUM          | Type of ledger entry                 |
| amountCents         | INT           | Signed amount (+grant, -redemption)  |
| balanceAfterCents   | INT           | Balance after this entry             |
| relatedGrantId      | INT NULL      | FK to credit_grants.id               |
| relatedRedemptionId | INT NULL      | FK to credit_redemptions.id          |
| relatedRideId       | INT NULL      | FK to rides.id                       |
| description         | TEXT          | Human-readable description           |
| metadata            | JSON          | Additional context                   |
| createdAt           | TIMESTAMP     | Entry creation time                  |

Entry types: `grant`, `redemption_reserve`, `redemption_apply`, `redemption_release`, `expiry`, `reversal`, `admin_credit`, `admin_debit`

### Table: `abuse_flags`
Tracks suspicious credit-related activity.

| Column       | Type          | Description                          |
|--------------|---------------|--------------------------------------|
| id           | INT PK AUTO   | Primary key                          |
| flagId       | VARCHAR(36) UQ| UUID for external reference          |
| userId       | INT           | FK to users.id                       |
| rideId       | INT NULL      | FK to rides.id                       |
| flagType     | ENUM          | Type of abuse detected               |
| severity     | ENUM          | low/medium/high/critical             |
| status       | ENUM          | open/investigating/resolved/dismissed|
| details      | JSON          | Evidence and context                 |
| actionTaken  | TEXT          | Resolution description               |
| resolvedBy   | INT NULL      | Admin who resolved                   |
| resolvedAt   | TIMESTAMP     | When resolved                        |
| createdAt    | TIMESTAMP     | When flagged                         |

---

## 7. Two-Phase Redemption Flow

Credits use a reserve-then-apply pattern to handle payment failures gracefully:

```
1. RESERVE  — User confirms ride -> credits moved from available to reserved
2. APPLY    — Stripe payment succeeds -> reserved credits become permanently used
3. RELEASE  — Stripe payment fails / ride cancelled -> reserved credits return to available
```

### Sequence Diagram
```
User        App Server        Credit Service       Stripe
 |            |                    |                  |
 |--confirm-->|                    |                  |
 |            |--reserveCredits--->|                  |
 |            |<--reserved OK------|                  |
 |            |                    |                  |
 |            |--chargeRide(fare - credits)---------->|
 |            |                    |                  |
 |            |<---------payment succeeded-----------|
 |            |--applyCredits----->|                  |
 |            |<--applied OK-------|                  |
 |            |                    |                  |
 |<--receipt--|                    |                  |
```

### Failure Path
```
 |            |<---------payment failed--------------|
 |            |--releaseCredits--->|                  |
 |            |<--released OK------|                  |
 |<--error----|                    |                  |
```

---

## 8. API Endpoints

### `walletCredits.getBalance`
Returns the user's credit wallet balance and metadata.

**Auth:** Protected (requires session)
**Input:** None
**Output:**
```typescript
{
  availableBalance: string;    // "12.50"
  reservedBalance: string;     // "0.00"
  totalEarned: string;         // "45.00"
  totalRedeemed: string;       // "30.00"
  totalExpired: string;        // "2.50"
  activeGrantsCount: number;   // 3
  nextExpiry: string | null;   // ISO date of earliest expiring grant
}
```

### `walletCredits.getLedger`
Returns paginated credit ledger entries.

**Auth:** Protected
**Input:** `{ limit: number (default 50), offset: number (default 0) }`
**Output:** `CreditLedgerEntry[]`

### `walletCredits.getActiveGrants`
Returns all active/partially-used grants with remaining amounts.

**Auth:** Protected
**Input:** None
**Output:**
```typescript
Array<{
  grantId: string;
  amountCents: number;
  remainingCents: number;
  reason: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}>
```

### `walletCredits.previewRedemption`
Calculates how much credit can be applied to a given fare.

**Auth:** Protected
**Input:** `{ fareAmountCents: number }`
**Output:**
```typescript
{
  creditsAvailable: number;    // total available cents
  maxApplicable: number;       // max cents applicable to this fare
  stripeChargeable: number;    // amount Stripe will charge
  fareTotal: number;           // original fare
}
```

### `walletCredits.reserveForRide`
Reserves credits for an upcoming ride payment.

**Auth:** Protected
**Input:** `{ rideId: number, amountCents: number }`
**Output:** `{ reserved: true, totalReserved: number, reservations: Redemption[] }`

### `walletCredits.releaseForRide`
Releases previously reserved credits (payment failed or ride cancelled).

**Auth:** Protected
**Input:** `{ rideId: number }`
**Output:** `{ released: true, totalReleased: number }`

---

## 9. Service Layer Architecture

### `walletCreditService.ts` Functions

| Function                  | Purpose                                           |
|---------------------------|---------------------------------------------------|
| `getOrCreateCreditWallet` | Lazy-create credit wallet for user                |
| `getCreditWalletBalance`  | Full balance snapshot with grant metadata          |
| `grantRideCredits`        | Award credits after shared ride completion         |
| `checkVelocityLimits`     | Verify daily/weekly caps                           |
| `previewCreditRedemption` | Calculate applicable credits for a fare            |
| `reserveCredits`          | Phase 1: Lock credits for ride payment             |
| `applyReservedCredits`    | Phase 2: Finalize after Stripe success             |
| `releaseReservedCredits`  | Rollback: Unlock credits after payment failure     |
| `expireCredits`           | Cron: Expire overdue grants                        |
| `reverseGrantForRide`     | Undo grant when ride is refunded                   |
| `checkAbuseFlags`         | Detect suspicious patterns                         |
| `adminAdjustCredits`      | Manual credit adjustment by admin                  |
| `getCreditLedger`         | Paginated ledger query                             |
| `getActiveGrants`         | List non-expired, non-used grants                  |

---

## 10. Concurrency and Transaction Safety

### Row-Level Locking
All credit mutations use `SELECT ... FOR UPDATE` within transactions to prevent double-spending:

```sql
BEGIN;
SELECT * FROM credit_grants
WHERE userId = ? AND status IN ('active', 'partially_used')
ORDER BY expiresAt ASC
FOR UPDATE;

-- Deduct from grants...
-- Update wallet balances...
-- Insert ledger entries...

COMMIT;
```

### Idempotency
Every grant and redemption has an `idempotencyKey`:
- Grant: `grant_ride_{rideId}_user_{userId}`
- Redemption: `redeem_ride_{rideId}_user_{userId}`

Duplicate requests with the same key return the existing result without creating new records.

### Race Condition Prevention
- Credit wallet updates use atomic SQL: `SET availableBalance = availableBalance - ?`
- Grants are locked before modification with `FOR UPDATE`
- Transaction isolation level: READ COMMITTED (MySQL default)

---

## 11. Idempotency Design

### Grant Idempotency
Each ride completion can only produce one credit grant per user. The idempotency key format is:
```
grant_shared_ride_{rideId}_user_{userId}
```

Before creating a new grant, the service checks:
```sql
SELECT id FROM credit_grants WHERE idempotencyKey = ?;
```

### Redemption Idempotency
Each ride payment can only reserve credits once:
```
redeem_ride_{rideId}_user_{userId}
```

### Benefits
- Safe to retry failed requests
- Webhook handlers can fire multiple times
- Network timeouts don't create duplicate credits

---

## 12. Integration with Stripe Payment Flow

### Modified Payment Sequence

```
1. User confirms ride booking
2. App calls walletCredits.previewRedemption({ fareAmountCents })
3. User sees "Pay $X with card, $Y with credits"
4. App calls walletCredits.reserveForRide({ rideId, amountCents: creditsToUse })
5. App calls stripe.chargeRide({ fareCents: fareTotal - creditsApplied })
6. On Stripe success: walletCredits.applyReservedCredits({ userId, rideId })
7. On Stripe failure: walletCredits.releaseForRide({ rideId })
```

### Stripe Charge Calculation
```typescript
const preview = await previewCreditRedemption({ userId, fareAmountCents });
const creditsToApply = preview.maxApplicable; // user can choose less
const stripeAmount = fareAmountCents - creditsToApply;

// Stripe minimum charge is $0.50 (50 cents)
if (stripeAmount < 50 && stripeAmount > 0) {
  // Reduce credits applied to ensure minimum Stripe charge
  creditsToApply = fareAmountCents - 50;
}
```

---

## 13. Anti-Abuse System

### Detection Rules

| Rule                    | Threshold                    | Severity | Action            |
|-------------------------|------------------------------|----------|-------------------|
| Min fare violation      | Fare < $5.00                 | medium   | Deny credits      |
| Min distance violation  | Distance < 1.0 km           | medium   | Deny credits      |
| Velocity limit exceeded | > $6/day or > $20/week      | low      | Cap credits       |
| Duplicate route         | Same pickup+dropoff in 24h   | high     | Flag for review   |
| Self-referral           | Referred own alt account     | critical | Suspend credits   |
| Multi-account           | Same device/IP, multiple accts| critical | Suspend all       |
| Suspicious pattern      | Algorithmic detection        | high     | Flag for review   |

### Duplicate Route Detection
```sql
SELECT COUNT(*) FROM rides r
JOIN ride_passengers rp ON r.id = rp.rideId
WHERE rp.passengerId = ?
  AND r.mode = 'share'
  AND r.status = 'completed'
  AND r.completedAt > NOW() - INTERVAL 24 HOUR
  AND ABS(r.pickupLat - ?) < 0.001   -- ~111m
  AND ABS(r.pickupLng - ?) < 0.001
  AND ABS(r.dropoffLat - ?) < 0.001
  AND ABS(r.dropoffLng - ?) < 0.001;
```

### Velocity Check
```sql
-- Daily check
SELECT COALESCE(SUM(amountCents), 0) as dailyTotal
FROM credit_grants
WHERE userId = ? AND createdAt > CURDATE()
  AND reason = 'shared_ride_completion';

-- Weekly check
SELECT COALESCE(SUM(amountCents), 0) as weeklyTotal
FROM credit_grants
WHERE userId = ? AND createdAt > NOW() - INTERVAL 7 DAY
  AND reason = 'shared_ride_completion';
```

---

## 14. Expiry Scheduling

### Cron Job: `expireCredits()`
- Runs every hour
- Processes grants in batches of 100 to avoid long-running transactions
- Each batch is its own transaction

```typescript
async function expireCredits(): Promise<number> {
  let totalExpired = 0;
  const batchSize = 100;

  while (true) {
    const batch = await db.select()
      .from(creditGrants)
      .where(and(
        inArray(creditGrants.status, ['active', 'partially_used']),
        lte(creditGrants.expiresAt, new Date())
      ))
      .limit(batchSize);

    if (batch.length === 0) break;

    await db.transaction(async (tx) => {
      for (const grant of batch) {
        // Update grant status
        // Reduce wallet balance
        // Create ledger entry
      }
    });

    totalExpired += batch.length;
  }

  return totalExpired;
}
```

---

## 15. Ledger Entry Format

Every credit movement creates an immutable ledger entry:

```typescript
{
  ledgerId: "uuid-v4",
  userId: 123,
  entryType: "grant",              // or redemption_reserve, etc.
  amountCents: 150,                // positive for credits in, negative for credits out
  balanceAfterCents: 1550,         // running balance after this entry
  relatedGrantId: 45,
  relatedRedemptionId: null,
  relatedRideId: 789,
  description: "Earned 10% credit from shared ride #789",
  metadata: {
    fareAmountCents: 1500,
    creditRate: 0.10,
    passengerCount: 2
  },
  createdAt: "2026-03-27T10:30:00Z"
}
```

### Entry Type Semantics

| Entry Type           | Amount Sign | Description                           |
|----------------------|-------------|---------------------------------------|
| grant                | +           | Credits awarded                       |
| redemption_reserve   | -           | Credits locked for ride payment       |
| redemption_apply     | 0           | Reserved credits finalized            |
| redemption_release   | +           | Reserved credits returned             |
| expiry               | -           | Credits expired                       |
| reversal             | -           | Grant reversed (ride refunded)        |
| admin_credit         | +           | Admin added credits                   |
| admin_debit          | -           | Admin removed credits                 |

---

## 16. Frontend Integration

### Wallet Screen
The existing wallet screen (`app/wallet.tsx`) is extended with a "Ride Credits" section:

- Green-themed credit balance card (distinct from blue cash wallet)
- "Earned from shared rides" subtitle
- Active credits list with expiry countdown
- "Not withdrawable - Use on rides only" disclaimer
- Recent credit activity (last 5 ledger entries)

### Ride Booking Flow
When booking a ride, the confirm screen shows:
```
Ride Fare:        $18.00
Credits Applied:  -$6.50  (green)
You Pay:          $11.50
```

### Ride Receipt Screen
After ride completion (`app/ride-receipt.tsx`) shows:
- Fare breakdown including credits applied
- Stripe charge amount
- Credits earned section (for shared rides)
- Celebration animation for newly earned credits

### API Hooks (React Native)
```typescript
// Get balance
const { data: creditBalance } = trpc.walletCredits.getBalance.useQuery();

// Preview redemption
const { data: preview } = trpc.walletCredits.previewRedemption.useQuery(
  { fareAmountCents: 1800 },
  { enabled: !!fareAmount }
);

// Reserve credits
const reserveMut = trpc.walletCredits.reserveForRide.useMutation();

// Release credits
const releaseMut = trpc.walletCredits.releaseForRide.useMutation();
```

---

## 17. Monitoring and Observability

### Key Metrics to Track
- Credits granted per hour/day/week
- Credits redeemed per hour/day/week
- Credits expired per hour/day/week
- Average credit balance per user
- Credit utilization rate (redeemed / granted)
- Abuse flags created per day
- Reserve-to-apply conversion rate
- Average time from grant to redemption
- Average time from grant to expiry

### Alerts
- Spike in credit grants (> 2x normal volume)
- High expiry rate (> 40% of grants expiring unused)
- Abuse flag surge (> 10 critical flags in 1 hour)
- Reserve timeout (credits reserved > 30 minutes without apply/release)
- Balance discrepancy (wallet balance != sum of active grant remainingCents)

### Health Check Query
```sql
-- Verify wallet balance consistency
SELECT
  cw.userId,
  cw.availableBalance * 100 as walletCents,
  COALESCE(SUM(cg.remainingCents), 0) as grantCents
FROM credit_wallets cw
LEFT JOIN credit_grants cg
  ON cw.userId = cg.userId
  AND cg.status IN ('active', 'partially_used')
GROUP BY cw.userId, cw.availableBalance
HAVING walletCents != grantCents;
-- Should return 0 rows
```

### Logging
All credit operations are logged with structured metadata:
```
[walletCredits] grant userId=123 rideId=789 amount=150 balance=1550
[walletCredits] reserve userId=123 rideId=790 amount=800 grants=[45,46]
[walletCredits] apply userId=123 rideId=790 amount=800
[walletCredits] expire grantId=42 userId=123 amount=200
[walletCredits] abuse flagType=duplicate_route userId=123 rideId=791
```
