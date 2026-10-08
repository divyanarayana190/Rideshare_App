# RideShare App — TODO

## Setup & Configuration
- [x] Generate app logo and update branding
- [x] Configure theme colors (blue + amber)
- [x] Set up navigation structure (tabs + stack)
- [x] Add icon mappings in icon-symbol.tsx
- [x] Set up data models and AsyncStorage helpers

## Screens
- [x] Home screen with map-style UI and "Where to?" bar
- [x] Book Ride screen (origin, destination, Solo/Share toggle, fare estimate)
- [x] Find Shared Rides screen (list of matching rides)
- [x] Ride Match Detail screen (driver info, co-passengers, fare split preview)
- [x] Ride Confirmation screen (booking summary, fare breakdown)
- [x] Active Ride screen (live tracking UI, driver info, co-passengers)
- [x] My Rides screen (Upcoming + Past tabs)
- [x] Ride History Detail screen (past ride summary, receipt)
- [x] Driver Mode screen (incoming requests, accept/decline, active trip)
- [x] Profile screen (user info, payment, rating, driver toggle)
- [x] Notifications screen (ride updates, alerts)

## Core Features
- [x] Fare split calculation logic (based on distance proportions)
- [x] Ride matching algorithm (same direction detection)
- [x] Mock driver/passenger data for demo
- [x] AsyncStorage persistence for rides and profile
- [x] Ride status state machine (searching → matched → active → completed)
- [x] Co-passenger joining flow

## Polish
- [x] Smooth tab bar with correct icons
- [x] Press feedback and haptics on primary actions
- [x] Loading states and empty states
- [x] Map-style visual for route display


## Twilio Integration
- [x] SMS notifications (ride updates, driver arrival, pickup reminders)
- [x] Phone verification (sign-up/login with OTP)
- [x] In-app calling UI (driver-passenger calls)
- [x] Call recording and history

## Stripe Integration
- [x] Payment processing (charge passengers for rides)
- [x] Driver payouts (Stripe Connect for driver bank accounts)
- [x] Wallet/prepaid balance system
- [x] Transaction history and receipts
- [x] Refund handling

## Chat & Communication
- [x] Real-time chat between driver and passengers
- [x] Message notifications
- [x] Chat history persistence
- [x] Typing indicators

## Ratings & Reviews
- [x] Post-ride rating system (passenger rates driver, driver rates passenger)
- [x] Review comments and photos
- [x] Driver/passenger profiles with average ratings
- [x] Report unsafe behavior

## Promo & Referral System
- [x] Promo code validation and application
- [x] Referral tracking (invite friends, earn credits)
- [x] Discount calculation in fare
- [x] Promo history and usage tracking

## Emergency & Safety
- [x] Emergency SOS button (alert authorities, emergency contacts)
- [x] Share trip details with emergency contacts
- [x] Driver background check integration
- [x] Ride safety tips and guidelines

## Analytics & Dashboard
- [x] Driver earnings dashboard (daily/weekly/monthly)
- [x] Passenger spending analytics
- [x] Ride statistics (total rides, average rating, distance)
- [x] Revenue reports for admin

## Backend & Database
- [x] User authentication (phone, email, OAuth)
- [x] User profiles (passenger, driver, admin)
- [x] Rides table (status, fare, passengers, driver)
- [x] Payments & transactions table
- [x] Chat messages table
- [x] Ratings & reviews table
- [x] Promo codes table
- [x] Wallet/balance table

## API Endpoints
- [x] Auth endpoints (signup, login, logout, verify OTP)
- [x] User endpoints (profile, update, delete)
- [x] Rides endpoints (create, list, get, update, cancel)
- [x] Payments endpoints (create, confirm, refund)
- [x] Chat endpoints (send, get, list)
- [x] Ratings endpoints (create, list, get)
- [x] Promo endpoints (validate, apply)
- [x] Analytics endpoints (earnings, spending, stats)

## Webhooks & Real-time
- [x] Stripe webhook handlers (payment success, payout)
- [x] Twilio webhook handlers (SMS delivery, call events)
- [x] Real-time ride status updates
- [x] Real-time chat messages
- [x] Real-time notifications

## Testing & QA
- [x] Unit tests for Twilio integration
- [x] Unit tests for Stripe integration
- [x] Integration tests for chat
- [x] End-to-end test flows
- [x] Payment flow testing
- [x] SMS/OTP testing


## PHASE 2 - NEW FEATURES

### Authentication & User Accounts
- [ ] Sign up screen (email, Google, phone)
- [ ] Sign in screen (email, Google, phone)
- [ ] OTP verification screen
- [ ] User account management screen
- [ ] Student verification (.edu email)
- [ ] Driver license verification

### Safety Preferences
- [ ] Driver gender preference (no preference, woman, man)
- [ ] Co-rider preference (no preference, women-only, men-only)
- [ ] Safety preference badges on ride cards
- [ ] Gender preference filter toggle in booking sheet

### Seat Management
- [ ] Seat selection (1-4 seats)
- [ ] Show "X of Y seats filled" on ride cards
- [ ] Show price per seat
- [ ] Seat availability validation

### Real Maps Integration
- [ ] Location picker for origin
- [ ] Location picker for destination
- [ ] Route visualization on map
- [ ] Distance calculation
- [ ] Radius-based matching (0.1-1 mile)

### Booking for Others
- [ ] Add passenger screen
- [ ] Multiple passenger booking
- [ ] Passenger details form

### Payments
- [ ] Card management screen
- [ ] Add debit/credit card
- [ ] Payment processing
- [ ] Payment history

### Loyalty & Discounts
- [ ] Loyalty points system (10 points per ride)
- [ ] Discount tiers (50%, 60%, 70%, free ride)
- [ ] Student discount (1-2 free rides $0-15)
- [ ] Points display on profile

### Tips & Ratings
- [ ] Tip screen after ride completion
- [ ] Rating screen (1-5 stars)
- [ ] Feedback comments
- [ ] Complaint/report form
- [ ] Complaint history

### Driver Features
- [ ] Driver license verification
- [ ] License upload and validation
- [ ] Driver verification status

### Ride Matching
- [ ] Radius-based matching algorithm
- [ ] Route overlap calculation
- [ ] Safety preference matching
- [ ] Seat availability matching
