# 🚀 RideShare App - Complete Step-by-Step Guide
## From Scratch to Production Deployment

---

## 📑 Table of Contents

1. [Prerequisites & System Setup](#prerequisites--system-setup)
2. [Technology Stack Overview](#technology-stack-overview)
3. [Installation Guide](#installation-guide)
4. [Project Structure](#project-structure)
5. [Running the App](#running-the-app)
6. [Understanding the Architecture](#understanding-the-architecture)
7. [Frontend Development](#frontend-development)
8. [Backend Development](#backend-development)
9. [Database Setup](#database-setup)
10. [Third-Party Integrations](#third-party-integrations)
11. [Testing](#testing)
12. [Deployment](#deployment)
13. [Troubleshooting](#troubleshooting)

---

## 1. Prerequisites & System Setup

### 1.1 What You Need Before Starting

Before building the RideShare app, ensure your computer has:

- **Operating System**: macOS, Windows, or Linux
- **RAM**: Minimum 8GB (16GB recommended)
- **Storage**: 10GB free space
- **Internet**: Stable connection for downloading packages

### 1.2 Install Node.js and npm

Node.js is the JavaScript runtime that powers both frontend and backend.

#### On macOS (using Homebrew)

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js (includes npm)
brew install node

# Verify installation
node --version    # Should show v18.x.x or higher
npm --version     # Should show 9.x.x or higher
```

#### On Windows

1. Visit [nodejs.org](https://nodejs.org)
2. Download LTS version (Long Term Support)
3. Run installer and follow prompts
4. Restart your computer
5. Open Command Prompt and verify:

```bash
node --version
npm --version
```

#### On Linux (Ubuntu/Debian)

```bash
# Update package manager
sudo apt update

# Install Node.js and npm
sudo apt install nodejs npm

# Verify installation
node --version
npm --version
```

### 1.3 Install pnpm (Package Manager)

pnpm is a faster, more efficient package manager than npm.

```bash
# Install pnpm globally
npm install -g pnpm

# Verify installation
pnpm --version    # Should show 9.x.x or higher
```

### 1.4 Install Git

Git is needed for version control and cloning repositories.

#### On macOS

```bash
brew install git
```

#### On Windows

1. Visit [git-scm.com](https://git-scm.com)
2. Download and run installer
3. Use default settings

#### On Linux

```bash
sudo apt install git
```

### 1.5 Install Expo CLI

Expo CLI is used to run and build React Native apps.

```bash
# Install globally
npm install -g expo-cli

# Verify installation
expo --version    # Should show 52.x.x or higher
```

### 1.6 Install EAS CLI (For Building Apps)

EAS CLI is used to build iOS and Android apps for app stores.

```bash
# Install globally
npm install -g eas-cli

# Verify installation
eas --version     # Should show 7.x.x or higher

# Login to Expo account (create free account at expo.dev first)
eas login
```

### 1.7 Install Docker (Optional, for Database)

Docker allows you to run databases in containers without installing them directly.

#### On macOS

```bash
brew install docker
# Then start Docker Desktop from Applications
```

#### On Windows

1. Visit [docker.com](https://www.docker.com/products/docker-desktop)
2. Download Docker Desktop
3. Run installer and follow prompts

#### On Linux

```bash
sudo apt install docker.io
sudo usermod -aG docker $USER
newgrp docker
```

### 1.8 Verify All Installations

```bash
# Run this to check all tools are installed
node --version
npm --version
pnpm --version
git --version
expo --version
eas --version
```

---

## 2. Technology Stack Overview

### 2.1 Frontend Stack

| Technology | Purpose | Version |
|------------|---------|---------|
| **React Native** | Mobile app framework | 0.81.5 |
| **Expo** | Development platform for React Native | 54.0 |
| **TypeScript** | Type-safe JavaScript | 5.9 |
| **React 19** | UI library | 19.1.0 |
| **NativeWind** | Tailwind CSS for React Native | 4.2.1 |
| **Expo Router** | Navigation framework | 6.0 |
| **React Query** | Data fetching & caching | 5.90 |

### 2.2 Backend Stack

| Technology | Purpose | Version |
|------------|---------|---------|
| **Node.js** | JavaScript runtime | 18+ |
| **Express** | Web framework | 4.22 |
| **tRPC** | Type-safe API framework | 11.7.2 |
| **Drizzle ORM** | Database ORM | 0.44.7 |
| **MySQL** | Database | 8.0+ |

### 2.3 Third-Party Services

| Service | Purpose |
|---------|---------|
| **Twilio** | SMS, phone verification, calling |
| **Stripe** | Payments, driver payouts |
| **Firebase** | Push notifications |
| **Expo** | App hosting & distribution |

### 2.4 Development Tools

| Tool | Purpose |
|------|---------|
| **pnpm** | Package manager |
| **TypeScript** | Type checking |
| **ESLint** | Code linting |
| **Prettier** | Code formatting |
| **Vitest** | Unit testing |

---

## 3. Installation Guide

### 3.1 Clone the Project

```bash
# Navigate to where you want to store the project
cd ~/projects

# Clone the RideShare app repository
git clone https://github.com/your-username/rideshare-app.git

# Enter the project directory
cd rideshare-app

# Verify you're in the right place
pwd    # Should show: /path/to/rideshare-app
ls     # Should show: app, components, server, package.json, etc.
```

### 3.2 Install Dependencies

```bash
# Install all project dependencies
pnpm install

# This will:
# - Read package.json
# - Download all required packages
# - Create node_modules folder
# - Generate pnpm-lock.yaml (lock file)

# Verify installation
pnpm list    # Shows all installed packages
```

### 3.3 Create Environment File

```bash
# Copy example environment file
cp .env.example .env

# Open .env in your text editor
# On macOS/Linux:
nano .env

# On Windows (use Notepad or VS Code):
# Open .env file and edit manually
```

### 3.4 Configure Environment Variables

Edit `.env` file and fill in your credentials:

```env
# ============================================
# TWILIO CONFIGURATION
# ============================================
# Get these from: https://www.twilio.com/console
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================================
# STRIPE CONFIGURATION
# ============================================
# Get these from: https://dashboard.stripe.com/apikeys
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_SECRET_KEY=<YOUR_STRIPE_SECRET_KEY>
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx

# ============================================
# DATABASE CONFIGURATION
# ============================================
# Format: mysql://username:password@host:port/database
DATABASE_URL=mysql://root:password@localhost:3306/rideshare

# ============================================
# API CONFIGURATION
# ============================================
API_URL=http://localhost:3000
EXPO_PUBLIC_API_URL=http://localhost:3000

# ============================================
# FIREBASE CONFIGURATION
# ============================================
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
FIREBASE_CLIENT_EMAIL=your-email@appspot.gserviceaccount.com
FIREBASE_WEB_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxx

# ============================================
# ENVIRONMENT
# ============================================
NODE_ENV=development
```

**Note**: For development, you can leave most values empty. The app uses mock data by default.

---

## 4. Project Structure

### 4.1 Directory Layout

```
rideshare-app/
├── app/                          # Frontend screens & navigation
│   ├── (tabs)/                   # Tab-based screens
│   │   ├── _layout.tsx           # Tab layout configuration
│   │   ├── index.tsx             # Home screen
│   │   ├── rides.tsx             # My Rides screen
│   │   └── profile.tsx           # Profile screen
│   ├── _layout.tsx               # Root layout with providers
│   ├── book-ride.tsx             # Book a ride screen
│   ├── find-shared.tsx           # Find shared rides screen
│   ├── ride-detail.tsx           # Ride details screen
│   ├── active-ride.tsx           # Live ride tracking
│   ├── chat-screen.tsx           # Chat screen
│   ├── rate-ride.tsx             # Rating screen
│   ├── emergency-sos.tsx         # Emergency alert screen
│   └── ...                       # More screens
│
├── components/                   # Reusable UI components
│   ├── screen-container.tsx      # SafeArea wrapper
│   ├── live-map.tsx              # Map component
│   ├── ui/
│   │   └── icon-symbol.tsx       # Icon mapping
│   └── ...                       # Other components
│
├── lib/                          # Utility functions & services
│   ├── types.ts                  # TypeScript type definitions
│   ├── mock-data.ts              # Mock data for development
│   ├── rides-store.tsx           # State management
│   ├── maps-service.ts           # Maps utilities
│   ├── notifications-service.ts  # Notifications
│   ├── trpc.ts                   # API client setup
│   ├── utils.ts                  # Helper functions
│   └── _core/                    # Core utilities
│
├── server/                       # Backend code
│   ├── _core/
│   │   ├── index.ts              # Server entry point
│   │   ├── trpc.ts               # tRPC setup
│   │   └── ...                   # Other core files
│   ├── services/
│   │   ├── twilio.ts             # Twilio integration
│   │   ├── stripe.ts             # Stripe integration
│   │   └── websocket.ts          # WebSocket setup
│   ├── routers.ts                # API endpoints
│   ├── db.ts                     # Database helpers
│   └── README.md                 # Backend documentation
│
├── drizzle/                      # Database schema & migrations
│   ├── schema.ts                 # Database tables
│   ├── 0000_*.sql                # Migration files
│   └── meta/                     # Migration metadata
│
├── hooks/                        # React hooks
│   ├── use-auth.ts               # Authentication hook
│   ├── use-colors.ts             # Theme colors hook
│   └── ...                       # Other hooks
│
├── constants/                    # App constants
│   ├── theme.ts                  # Theme configuration
│   └── oauth.ts                  # OAuth configuration
│
├── assets/                       # Images, fonts, etc.
│   ├── images/
│   │   ├── icon.png              # App icon
│   │   ├── splash-icon.png       # Splash screen
│   │   └── ...                   # Other images
│   └── fonts/                    # Custom fonts
│
├── tests/                        # Unit tests
│   └── rideshare.test.ts         # Test file
│
├── __tests__/                    # More tests
│   └── rideshare.test.ts
│
├── app.config.ts                 # Expo configuration
├── tailwind.config.js            # Tailwind CSS config
├── theme.config.js               # Theme colors
├── tsconfig.json                 # TypeScript config
├── package.json                  # Dependencies & scripts
├── pnpm-lock.yaml                # Dependency lock file
├── .env.example                  # Example environment file
├── .env                          # Your environment file (git ignored)
│
├── QUICKSTART.md                 # Quick start guide
├── README_COMPLETE.md            # Full documentation
├── INTEGRATION_GUIDE.md          # Twilio & Stripe setup
├── FIREBASE_SETUP.md             # Firebase guide
├── DEPLOYMENT_GUIDE.md           # Deployment instructions
└── COMPLETE_GUIDE.md             # This file
```

### 4.2 What Each Folder Does

| Folder | Purpose |
|--------|---------|
| `app/` | All screens and navigation (frontend) |
| `components/` | Reusable UI components |
| `lib/` | Utilities, services, and helpers |
| `server/` | Backend API code |
| `drizzle/` | Database schema and migrations |
| `hooks/` | Custom React hooks |
| `constants/` | App-wide constants |
| `assets/` | Images, fonts, and media |
| `tests/` | Unit and integration tests |

---

## 5. Running the App

### 5.1 Start Development Server

```bash
# From the project root directory
cd ~/projects/rideshare-app

# Start both frontend and backend
pnpm dev

# This will:
# 1. Start Metro Bundler (frontend) on port 8081
# 2. Start Express server (backend) on port 3000
# 3. Display QR code for Expo Go
```

### 5.2 View Output

You should see:

```
✓ Expo Metro Bundler ready at http://localhost:8081
✓ API server ready at http://localhost:3000
✓ Scan QR code with Expo Go app

QR Code: [QR code displayed]
```

### 5.3 Open App in Different Ways

#### Option A: Expo Go (Easiest)

```bash
# 1. Install Expo Go app on your phone
#    - iOS: App Store
#    - Android: Google Play Store

# 2. Scan QR code from terminal with phone camera

# 3. App opens automatically in Expo Go
```

#### Option B: Web Browser

```bash
# Open in browser
open http://localhost:8081

# Or on Windows:
start http://localhost:8081
```

#### Option C: iOS Simulator

```bash
# Requires Xcode (macOS only)
pnpm ios

# This will:
# - Open iOS Simulator
# - Build and run app
# - Hot reload on file changes
```

#### Option D: Android Emulator

```bash
# Requires Android Studio
pnpm android

# This will:
# - Open Android Emulator
# - Build and run app
# - Hot reload on file changes
```

### 5.4 Hot Reload

When you edit a file, the app automatically reloads:

```bash
# Edit a screen file
nano app/(tabs)/index.tsx

# Save the file (Ctrl+S)

# App automatically reloads on your device/simulator
```

### 5.5 Stop Development Server

```bash
# Press Ctrl+C in terminal to stop

# Or in a new terminal:
lsof -ti:8081 | xargs kill -9  # Kill Metro Bundler
lsof -ti:3000 | xargs kill -9  # Kill Express server
```

---

## 6. Understanding the Architecture

### 6.1 How the App Works

```
┌─────────────────────────────────────────────────────────────┐
│                    USER'S PHONE                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           React Native Frontend                      │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  Home Screen                                 │   │  │
│  │  │  - Display map                               │   │  │
│  │  │  - Show nearby drivers                       │   │  │
│  │  │  - Book ride button                          │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                      ↓                               │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  Book Ride Screen                            │   │  │
│  │  │  - Enter origin & destination                │   │  │
│  │  │  - Select ride type (solo/shared)            │   │  │
│  │  │  - See fare estimate                         │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                      ↓                                      │
│         HTTP/REST API Call (tRPC)                          │
│                      ↓                                      │
└─────────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              YOUR BACKEND SERVER                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Express.js Server (Port 3000)                       │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  tRPC Router                                 │   │  │
│  │  │  - /rides/create                             │   │  │
│  │  │  - /rides/list                               │   │  │
│  │  │  - /payments/process                         │   │  │
│  │  │  - /chat/send                                │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                      ↓                               │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  Database Layer (Drizzle ORM)                │   │  │
│  │  │  - Query builder                             │   │  │
│  │  │  - Type-safe queries                         │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                      ↓                               │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  MySQL Database                              │   │  │
│  │  │  - Users table                               │   │  │
│  │  │  - Rides table                               │   │  │
│  │  │  - Payments table                            │   │  │
│  │  │  - Chat messages table                       │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Data Flow Example: Booking a Ride

```
1. User taps "Book Ride" button
   ↓
2. Frontend collects:
   - Origin: "Times Square"
   - Destination: "Grand Central"
   - Ride type: "shared"
   ↓
3. Frontend calls backend API:
   POST /api/rides/create
   {
     origin: "Times Square",
     destination: "Grand Central",
     rideType: "shared"
   }
   ↓
4. Backend receives request
   ↓
5. Backend validates data
   ↓
6. Backend calculates fare:
   - Distance: 2.5 km
   - Base fare: $5
   - Per km: $2
   - Total: $5 + (2.5 × $2) = $10
   ↓
7. Backend creates ride in database:
   INSERT INTO rides (origin, destination, fare, status)
   VALUES ("Times Square", "Grand Central", 10, "searching")
   ↓
8. Backend returns response:
   {
     rideId: "ride_123",
     fare: 10,
     status: "searching"
   }
   ↓
9. Frontend receives response
   ↓
10. Frontend displays:
    - Ride ID
    - Fare: $10
    - Status: "Searching for driver..."
    ↓
11. User sees real-time updates as driver accepts
```

---

## 7. Frontend Development

### 7.1 Creating a New Screen

```bash
# 1. Create new screen file
touch app/my-new-screen.tsx

# 2. Add basic screen code
cat > app/my-new-screen.tsx << 'EOF'
import { Text } from "react-native";
import { ScreenContainer } from "@/components/screen-container";

export default function MyNewScreen() {
  return (
    <ScreenContainer className="p-4">
      <Text className="text-2xl font-bold text-foreground">
        My New Screen
      </Text>
    </ScreenContainer>
  );
}
EOF

# 3. Add navigation in app/(tabs)/_layout.tsx
# (See section 7.3)
```

### 7.2 Using Tailwind CSS for Styling

Tailwind CSS is a utility-first CSS framework. Instead of writing CSS, you use pre-defined classes:

```typescript
// ❌ Old way (CSS)
const styles = StyleSheet.create({
  button: {
    backgroundColor: '#0a7ea4',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
});

<TouchableOpacity style={styles.button}>
  <Text>Click me</Text>
</TouchableOpacity>

// ✅ New way (Tailwind)
<TouchableOpacity className="bg-primary px-4 py-3 rounded-lg">
  <Text className="text-white font-bold">Click me</Text>
</TouchableOpacity>
```

### 7.3 Common Tailwind Classes

| Class | What it does |
|-------|-------------|
| `p-4` | Padding: 16px on all sides |
| `px-4` | Padding: 16px left and right |
| `py-3` | Padding: 12px top and bottom |
| `m-2` | Margin: 8px on all sides |
| `bg-primary` | Background color (primary theme color) |
| `text-foreground` | Text color (foreground theme color) |
| `text-2xl` | Font size: 24px |
| `font-bold` | Font weight: bold |
| `rounded-lg` | Border radius: 8px |
| `flex-1` | Flex: 1 (take available space) |
| `flex-row` | Flex direction: row (horizontal) |
| `items-center` | Align items: center |
| `justify-between` | Justify content: space-between |
| `gap-4` | Gap between items: 16px |

### 7.4 Navigating Between Screens

```typescript
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => {
        // Navigate to book-ride screen
        router.push("/book-ride");
      }}
    >
      <Text>Book Ride</Text>
    </TouchableOpacity>
  );
}
```

### 7.5 Passing Data Between Screens

```typescript
// Screen 1: Pass data
router.push({
  pathname: "/ride-detail",
  params: {
    rideId: "ride_123",
    fare: 25.50,
  },
});

// Screen 2: Receive data
import { useLocalSearchParams } from "expo-router";

export default function RideDetailScreen() {
  const { rideId, fare } = useLocalSearchParams();
  
  return (
    <Text>
      Ride: {rideId}, Fare: ${fare}
    </Text>
  );
}
```

### 7.6 Using State Management

```typescript
import { useState } from "react";

export default function MyScreen() {
  // Create state variable
  const [count, setCount] = useState(0);

  return (
    <View>
      <Text>Count: {count}</Text>
      <TouchableOpacity
        onPress={() => setCount(count + 1)}
      >
        <Text>Increment</Text>
      </TouchableOpacity>
    </View>
  );
}
```

---

## 8. Backend Development

### 8.1 Understanding tRPC

tRPC is a framework for building type-safe APIs. Instead of REST endpoints, you define procedures:

```typescript
// ❌ Old way (REST)
// GET /api/rides/123
// Response: { id: 123, fare: 25 }

// ✅ New way (tRPC)
export const appRouter = router({
  rides: router({
    getById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const ride = await db.query.rides.findFirst({
          where: eq(rides.id, input.id),
        });
        return ride;
      }),
  }),
});
```

### 8.2 Creating an API Endpoint

```typescript
// server/routers.ts

import { publicProcedure, router } from "@/server/_core/trpc";
import { z } from "zod";

export const appRouter = router({
  // Create a new ride
  createRide: publicProcedure
    .input(
      z.object({
        origin: z.string(),
        destination: z.string(),
        rideType: z.enum(["solo", "shared"]),
      })
    )
    .mutation(async ({ input }) => {
      // Validate input
      if (!input.origin || !input.destination) {
        throw new Error("Origin and destination required");
      }

      // Calculate fare
      const fare = calculateFare(input.origin, input.destination);

      // Create ride in database
      const ride = await db.insert(rides).values({
        origin: input.origin,
        destination: input.destination,
        fare,
        status: "searching",
      });

      return {
        rideId: ride.id,
        fare,
        status: "searching",
      };
    }),
});
```

### 8.3 Calling API from Frontend

```typescript
// app/book-ride.tsx

import { trpc } from "@/lib/trpc";

export default function BookRideScreen() {
  // Create mutation
  const createRide = trpc.createRide.useMutation();

  const handleBookRide = async () => {
    try {
      const result = await createRide.mutateAsync({
        origin: "Times Square",
        destination: "Grand Central",
        rideType: "shared",
      });

      console.log("Ride created:", result);
      // Navigate to confirmation screen
    } catch (error) {
      console.error("Error creating ride:", error);
    }
  };

  return (
    <TouchableOpacity onPress={handleBookRide}>
      <Text>Book Ride</Text>
    </TouchableOpacity>
  );
}
```

### 8.4 Database Queries with Drizzle ORM

```typescript
// server/db.ts

import { db } from "@/server/_core/index";
import { rides, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

// Get all rides
const allRides = await db.query.rides.findMany();

// Get ride by ID
const ride = await db.query.rides.findFirst({
  where: eq(rides.id, "ride_123"),
});

// Create new ride
const newRide = await db.insert(rides).values({
  origin: "Times Square",
  destination: "Grand Central",
  fare: 25.50,
  status: "searching",
});

// Update ride
await db.update(rides)
  .set({ status: "active" })
  .where(eq(rides.id, "ride_123"));

// Delete ride
await db.delete(rides)
  .where(eq(rides.id, "ride_123"));
```

---

## 9. Database Setup

### 9.1 Understanding MySQL

MySQL is a relational database that stores data in tables with rows and columns:

```
users table:
┌────┬──────────┬──────────┬────────────┐
│ id │ name     │ email    │ phone      │
├────┼──────────┼──────────┼────────────┤
│ 1  │ John     │ j@ex.com │ 555-1234   │
│ 2  │ Sarah    │ s@ex.com │ 555-5678   │
└────┴──────────┴──────────┴────────────┘

rides table:
┌────┬────────────┬──────────────┬───────┬────────────┐
│ id │ origin     │ destination  │ fare  │ status     │
├────┼────────────┼──────────────┼───────┼────────────┤
│ 1  │ Times Sq   │ Grand Cent   │ 25.50 │ searching  │
│ 2  │ Central Pk │ Brooklyn Br  │ 12.30 │ active     │
└────┴────────────┴──────────────┴───────┴────────────┘
```

### 9.2 Install MySQL

#### On macOS

```bash
# Using Homebrew
brew install mysql

# Start MySQL
brew services start mysql

# Verify installation
mysql --version

# Connect to MySQL
mysql -u root
```

#### On Windows

1. Visit [mysql.com](https://dev.mysql.com/downloads/mysql/)
2. Download MySQL Community Server
3. Run installer and follow prompts
4. Choose "MySQL Server" and "MySQL Workbench"
5. Complete installation

#### On Linux

```bash
# Install MySQL
sudo apt install mysql-server

# Start MySQL
sudo systemctl start mysql

# Verify
mysql --version
```

#### Using Docker (Easiest)

```bash
# Create and run MySQL container
docker run --name rideshare-mysql \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=rideshare \
  -p 3306:3306 \
  -d mysql:8.0

# Verify
docker ps    # Should show rideshare-mysql container

# Connect
mysql -h 127.0.0.1 -u root -p
# Enter password: password
```

### 9.3 Create Database

```bash
# Connect to MySQL
mysql -u root -p

# Enter password when prompted

# Create database
CREATE DATABASE rideshare;

# Use database
USE rideshare;

# Verify
SHOW DATABASES;

# Exit
EXIT;
```

### 9.4 Run Database Migrations

```bash
# From project root
cd ~/projects/rideshare-app

# Push schema to database
pnpm db:push

# This will:
# - Read drizzle/schema.ts
# - Create all tables
# - Run migrations

# Verify tables were created
mysql -u root -p rideshare -e "SHOW TABLES;"
```

### 9.5 View Database Tables

```bash
# Connect to database
mysql -u root -p rideshare

# List all tables
SHOW TABLES;

# View table structure
DESCRIBE users;
DESCRIBE rides;
DESCRIBE payments;

# View data
SELECT * FROM users;
SELECT * FROM rides WHERE status = 'active';

# Exit
EXIT;
```

---

## 10. Third-Party Integrations

### 10.1 Twilio Integration

Twilio provides SMS, phone verification, and calling.

#### Step 1: Create Twilio Account

1. Visit [twilio.com](https://www.twilio.com)
2. Click "Sign Up"
3. Enter email and password
4. Verify email
5. Complete phone verification

#### Step 2: Get Credentials

1. Go to [Twilio Console](https://console.twilio.com)
2. Copy **Account SID** and **Auth Token**
3. Go to **Phone Numbers** → **Manage** → **Active Numbers**
4. Copy your **Twilio Phone Number** (e.g., +1234567890)

#### Step 3: Add to .env

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

#### Step 4: Send SMS

```typescript
// server/services/twilio.ts

import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendSMS(to: string, message: string) {
  const result = await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: to,
  });

  return result;
}

// Usage:
await sendSMS("+1555123456", "Your ride is here!");
```

### 10.2 Stripe Integration

Stripe handles payments and driver payouts.

#### Step 1: Create Stripe Account

1. Visit [stripe.com](https://stripe.com)
2. Click "Sign Up"
3. Enter email and password
4. Verify email

#### Step 2: Get Credentials

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Click **Developers** → **API Keys**
3. Copy **Publishable Key** (pk_test_...)
4. Copy **Secret Key** (STRIPE_KEY_PLACEHOLDER)

#### Step 3: Add to .env

```env
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_SECRET_KEY=<YOUR_STRIPE_SECRET_KEY>
```

#### Step 4: Process Payment

```typescript
// server/services/stripe.ts

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createPaymentIntent(amount: number) {
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: "usd",
  });

  return intent;
}

// Usage:
const intent = await createPaymentIntent(25.50);
// Returns: { clientSecret: "pi_...", id: "pi_..." }
```

### 10.3 Firebase Integration

Firebase provides push notifications.

#### Step 1: Create Firebase Project

1. Visit [firebase.google.com](https://firebase.google.com)
2. Click "Get Started"
3. Click "Create a project"
4. Enter project name: "RideShare"
5. Click "Create project"

#### Step 2: Get Credentials

1. Go to **Project Settings** → **Service Accounts**
2. Click **Generate New Private Key**
3. Save JSON file securely
4. Extract values for .env

#### Step 3: Add to .env

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
FIREBASE_CLIENT_EMAIL=your-email@appspot.gserviceaccount.com
```

#### Step 4: Send Push Notification

```typescript
// server/services/firebase.ts

import admin from "firebase-admin";

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
});

export async function sendPushNotification(
  token: string,
  title: string,
  body: string
) {
  const message = {
    notification: { title, body },
    token: token,
  };

  const result = await admin.messaging().send(message);
  return result;
}

// Usage:
await sendPushNotification(
  "device_token_here",
  "Ride Matched!",
  "Driver is on the way"
);
```

---

## 11. Testing

### 11.1 Run Unit Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode (re-run on file changes)
pnpm test --watch

# Run specific test file
pnpm test rideshare.test.ts

# View test coverage
pnpm test --coverage
```

### 11.2 Write a Test

```typescript
// __tests__/my-test.ts

import { describe, it, expect } from "vitest";
import { calculateFare } from "@/lib/mock-data";

describe("calculateFare", () => {
  it("should calculate fare correctly", () => {
    const fare = calculateFare(5); // 5 km
    expect(fare).toBe(15); // $5 base + $2 per km = $15
  });

  it("should handle zero distance", () => {
    const fare = calculateFare(0);
    expect(fare).toBe(5); // Base fare only
  });
});
```

### 11.3 Type Checking

```bash
# Check for TypeScript errors
pnpm check

# Fix formatting issues
pnpm format

# Run linter
pnpm lint
```

---

## 12. Deployment

### 12.1 Deploy Backend to Vercel

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy
vercel --prod

# 4. Set environment variables
vercel env add DATABASE_URL
vercel env add TWILIO_ACCOUNT_SID
# ... add other variables

# 5. Redeploy with env vars
vercel --prod
```

### 12.2 Deploy Mobile App to iOS App Store

```bash
# 1. Create Apple Developer account at developer.apple.com

# 2. Build for iOS
eas build --platform ios

# 3. Submit to App Store
eas submit --platform ios

# 4. Wait for Apple review (usually 24-48 hours)

# 5. App appears in App Store
```

### 12.3 Deploy Mobile App to Google Play

```bash
# 1. Create Google Play Developer account

# 2. Build for Android
eas build --platform android

# 3. Submit to Google Play
eas submit --platform android

# 4. Wait for Google review (usually 2-4 hours)

# 5. App appears in Google Play Store
```

---

## 13. Troubleshooting

### 13.1 Common Errors & Solutions

#### Error: "pnpm: command not found"

```bash
# Solution: Install pnpm
npm install -g pnpm

# Verify
pnpm --version
```

#### Error: "Port 8081 already in use"

```bash
# Solution: Kill process on port 8081
lsof -ti:8081 | xargs kill -9

# Or use different port
EXPO_PORT=8082 pnpm dev
```

#### Error: "Cannot find module '@/lib/...'"

```bash
# Solution: Run install again
pnpm install

# Or clear cache
rm -rf node_modules
pnpm install
```

#### Error: "Database connection failed"

```bash
# Solution: Check MySQL is running
mysql -u root -p

# If not running:
# macOS: brew services start mysql
# Linux: sudo systemctl start mysql
# Docker: docker start rideshare-mysql
```

#### Error: "TypeScript errors"

```bash
# Solution: Check errors
pnpm check

# Fix formatting
pnpm format

# Review errors and fix manually
```

### 13.2 Debug Mode

```bash
# Enable verbose logging
DEBUG=* pnpm dev

# View server logs
tail -f server.log

# View client logs
# Check browser console or Expo Go app
```

### 13.3 Reset Everything

```bash
# Clear all caches and reinstall
rm -rf node_modules .expo dist
pnpm install

# Reset database
mysql -u root -p rideshare -e "DROP DATABASE rideshare; CREATE DATABASE rideshare;"

# Restart dev server
pnpm dev
```

---

## 📚 Additional Resources

- [React Native Docs](https://reactnative.dev)
- [Expo Documentation](https://docs.expo.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [tRPC Documentation](https://trpc.io)
- [Drizzle ORM](https://orm.drizzle.team)
- [Twilio Docs](https://www.twilio.com/docs)
- [Stripe Documentation](https://stripe.com/docs)
- [Firebase Docs](https://firebase.google.com/docs)

---

## ✅ Quick Reference Cheat Sheet

```bash
# Installation
npm install -g pnpm expo-cli eas-cli
pnpm install

# Development
pnpm dev              # Start dev server
pnpm ios              # Run on iOS simulator
pnpm android          # Run on Android emulator
pnpm test             # Run tests
pnpm check            # Type check
pnpm format           # Format code
pnpm lint             # Lint code

# Database
pnpm db:push          # Create tables
mysql -u root -p      # Connect to MySQL

# Deployment
vercel --prod         # Deploy backend
eas build --platform ios      # Build for iOS
eas build --platform android  # Build for Android

# Debugging
DEBUG=* pnpm dev      # Verbose logging
lsof -ti:8081 | xargs kill -9  # Kill port
```

---

**Congratulations! You now have a complete understanding of the RideShare app from scratch to production!** 🎉

For questions, refer to the specific documentation files:
- `QUICKSTART.md` - 5-minute setup
- `README_COMPLETE.md` - Full architecture
- `INTEGRATION_GUIDE.md` - Twilio & Stripe
- `FIREBASE_SETUP.md` - Push notifications
- `DEPLOYMENT_GUIDE.md` - Production deployment
