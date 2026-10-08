# Firebase Setup Guide for RideShare App

This guide walks you through setting up Firebase Cloud Messaging (FCM) for push notifications in your RideShare app.

## 📋 Prerequisites

- Firebase account (free at [firebase.google.com](https://firebase.google.com))
- Google Cloud Project
- Expo account (for EAS builds)

## 🚀 Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Create a project**
3. Enter project name: "RideShare"
4. Accept terms and click **Create project**
5. Wait for project to initialize

## 📱 Step 2: Set Up Firebase for iOS

### 2.1 Register iOS App

1. In Firebase Console, click the iOS icon
2. Enter Bundle ID: `space.manus.rideshare.app.t{timestamp}` (from your `app.config.ts`)
3. Enter App Store ID (optional for development)
4. Click **Register app**

### 2.2 Download GoogleService-Info.plist

1. Click **Download GoogleService-Info.plist**
2. Save to `ios/GoogleService-Info.plist`
3. In Xcode, add the file to your project:
   - Open `ios/rideshare.xcworkspace`
   - Right-click on project → Add Files
   - Select `GoogleService-Info.plist`
   - Ensure it's added to the RideShare target

### 2.3 Configure APNs Certificate

1. Go to [Apple Developer](https://developer.apple.com)
2. Create a new Key with Apple Push Notifications service (APNs)
3. Download the `.p8` file
4. In Firebase Console, go to **Project Settings** → **Cloud Messaging**
5. Upload the APNs certificate

## 🤖 Step 3: Set Up Firebase for Android

### 3.1 Register Android App

1. In Firebase Console, click the Android icon
2. Enter Package name: `space.manus.rideshare.app.t{timestamp}` (from `app.config.ts`)
3. Enter SHA-1 certificate fingerprint:
   ```bash
   cd android && ./gradlew signingReport
   ```
   Copy the SHA-1 from the output
4. Click **Register app**

### 3.2 Download google-services.json

1. Click **Download google-services.json**
2. Save to `android/app/google-services.json`

### 3.3 Configure Android Project

In `android/build.gradle`:
```gradle
buildscript {
  dependencies {
    classpath 'com.google.gms:google-services:4.3.15'
  }
}
```

In `android/app/build.gradle`:
```gradle
apply plugin: 'com.google.gms.google-services'

dependencies {
  implementation 'com.google.firebase:firebase-messaging:23.2.1'
}
```

## 🔑 Step 4: Get Firebase Credentials

### 4.1 Service Account Key

1. Go to **Project Settings** → **Service Accounts**
2. Click **Generate New Private Key**
3. Save the JSON file securely
4. Extract these values for your `.env`:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_PRIVATE_KEY`
   - `FIREBASE_CLIENT_EMAIL`

### 4.2 Web API Key

1. Go to **Project Settings** → **General**
2. Scroll to "Your apps"
3. Copy **Web API Key** to `FIREBASE_WEB_API_KEY`

## 🔧 Step 5: Configure Environment Variables

Add to your `.env` file:

```env
# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email@appspot.gserviceaccount.com
FIREBASE_WEB_API_KEY=your-web-api-key
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-app-id
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com
```

## 📲 Step 6: Integrate with Expo

### 6.1 Install Expo Notifications

```bash
pnpm add expo-notifications
```

### 6.2 Update app.config.ts

```typescript
const config: ExpoConfig = {
  // ... existing config
  plugins: [
    // ... existing plugins
    [
      "expo-notifications",
      {
        icon: "./assets/images/notification-icon.png",
        color: "#0a7ea4",
        sounds: ["./assets/sounds/notification.wav"],
        modes: "productionOnly",
      },
    ],
  ],
};
```

### 6.3 Get Expo Push Token

In your app:

```typescript
import * as Notifications from "expo-notifications";

async function getExpoPushToken() {
  const { data: token } = await Notifications.getExpoPushTokenAsync();
  console.log("Expo Push Token:", token);
  
  // Send this token to your backend
  await fetch("/api/user/update-push-token", {
    method: "POST",
    body: JSON.stringify({ expoPushToken: token }),
  });
}
```

## 🔔 Step 7: Send Push Notifications

### 7.1 From Backend (Node.js)

```typescript
import admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
});

// Send notification
async function sendPushNotification(expoPushToken: string, title: string, body: string) {
  const message = {
    notification: {
      title,
      body,
    },
    data: {
      type: "ride_update",
      rideId: "ride_123",
    },
    token: expoPushToken,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Successfully sent message:", response);
  } catch (error) {
    console.error("Error sending message:", error);
  }
}
```

### 7.2 From Expo (Frontend)

```typescript
import * as Notifications from "expo-notifications";

async function sendLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: "ride_update" },
      sound: "default",
      badge: 1,
    },
    trigger: null, // Send immediately
  });
}
```

## 🧪 Step 8: Test Notifications

### 8.1 Test from Firebase Console

1. Go to **Messaging** → **Create your first campaign**
2. Select **Firebase Notifications**
3. Enter title and body
4. Click **Send test message**
5. Select your device and click **Test**

### 8.2 Test from Backend

```bash
curl -X POST https://fcm.googleapis.com/v1/projects/YOUR_PROJECT_ID/messages:send \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "token": "YOUR_DEVICE_TOKEN",
      "notification": {
        "title": "Test Notification",
        "body": "This is a test message"
      }
    }
  }'
```

## 📊 Step 9: Monitor Notifications

1. Go to **Messaging** → **Reports**
2. View delivery statistics
3. Check error logs for failed deliveries

## 🚨 Troubleshooting

### Notifications Not Received

1. **Check device token** - Ensure token is registered in Firebase
2. **Check permissions** - User must grant notification permission
3. **Check Firebase rules** - Verify security rules allow sending
4. **Check APNs/FCM credentials** - Verify certificates are valid
5. **Check logs** - Review Firebase Console error logs

### Token Expired

- Tokens expire after ~60 days
- Refresh token on app launch:

```typescript
useEffect(() => {
  const subscription = Notifications.addNotificationResponseReceivedListener(() => {
    // Handle notification
  });

  // Refresh token
  getExpoPushToken();

  return () => subscription.remove();
}, []);
```

## 🔐 Security Best Practices

1. **Never expose private key** - Keep in `.env` only
2. **Validate tokens** - Verify tokens belong to users
3. **Rate limit** - Limit notifications per user per day
4. **Opt-in** - Always ask permission before sending
5. **Unsubscribe** - Allow users to disable notifications
6. **Encrypt data** - Use HTTPS for all communication

## 📚 Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Expo Notifications](https://docs.expo.dev/push-notifications/overview/)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Apple Push Notification service](https://developer.apple.com/notifications/)

## ✅ Checklist

- [ ] Firebase project created
- [ ] iOS app registered with APNs certificate
- [ ] Android app registered with SHA-1 fingerprint
- [ ] Service account key downloaded
- [ ] Environment variables configured
- [ ] Expo notifications installed
- [ ] app.config.ts updated
- [ ] Push token retrieval implemented
- [ ] Backend notification sending tested
- [ ] Notifications received on device
- [ ] Analytics configured
- [ ] Security rules reviewed

---

**Your RideShare app is now ready for production push notifications!** 🚀
