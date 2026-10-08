// app/auth/verify-otp.tsx
import { AUTH, D } from "@/constants/design";
import YooCarLogo from "@/components/YooCarLogo";
import { ScreenContainer } from "@/components/screen-container";
import { GradientButton } from "@/components/ui/GradientButton";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context-v2";
import { getOtpSession, getResendRemaining } from "@/lib/otp-session";
import { consumePendingSignup } from "@/lib/pending-signup";
import { useToastStore } from "@/lib/stores";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type PressableStateCallbackType,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function VerifyOtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const { verifyOtp, requestOtp, isSignedIn } = useAuth();
  const toast = useToastStore();

  const [pendingNav, setPendingNav] = useState<string | null>(null);

  useEffect(() => {
    if (pendingNav && isSignedIn) {
      const dest = pendingNav;
      setPendingNav(null);
      router.replace(dest as Href);
    }
  }, [pendingNav, isSignedIn, router]);

  const method = (params.method as "email" | "phone") ?? "phone";
  // Prefer the OTP session (set by requestOtp()) over stale navigation params.
  // Params can be stale when Expo Router reuses the screen instance.
  const destination = getOtpSession()?.destination ?? (params.destination as string) ?? "";
  const purpose = (params.purpose as "signup" | "login") ?? "login";
  const firstName = (params.firstName as string) ?? "";
  const lastName = (params.lastName as string) ?? "";
  const email = (params.email as string) || undefined;
  const gender = (params.gender as "male" | "female" | "non_binary" | "prefer_not_to_say") || undefined;
  const role = (params.role as "user" | "driver") || undefined;
  const isStudent = params.isStudent === "true";
  const collegeEmail = (params.collegeEmail as string) || undefined;
  const legalVersion = (params.legalVersion as string) || undefined;
  const acceptTerms = params.acceptTerms === "true";
  const acceptPrivacy = params.acceptPrivacy === "true";
  const acceptCommunity = params.acceptCommunity === "true";
  const termsAcceptedAt = (params.termsAcceptedAt as string) || undefined;
  const privacyAcceptedAt = (params.privacyAcceptedAt as string) || undefined;
  const communityAcceptedAt = (params.communityAcceptedAt as string) || undefined;
  const deviceInfo = (params.deviceInfo as string) || undefined;
  const title = useMemo(
    () => (method === "email" ? "Email" : "Phone"),
    [method],
  );

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCountdown, setResendCountdown] = useState(() => getResendRemaining());
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<InstanceType<typeof TextInput>>(null);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const handleVerify = async () => {
    setError("");
    setLoading(true);

    try {
      const code = otp.replace(/\D/g, "");
      if (!destination) throw new Error("Missing destination. Go back.");
      if (code.length !== 6) throw new Error("Enter a 6-digit code");

      if (purpose === "signup" && (!firstName || !lastName)) {
        throw new Error("Missing name. Go back.");
      }

      const pendingSignup = purpose === "signup" ? consumePendingSignup() : null;

      await verifyOtp({
        method,
        destination,
        code,
        purpose,
        ...(purpose === "signup"
          ? {
              firstName,
              lastName,
              email,
              gender,
              role,
              isStudent,
              collegeEmail,
              legalVersion,
              acceptTerms,
              acceptPrivacy,
              acceptCommunity,
              termsAcceptedAt,
              privacyAcceptedAt,
              communityAcceptedAt,
              deviceInfo,
            }
          : {}),
        ...(pendingSignup?.password ? { password: pendingSignup.password } : {}),
      });

      if (purpose === "signup") {
        toast.show("Account created! Add a payment method from Profile when you're ready to book.", "success");
      } else if (purpose === "login") {
        toast.show("Welcome back!", "success");
      }

      const hasEduEmail =
        purpose === "signup" &&
        isStudent &&
        typeof collegeEmail === "string" &&
        collegeEmail.trim().toLowerCase().endsWith(".edu");
      setPendingNav(hasEduEmail ? "/student-verification" : "/(tabs)");
    } catch (e: any) {
      const msg = e?.message || "Verification failed";
      setError(msg);
      toast.show(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResendCountdown(60);

    try {
      if (!destination) throw new Error("Missing destination");
      await requestOtp({ method, destination, purpose });
      toast.show("Code resent!", "success");
    } catch (e: any) {
      const msg = e?.message || "Failed to resend";
      setError(msg);
      toast.show(msg, "error");
      setResendCountdown(0);
    }
  };

  const maskedDestination =
    method === "phone" && destination.length >= 4
      ? "•••• " + destination.slice(-4)
      : destination;

  return (
    <ScreenContainer style={{ backgroundColor: AUTH.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: D.spacing.lg,
          paddingVertical: 28,
          justifyContent: "center",
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo + tagline */}
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <YooCarLogo size={96} />
          <Text style={{ color: AUTH.textMuted, fontSize: 12, marginTop: 6, letterSpacing: 0.5 }}>
            Ride Together. Go Further.
          </Text>
        </View>

        {/* Title + masked destination */}
        <View style={{ alignItems: "center", gap: 4, marginBottom: 24 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: AUTH.text }}>
            Verify Your {title}
          </Text>
          <Text style={{ fontSize: 14, color: AUTH.textMuted, textAlign: "center", lineHeight: 22 }}>
            We sent a 6-digit code to
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: AUTH.text, letterSpacing: 1.5 }}>
            {maskedDestination}
          </Text>
        </View>

        {/* Wrong number / email card */}
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.75}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: AUTH.surface,
            borderWidth: 1,
            borderColor: AUTH.border,
            borderRadius: D.radius.md,
            padding: 14,
            gap: 12,
            marginBottom: 24,
          }}
        >
          <Ionicons
            name={method === "phone" ? "phone-portrait-outline" : "mail-outline"}
            size={20}
            color={AUTH.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: AUTH.text, fontSize: 14, fontWeight: "600" }}>
              Wrong {method === "phone" ? "number" : "email"}?
            </Text>
            <Text style={{ color: D.blue, fontSize: 13, marginTop: 2 }}>
              Edit your {method === "phone" ? "phone number" : "email address"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={AUTH.textSubtle} />
        </TouchableOpacity>

        {/* OTP label */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: AUTH.textMuted, marginBottom: 10, marginLeft: 2 }}>
          Enter 6-digit code
        </Text>

        {/* OTP boxes with hidden input overlay */}
        <View style={{ position: "relative", marginBottom: 16 }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => inputRef.current?.focus()}
            style={{ flexDirection: "row", gap: 8 }}
          >
            {Array.from({ length: 6 }).map((_, i) => {
              const isActive = focused && otp.length === i;
              const isFilled = !!otp[i];
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 58,
                    borderWidth: 1.5,
                    borderColor: isActive
                      ? D.blue
                      : isFilled
                      ? "rgba(30,136,255,0.45)"
                      : AUTH.border,
                    borderRadius: D.radius.sm,
                    backgroundColor: isActive
                      ? "rgba(30,136,255,0.08)"
                      : AUTH.surfaceInput,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isFilled ? AUTH.text : AUTH.textSubtle,
                      fontSize: 22,
                      fontWeight: "700",
                    }}
                  >
                    {otp[i] ?? "—"}
                  </Text>
                </View>
              );
            })}
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            value={otp}
            onChangeText={(t: string) => setOtp(t.replace(/\D/g, ""))}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            caretHidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: 0.01,
            }}
          />
        </View>

        {/* Secure verification badge */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: AUTH.surface,
            borderWidth: 1,
            borderColor: AUTH.border,
            borderRadius: D.radius.md,
            padding: 14,
            gap: 12,
            marginBottom: 20,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(30,136,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="shield-checkmark" size={20} color={D.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: AUTH.text, fontSize: 13, fontWeight: "600" }}>
              Secure Verification
            </Text>
            <Text style={{ color: AUTH.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
              Your code is safe with us.{"\n"}We never share your {method === "phone" ? "phone number" : "email"} with anyone.
            </Text>
          </View>
          <Ionicons name="lock-closed-outline" size={20} color={AUTH.textSubtle} />
        </View>

        {/* Error */}
        {error ? (
          <View
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              borderWidth: 1,
              borderColor: "rgba(239, 68, 68, 0.3)",
              borderRadius: D.radius.sm,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: "#FCA5A5", fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        <GradientButton
          label="Verify"
          loading={loading}
          disabled={otp.length !== 6}
          onPress={handleVerify}
        />

        {/* Resend */}
        <View style={{ alignItems: "center", gap: 4, marginTop: 24 }}>
          <Text style={{ color: AUTH.textMuted, fontSize: 14 }}>
            {"Didn't receive the code?"}
          </Text>
          <TouchableOpacity
            onPress={handleResend}
            disabled={resendCountdown > 0 || loading}
          >
            <Text
              style={{
                fontWeight: "600",
                fontSize: 15,
                color: resendCountdown > 0 ? AUTH.textSubtle : D.blue,
              }}
            >
              {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend Code"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* OR divider */}
        <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 20 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: AUTH.border }} />
          <Text style={{ marginHorizontal: 12, color: AUTH.textSubtle, fontSize: 12 }}>OR</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: AUTH.border }} />
        </View>

        {/* Go Back button */}
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }: PressableStateCallbackType) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderWidth: 1.5,
            borderColor: D.blue,
            borderRadius: D.radius.md,
            paddingVertical: 15,
            backgroundColor: pressed ? "rgba(30,136,255,0.12)" : "transparent",
          })}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={18} color={D.blue} />
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
