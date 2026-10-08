# Complete Production-Grade RideShare App Implementation Guide

## Overview
This guide provides step-by-step implementation of ALL 11 features for a production-grade Uber-like RideShare app using Expo Router, Node/Express, tRPC, and PostgreSQL.

## Architecture
```
rideshare-app/
├── app/                    # Expo Router frontend
│   ├── (tabs)/            # Main app tabs
│   ├── auth/              # Auth screens
│   └── [feature screens]  # Feature screens
├── server/                # Node/Express backend
│   ├── routers.ts         # tRPC routers
│   ├── db.ts              # Database helpers
│   └── services/          # Business logic
├── lib/                   # Shared utilities
├── drizzle/               # Database schema
└── package.json
```

## Feature Implementation Checklist

### FEATURE 1: Authentication (Phone/Email/Google + OTP)
**Status:** ✅ READY TO IMPLEMENT

**Files to Create/Update:**
1. `lib/auth-context-v2.tsx` - Enhanced auth context ✅ DONE
2. `app/auth/sign-up.tsx` - Sign-up screen with OTP
3. `app/auth/sign-in.tsx` - Sign-in screen with OTP
4. `app/auth/verify-otp.tsx` - OTP verification screen
5. `server/routers.ts` - Add auth procedures (requestOtp, verifyOtp)

**Procedures:**
```typescript
// requestOtp({ method, destination, purpose })
// verifyOtp({ method, destination, code, purpose, firstName?, lastName? })
// signInWithGoogle(googleId, email, firstName, lastName)
// logout()
// me()
```

**Database Tables:**
- User (id, phone, email, googleId, firstName, lastName, role, createdAt)
- Session (id, userId, tokenHash, expiresAt)
- OTPCode (id, method, destination, codeHash, purpose, attempts, expiresAt)

---

### FEATURE 2: Safety Preferences & Seat Selection
**Status:** 🔄 IN PROGRESS

**UI Components:**
1. Safety preference section in booking sheet
2. Driver gender preference (No preference / Woman / Man)
3. Co-rider preference (No preference / Women-only / Men-only)
4. Seat selector (1-4 seats)
5. Ride cards showing "2 of 4 seats filled"
6. Gender restriction badges ("Women-only", "Men-only")
7. Filter toggles in booking sheet

**Database:**
- Add to RideRequest: `prefs JSON` (gender, coRiderPref, seatsRequested)
- Add to SharedRidePool: `restriction ENUM` (NONE, WOMEN_ONLY, MEN_ONLY)

---

### FEATURE 3: Booking for Someone Else
**Status:** 🔄 IN PROGRESS

**UI:**
- "Riding for: Me / Someone else" toggle
- Beneficiary name + phone input
- Show in driver view

**Database:**
- RideRequest: add `beneficiaryName`, `beneficiaryPhone`

---

### FEATURE 4: Real Maps Integration
**Status:** 🔄 IN PROGRESS

**Implementation:**
- Use react-native-maps or Mapbox
- Autocomplete for pickup/destination
- Route polyline visualization
- ETA and distance display

**Database:**
- RideRequest: `pickupLat`, `pickupLng`, `dropoffLat`, `dropoffLng`
- DriverLocation: `lat`, `lng`, `heading`, `updatedAt`

---

### FEATURE 5: Shared Ride Radius & On-Route Matching
**Status:** 🔄 IN PROGRESS

**Matching Logic:**
- Radius options: 0.1, 0.2, 0.5, 1.0 miles
- Pickup: within radius of start OR along route
- Dropoff: reasonably aligned with route
- Concurrency: Redis lock + transaction

**Database:**
- RideRequest: add `radiusMiles`
- SharedRidePool: add `routePolyline`

---

### FEATURE 6: Payments (Stripe Integration)
**Status:** 🔄 IN PROGRESS

**Implementation:**
- Add debit/credit card payment method
- Stripe test mode for dev
- Store payment tokens (never raw cards)
- Preauth on trip start, capture on completion
- Refunds on cancellation

**Database:**
- PaymentMethod (id, userId, provider, providerRef, last4, brand, expMonth, expYear)
- Payment (id, tripId, userId, providerIntentId, amountCents, status)

**Procedures:**
```typescript
// addPaymentMethod(setupIntentId)
// listPaymentMethods()
// removePaymentMethod(methodId)
// processPayment(tripId, methodId, amountCents)
```

---

### FEATURE 7: User Accounts & Profile Management
**Status:** 🔄 IN PROGRESS

**UI Screens:**
- User profile (name, email, phone, rating, stats)
- Trip history (past + upcoming)
- Saved places
- Payment methods
- Settings

**Database:**
- User (extended with profile data)
- SavedPlace (id, userId, label, lat, lng)
- UserStats (userId, totalRides, totalSpent, avgRating)

