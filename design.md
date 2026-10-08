# RideShare App — Design Document

## Brand Identity
- **App Name:** RideShare
- **Tagline:** Split Your Ride, Share the Cost
- **Primary Color:** #1A56DB (deep blue — trust, reliability)
- **Accent Color:** #F59E0B (amber — energy, action)
- **Background:** #F8FAFC (light) / #0F172A (dark)
- **Surface:** #FFFFFF (light) / #1E293B (dark)
- **Success:** #10B981 (green)
- **Error:** #EF4444 (red)

---

## Screen List

1. **Onboarding / Welcome** — First launch splash with app intro and Login/Sign Up CTA
2. **Home (Map View)** — Interactive map with current location, nearby drivers, quick ride booking bar
3. **Book Ride** — Origin/destination input, ride type selector (Solo / Share), estimated fare preview
4. **Find Shared Rides** — List of active rides going in same direction, filter by route proximity
5. **Ride Match Detail** — Details of a shared ride: driver info, co-passengers, fare split preview, join CTA
6. **Ride Confirmation** — Booking summary, fare split breakdown, confirm & pay button
7. **Active Ride** — Live map with driver location, ETA, co-passengers list, fare meter
8. **My Rides** — Tab: Upcoming rides, Past rides history
9. **Ride History Detail** — Past ride summary: route, co-passengers, amount paid, receipt
10. **Driver Mode** — Toggle to driver: see ride requests, accept/decline, active trip management
11. **Profile** — User info, payment methods, rating, preferences
12. **Notifications** — Ride updates, match found alerts, payment confirmations

---

## Primary Content and Functionality

### Home (Map View)
- Map centered on user's current location
- Floating bottom sheet: "Where to?" search bar
- Nearby available drivers shown as car icons
- Quick action buttons: Book Solo, Share Ride
- Active ride banner if ride in progress

### Book Ride
- Auto-filled pickup from current location (editable)
- Destination search with autocomplete suggestions
- Ride type toggle: **Solo** (full fare) vs **Share** (split fare)
- Estimated fare range shown dynamically
- Estimated time to pickup
- "Find Shared Rides" button when Share mode selected

### Find Shared Rides
- List of rides going in same general direction
- Each card shows: driver name/rating, route overlap %, seats available, estimated fare share
- Filter: departure time, max detour distance
- "Join Ride" CTA on each card

### Ride Match Detail
- Map preview of shared route
- Driver card: name, photo, rating, vehicle info
- Co-passengers: avatars + pickup points
- Fare split table: each passenger's share based on distance
- "Join This Ride" button

### Ride Confirmation
- Full booking summary
- Fare breakdown: base fare, your share, platform fee
- Payment method selector
- "Confirm Booking" button

### Active Ride
- Full-screen map with live driver location
- ETA chip at top
- Bottom sheet: driver info, co-passengers, "Cancel" option
- Fare meter (running total)

### My Rides
- Two tabs: Upcoming / Past
- Upcoming: ride card with date, route, co-passengers count, fare share
- Past: completed rides with receipt access

### Driver Mode
- Toggle in Profile to switch to Driver
- Incoming ride requests with route preview
- Accept/Decline with 15s timer
- Active trip: passenger list, route, earnings

---

## Key User Flows

### Flow 1: Book a Shared Ride
1. Home → tap "Where to?" bar
2. Book Ride screen → enter destination
3. Select "Share" mode → tap "Find Shared Rides"
4. Find Shared Rides → browse matching rides
5. Tap a ride → Ride Match Detail
6. Review fare split → tap "Join This Ride"
7. Ride Confirmation → confirm payment → booking confirmed
8. Active Ride screen → track driver in real-time

### Flow 2: Create a New Shared Ride (as first passenger)
1. Home → tap "Where to?"
2. Book Ride → enter destination → select "Share"
3. No matching rides found → tap "Create Shared Ride"
4. Ride Confirmation → confirm → ride posted to pool
5. Active Ride → wait for co-passengers to join → driver assigned

### Flow 3: Driver Accept Ride
1. Profile → toggle "Driver Mode"
2. Driver Home → incoming request notification
3. Accept → see full route with all passengers
4. Start trip → navigate to each pickup
5. Complete trip → earnings summary shown

---

## Color Choices

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| primary | #1A56DB | #3B82F6 | Buttons, active states, links |
| accent | #F59E0B | #FBBF24 | Fare highlights, badges |
| background | #F8FAFC | #0F172A | Screen backgrounds |
| surface | #FFFFFF | #1E293B | Cards, sheets |
| foreground | #0F172A | #F1F5F9 | Primary text |
| muted | #64748B | #94A3B8 | Secondary text |
| success | #10B981 | #34D399 | Confirmed, completed |
| error | #EF4444 | #F87171 | Cancelled, errors |
| border | #E2E8F0 | #334155 | Dividers, outlines |

---

## Navigation Structure

```
(tabs)/
  index.tsx          ← Home (Map)
  rides.tsx          ← My Rides
  profile.tsx        ← Profile

(stack)/
  book-ride.tsx      ← Book Ride flow
  find-shared.tsx    ← Find Shared Rides
  ride-detail/[id].tsx   ← Ride Match Detail
  confirm-ride.tsx   ← Confirmation
  active-ride.tsx    ← Active Ride tracker
  ride-history/[id].tsx  ← Past Ride Detail
  driver-mode.tsx    ← Driver Dashboard
  notifications.tsx  ← Notifications
```
