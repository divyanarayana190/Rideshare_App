// app/_layout.tsx
import FuturisticLoader from "@/components/FuturisticLoader";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ToastOverlay } from "@/components/driver/Toast";
import { NativeStripeProvider } from "@/components/payments/NativeStripeProvider";
import { LegalReacceptanceGate } from "@/components/legal/LegalReacceptanceGate";
import { AuthProvider, useAuth } from "@/lib/auth-context-v2";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { RidesProvider } from "@/lib/rides-store";
import { initSentry } from "@/lib/sentry";
import { ThemeProvider as NativeWindThemeProvider } from "@/lib/theme-provider";
import { trpc } from "@/lib/trpc";
import { createTRPCClient } from "@/lib/trpc-client";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, useRouter, type Href } from "expo-router";
// ponytail: usePathname is in expo-router/build/hooks but missing from the index type chain in this project — import directly
import { usePathname } from "expo-router/build/hooks";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, View, useColorScheme as useColorScheme_RN } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";
import { createAppQueryClient } from "@/lib/query-client";
import { resolveNotificationHref } from "@/lib/notification-routing";
import { RideEventsProvider } from "@/lib/ride-events-context";
import { usePushNotifications } from "@/hooks/use-push-notifications";

// Initialize Sentry before anything else renders
initSentry();

const USE_NATIVE_DRIVER = Platform.OS !== "web";

SplashScreen.preventAutoHideAsync();

const queryClient = createAppQueryClient();
const trpcClient = createTRPCClient();