---

### FEATURE 8: Loyalty Points & Discounts
**Status:** 🔄 IN PROGRESS

**Rules:**
- Award 10 points per completed ride
- Milestones: 10 rides → 50% discount OR 1 free ride up to $10
- Tiers: 50%, 60%, 70% discounts
- Auditable, deterministic rules

**Database:**
- LoyaltyAccount (userId, points)
- LoyaltyLedger (id, userId, deltaPoints, reason, tripId, createdAt)
- BenefitGrant (id, userId, type, value, capCents, remainingUses, expiresAt)

**Procedures:**
```typescript
// awardPoints(userId, tripId, points)
// redeemDiscount(userId, discountType)
// getLoyaltyStatus(userId)
```

---

### FEATURE 9: Student Verification & Free Rides
**Status:** 🔄 IN PROGRESS

**Implementation:**
- Verify .edu email via OTP
- Grant 1-2 free rides up to $15
- One-time per user, audited
- Prevent abuse

**Database:**
- User: add `studentVerifiedAt`, `studentEmail`
- BenefitGrant: type = STUDENT_FREE_RIDE

**Procedures:**
```typescript
// verifyStudentEmail(email)
// getStudentBenefits(userId)
```

---

### FEATURE 10: Tips, Ratings, Complaints
**Status:** 🔄 IN PROGRESS

**UI Screens:**
- Post-ride rating (1-5 stars)
- Tip amount selector
- Feedback comments
- Report/complaint form

**Database:**
- Tip (id, tripId, userId, amountCents)
- Rating (id, tripId, raterId, rateeId, stars, comment)
- Report (id, tripId, reporterId, category, description, status)

**Procedures:**
```typescript
// tipTrip(tripId, amountCents)
// rateTrip(tripId, stars, comment)
// reportTrip(tripId, category, description)
```

---

### FEATURE 11: Driver License Verification
**Status:** 🔄 IN PROGRESS

**Flow:**
1. Driver uploads license photo
2. Admin reviews (PENDING → APPROVED/REJECTED)
3. Driver can only go online if approved
4. Audit trail for all actions

**Database:**
- DriverLicense (id, driverId, number, state, expiry, docUrl, status)
- Driver (id, userId, status, gender, ratingAvg, verifiedAt)

**Procedures:**
```typescript
// uploadDriverLicense(file, number, state, expiry)
// getDriverLicenseStatus(driverId)
// [ADMIN] approveDriverLicense(licenseId)
// [ADMIN] rejectDriverLicense(licenseId, reason)
```

---

## Implementation Order (Recommended)

1. **Auth** (Features 1) - Foundation
2. **User Accounts** (Feature 7) - Needed for all other features
3. **Safety Preferences & Seats** (Feature 2) - Core UX
4. **Real Maps** (Feature 4) - Core functionality
5. **Payments** (Feature 6) - Revenue
6. **Shared Ride Matching** (Feature 5) - Core feature
7. **Booking for Others** (Feature 3) - Enhancement
8. **Loyalty Points** (Feature 8) - Retention
9. **Student Verification** (Feature 9) - Growth
10. **Tips/Ratings/Complaints** (Feature 10) - Trust
11. **Driver License** (Feature 11) - Safety

---

## Database Schema (Prisma)

