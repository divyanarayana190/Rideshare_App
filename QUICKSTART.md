# RideShare App - Quick Start Guide

Get your RideShare app running in 5 minutes!

## 🚀 Installation (5 minutes)

### 1. Clone and Install

```bash
cd rideshare-app
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials (optional for development):

```env
# Leave empty for mock data during development
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
STRIPE_PUBLISHABLE_KEY=
DATABASE_URL=
```

### 3. Start Development Server

```bash
pnpm dev
```

You'll see:
```
Metro Bundler ready at http://localhost:8081
API server ready at http://localhost:3000
QR code: exps://...
```

### 4. Open in Expo Go

**Option A: Scan QR Code**
- Install [Expo Go](https://expo.dev/client) on your phone
- Scan the QR code from terminal

**Option B: Web Browser**
- Visit `http://localhost:8081`
- Use web preview

**Option C: Simulator**
```bash
pnpm ios      # iOS Simulator
pnpm android  # Android Emulator
```

## 📱 Test the App

### Home Screen
- Tap "Where to?" to book a ride
- See nearby drivers and popular destinations

### Book a Ride
1. Enter origin and destination
2. Toggle "Share Ride" to find co-passengers
3. See live fare estimate
4. Tap "Book Ride"

### Find Shared Rides
- See matching rides with other passengers
- View co-passenger info and fare split
- Join a ride to share costs

### Driver Mode
1. Go to Profile → Toggle "Driver Mode"
2. See incoming ride requests
3. Accept/decline rides
4. Track active ride

### Chat
- Message driver or co-passengers
- Real-time chat during ride

### Wallet
- Add funds to prepaid balance
- View transaction history
- See savings from shared rides

## 🧪 Test Data

The app comes with mock data for testing:

```typescript
// Mock drivers
- John Smith (4.8★, 500 rides)
- Sarah Johnson (4.9★, 800 rides)
- Mike Chen (4.7★, 350 rides)

// Mock rides
- NYC → JFK Airport ($28.50)
- Times Square → Brooklyn Bridge ($12.30)
- Central Park → Grand Central ($8.75)

// Mock users
- You (Passenger)
- Test Driver
- Test Co-passengers
```

## 🔧 Common Tasks

### Run Tests

```bash
pnpm test
```

### Check TypeScript

```bash
pnpm check
```

### Format Code

```bash
pnpm format
```

### Lint Code

```bash
pnpm lint
```

### View Logs

```bash
# Metro bundler logs
pnpm dev

# Server logs (separate terminal)
pnpm dev:server

# Client logs
# Check Expo Go app or browser console
```

## 🎨 Customize Theme

Edit `theme.config.js`:

```javascript
const themeColors = {
  primary: { light: '#0a7ea4', dark: '#0a7ea4' },      // Blue
  background: { light: '#ffffff', dark: '#151718' },   // White/Dark
  surface: { light: '#f5f5f5', dark: '#1e2022' },      // Light gray
  foreground: { light: '#11181C', dark: '#ECEDEE' },   // Text
  success: { light: '#22C55E', dark: '#4ADE80' },      // Green
  error: { light: '#EF4444', dark: '#F87171' },        // Red
  warning: { light: '#F59E0B', dark: '#FBBF24' },      // Orange
};
```

## 📱 Add New Screens

### 1. Create Screen File

```bash
touch app/my-screen.tsx
```

### 2. Add Screen Code

```typescript
import { ScreenContainer } from "@/components/screen-container";
import { Text } from "react-native";

export default function MyScreen() {
  return (
    <ScreenContainer className="p-4">
      <Text className="text-2xl font-bold text-foreground">
        My Screen
      </Text>
    </ScreenContainer>
  );
}
```

### 3. Add Navigation

In `app/(tabs)/_layout.tsx`:

```typescript
<Tabs.Screen
  name="my-screen"
  options={{
    title: "My Screen",
    tabBarIcon: ({ color }) => (
      <IconSymbol name="star.fill" color={color} />
    ),
  }}
/>
```

## 🔌 Connect to Real Backend

### 1. Update API URL

In `.env`:

```env
EXPO_PUBLIC_API_URL=https://your-api.com
API_URL=https://your-api.com
```

### 2. Restart Dev Server

```bash
# Stop current server (Ctrl+C)
pnpm dev
```

### 3. Test API Connection

```bash
# Check API health
curl https://your-api.com/api/health
```

## 🚀 Deploy

### Deploy Backend

```bash
# Vercel (easiest)
vercel --prod

# AWS Lambda
cdk deploy

# Firebase Functions
firebase deploy --only functions
```

### Deploy Mobile App

```bash
# iOS
eas build --platform ios --auto-submit

# Android
eas build --platform android --auto-submit
```

## 🆘 Troubleshooting

### App won't start

```bash
# Clear cache
rm -rf .expo node_modules
pnpm install

# Restart dev server
pnpm dev
```

### Port already in use

```bash
# Kill process on port 8081
lsof -ti:8081 | xargs kill -9

# Or use different port
EXPO_PORT=8082 pnpm dev
```

### Metro bundler error

```bash
# Clear Metro cache
pnpm dev --clear

# Or manually
rm -rf .expo
pnpm dev
```

### TypeScript errors

```bash
# Check all errors
pnpm check

# Fix formatting
pnpm format
```

## 📚 Next Steps

1. **Customize branding** - Update app name, logo, colors
2. **Add real maps** - Integrate react-native-maps
3. **Connect Twilio** - Set up SMS and calling
4. **Connect Stripe** - Enable real payments
5. **Deploy backend** - Choose Vercel, AWS, or Firebase
6. **Submit to stores** - iOS App Store and Google Play

## 📖 Documentation

- [README_COMPLETE.md](./README_COMPLETE.md) - Full architecture
- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Twilio & Stripe setup
- [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) - Push notifications
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Production deployment

## 💬 Need Help?

- Check [Expo Docs](https://docs.expo.dev)
- Review [React Native Docs](https://reactnative.dev)
- Visit [tRPC Docs](https://trpc.io)
- Open an issue on GitHub

---

**Happy coding! 🎉**