function RootLayoutNav() {
  useAuthGuard();
  usePushNotifications();

  const { isSignedIn, isLoading, justLoggedIn, clearJustLoggedIn } = useAuth();
  const router = useRouter();

  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  // ── Push notification tap → deep-link navigation ──────────────────────────
  useEffect(() => {
    const navigateFromPush = (data: Record<string, unknown> | undefined) => {
      if (!isSignedIn || !data) return;
      const isDriverView = data.recipientRole === "driver";
      const href = resolveNotificationHref(
        {
          type: typeof data.type === "string" ? data.type : undefined,
          deepLink: typeof data.deepLink === "string" ? data.deepLink : undefined,
          data,
          recipientRole: typeof data.recipientRole === "string" ? data.recipientRole : undefined,
        },
        isDriverView,
      );
      if (href) router.push(href as Href);
    };

    if (Platform.OS === "web") return;

    // Cold start: app opened from a notification tap
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      navigateFromPush(response.notification.request.content.data as Record<string, unknown>);
    });

    // Foreground / background tap
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromPush(response.notification.request.content.data as Record<string, unknown>);
    });
    return () => sub.remove();
  }, [isSignedIn, router]);

  // ── Initial app splash (cold start) ──────────────────────────────────────
  const isReady = (fontsLoaded || !!fontError) && !isLoading;
  const [showInitialSplash, setShowInitialSplash] = useState(true);
  const initialFadeOut = useRef(new Animated.Value(1)).current;

  // ── Post-login splash (after OTP verify) ─────────────────────────────────
  const [showLoginSplash, setShowLoginSplash] = useState(false);
  const loginFadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Cold start splash fade-out — web renders immediately; native gets a short brand moment
  useEffect(() => {
    if (!isReady || !showInitialSplash) return;

    if (Platform.OS === "web") {
      setShowInitialSplash(false);
      return;
    }

    const timer = setTimeout(() => {
      Animated.timing(initialFadeOut, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(() => setShowInitialSplash(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [isReady, showInitialSplash]); // eslint-disable-line react-hooks/exhaustive-deps -- initialFadeOut is a stable Animated.Value ref

  // Post-login: show loading overlay while app loads underneath
  useEffect(() => {
    if (justLoggedIn) {
      setShowLoginSplash(true);
      loginFadeOut.setValue(1);

      let cleared = false;
      const clear = () => {
        if (cleared) return;
        cleared = true;
        setShowLoginSplash(false);
        clearJustLoggedIn();
      };

      // 200 ms on Android: gives the navigator time to commit the tab stack
      // before the overlay begins fading, preventing a blank-screen flash.
      const timer = setTimeout(() => {
        if (Platform.OS === "web") {
          clear();
        } else {
          Animated.timing(loginFadeOut, {
            toValue: 0,
            duration: 400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start(() => clear());
          // Fallback: if the animation callback never fires on Android (known
          // native-driver edge case), clear the splash after animation duration.
          setTimeout(clear, 500);
        }
      }, Platform.OS === "android" ? 200 : 0);
      return () => clearTimeout(timer);
    }
  }, [justLoggedIn, clearJustLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps -- loginFadeOut is a stable Animated.Value ref

  // Show loader only while fonts load or auth has no cached session yet.
  // Never block auth routes — they are public and must render immediately.
  const pathname = usePathname();
  const onAuthRoute = pathname?.startsWith("/auth") || pathname?.startsWith("/(auth)");
  const waitingForAuth = isLoading && !isSignedIn && !onAuthRoute;
  if ((!fontsLoaded && !fontError) || waitingForAuth || showInitialSplash) {
    return (
      <Animated.View style={{ flex: 1, opacity: initialFadeOut }}>
        <FuturisticLoader />
      </Animated.View>
    );
  }

  // Single return keeps AppStack always mounted — avoids navigation state reset
  // when showLoginSplash transitions from true → false after post-login delay.
  return (
    <View style={{ flex: 1 }}>
      {!showLoginSplash && <OfflineBanner />}
      <AppStack />
      <LegalReacceptanceGate />
      <ToastOverlay />
      {showLoginSplash && (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: loginFadeOut,
            zIndex: 999,
          }}
          pointerEvents="auto"
        >
          <FuturisticLoader />
        </Animated.View>
      )}
    </View>
  );
}

function AppStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ animationEnabled: false }} />
      <Stack.Screen name="auth" options={{ animationEnabled: false }} />
      <Stack.Screen name="student-verification" options={{ animationEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ animationEnabled: false }} />
      <Stack.Screen name="oauth/callback" />
      <Stack.Screen name="book-ride" />
      <Stack.Screen name="ride-options" />
      <Stack.Screen name="find-shared" />
      <Stack.Screen name="ride-detail" />
      <Stack.Screen name="confirm-ride" />
      <Stack.Screen name="active-ride" />
      <Stack.Screen name="ride-history" />
      <Stack.Screen name="ride-receipt" />
      <Stack.Screen name="trip-receipt" />
      <Stack.Screen name="driver" options={{ headerShown: false, animationEnabled: false }} />
      <Stack.Screen name="driver-onboarding" />
      <Stack.Screen name="driver-license-verification" />
      <Stack.Screen name="driver-application-status" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="chat-screen" />
      <Stack.Screen name="live-chat" />
      <Stack.Screen name="rate-ride" />
      <Stack.Screen name="rate-ride-v2" />
      <Stack.Screen name="emergency-sos" />
      <Stack.Screen name="analytics-dashboard" />
      <Stack.Screen name="promo-codes" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="permissions" options={{ headerShown: false }} />
      <Stack.Screen name="stripe-diagnostics" />
      <Stack.Screen name="safety-preferences" />
      <Stack.Screen name="payment-methods" />
      <Stack.Screen name="stripe-add-card" />
      <Stack.Screen name="stripe-cards" />
      <Stack.Screen name="loyalty-rewards" />
      <Stack.Screen name="help-support" />
      <Stack.Screen name="legal" options={{ animationEnabled: false }} />
      <Stack.Screen name="referral" />
      <Stack.Screen name="recurring-rides" />
      <Stack.Screen name="multi-stop-ride" />
      <Stack.Screen name="ride-discovery" />
      <Stack.Screen name="carpool-detail" />
      <Stack.Screen name="driver-join-requests" />
      <Stack.Screen name="create-ride" />
      <Stack.Screen name="ride-requested" />
      <Stack.Screen name="ticket-detail" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme_RN();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <NativeStripeProvider>
            <SignedInRideEvents>
              <RidesProvider>
                <NativeWindThemeProvider>
                  <ThemeProvider
                    value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
                  >
                    <SafeAreaProvider style={{ flex: 1 }}>
                      <RootLayoutNav />
                    </SafeAreaProvider>
                  </ThemeProvider>
                </NativeWindThemeProvider>
              </RidesProvider>
            </SignedInRideEvents>
            </NativeStripeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );
}

function SignedInRideEvents({ children }: { children: ReactNode }) {
  const { isSignedIn, sessionChecked } = useAuth();
  return (
    <RideEventsProvider enabled={sessionChecked && isSignedIn}>
      {children}
    </RideEventsProvider>
  );
}