```prisma
// User
model User {
  id String @id @default(cuid())
  phone String? @unique
  email String? @unique
  googleId String? @unique
  firstName String
  lastName String
  role String @default("rider") // rider, driver, admin
  studentEmail String?
  studentVerifiedAt DateTime?
  createdAt DateTime @default(now())
  
  sessions Session[]
  rideRequests RideRequest[]
  trips Trip[]
  ratings Rating[]
  paymentMethods PaymentMethod[]
  loyaltyAccount LoyaltyAccount?
}

// Session
model Session {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id])
  tokenHash String @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
}

// OTPCode
model OTPCode {
  id String @id @default(cuid())
  method String // phone, email
  destination String
  codeHash String
  purpose String // login, signup, verify_email
  attempts Int @default(0)
  expiresAt DateTime
  createdAt DateTime @default(now())
}

// RideRequest
model RideRequest {
  id String @id @default(cuid())
  riderId String
  rider User @relation(fields: [riderId], references: [id])
  type String // SOLO, SHARED
  pickupLat Float
  pickupLng Float
  pickupAddress String
  dropoffLat Float
  dropoffLng Float
  dropoffAddress String
  seatsRequested Int @default(1)
  radiusMiles Float @default(0.5)
  prefs Json // { driverGender, coRiderPref, ... }
  beneficiaryName String?
  beneficiaryPhone String?
  status String @default("PENDING") // PENDING, MATCHED, ACCEPTED, STARTED, COMPLETED, CANCELLED
  createdAt DateTime @default(now())
  
  trip Trip?
}

// Trip
model Trip {
  id String @id @default(cuid())
  rideRequestId String @unique
  rideRequest RideRequest @relation(fields: [rideRequestId], references: [id])
  driverId String
  driver User @relation(fields: [driverId], references: [id])
  status String @default("PENDING")
  distanceMeters Float?
  durationSec Int?
  fareCents Int?
  currency String @default("USD")
  startedAt DateTime?
  completedAt DateTime?
  createdAt DateTime @default(now())
  
  payments Payment[]
  tips Tip[]
  ratings Rating[]
  reports Report[]
}

// PaymentMethod
model PaymentMethod {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id])
  provider String // stripe
  providerRef String
  last4 String
  brand String
  expMonth Int
  expYear Int
  createdAt DateTime @default(now())
}

// Payment
model Payment {
  id String @id @default(cuid())
  tripId String
  trip Trip @relation(fields: [tripId], references: [id])
  userId String
  amountCents Int
  status String @default("PENDING")
  providerIntentId String?
  createdAt DateTime @default(now())
}

// Tip
model Tip {
  id String @id @default(cuid())
  tripId String
  trip Trip @relation(fields: [tripId], references: [id])
  userId String
  amountCents Int
  createdAt DateTime @default(now())
}

// Rating
model Rating {
  id String @id @default(cuid())
  tripId String
  trip Trip @relation(fields: [tripId], references: [id])
  raterId String
  rateeId String
  stars Int
  comment String?
  createdAt DateTime @default(now())
}

// Report
model Report {
  id String @id @default(cuid())
  tripId String
  trip Trip @relation(fields: [tripId], references: [id])
  reporterId String
  category String
  description String
  status String @default("PENDING")
  createdAt DateTime @default(now())
}

// LoyaltyAccount
model LoyaltyAccount {
  userId String @unique
  user User @relation(fields: [userId], references: [id])
  points Int @default(0)
  updatedAt DateTime @updatedAt
}

// LoyaltyLedger
model LoyaltyLedger {
  id String @id @default(cuid())
  userId String
  deltaPoints Int
  reason String
  tripId String?
  createdAt DateTime @default(now())
}

// BenefitGrant
model BenefitGrant {
  id String @id @default(cuid())
  userId String
  type String // STUDENT_FREE_RIDE, LOYALTY_FREE_RIDE, DISCOUNT
  value Int // percentage or cents
  capCents Int?
  remainingUses Int @default(1)
  expiresAt DateTime
  createdAt DateTime @default(now())
}

// DriverLicense
model DriverLicense {
  id String @id @default(cuid())
  driverId String @unique
  number String
  state String
  expiry DateTime
  docUrl String
  status String @default("PENDING") // PENDING, APPROVED, REJECTED
  rejectionReason String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// Driver
model Driver {
  id String @id @default(cuid())
  userId String @unique
  user User @relation(fields: [userId], references: [id])
  status String @default("OFFLINE") // ONLINE, OFFLINE
  gender String?
  ratingAvg Float @default(5.0)
  verifiedAt DateTime?
  createdAt DateTime @default(now())
  
  license DriverLicense?
  trips Trip[]
}
```

---

## Running the App

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Fill in your Stripe, Twilio, Google OAuth keys

# Run database migrations
pnpm db:push

# Start dev server
pnpm dev

# Open browser
open http://localhost:8081
```

---

## Testing Checklist

- [ ] Sign up with phone + OTP
- [ ] Sign up with email + OTP
- [ ] Sign in with Google
- [ ] Session persists on refresh
- [ ] Book ride with safety preferences
- [ ] Select seats (1-4)
- [ ] See ride cards with seat display
- [ ] Book for someone else
- [ ] Pick location on map
- [ ] Estimate fare
- [ ] Add payment method
- [ ] Complete ride
- [ ] Tip driver
- [ ] Rate driver
- [ ] Report issue
- [ ] Verify as student
- [ ] See loyalty points
- [ ] Redeem discount
- [ ] Driver uploads license
- [ ] Admin approves license
- [ ] Driver goes online
- [ ] Driver receives ride request
- [ ] Driver accepts ride
- [ ] Real-time tracking
- [ ] Trip completion
- [ ] Payment captured

---

## Deployment

```bash
# Build for production
pnpm build

# Deploy backend
vercel deploy

# Build mobile app
eas build --platform ios --auto-submit
eas build --platform android --auto-submit
```

---

## Support

For issues or questions, refer to:
- Expo Router: https://docs.expo.dev/router/
- tRPC: https://trpc.io/
- Stripe: https://stripe.com/docs
- Prisma: https://www.prisma.io/docs/
