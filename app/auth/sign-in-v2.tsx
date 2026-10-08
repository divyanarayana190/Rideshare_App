import { AUTH, D } from "@/constants/design";
import YooCarLogo from "@/components/YooCarLogo";
import { ScreenContainer } from "@/components/screen-container";
import { GradientButton, AuthLink, TrustIndicators } from "@/components/ui/GradientButton";
import { PremiumInput, PasswordToggle } from "@/components/ui/PremiumInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useAuth } from "@/lib/auth-context-v2";
import { getOtpSession, getResendRemaining } from "@/lib/otp-session";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type AuthMode = "password" | "otp";
type ContactMethod = "email" | "phone";

export default function SignInScreen() {
  const router = useRouter();
  const { requestOtp, loginWithPassword, requestPasswordReset, isSignedIn, justLoggedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn && !justLoggedIn) {
      router.replace("/(tabs)" as Href);
    }
  }, [isSignedIn, justLoggedIn, router]);

  const [contactMethod, setContactMethod] = useState<ContactMethod>("phone");
  const [authMode, setAuthMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enrollModal, setEnrollModal] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [error, setError] = useState("");

  const getDestination = useCallback(
    () => contactMethod === "phone" ? phone.replace(/\D/g, "") : email.trim().toLowerCase(),
    [contactMethod, phone, email],
  );

  const validate = useCallback((): string | null => {
    const dest = getDestination();
    if (contactMethod === "phone" && dest.length < 10)
      return "Enter a valid phone number (10+ digits)";
    if (contactMethod === "email" && !dest.includes("@"))
      return "Enter a valid email address";
    if (authMode === "password" && password.length < 1)
      return "Password is required";
    return null;
  }, [getDestination, contactMethod, authMode, password]);

  const handleSignIn = useCallback(async () => {
    setError("");
    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    setLoading(true);
    const dest = getDestination();
    try {
      if (authMode === "password") {
        const result = await loginWithPassword({
          method: contactMethod,
          destination: dest,
          password,
        });
        if (result && (result as any).passwordNotConfigured) {
          setEnrollModal(true);
          return;
        }
      } else {
        const verifyParams = { method: contactMethod, destination: dest, purpose: "login" } as const;
        const session = getOtpSession();
        const sessionActive =
          session?.destination === dest &&
          session?.method === contactMethod &&
          getResendRemaining() > 0;

        if (!sessionActive) {
          await requestOtp(verifyParams);
        }

        router.push({ pathname: "/auth/verify-otp", params: verifyParams });
      }
    } catch (e: any) {
      setError((e as any)?.message || "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [
    contactMethod,
    authMode,
    password,
    loginWithPassword,
    requestOtp,
    router,
    getDestination,
    validate,
  ]);

  const handleEnrollWithOtp = useCallback(async () => {
    setEnrollLoading(true);
    try {
      const dest = getDestination();
      await requestPasswordReset({ method: contactMethod, destination: dest });
      setEnrollModal(false);
      router.push({
        pathname: "/auth/enroll-password" as Href,
        params: { method: contactMethod, destination: dest },
      });
    } catch (e: any) {
      setError(e?.message || "Failed to send verification code. Please try again.");
      setEnrollModal(false);
    } finally {
      setEnrollLoading(false);
    }
  }, [contactMethod, requestPasswordReset, getDestination, router]);

  const formatPhone = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const destError = error && !getDestination();

  return (
    <ScreenContainer style={{ backgroundColor: AUTH.bg }} containerClassName="">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: D.spacing.lg, paddingTop: 0 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo & Brand */}
        <View style={{ alignItems: "center", marginTop: 0, marginBottom: 32 }}>
          <YooCarLogo size={182} />
          <Text
            style={{
              fontSize: 34,
              fontWeight: "800",
              color: AUTH.text,
              marginTop: 0,
              letterSpacing: 3,
            }}
          >
            YOO
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: AUTH.textMuted,
              marginTop: 6,
              letterSpacing: 0.2,
            }}
          >
            Ride Together. Go Further.
          </Text>
        </View>

        {/* Welcome */}
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <Text
            style={{
              fontSize: 26,
              fontWeight: "700",
              color: AUTH.text,
              letterSpacing: -0.3,
            }}
          >
            Welcome Back
          </Text>
          <Text style={{ fontSize: 15, color: AUTH.textMuted, marginTop: 8 }}>
            Sign in to continue your journey
          </Text>
        </View>

        {/* Phone / Email Toggle */}
        <View style={{ marginBottom: 20 }}>
          <SegmentedControl
            segments={[
              { value: "phone" as const, label: "Phone", icon: "phone-portrait-outline" },
              { value: "email" as const, label: "Email", icon: "mail-outline" },
            ]}
            value={contactMethod}
            onChange={(m) => {
              setContactMethod(m);
              setError("");
            }}
          />
        </View>

        {/* Error Banner */}
        {error ? (
          <View
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              borderWidth: 1,
              borderColor: "rgba(239, 68, 68, 0.3)",
              borderRadius: D.radius.sm,
              padding: 14,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: D.red,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>!</Text>
            </View>
            <Text style={{ color: "#FCA5A5", fontSize: 13, flex: 1 }}>{error}</Text>
          </View>
        ) : null}

        {/* Input Fields */}
        <View style={{ gap: 16, marginBottom: 12 }}>
          <PremiumInput
            label={contactMethod === "phone" ? "Phone Number" : "Email Address"}
            icon={contactMethod === "phone" ? "call-outline" : "mail-outline"}
            error={!!destError}
            placeholder={contactMethod === "phone" ? "(555) 123-4567" : "you@example.com"}
            value={contactMethod === "phone" ? formatPhone(phone) : email}
            onChangeText={
              contactMethod === "phone"
                ? (t: string) => setPhone(t.replace(/\D/g, ""))
                : setEmail
            }
            keyboardType={contactMethod === "phone" ? "phone-pad" : "email-address"}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {authMode === "password" && (
            <PremiumInput
              label="Password"
              icon="lock-closed-outline"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              trailing={
                <PasswordToggle visible={showPassword} onToggle={() => setShowPassword(!showPassword)} />
              }
            />
          )}
        </View>

        {/* Forgot Password & Auth Mode Switch */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            paddingHorizontal: 4,
          }}
        >
          {authMode === "password" ? (
            <AuthLink
              label="Use OTP instead"
              onPress={() => {
                setAuthMode("otp");
                setError("");
              }}
            />
          ) : (
            <AuthLink
              label="Use Password"
              onPress={() => {
                setAuthMode("password");
                setError("");
              }}
            />
          )}
          <AuthLink label="Forgot Password?" onPress={() => router.push("/auth/forgot-password")} />
        </View>

        {/* Sign In Button */}
        <GradientButton
          label={authMode === "password" ? "Sign In" : "Send OTP Code"}
          loading={loading}
          showArrow={!loading && authMode === "password"}
          onPress={handleSignIn}
        />

        {/* Sign Up Link */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 6,
            marginTop: 20,
          }}
        >
          <Text style={{ color: AUTH.textMuted, fontSize: 15 }}>
            {"Don't have an account?"}
          </Text>
          <AuthLink label="Sign Up" onPress={() => router.replace("/auth/sign-up")} />
        </View>

        {/* Trust Indicators */}
        <TrustIndicators />

        {/* Security Note */}
        <View
          style={{
            alignItems: "center",
            paddingTop: 24,
            paddingBottom: 28,
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons name="lock-closed-outline" size={12} color={AUTH.textSubtle} />
          <Text style={{ fontSize: 11, color: AUTH.textSubtle, textAlign: "center" }}>
            Protected by 256-bit encryption
          </Text>
        </View>
      </ScrollView>

      {/* Password Enrollment Modal */}
      <Modal visible={enrollModal} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.65)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: AUTH.surface,
              borderRadius: D.radius.xl,
              padding: 28,
              width: "100%",
              borderWidth: 1,
              borderColor: AUTH.border,
              ...D.shadow.modal,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: D.radius.md,
                backgroundColor: "rgba(30, 136, 255, 0.15)",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 28 }}>🔒</Text>
            </View>

            <Text style={{ fontSize: 22, fontWeight: "800", color: AUTH.text, marginBottom: 10 }}>
              Set Password
            </Text>
            <Text style={{ fontSize: 14, color: AUTH.textMuted, lineHeight: 22, marginBottom: 28 }}>
              This account currently uses OTP login. Verify your phone number
              once to create a password for future logins.
            </Text>

            <GradientButton
              label="Verify with OTP"
              loading={enrollLoading}
              onPress={handleEnrollWithOtp}
            />

            <TouchableOpacity
              onPress={() => setEnrollModal(false)}
              disabled={enrollLoading}
              style={{ padding: 14, alignItems: "center", marginTop: 8 }}
            >
              <Text style={{ color: AUTH.textMuted, fontWeight: "600", fontSize: 15 }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
