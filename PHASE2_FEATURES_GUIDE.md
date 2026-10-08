# 🚀 RideShare Phase 2 - Complete Feature Implementation Guide

This guide documents all 11 new features added to the RideShare app with code examples and implementation details.

---

## Feature 1: Authentication (Email, Google, Phone + OTP)

### Files Created
- `app/auth/_layout.tsx` - Auth navigation layout
- `app/auth/sign-up.tsx` - Sign up screen (email, phone, Google)
- `app/auth/sign-in.tsx` - Sign in screen (email, phone, Google)
- `app/auth/verify-otp.tsx` - OTP verification screen

### Features
✅ Email/password sign up and sign in
✅ Phone number + OTP verification
✅ Google OAuth integration
✅ OTP resend with 60-second timer
✅ Form validation and error handling

### How to Use

```typescript
// Navigate to sign up
router.push("/auth/sign-up");

// Navigate to sign in
router.push("/auth/sign-in");

// OTP verification with params
router.push({
  pathname: "/auth/verify-otp",
  params: {
    method: "email",
    email: "user@example.com",
  },
});
```

### Integration with Backend

```typescript
// In server/routers.ts, add these endpoints:

export const appRouter = router({
  // Sign up
  signUp: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6),
      firstName: z.string(),
      lastName: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Hash password
      const hashedPassword = await hashPassword(input.password);
      
      // Create user
      const user = await db.insert(users).values({
        email: input.email,
        passwordHash: hashedPassword,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      
      return { userId: user.id };
    }),

  // Verify OTP
  verifyOTP: publicProcedure
    .input(z.object({
      phone: z.string(),
      otp: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Verify with Twilio
      const verified = await twilioService.verifyOTP(input.phone, input.otp);
      
      if (!verified) {
        throw new Error("Invalid OTP");
      }
      
      // Create or update user
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.phone, input.phone),
      });
      
      if (!user) {
        const newUser = await db.insert(users).values({
          phone: input.phone,
        });
        return { userId: newUser.id, isNewUser: true };
      }
      
      return { userId: user.id, isNewUser: false };
    }),
});
```

---

## Feature 2: Safety Preferences

### Files Created
- `app/safety-preferences.tsx` - Safety preferences screen

### Features
✅ Driver gender preference (no preference, woman, man)
✅ Co-rider preference (no preference, women-only, men-only)
✅ Seat selection (1-4 seats)
✅ Visual preference indicators
✅ Persistent storage

### How to Use

```typescript
// Navigate to safety preferences
router.push("/safety-preferences");

// Save preferences
const preferences = {
  driverGender: "woman",
  coRiderPref: "women-only",
  seatsNeeded: 2,
};

// Store in database
await db.insert(userPreferences).values({
  userId: currentUser.id,
  ...preferences,
});
```

### Database Schema

```sql
CREATE TABLE user_preferences (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  driver_gender ENUM('no-preference', 'woman', 'man') DEFAULT 'no-preference',
  co_rider_preference ENUM('no-preference', 'women-only', 'men-only') DEFAULT 'no-preference',
  seats_needed INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## Feature 3: Updated Ride Cards with Seats & Gender Badges

### Files Created
- `components/ride-card.tsx` - Enhanced ride card component

### Features
✅ Display seat occupancy (X of Y seats)
✅ Show available seats count
✅ Gender restriction badges (women-only, men-only)
✅ Price per seat display
✅ Visual seat indicators

### How to Use

```typescript
import { RideCard } from "@/components/ride-card";

<RideCard
  driverName="Sarah Johnson"
  driverRating={4.8}
  fare={18.50}
  seatsOccupied={2}
  totalSeats={4}
  pricePerSeat={9.25}
  genderBadge="women-only"
  isSharedRide={true}
  onPress={() => router.push("/ride-detail")}
/>
```

### Rendering

```
┌─────────────────────────────┐
│ Sarah Johnson        $18.50  │
│ ⭐ 4.8 • 156 rides  $9.25/seat
│                             │
│ 🪑 2 of 4 seats filled      │
│ ● ● ○ ○ 2 available        │
│                             │
│ 👩 Women-Only Ride          │
│                             │
│ 📍 Pickup in 5 mins • 12 km │
└─────────────────────────────┘
```

---

## Feature 4: Payment Card Management

### Files Created
- `app/payment-methods.tsx` - Payment methods screen

### Features
✅ Add debit/credit cards
✅ Save multiple cards
✅ Set default payment method
✅ Delete cards
✅ Wallet balance display
✅ Card validation

### How to Use

```typescript
// Navigate to payment methods
router.push("/payment-methods");

