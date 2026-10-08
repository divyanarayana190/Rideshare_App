# 🏗️ RideShare App - Architecture Deep Dive

Complete technical reference with code examples for every component.

---

## Table of Contents

1. [Frontend Architecture](#frontend-architecture)
2. [Backend Architecture](#backend-architecture)
3. [Database Schema](#database-schema)
4. [API Reference](#api-reference)
5. [Code Examples](#code-examples)
6. [State Management](#state-management)
7. [Authentication Flow](#authentication-flow)
8. [Real-Time Communication](#real-time-communication)

---

## Frontend Architecture

### 1.1 Project Structure

```
app/
├── (tabs)/                    # Tab-based navigation
│   ├── _layout.tsx            # Tab bar setup
│   ├── index.tsx              # Home screen
│   ├── rides.tsx              # My Rides tab
│   └── profile.tsx            # Profile tab
├── _layout.tsx                # Root layout with providers
└── [screen].tsx               # Individual screens
```

### 1.2 Screen Hierarchy

```
RootLayout (_layout.tsx)
├── Providers (Theme, Auth, Rides)
├── TabLayout (_layout.tsx)
│   ├── Home (index.tsx)
│   ├── My Rides (rides.tsx)
│   └── Profile (profile.tsx)
└── Stack Screens
    ├── BookRide
    ├── FindShared
    ├── RideDetail
    ├── ConfirmRide
    ├── ActiveRide
    ├── Chat
    ├── RateRide
    ├── EmergencySOS
    ├── Analytics
    ├── PromoCode
    ├── Wallet
    └── Notifications
```

### 1.3 Component Hierarchy

```
ScreenContainer
├── SafeAreaView
│   └── View (content)
```

### 1.4 Navigation Flow

```
Home Screen
├── "Where to?" → Book Ride
├── "Recent Rides" → Ride History
├── "Share a Ride" → Find Shared
└── "Driver Mode" → Driver Dashboard

Book Ride
├── Select Origin
├── Select Destination
├── Choose Ride Type (Solo/Shared)
├── View Fare Estimate
└── Book → Confirm Ride

Confirm Ride
├── Review Details
├── Select Payment Method
├── Confirm → Active Ride

Active Ride
├── Live Tracking
├── Driver Info
├── Co-passengers
├── Chat
└── Complete → Rate Ride
```

---

## Backend Architecture

### 2.1 Server Structure

```
server/
├── _core/
│   ├── index.ts               # Express app setup
│   ├── trpc.ts                # tRPC router setup
│   ├── context.ts             # Request context
│   └── ...
├── services/
│   ├── twilio.ts              # SMS & calling
│   ├── stripe.ts              # Payments
│   └── websocket.ts           # Real-time
├── routers.ts                 # API endpoints
├── db.ts                      # Database helpers
└── storage.ts                 # File storage
```

### 2.2 Request Flow

```
HTTP Request
    ↓
Express Middleware
    ↓
tRPC Router
    ↓
Procedure Handler
    ↓
Database Query
    ↓
Response
```

### 2.3 Middleware Stack

```
Express
├── CORS Middleware
├── JSON Parser
├── Authentication
├── Logging
├── Error Handler
└── tRPC Handler
```

---

## Database Schema

### 3.1 Table Relationships

```
users (1) ──→ (many) profiles
users (1) ──→ (many) rides (as driver)
users (1) ──→ (many) rides (as passenger via passengers table)
rides (1) ──→ (many) passengers
rides (1) ──→ (many) payments
rides (1) ──→ (many) chat_messages
rides (1) ──→ (many) ratings
users (1) ──→ (many) wallets
users (1) ──→ (many) transactions
users (1) ──→ (many) emergency_alerts
```

### 3.2 Users Table

```sql
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  profile_photo_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 3.3 Rides Table

```sql
CREATE TABLE rides (
  id VARCHAR(36) PRIMARY KEY,
  driver_id VARCHAR(36) NOT NULL,
  origin VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  origin_lat DECIMAL(10, 8),
  origin_lng DECIMAL(11, 8),
  destination_lat DECIMAL(10, 8),
  destination_lng DECIMAL(11, 8),
  ride_type ENUM('solo', 'shared') DEFAULT 'solo',
  status ENUM('searching', 'matched', 'active', 'completed', 'cancelled') DEFAULT 'searching',
  total_fare DECIMAL(10, 2),
  distance_km DECIMAL(10, 2),
  duration_minutes INT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES users(id)
);
```

### 3.4 Passengers Table

```sql
CREATE TABLE passengers (
  id VARCHAR(36) PRIMARY KEY,
  ride_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  passenger_fare DECIMAL(10, 2),
  pickup_lat DECIMAL(10, 8),
  pickup_lng DECIMAL(11, 8),
  dropoff_lat DECIMAL(10, 8),
  dropoff_lng DECIMAL(11, 8),
  status ENUM('waiting', 'picked_up', 'dropped_off', 'cancelled') DEFAULT 'waiting',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 3.5 Payments Table

```sql
CREATE TABLE payments (
  id VARCHAR(36) PRIMARY KEY,
  ride_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  amount DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'USD',
  payment_method ENUM('card', 'wallet', 'cash') DEFAULT 'card',
  stripe_payment_intent_id VARCHAR(255),
  status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 3.6 Chat Messages Table

```sql
CREATE TABLE chat_messages (
  id VARCHAR(36) PRIMARY KEY,
  ride_id VARCHAR(36) NOT NULL,
  sender_id VARCHAR(36) NOT NULL,
  message TEXT,
  message_type ENUM('text', 'image', 'location') DEFAULT 'text',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);
```

### 3.7 Ratings Table

```sql
CREATE TABLE ratings (
  id VARCHAR(36) PRIMARY KEY,
  ride_id VARCHAR(36) NOT NULL,
  rater_id VARCHAR(36) NOT NULL,
  rated_user_id VARCHAR(36) NOT NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (rater_id) REFERENCES users(id),
  FOREIGN KEY (rated_user_id) REFERENCES users(id)
);
```

---

## API Reference

### 4.1 Rides Endpoints

#### Create Ride

```typescript
POST /api/rides/create
Input: {
  origin: string
  destination: string
  rideType: "solo" | "shared"
}
Output: {
  rideId: string
  fare: number
  status: string
}
```

#### List Available Rides

```typescript
GET /api/rides/available
Query: {
  origin: string
  destination: string
  limit: number (default: 10)
}
Output: {
  rides: Array<{
    id: string
    driverId: string
    driverName: string
    driverRating: number
    fare: number
    passengers: number
    distance: number
  }>
}
```

#### Get Ride Details

```typescript
GET /api/rides/:rideId
Output: {
  id: string
  driver: User
  passengers: User[]
  origin: string
  destination: string
  fare: number
  status: string
  startedAt: Date
  completedAt: Date
}
```

#### Join Ride

```typescript
POST /api/rides/:rideId/join
Input: {
  passengerId: string
}
Output: {
  success: boolean
  fare: number
  message: string
}
```

### 4.2 Payments Endpoints

#### Create Payment Intent

```typescript
POST /api/payments/create-intent
Input: {
  rideId: string
  amount: number
  currency: string
}
Output: {
  clientSecret: string
  intentId: string
}
```

#### Confirm Payment

```typescript
POST /api/payments/confirm
Input: {
  intentId: string
  paymentMethodId: string
}
Output: {
  success: boolean
  transactionId: string
}
```

### 4.3 Chat Endpoints

#### Send Message

```typescript
POST /api/chat/send
Input: {
  rideId: string
  message: string
}
Output: {
  messageId: string
  timestamp: Date
}
```

#### Get Chat History

```typescript
GET /api/chat/:rideId
Query: {
  limit: number (default: 50)
  offset: number (default: 0)
}
Output: {
  messages: Array<{
    id: string
    senderId: string
    senderName: string
    message: string
    timestamp: Date
  }>
}
```

---

## Code Examples

### 5.1 Creating a Screen

```typescript
// app/my-screen.tsx

import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";

export default function MyScreen() {
  const router = useRouter();
  const colors = useColors();

  return (
    <ScreenContainer className="p-4">
      <ScrollView>
        {/* Header */}
        <View className="mb-6">
          <Text className="text-3xl font-bold text-foreground">
            My Screen
          </Text>
          <Text className="text-sm text-muted mt-2">
            This is my custom screen
          </Text>
        </View>

        {/* Content */}
        <View className="gap-4">
          <View
            className="bg-surface p-4 rounded-lg border"
            style={{ borderColor: colors.border }}
          >
            <Text className="text-lg font-semibold text-foreground">
              Card Title
            </Text>
            <Text className="text-sm text-muted mt-2">
              Card content goes here
            </Text>
          </View>

          {/* Button */}
          <TouchableOpacity
            className="bg-primary py-3 rounded-lg items-center"
            onPress={() => router.push("/book-ride")}
          >
            <Text className="text-white font-semibold">
              Go to Book Ride
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
```

### 5.2 Creating an API Endpoint

```typescript
// server/routers.ts

import { publicProcedure, router } from "@/server/_core/trpc";
import { z } from "zod";
import { db } from "@/server/db";

export const appRouter = router({
  // Get user profile
  getUserProfile: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, input.userId),
      });

      if (!user) {
        throw new Error("User not found");
      }

      return {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
      };
    }),

  // Update user profile
  updateUserProfile: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const updated = await db
        .update(users)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
        })
        .where((users, { eq }) => eq(users.id, input.userId));

      return { success: true };
    }),
});
```

### 5.3 Calling API from Frontend

```typescript
// app/profile.tsx

import { useEffect, useState } from "react";
import { Text, View, ActivityIndicator } from "react-native";
import { trpc } from "@/lib/trpc";

export default function ProfileScreen() {
  const [userId] = useState("user_123");

  // Query user profile
  const { data: profile, isLoading } = trpc.getUserProfile.useQuery(
    { userId },
    { enabled: !!userId }
  );

  // Mutation to update profile
  const updateProfile = trpc.updateUserProfile.useMutation();

  const handleUpdateName = async () => {
    try {
      await updateProfile.mutateAsync({
        userId,
        firstName: "John",
        lastName: "Doe",
      });
      console.log("Profile updated!");
    } catch (error) {
      console.error("Error updating profile:", error);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="p-4">
      <Text className="text-2xl font-bold">
        {profile?.name}
      </Text>
      <Text className="text-gray-600">{profile?.email}</Text>
      <TouchableOpacity
        className="mt-4 bg-blue-500 p-3 rounded"
        onPress={handleUpdateName}
      >
        <Text className="text-white">Update Name</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### 5.4 Database Query

```typescript
// server/db.ts

import { db } from "@/server/_core/index";
import { rides, users, payments } from "@/drizzle/schema";
import { eq, and, gte } from "drizzle-orm";

// Get all active rides
export async function getActiveRides() {
  return await db.query.rides.findMany({
    where: (rides, { eq }) => eq(rides.status, "active"),
    with: {
      driver: true,
      passengers: true,
    },
  });
}

// Get user's rides
export async function getUserRides(userId: string) {
  return await db.query.rides.findMany({
    where: (rides, { eq }) => eq(rides.driverId, userId),
    orderBy: (rides, { desc }) => desc(rides.createdAt),
  });
}

// Calculate total earnings
export async function getUserEarnings(userId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const earnings = await db
    .select({
      totalEarnings: db.sql`SUM(${payments.amount})`,
      rideCount: db.sql`COUNT(DISTINCT ${rides.id})`,
    })
    .from(payments)
    .innerJoin(rides, eq(payments.rideId, rides.id))
    .where(
      and(
        eq(rides.driverId, userId),
        gte(payments.createdAt, startDate)
      )
    );

  return earnings[0];
}
```

---

## State Management

### 6.1 Using React Context

```typescript
// lib/rides-store.tsx

import React, { createContext, useContext, useState } from "react";

interface Ride {
  id: string;
  origin: string;
  destination: string;
  fare: number;
  status: string;
}

interface RidesContextType {
  rides: Ride[];
  currentRide: Ride | null;
  addRide: (ride: Ride) => void;
  setCurrentRide: (ride: Ride | null) => void;
}

const RidesContext = createContext<RidesContextType | undefined>(undefined);

export function RidesProvider({ children }: { children: React.ReactNode }) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [currentRide, setCurrentRide] = useState<Ride | null>(null);

  const addRide = (ride: Ride) => {
    setRides([...rides, ride]);
  };

  return (
    <RidesContext.Provider
      value={{ rides, currentRide, addRide, setCurrentRide }}
    >
      {children}
    </RidesContext.Provider>
  );
}

export function useRides() {
  const context = useContext(RidesContext);
  if (!context) {
    throw new Error("useRides must be used within RidesProvider");
  }
  return context;
}
```

### 6.2 Using the Context

```typescript
// app/book-ride.tsx

import { useRides } from "@/lib/rides-store";

export default function BookRideScreen() {
  const { addRide, currentRide } = useRides();

  const handleBookRide = () => {
    const newRide = {
      id: "ride_" + Date.now(),
      origin: "Times Square",
      destination: "Grand Central",
      fare: 25.50,
      status: "searching",
    };

    addRide(newRide);
  };

  return (
    <TouchableOpacity onPress={handleBookRide}>
      <Text>Book Ride</Text>
    </TouchableOpacity>
  );
}
```

---

## Authentication Flow

### 7.1 Sign Up Flow

```
User enters email/password
    ↓
Frontend validates input
    ↓
Frontend sends to backend
    ↓
Backend hashes password
    ↓
Backend creates user in database
    ↓
Backend generates JWT token
    ↓
Frontend stores token in secure storage
    ↓
Frontend navigates to home screen
```

### 7.2 Login Flow

```
User enters email/password
    ↓
Frontend sends to backend
    ↓
Backend finds user by email
    ↓
Backend compares password hash
    ↓
Backend generates JWT token
    ↓
Frontend stores token
    ↓
Frontend navigates to home screen
```

### 7.3 Protected Endpoints

```typescript
// server/routers.ts

import { protectedProcedure, router } from "@/server/_core/trpc";

export const appRouter = router({
  // This endpoint requires authentication
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    // ctx.userId is available only if user is authenticated
    return await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, ctx.userId),
    });
  }),
});
```

---

## Real-Time Communication

### 8.1 WebSocket Connection

```typescript
// server/services/websocket.ts

import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (data) => {
    const message = JSON.parse(data);

    // Broadcast to all clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
```

### 8.2 Real-Time Chat

```typescript
// Frontend: Send message
const sendMessage = async (rideId: string, message: string) => {
  await trpc.sendChatMessage.mutate({
    rideId,
    message,
  });
};

// Backend: Broadcast message
export const sendChatMessage = protectedProcedure
  .input(z.object({ rideId: z.string(), message: z.string() }))
  .mutation(async ({ input, ctx }) => {
    // Save to database
    const msg = await db.insert(chatMessages).values({
      rideId: input.rideId,
      senderId: ctx.userId,
      message: input.message,
    });

    // Broadcast via WebSocket
    broadcastToRide(input.rideId, {
      type: "chat_message",
      data: msg,
    });

    return msg;
  });
```

---

## Performance Optimization

### 9.1 Query Optimization

```typescript
// ❌ Bad: N+1 query problem
const rides = await db.query.rides.findMany();
for (const ride of rides) {
  const driver = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, ride.driverId),
  });
  // ...
}

// ✅ Good: Fetch with relations
const rides = await db.query.rides.findMany({
  with: {
    driver: true,
    passengers: true,
  },
});
```

### 9.2 Caching

```typescript
// Cache ride listings
const CACHE_KEY = "rides:available";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getAvailableRides() {
  const cached = await cache.get(CACHE_KEY);
  if (cached) return cached;

  const rides = await db.query.rides.findMany({
    where: (rides, { eq }) => eq(rides.status, "searching"),
  });

  await cache.set(CACHE_KEY, rides, CACHE_TTL);
  return rides;
}
```

---

**This deep dive covers the complete technical architecture of the RideShare app!**
