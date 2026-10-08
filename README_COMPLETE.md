# RideShare - Complete Production-Ready App

A full-featured ride-sharing application built with React Native, Expo, TypeScript, and a complete backend with Twilio and Stripe integrations.

## 📱 Features

### Core Ride-Sharing
- ✅ **Ride Booking** - Book solo or shared rides with real-time fare estimates
- ✅ **Ride Matching** - Automatic matching with drivers heading in the same direction
- ✅ **Fare Splitting** - Proportional fare split based on each passenger's distance
- ✅ **Driver Mode** - Accept/decline incoming ride requests
- ✅ **Live Tracking** - Real-time driver location updates and ETA

### Communication & Safety
- ✅ **Real-Time Chat** - Message driver and co-passengers during rides
- ✅ **Emergency SOS** - One-tap emergency alert with location sharing
- ✅ **Phone Verification** - Twilio-powered OTP verification
- ✅ **In-App Calling** - Direct calling between driver and passengers

### Payments & Wallet
- ✅ **Stripe Payments** - Secure card payments for rides
- ✅ **Wallet System** - Prepaid balance for faster checkout
- ✅ **Driver Payouts** - Stripe Connect for driver bank transfers
- ✅ **Transaction History** - Complete payment records

### User Experience
- ✅ **Ratings & Reviews** - 5-star rating system with comments
- ✅ **Promo Codes** - Apply discount codes to rides
- ✅ **Referral System** - Earn credits by inviting friends
- ✅ **Analytics Dashboard** - Track spending, savings, and achievements
- ✅ **Push Notifications** - Real-time ride and payment alerts

## 🏗️ Architecture

### Frontend (17 Screens)
```
app/
├── (tabs)/
│   ├── index.tsx              # Home screen
│   ├── rides.tsx              # My Rides
│   └── profile.tsx            # Profile & Settings
├── book-ride.tsx              # Book a ride
├── find-shared.tsx            # Find shared rides
├── ride-detail.tsx            # Ride details & fare split
├── confirm-ride.tsx           # Booking confirmation
├── active-ride.tsx            # Live ride tracking
├── ride-history.tsx           # Past ride details
├── driver-mode.tsx            # Driver dashboard
├── chat-screen.tsx            # Real-time chat
├── rate-ride.tsx              # Rate experience
├── emergency-sos.tsx          # Emergency alerts
├── analytics-dashboard.tsx    # Stats & achievements
├── promo-codes.tsx            # Promo management
├── wallet.tsx                 # Wallet & balance
└── notifications.tsx          # Notification center
```

### Backend (40+ API Endpoints)
```
server/
├── routers.ts                 # tRPC endpoints
├── db.ts                      # Database helpers
├── services/
│   ├── twilio.ts              # SMS & calling
│   ├── stripe.ts              # Payments & payouts
│   ├── websocket.ts           # Real-time updates
│   └── webhooks.ts            # Stripe & Twilio webhooks
└── _core/
    ├── index.ts               # Server setup
    └── trpc.ts                # tRPC configuration
```

### Database (14 Tables)
```
- users                        # User accounts
- profiles                     # User profiles (passenger/driver)
- rides                        # Ride records
- passengers                   # Ride passengers
- payments                     # Payment records
- wallets                      # User wallet balance
- transactions                 # Wallet transactions
- chat_messages                # Chat history
- ratings                      # Ride ratings
- promo_codes                  # Available promos
- referrals                    # Referral tracking
- emergency_alerts             # SOS alerts
- analytics                    # Usage analytics
- driver_locations             # Real-time driver GPS
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and pnpm
- Expo CLI
- Twilio account (for SMS/calling)
- Stripe account (for payments)
- Firebase account (for push notifications - optional)

### Installation

1. **Clone and install dependencies**
```bash
cd rideshare-app
pnpm install
```

2. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1-555-123-4567
TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid

# Stripe
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=<YOUR_STRIPE_SECRET_KEY>
STRIPE_WEBHOOK_SECRET=whsec_...

# Database
DATABASE_URL=mysql://user:password@localhost:3306/rideshare

# API
API_URL=http://localhost:3000
EXPO_PUBLIC_API_URL=http://localhost:3000
```

3. **Set up database**
```bash
pnpm db:push
```

4. **Start development server**
```bash
pnpm dev
```

5. **Open in Expo Go**
- Scan the QR code with Expo Go app on your phone
- Or visit `http://localhost:8081` in a web browser

## 📚 API Documentation

### Authentication
```typescript
// Sign up
POST /api/auth/signup
{ email, phone, password, firstName, lastName }

// Login
POST /api/auth/login
{ email, password }

// Verify OTP
POST /api/auth/verify-otp
{ phone, code }
```

