# Stripe & Twilio Integration Setup Guide

This guide walks you through setting up Stripe and Twilio for your RideShare app.

---

## Part 1: Stripe Setup

### Step 1: Create Stripe Account

1. Go to [stripe.com](https://stripe.com)
2. Click **Sign Up**
3. Enter your email and create a password
4. Verify your email
5. Complete your business information
6. Verify your phone number

### Step 2: Get Your API Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Click **Developers** (bottom left)
3. Click **API Keys**
4. You'll see two keys:
   - **Publishable Key** - Safe to use on frontend (starts with `pk_`)
   - **Secret Key** - Keep private! Only use on backend (starts with `sk_`)

### Step 3: Set Up Stripe Connect (For Driver Payouts)

1. In Stripe Dashboard, go to **Settings** → **Connect Settings**
2. Enable **Express Accounts** for drivers
3. This allows drivers to connect their bank accounts for payouts

### Step 4: Create Test Cards

Use these test card numbers for development:

```
Visa:           4242 4242 4242 4242
Mastercard:     5555 5555 5555 4444
Amex:           3782 822463 10005
Declined:       4000 0000 0000 0002
```

Expiry: Any future date (e.g., 12/25)
CVC: Any 3 digits (e.g., 123)

### Step 5: Add Keys to Your App

Create a `.env` file in your project root:

```bash
# .env
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_SECRET_KEY=<YOUR_STRIPE_SECRET_KEY>
```

**IMPORTANT:** Never commit `.env` to git! Add to `.gitignore`:

```bash
echo ".env" >> .gitignore
```

---

## Part 2: Twilio Setup

### Step 1: Create Twilio Account

1. Go to [twilio.com](https://www.twilio.com)
2. Click **Sign Up**
3. Enter your email and create a password
4. Verify your email and phone number
5. Complete your profile

### Step 2: Get Your Account Credentials

1. Go to [Twilio Console](https://console.twilio.com)
2. You'll see your **Account SID** and **Auth Token** on the dashboard
3. **Save these securely** - you'll need them

### Step 3: Get a Twilio Phone Number

1. In Twilio Console, go to **Phone Numbers** → **Manage** → **Active Numbers**
2. Click **Get a Number**
3. Choose your country and area code
4. Select a number
5. **Save this number** - it's used for sending SMS

### Step 4: Set Up Verify API (For OTP)

1. In Twilio Console, go to **Verify** → **Services**
2. Click **Create Service**
3. Name it "RideShare"
4. Click **Create**
5. **Copy the Service SID** - you'll need this for OTP verification

### Step 5: Add Keys to Your App

Update your `.env` file:

```bash
# .env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid_here
```

---

## Part 3: Backend Integration

### Stripe Payment Processing

```typescript
// server/services/stripe.ts

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
});

export async function createPaymentIntent(
  amount: number,
  customerId: string,
  rideId: string
) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: "usd",
    customer: customerId,
    metadata: {
      rideId: rideId,
    },
  });

  return paymentIntent.client_secret;
}

export async function confirmPayment(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent.status === "succeeded";
}

export async function createConnectAccount(driverId: string) {
  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    email: `driver-${driverId}@rideshare.app`,
  });

  return account.id;
}

export async function createTransfer(
  amount: number,
  connectedAccountId: string,
  rideId: string
) {
  const transfer = await stripe.transfers.create({
    amount: Math.round(amount * 100),
    currency: "usd",
    destination: connectedAccountId,
    metadata: {
      rideId: rideId,
    },
  });

  return transfer.id;
}
```

### Twilio SMS & OTP

```typescript
// server/services/twilio.ts

import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID!;

// Send SMS
export async function sendSMS(phoneNumber: string, message: string) {
  const result = await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: phoneNumber,
  });

  return result.sid;
}

// Send OTP
export async function sendOTP(phoneNumber: string) {
  const verification = await client.verify.v2.services(verifySid).verifications.create({
    to: phoneNumber,
    channel: "sms",
  });

  return verification.sid;
}

// Verify OTP
export async function verifyOTP(phoneNumber: string, code: string) {
  const verificationCheck = await client.verify.v2
    .services(verifySid)
    .verificationChecks.create({
      to: phoneNumber,
      code: code,
    });

  return verificationCheck.status === "approved";
}

// Send ride notifications
export async function notifyRideUpdate(
  phoneNumber: string,
  driverName: string,
  eta: number
) {
  const message = `Your ${driverName} is on the way! ETA: ${eta} minutes.`;
  return sendSMS(phoneNumber, message);
}

export async function notifyRideCompleted(
  phoneNumber: string,
  fare: number,
  driverName: string
) {
  const message = `Ride with ${driverName} completed! Total: $${fare.toFixed(2)}. Rate your driver in the app.`;
  return sendSMS(phoneNumber, message);
}
```

### API Endpoints

```typescript
// server/routers.ts

export const appRouter = router({
  // Stripe - Create Payment Intent
  createPaymentIntent: protectedProcedure
    .input(z.object({
      amount: z.number(),
      rideId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const clientSecret = await createPaymentIntent(
        input.amount,
        ctx.user.id,
        input.rideId
      );

      return { clientSecret };
    }),

  // Stripe - Confirm Payment
  confirmPayment: protectedProcedure
    .input(z.object({
      paymentIntentId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const success = await confirmPayment(input.paymentIntentId);
      return { success };
    }),

  // Twilio - Send OTP
  sendOTP: publicProcedure
    .input(z.object({
      phoneNumber: z.string(),
    }))
    .mutation(async ({ input }) => {
      const sid = await sendOTP(input.phoneNumber);
      return { sid };
    }),

  // Twilio - Verify OTP
  verifyOTP: publicProcedure
    .input(z.object({
      phoneNumber: z.string(),
      code: z.string(),
    }))
    .mutation(async ({ input }) => {
      const verified = await verifyOTP(input.phoneNumber, input.code);
      return { verified };
    }),

  // Twilio - Send Ride Notification
  notifyRideUpdate: protectedProcedure
    .input(z.object({
      phoneNumber: z.string(),
      driverName: z.string(),
      eta: z.number(),
    }))
    .mutation(async ({ input }) => {
      const messageSid = await notifyRideUpdate(
        input.phoneNumber,
        input.driverName,
        input.eta
      );

      return { messageSid };
    }),
});
```

---

## Part 4: Frontend Integration

### Payment Form

```typescript
// app/payment-checkout.tsx

import { loadStripe } from "@stripe/stripe-js";
import { CardElement, Elements, useStripe, useElements } from "@stripe/react-stripe-js";
import { useState } from "react";

const stripePromise = loadStripe(
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export function PaymentCheckout({ rideId, amount }: { rideId: string; amount: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePayment = async () => {
    if (!stripe || !elements) return;

    setLoading(true);
    setError("");

    try {
      // 1. Create payment intent on backend
      const response = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, rideId }),
      });

      const { clientSecret } = await response.json();

      // 2. Confirm payment with Stripe
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
        },
      });

      if (result.paymentIntent?.status === "succeeded") {
        // Payment successful
        console.log("Payment succeeded!");
        // Navigate to success screen
      } else {
        setError("Payment failed. Please try again.");
      }
    } catch (err) {
      setError("Payment error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Elements stripe={stripePromise}>
      <CardElement />
      <button onClick={handlePayment} disabled={loading}>
        {loading ? "Processing..." : `Pay $${amount.toFixed(2)}`}
      </button>
      {error && <p>{error}</p>}
    </Elements>
  );
}
```

### OTP Verification

```typescript
// app/auth/verify-otp.tsx (updated)

import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function OTPVerification({ phoneNumber }: { phoneNumber: string }) {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const verifyOTPMutation = trpc.verifyOTP.useMutation();

  const handleVerify = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await verifyOTPMutation.mutateAsync({
        phoneNumber,
        code: otp,
      });

      if (result.verified) {
        // OTP verified successfully
        console.log("OTP verified!");
        // Navigate to home
      } else {
        setError("Invalid OTP. Please try again.");
      }
    } catch (err) {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="text"
        placeholder="000000"
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
        maxLength={6}
      />
      <button onClick={handleVerify} disabled={loading}>
        {loading ? "Verifying..." : "Verify OTP"}
      </button>
      {error && <p>{error}</p>}
    </div>
  );
}
```

---

## Part 5: Webhook Handlers

### Stripe Webhooks

```typescript
// server/webhooks/stripe.ts

import { Webhook } from "svix";

export async function handleStripeWebhook(
  body: string,
  signature: string
) {
  const wh = new Webhook(process.env.STRIPE_WEBHOOK_SECRET!);
  const event = wh.verify(body, signature);

  switch (event.type) {
    case "payment_intent.succeeded":
      // Update ride payment status
      const paymentIntent = event.data.object;
      const rideId = paymentIntent.metadata.rideId;
      
      await db.update(rides).set({
        paymentStatus: "completed",
      }).where((rides, { eq }) => eq(rides.id, rideId));

      // Send SMS notification
      await notifyRideCompleted(
        passenger.phone,
        paymentIntent.amount / 100,
        driver.name
      );
      break;

    case "payment_intent.payment_failed":
      // Handle failed payment
      break;

    case "account.updated":
      // Driver account updated
      break;
  }
}
```

### Twilio Webhooks

```typescript
// server/webhooks/twilio.ts

export async function handleTwilioWebhook(
  messageStatus: string,
  messageSid: string
) {
  // Log message delivery status
  await db.insert(smsLogs).values({
    messageSid,
    status: messageStatus,
    timestamp: new Date(),
  });

  // If failed, retry or notify
  if (messageStatus === "failed") {
    console.error(`SMS delivery failed: ${messageSid}`);
    // Implement retry logic
  }
}
```

---

## Part 6: Testing

### Test Stripe Payments

1. Use test card: `4242 4242 4242 4242`
2. Any future expiry date
3. Any 3-digit CVC
4. Payment should succeed

### Test Twilio OTP

1. Use your real phone number
2. Request OTP
3. You should receive an SMS with a 6-digit code
4. Enter the code to verify

### Test SMS Notifications

```bash
# Send test SMS via Twilio CLI
twilio api:core:messages:create \
  --from=+1234567890 \
  --to=+your_phone_number \
  --body="Test message from RideShare"
```

---

## Troubleshooting

### Stripe Issues

| Error | Solution |
|-------|----------|
| "Invalid API Key" | Check your `STRIPE_SECRET_KEY` in `.env` |
| "No such customer" | Create customer before charging |
| "Card declined" | Use test card `4000 0000 0000 0002` |

### Twilio Issues

| Error | Solution |
|-------|----------|
| "Invalid phone number" | Use international format: `+1234567890` |
| "Invalid Account SID" | Check your `TWILIO_ACCOUNT_SID` in `.env` |
| "SMS not received" | Check Twilio account balance and permissions |

---

## Production Checklist

- [ ] Switch to live API keys (remove "test" from keys)
- [ ] Set up Stripe webhook endpoint
- [ ] Set up Twilio webhook endpoint
- [ ] Enable 3D Secure for card payments
- [ ] Set up PCI compliance
- [ ] Enable rate limiting on payment endpoints
- [ ] Set up monitoring and alerts
- [ ] Test with real payments (small amounts)
- [ ] Document payment flow for support team

---

**Your Stripe and Twilio integration is now ready!**
