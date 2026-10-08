import "./scripts/load-env.js";

const rawBundleId = "space.manus.rideshare.app.t20260228214552";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".")
    .replace(/[^a-zA-Z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
    .split(".")
    .map((segment) => (/^[a-zA-Z]/.test(segment) ? segment : `x${segment}`))
    .join(".") || "space.manus.app";

const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const config = {
  name: "YOO",
  slug: "yoo-app",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/brand/yoo-logo-transparent.png",
  scheme: schemeFromBundleId,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  updates: {
    url: "https://u.expo.dev/dff81bd7-b139-4a30-b446-ba672a176252",
  },

  runtimeVersion: {
    policy: "appVersion",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        "YOO needs your location to show nearby drivers and navigate.",
      NSLocationAlwaysUsageDescription:
        "YOO needs your location to show nearby drivers and navigate.",
      NSCameraUsageDescription:
        "YOO uses your camera to upload a profile photo and verify your driver license.",
      NSMicrophoneUsageDescription:
        "YOO uses your microphone for in-app voice calls with your driver.",
      NSPhotoLibraryUsageDescription:
        "YOO uses your photo library to let you choose a profile photo.",
    },
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#090618",
      foregroundImage: "./assets/brand/yoo-logo-transparent.png",
      monochromeImage: "./assets/brand/yoo-logo-transparent.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: bundleId,
    permissions: [
      "POST_NOTIFICATIONS",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "VIBRATE",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
    ],
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: schemeFromBundleId, host: "*" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/brand/yoo-logo-transparent.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-audio",
      {
        microphonePermission:
          "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/brand/yoo-logo-transparent.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#090618",
        dark: { backgroundColor: "#090618" },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
          compileSdkVersion: 36,
          targetSdkVersion: 35,
          buildToolsVersion: "36.0.0",
        },
      },
    ],
    "expo-font",
    "expo-asset",
    "expo-localization",
    "expo-web-browser",
    [
      "@stripe/stripe-react-native",
      {
        merchantIdentifier:
          process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID ??
          "merchant.com.yoo.rideshare",
        enableGooglePay: false,
      },
    ],
    [
      "@sentry/react-native",
      {
        organization: process.env.SENTRY_ORG ?? "",
        project: process.env.SENTRY_PROJECT ?? "",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    // reactCompiler disabled — adds significant compile-time overhead in dev
    // Re-enable for production builds once stable
    // reactCompiler: true,
  },
  extra: {
    // Set SENTRY_DSN in your .env to enable crash reporting
    sentryDsn: process.env.SENTRY_DSN ?? "",
    eas: {
      projectId: "dff81bd7-b139-4a30-b446-ba672a176252",
    },
  },
};

export default config;