// Add card
const newCard = {
  cardNumber: "4242424242424242",
  cardholderName: "John Doe",
  expiryDate: "12/25",
  cvv: "123",
};

// Store in database
await db.insert(paymentMethods).values({
  userId: currentUser.id,
  ...newCard,
  isDefault: true,
});
```

### Database Schema

```sql
CREATE TABLE payment_methods (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  card_number VARCHAR(255) NOT NULL,
  cardholder_name VARCHAR(100),
  expiry_date VARCHAR(5),
  card_type ENUM('visa', 'mastercard', 'amex'),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## Feature 5: Loyalty Points & Student Discounts

### Files Created
- `app/loyalty-rewards.tsx` - Loyalty and rewards screen

### Features
✅ Earn 10 points per completed ride
✅ Discount tiers (50%, 60%, 70%, free ride)
✅ Student verification with .edu email
✅ 1-2 free rides for verified students ($0-15)
✅ Referral program
✅ Activity history

### How to Use

```typescript
// Navigate to loyalty rewards
router.push("/loyalty-rewards");

// Award points after ride completion
await db.update(users).set({
  loyaltyPoints: users.loyaltyPoints + 10,
}).where((users, { eq }) => eq(users.id, userId));

// Verify student email
const isStudent = email.endsWith("@.edu");
if (isStudent) {
  await db.insert(studentDiscounts).values({
    userId: currentUser.id,
    freeRides: 2,
    maxValue: 15,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
  });
}
```

### Discount Calculation

```typescript
// Calculate discount based on points
function calculateDiscount(points: number): { discount: number; maxValue: number } {
  if (points >= 500) return { discount: 0.70, maxValue: 25 }; // 70% off
  if (points >= 300) return { discount: 0.60, maxValue: 20 }; // 60% off
  if (points >= 100) return { discount: 0.50, maxValue: 10 }; // 50% off
  return { discount: 0, maxValue: 0 };
}

// Apply discount
const fare = 25.00;
const { discount } = calculateDiscount(loyaltyPoints);
const discountedFare = fare * (1 - discount);
```

### Database Schema

```sql
CREATE TABLE loyalty_points (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  points INT DEFAULT 0,
  total_rides INT DEFAULT 0,
  total_savings DECIMAL(10, 2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE student_discounts (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  free_rides INT DEFAULT 2,
  max_value DECIMAL(10, 2) DEFAULT 15,
  used_rides INT DEFAULT 0,
  verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## Feature 6: Booking for Others

### Implementation Example

```typescript
// In book-ride.tsx, add passenger selection

interface BookingPassenger {
  name: string;
  phone: string;
  email: string;
  relation: "friend" | "family" | "colleague";
}

const [passengers, setPassengers] = useState<BookingPassenger[]>([]);

const handleAddPassenger = () => {
  // Show modal to add passenger
  // Validate phone and email
  // Add to passengers array
};

// When booking, include passengers
const rideData = {
  driverId: driver.id,
  origin: origin,
  destination: destination,
  passengers: [
    { userId: currentUser.id }, // Primary passenger
    ...passengers, // Additional passengers
  ],
};
```

### Database Schema

```sql
CREATE TABLE ride_passengers (
  id VARCHAR(36) PRIMARY KEY,
  ride_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  passenger_name VARCHAR(100),
  passenger_phone VARCHAR(20),
  passenger_email VARCHAR(100),
  passenger_fare DECIMAL(10, 2),
  status ENUM('invited', 'accepted', 'rejected', 'completed') DEFAULT 'invited',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## Feature 7: Real Maps Integration

### Installation

```bash
pnpm add react-native-maps
```

### Implementation

```typescript
// components/map-picker.tsx

import MapView, { Marker, Polyline } from "react-native-maps";
import { useState } from "react";

export function MapPicker({ onLocationSelect }: { onLocationSelect: (location: any) => void }) {
  const [region, setRegion] = useState({
    latitude: 40.7128,
    longitude: -74.0060,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  return (
    <MapView
      style={{ flex: 1 }}
      region={region}
      onRegionChange={setRegion}
      onPress={(e) => {
        const { latitude, longitude } = e.nativeEvent.coordinate;
        onLocationSelect({ latitude, longitude });
      }}
    >
      <Marker
        coordinate={{ latitude: region.latitude, longitude: region.longitude }}
        title="Selected Location"
      />
    </MapView>
  );
}
```

### Route Visualization

```typescript
// Show route between origin and destination
<Polyline
  coordinates={[
    { latitude: originLat, longitude: originLng },
    { latitude: destinationLat, longitude: destinationLng },
  ]}
  strokeColor="#0a7ea4"
  strokeWidth={3}
/>
```

---

## Feature 8: Radius-Based Ride Matching (0.1-1 mile)

### Implementation

```typescript
// lib/ride-matching.ts

import * as geolib from "geolib";

interface Location {
  latitude: number;
  longitude: number;
}

export function calculateDistance(
  point1: Location,
  point2: Location
): number {
  return geolib.getDistance(point1, point2) / 1609.34; // Convert to miles
}

export function isRouteOnWay(
  driverOrigin: Location,
  driverDestination: Location,
  passengerOrigin: Location,
  passengerDestination: Location,
  radiusMiles: number = 0.5
): boolean {
  // Check if passenger origin is within radius of driver's route
  const distanceToPassengerOrigin = calculateDistance(
    driverOrigin,
    passengerOrigin
  );

  if (distanceToPassengerOrigin > radiusMiles) {
    return false;
  }

  // Check if passenger destination is roughly on the way
  const driverDistance = calculateDistance(driverOrigin, driverDestination);
  const detourDistance =
    calculateDistance(driverOrigin, passengerOrigin) +
    calculateDistance(passengerOrigin, passengerDestination) +
    calculateDistance(passengerDestination, driverDestination);

  const detourRatio = detourDistance / driverDistance;

  // Allow up to 30% detour
  return detourRatio <= 1.3;
}

export function findMatchingRides(
  passengerOrigin: Location,
  passengerDestination: Location,
  availableRides: any[],
  radiusMiles: number = 0.5
): any[] {
  return availableRides.filter((ride) =>
    isRouteOnWay(
      ride.originLocation,
      ride.destinationLocation,
      passengerOrigin,
      passengerDestination,
      radiusMiles
    )
  );
}
```

### API Endpoint

```typescript
// In server/routers.ts

export const appRouter = router({
  findNearbyRides: publicProcedure
    .input(z.object({
      originLat: z.number(),
      originLng: z.number(),
      destinationLat: z.number(),
      destinationLng: z.number(),
      radiusMiles: z.number().min(0.1).max(1).default(0.5),
    }))
    .query(async ({ input }) => {
      // Get all active shared rides
      const rides = await db.query.rides.findMany({
        where: (rides, { eq, and }) =>
          and(
            eq(rides.status, "searching"),
            eq(rides.rideType, "shared")
          ),
      });

      // Filter by radius and route
      const matchingRides = rides.filter((ride) =>
        isRouteOnWay(
          { latitude: ride.originLat, longitude: ride.originLng },
          { latitude: ride.destinationLat, longitude: ride.destinationLng },
          { latitude: input.originLat, longitude: input.originLng },
          { latitude: input.destinationLat, longitude: input.destinationLng },
          input.radiusMiles
        )
      );

      return matchingRides;
    }),
});
```

---

## Feature 9: Tips, Ratings, Complaints

### Implementation

```typescript
// app/post-ride-feedback.tsx

export default function PostRideFeedbackScreen() {
  const [rating, setRating] = useState(5);
  const [tipAmount, setTipAmount] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [hasComplaint, setHasComplaint] = useState(false);

  const handleSubmit = async () => {
    // Save rating
    await db.insert(ratings).values({
      rideId: rideId,
      raterId: currentUser.id,
      ratedUserId: driver.id,
      rating: rating,
      comment: feedback,
    });

    // Process tip
    if (tipAmount > 0) {
      await db.insert(transactions).values({
        rideId: rideId,
        userId: currentUser.id,
        amount: tipAmount,
        type: "tip",
      });
    }

    // File complaint if needed
    if (hasComplaint) {
      await db.insert(complaints).values({
        rideId: rideId,
        userId: currentUser.id,
        description: feedback,
        status: "pending",
      });
    }
  };
}
```

### Database Schema

```sql
CREATE TABLE tips (
  id VARCHAR(36) PRIMARY KEY,
  ride_id VARCHAR(36) NOT NULL,
  payer_id VARCHAR(36) NOT NULL,
  recipient_id VARCHAR(36) NOT NULL,
  amount DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (payer_id) REFERENCES users(id),
  FOREIGN KEY (recipient_id) REFERENCES users(id)
);

CREATE TABLE complaints (
  id VARCHAR(36) PRIMARY KEY,
  ride_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  description TEXT,
  status ENUM('pending', 'investigating', 'resolved', 'dismissed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## Feature 10: Driver License Verification

### Implementation

```typescript
// app/driver-verification.tsx

export default function DriverVerificationScreen() {
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseImage, setLicenseImage] = useState(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("pending");

  const handleUploadLicense = async () => {
    // Upload image to S3
    const imageUrl = await uploadToS3(licenseImage);

    // Save license info
    await db.insert(driverLicenses).values({
      userId: currentUser.id,
      licenseNumber: licenseNumber,
      licenseImageUrl: imageUrl,
      expiryDate: expiryDate,
      status: "pending_review",
    });

    // Trigger verification (can use third-party service)
    await verifyLicenseWithThirdParty(licenseNumber, imageUrl);
  };
}
```

### Database Schema

```sql
CREATE TABLE driver_licenses (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  license_number VARCHAR(50),
  license_image_url VARCHAR(500),
  expiry_date DATE,
  status ENUM('pending_review', 'verified', 'rejected', 'expired') DEFAULT 'pending_review',
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## Feature 11: Booking for Others (Enhanced)

### Complete Implementation

```typescript
// app/add-passengers.tsx

interface Passenger {
  name: string;
  phone: string;
  email: string;
  relation: "friend" | "family" | "colleague";
}

export default function AddPassengersScreen() {
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [newPassenger, setNewPassenger] = useState<Passenger>({
    name: "",
    phone: "",
    email: "",
    relation: "friend",
  });

  const handleAddPassenger = () => {
    if (!newPassenger.name || !newPassenger.phone) {
      alert("Please fill in all fields");
      return;
    }

    setPassengers([...passengers, newPassenger]);
    setNewPassenger({ name: "", phone: "", email: "", relation: "friend" });
  };

  const handleRemovePassenger = (index: number) => {
    setPassengers(passengers.filter((_, i) => i !== index));
  };

  const handleConfirmBooking = async () => {
    // Create ride with all passengers
    const ride = await createRideWithPassengers({
      driverId: driver.id,
      origin: origin,
      destination: destination,
      passengers: [
        { userId: currentUser.id, isPrimary: true },
        ...passengers,
      ],
    });

    // Send invitations to passengers
    for (const passenger of passengers) {
      await sendPassengerInvitation(passenger.email, ride.id);
    }
  };
}
```

---

## Summary of Database Changes

### New Tables Added
1. `user_preferences` - Safety preferences
2. `payment_methods` - Payment cards
3. `loyalty_points` - Points tracking
4. `student_discounts` - Student verification
5. `ride_passengers` - Multiple passengers per ride
6. `tips` - Tip tracking
7. `complaints` - Complaint reports
8. `driver_licenses` - License verification

### Updated Tables
- `users` - Added loyalty points, student status
- `rides` - Added gender restrictions, seat count
- `ratings` - Enhanced with more fields

---

## API Endpoints Summary

```typescript
// Authentication
POST /auth/sign-up
POST /auth/sign-in
POST /auth/verify-otp
POST /auth/google-oauth

// Safety Preferences
GET /preferences
POST /preferences
PUT /preferences

// Payments
GET /payment-methods
POST /payment-methods
DELETE /payment-methods/:id
PUT /payment-methods/:id/default

// Loyalty
GET /loyalty/points
GET /loyalty/rewards
POST /loyalty/redeem

// Rides
GET /rides/nearby (with radius filtering)
POST /rides/with-passengers
POST /rides/:id/add-passenger

// Feedback
POST /rides/:id/rate
POST /rides/:id/tip
POST /rides/:id/complaint

// Driver Verification
POST /driver/verify-license
GET /driver/verification-status
```

---

## Testing Checklist

- [ ] Sign up with email, phone, Google
- [ ] OTP verification works
- [ ] Safety preferences save correctly
- [ ] Ride cards display seats and badges
- [ ] Payment card management works
- [ ] Loyalty points accumulate
- [ ] Student discount verification works
- [ ] Booking for others works
- [ ] Maps show correct locations
- [ ] Radius-based matching finds nearby rides
- [ ] Tips and ratings submit correctly
- [ ] Complaints are filed
- [ ] Driver license verification works

---

**All 11 features are now documented and ready for integration!**