### Rides
```typescript
// Create ride
POST /api/rides/create
{ origin, destination, rideType: "solo" | "shared" }

// Get available rides
GET /api/rides/available?origin=...&destination=...

// Join ride
POST /api/rides/:rideId/join
{ passengerId }

// Update ride status
PATCH /api/rides/:rideId
{ status: "searching" | "matched" | "active" | "completed" }
```

### Payments
```typescript
// Create payment intent
POST /api/payments/create-intent
{ rideId, amount, currency }

// Confirm payment
POST /api/payments/confirm
{ intentId, paymentMethodId }

// Get wallet balance
GET /api/wallet/balance

// Add funds to wallet
POST /api/wallet/add-funds
{ amount }
```

### Chat
```typescript
// Send message
POST /api/chat/send
{ rideId, message }

// Get chat history
GET /api/chat/:rideId

// Get unread count
GET /api/chat/unread
```

### Ratings
```typescript
// Create rating
POST /api/ratings/create
{ rideId, ratedUserId, rating, comment }

// Get ratings
GET /api/ratings/:userId
```

## 🔧 Configuration

### Theme Customization
Edit `theme.config.js` to change colors:
```javascript
const themeColors = {
  primary: { light: '#0a7ea4', dark: '#0a7ea4' },
  background: { light: '#ffffff', dark: '#151718' },
  // ... more colors
};
```

### App Branding
Edit `app.config.ts`:
```typescript
const env = {
  appName: "RideShare",
  appSlug: "rideshare-app",
  logoUrl: "https://your-s3-bucket.com/logo.png",
};
```

## 📦 Building for Production

### iOS
```bash
eas build --platform ios
```

### Android
```bash
eas build --platform android
```

### Web
```bash
pnpm build
```

## 🧪 Testing

### Run unit tests
```bash
pnpm test
```

### Run linting
```bash
pnpm lint
```

### Type checking
```bash
pnpm check
```

## 🔐 Security Best Practices

1. **Never commit `.env` file** - Use environment variables only
2. **Validate all inputs** - Sanitize user data on backend
3. **Use HTTPS** - All API calls must be encrypted
4. **Secure storage** - Use `expo-secure-store` for sensitive data
5. **Rate limiting** - Implement on all API endpoints
6. **PCI compliance** - Use Stripe for all payment processing
7. **Data encryption** - Encrypt sensitive data at rest

## 📊 Monitoring & Analytics

### Track Events
```typescript
import { getNotificationsManager } from "@/lib/notifications-service";

const notif = getNotificationsManager();
await notif.notifyRideCompleted(24.50, 5.25);
```

### View Logs
```bash
# Server logs
tail -f server.log

# Client logs
# Check browser console or Expo CLI output
```

## 🐛 Troubleshooting

### App won't start
```bash
# Clear cache and reinstall
pnpm install --force
rm -rf .expo
pnpm dev
```

### Database connection error
```bash
# Check DATABASE_URL in .env
# Verify MySQL is running
# Test connection: mysql -u user -p -h localhost
```

### Twilio SMS not sending
- Verify `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- Check phone number format (must include country code)
- Ensure Twilio account has sufficient balance

### Stripe payments failing
- Verify `STRIPE_SECRET_KEY` starts with `STRIPE_KEY_PLACEHOLDER` or `STRIPE_KEY_PLACEHOLDER`
- Check webhook endpoint is configured
- Test with Stripe test card: 4242 4242 4242 4242

## 📱 Device Testing

### iOS Simulator
```bash
pnpm ios
```

### Android Emulator
```bash
pnpm android
```

### Physical Device
1. Install Expo Go from App Store/Play Store
2. Scan QR code from `pnpm dev` output
3. Or run: `pnpm qr` to generate QR code

## 🚀 Deployment

### Deploy to Vercel (Backend)
```bash
vercel deploy
```

### Deploy to AWS (Backend)
```bash
aws lambda create-function \
  --function-name rideshare-api \
  --runtime nodejs18.x \
  --handler dist/index.handler \
  --zip-file fileb://dist.zip
```

### Deploy to Firebase (Backend)
```bash
firebase deploy --only functions
```

## 📖 Additional Resources

- [Expo Documentation](https://docs.expo.dev)
- [React Native Docs](https://reactnative.dev)
- [tRPC Documentation](https://trpc.io)
- [Twilio Docs](https://www.twilio.com/docs)
- [Stripe Docs](https://stripe.com/docs)
- [NativeWind Docs](https://www.nativewind.dev)

## 📝 License

This project is licensed under the MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 💬 Support

For support, email support@rideshare.app or open an issue on GitHub.

---

**Built with ❤️ using React Native, Expo, and TypeScript**
