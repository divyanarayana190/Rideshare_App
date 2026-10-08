# RideShare App - Integration Guide

This guide explains how to integrate Twilio and Stripe into your production RideShare app.

## Table of Contents

1. [Twilio Integration](#twilio-integration)
2. [Stripe Integration](#stripe-integration)
3. [Environment Variables](#environment-variables)
4. [Testing](#testing)
5. [Deployment](#deployment)

---

## Twilio Integration

### What's Included

The app includes a complete Twilio service module (`server/services/twilio.ts`) with:

- **SMS Notifications** - Send ride updates, pickup reminders, payment confirmations
- **Phone Verification** - Verify user phone numbers during signup
- **In-App Calling** - Connect drivers and passengers via phone calls
- **Call Recording** - Automatically record calls for safety

### Setup Steps

#### 1. Create a Twilio Account

1. Go to [twilio.com](https://www.twilio.com)
2. Sign up and verify your email and phone number
3. Go to your [Twilio Console](https://console.twilio.com)
4. Copy your **Account SID** and **Auth Token** (keep these secret!)

#### 2. Get a Twilio Phone Number

1. In the Console, go to **Phone Numbers** → **Manage** → **Active Numbers**
2. Click **Get a Number** and choose a number for your region
3. Copy the phone number (e.g., +1-555-123-4567)

#### 3. Set Up Verify API (for phone verification)

1. Go to **Verify** → **Services** → **Create Service**
2. Name it "RideShare"
3. Copy the **Service SID**

#### 4. Install Twilio Package

The package is already installed in `package.json`. If you need to reinstall:

```bash
pnpm add twilio
```

#### 5. Add Environment Variables

Create a `.env` file in the project root:

```env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1-555-123-4567
TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid_here
```

### Using Twilio in Your App

#### Send SMS

```typescript
import { sendSMS } from "@/server/services/twilio";

// Send a simple SMS
await sendSMS("+1-555-987-6543", "Your ride is arriving in 5 minutes!");

// Send a ride notification
await sendRideNotification("+1-555-987-6543", {
  driverName: "John",
  driverPhone: "+1-555-123-4567",
  pickupTime: "2:30 PM",
  pickupAddress: "123 Main St",
  dropoffAddress: "456 Park Ave",
  fare: 24.50,
});
```

#### Phone Verification

```typescript
import { sendVerificationCode, verifyPhoneCode } from "@/server/services/twilio";

// Send verification code
await sendVerificationCode("+1-555-987-6543");

// Verify the code (user enters it in app)
const isVerified = await verifyPhoneCode("+1-555-987-6543", "123456");
```

#### In-App Calling

```typescript
import { initiateCall, getCallStatus, endCall } from "@/server/services/twilio";

// Start a call
const callSid = await initiateCall("+1-555-987-6543", "https://your-app.com/api/twilio/call");

// Check call status
const status = await getCallStatus(callSid);

// End the call
await endCall(callSid);
```

---

## Stripe Integration

### What's Included

The app includes a complete Stripe service module (`server/services/stripe.ts`) with:

- **Payment Processing** - Charge passengers for rides
- **Stripe Connect** - Pay out drivers to their bank accounts
- **Wallet System** - Prepaid balance for faster checkout
- **Refunds** - Handle cancellations and disputes
- **Webhook Support** - Real-time payment confirmations

### Setup Steps

#### 1. Create a Stripe Account

1. Go to [stripe.com](https://stripe.com)
2. Sign up and complete your business profile
3. Go to your [Stripe Dashboard](https://dashboard.stripe.com)
4. Click **Developers** (bottom left) → **API Keys**
5. Copy your **Publishable Key** and **Secret Key**

#### 2. Set Up Stripe Connect (for driver payouts)

1. In the Dashboard, go to **Settings** → **Connect Settings**
2. Enable **Express Accounts** for drivers
3. This allows drivers to connect their bank accounts for payouts

#### 3. Create Webhook Endpoint

1. Go to **Developers** → **Webhooks**
2. Click **Add Endpoint**
3. Enter your webhook URL: `https://your-app.com/api/webhooks/stripe`
4. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`
5. Copy the **Webhook Secret**

#### 4. Install Stripe Package

The package is already installed in `package.json`. If you need to reinstall:

```bash
pnpm add stripe
```

#### 5. Add Environment Variables

Add to your `.env` file:

```env
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_SECRET_KEY=<YOUR_STRIPE_SECRET_KEY>
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Using Stripe in Your App

#### Create Payment Intent

```typescript
import { createPaymentIntent, confirmPaymentIntent } from "@/server/services/stripe";

// Create a payment intent for a $24.50 ride
const payment = await createPaymentIntent(24.50, "usd", {
  rideId: "ride_123",
  passengerId: 1,
});

// payment.clientSecret - send to frontend for payment form
// payment.intentId - store in database
```

#### Process Payment

```typescript
// On frontend: Use Stripe.js to collect card details
// Then confirm the payment with the clientSecret

const result = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: { name: "John Doe" },
  },
});

// Backend receives webhook confirmation
```

#### Handle Refunds

```typescript
import { refundPayment } from "@/server/services/stripe";

// Refund a payment
const refund = await refundPayment("pi_1234567890", 24.50);
```

#### Create Driver Connect Account

```typescript
import { createConnectAccount, createPayout } from "@/server/services/stripe";

// Create a Connect account for a driver
const account = await createConnectAccount(driverId, {
  email: "driver@example.com",
  firstName: "John",
  lastName: "Doe",
  dateOfBirth: "1990-01-01",
  address: "123 Main St",
  city: "New York",
  state: "NY",
  postalCode: "10001",
});

// account.connectId - store in database

// Later, create a payout to the driver
const payout = await createPayout(account.connectId, 150.00);
```

---

## Environment Variables

Create a `.env` file in the project root with all required variables:

```env
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1-555-123-4567
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Stripe
STRIPE_PUBLISHABLE_KEY=pk_test_51234567890abcdefghijklmnopqrstu
STRIPE_SECRET_KEY=<YOUR_STRIPE_SECRET_KEY>
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdefghijklmnopqrstu

# Database
DATABASE_URL=mysql://user:password@localhost:3306/rideshare

# API
API_URL=http://localhost:3000
EXPO_PUBLIC_API_URL=http://localhost:3000

# Environment
NODE_ENV=development
```

---

## Testing

### Test Twilio SMS

```bash
# In server/routers.ts, add a test endpoint
test: publicProcedure.mutation(async () => {
  const success = await sendSMS("+1-555-123-4567", "Test SMS from RideShare!");
  return { success };
});
```

### Test Stripe Payments

Use Stripe's test card numbers:

| Card Number | Use Case |
|---|---|
| 4242 4242 4242 4242 | Successful payment |
| 4000 0000 0000 0002 | Card declined |
| 4000 0025 0000 3155 | Requires authentication |

### Test Phone Verification

Use Twilio's test credentials (no real SMS sent):

```typescript
await sendVerificationCode("+15005550006"); // Always succeeds
await verifyPhoneCode("+15005550006", "123456"); // Always succeeds
```

---

## Deployment

### Production Checklist

- [ ] Switch Stripe to **live keys** (not test keys)
- [ ] Switch Twilio to **production account** (not trial)
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS for all API endpoints
- [ ] Set up proper error logging and monitoring
- [ ] Test all payment flows end-to-end
- [ ] Set up SMS rate limiting to prevent abuse
- [ ] Configure webhook retry policies
- [ ] Enable PCI compliance for payment handling
- [ ] Set up fraud detection in Stripe Dashboard

### Deploy to Production

```bash
# Build the app
pnpm build

# Deploy to your hosting provider
# Make sure all environment variables are set in production
```

---

## Troubleshooting

### Twilio SMS Not Sending

1. Check that `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are correct
2. Verify `TWILIO_PHONE_NUMBER` is a valid Twilio number
3. Check phone number format: must start with `+` and country code
4. Check Twilio account balance (trial accounts have limits)

### Stripe Payments Failing

1. Check that `STRIPE_SECRET_KEY` starts with `STRIPE_KEY_PLACEHOLDER` or `STRIPE_KEY_PLACEHOLDER`
2. Verify webhook secret is correct
3. Check that payment intent amount is in cents (multiply by 100)
4. Ensure card details are being collected properly on frontend

### Phone Verification Not Working

1. Check that `TWILIO_VERIFY_SERVICE_SID` is correct
2. Verify phone number format includes country code
3. Check that user is entering the correct code
4. Verify service is active in Twilio Console

---

## Support

For more information:

- [Twilio Documentation](https://www.twilio.com/docs)
- [Stripe Documentation](https://stripe.com/docs)
- [Expo Documentation](https://docs.expo.dev)

---

## Next Steps

1. **Add real-time notifications** - Use Socket.io for live ride updates
2. **Implement map integration** - Add `expo-maps` or `react-native-maps`
3. **Add push notifications** - Use `expo-notifications` with Firebase
4. **Set up analytics** - Track user behavior and ride metrics
5. **Add accessibility features** - Screen reader support, high contrast mode

Good luck with your RideShare app! 🚗
