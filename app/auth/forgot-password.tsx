import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context-v2";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type ContactMethod = "email" | "phone";
type Step = "destination" | "otp" | "new-password" | "success";

function maskDestination(method: ContactMethod, dest: string): string {
  if (method === "phone") {
    if (dest.length <= 4) return "***" + dest;
    return "***" + dest.slice(-4);
  }
  const atIdx = dest.indexOf("@");
  if (atIdx <= 1) return dest;
  return dest[0] + "***" + dest.slice(atIdx);
}

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score, label: "Weak", color: "#EF4444" };
  if (score === 2) return { score, label: "Fair", color: "#F59E0B" };
  if (score === 3) return { score, label: "Good", color: "#1E88FF" };
  return { score, label: "Strong", color: "#16A34A" };
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const colors = useColors();
  const { requestPasswordReset, verifyPasswordResetOtp, resetPassword } = useAuth();

  const [step, setStep] = useState<Step>("destination");
  const [contactMethod, setContactMethod] = useState<ContactMethod>("phone");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // OTP step
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const otpRefs = useRef<any[]>([]);
  const [countdown, setCountdown] = useState(300); // 5 minutes
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetToken, setResetToken] = useState("");

  // New password step
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Success redirect countdown
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  const getDestination = useCallback(
    () => contactMethod === "phone" ? phone.replace(/\D/g, "") : email.trim().toLowerCase(),
    [contactMethod, phone, email],
  );

  const formatPhone = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  // Countdown timer for OTP expiry
  useEffect(() => {
    if (step !== "otp" || countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [step, countdown]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Success redirect timer
  useEffect(() => {
    if (step !== "success") return;
    if (redirectCountdown <= 0) {
      router.replace("/auth/sign-in");
      return;
    }
    const timer = setInterval(() => setRedirectCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [step, redirectCountdown, router]);

  const handleSendCode = useCallback(async () => {
    setError("");
    const dest = getDestination();
    if (contactMethod === "phone" && dest.length < 10) {
      setError("Enter a valid phone number (10+ digits)");
      return;
    }
    if (contactMethod === "email" && !dest.includes("@")) {
      setError("Enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset({ method: contactMethod, destination: dest });
      setStep("otp");
      setCountdown(300);
      setResendCooldown(60);
      setOtpDigits(["", "", "", "", "", ""]);
    } catch (e: any) {
      setError(e?.message || "Failed to send reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [contactMethod, requestPasswordReset, getDestination]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    setError("");
    setLoading(true);
    try {
      await requestPasswordReset({ method: contactMethod, destination: getDestination() });
      setCountdown(300);
      setResendCooldown(60);
      setOtpDigits(["", "", "", "", "", ""]);
      setSuccessMsg("A new code has been sent");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  }, [contactMethod, resendCooldown, requestPasswordReset, getDestination]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      const newOtp = [...otpDigits];
      digits.forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d;
      });
      setOtpDigits(newOtp);
      const nextIdx = Math.min(index + digits.length, 5);
      otpRefs.current[nextIdx]?.focus();
      return;
    }

    const digit = value.replace(/\D/g, "");
    const newOtp = [...otpDigits];
    newOtp[index] = digit;
    setOtpDigits(newOtp);

    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !otpDigits[index] && index > 0) {
      const newOtp = [...otpDigits];
      newOtp[index - 1] = "";
      setOtpDigits(newOtp);
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = useCallback(async () => {
    setError("");
    const code = otpDigits.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      const token = await verifyPasswordResetOtp({
        method: contactMethod,
        destination: getDestination(),
        code,
      });
      setResetToken(token);
      setStep("new-password");
    } catch (e: any) {
      setError(e?.message || "Invalid or expired code. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [otpDigits, contactMethod, verifyPasswordResetOtp, getDestination]);

  const handleResetPassword = useCallback(async () => {
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await resetPassword({
        method: contactMethod,
        destination: getDestination(),
        resetToken,
        newPassword,
      });
      setStep("success");
      setRedirectCountdown(3);
    } catch (e: any) {
      setError(e?.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [newPassword, confirmPassword, contactMethod, resetToken, resetPassword, getDestination]);

  const inputStyle = (field: string) => ({
    borderWidth: 2,
    borderColor: focusedField === field ? "#1E88FF" : "#E5E7EB",
    borderRadius: 14,
    padding: 16,
    paddingLeft: 50,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: focusedField === field ? "#F0F7FF" : "#0F2244",
  });

  const passwordInputStyle = (field: string) => ({
    borderWidth: 2,
    borderColor: focusedField === field ? "#1E88FF" : "#E5E7EB",
    borderRadius: 14,
    padding: 16,
    paddingLeft: 50,
    paddingRight: 50,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: focusedField === field ? "#F0F7FF" : "#0F2244",
  });

  const strength = getPasswordStrength(newPassword);
  const requirements = [
    { label: "At least 8 characters", met: newPassword.length >= 8 },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(newPassword) },
    { label: "Contains number", met: /[0-9]/.test(newPassword) },
    { label: "Contains special character", met: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: "center", marginTop: 20, marginBottom: 32 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              backgroundColor: step === "success" ? "#16A34A" : "#1E88FF",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: step === "success" ? "#16A34A" : "#1E88FF",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 36, color: "#fff" }}>
              {step === "success" ? "\u2713" : step === "new-password" ? "\u{1F512}" : step === "otp" ? "\u{1F4E7}" : "\u{1F511}"}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 28,
              fontWeight: "900",
              color: colors.foreground,
              marginTop: 20,
              letterSpacing: -0.5,
              textAlign: "center",
            }}
          >
            {step === "destination" && "Reset Password"}
            {step === "otp" && "Enter Code"}
            {step === "new-password" && "New Password"}
            {step === "success" && "Password Reset!"}
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: "#94A3B8",
              marginTop: 6,
              textAlign: "center",
              paddingHorizontal: 20,
            }}
          >
            {step === "destination" && "Enter your phone or email to receive a reset code"}
            {step === "otp" &&
              `Code sent to ${maskDestination(contactMethod, getDestination())}`}
            {step === "new-password" && "Create a strong password for your account"}
            {step === "success" &&
              `Redirecting to sign in in ${redirectCountdown}s...`}
          </Text>
        </View>

        {/* Error Banner */}
        {error ? (
          <View
            style={{
              backgroundColor: "#FEF2F2",
              borderWidth: 1,
              borderColor: "#FECACA",
              borderRadius: 12,
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
                backgroundColor: "#EF4444",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>!</Text>
            </View>
            <Text style={{ color: "#DC2626", fontSize: 13, flex: 1 }}>{error}</Text>
          </View>
        ) : null}

        {/* Success Banner */}
        {successMsg ? (
          <View
            style={{
              backgroundColor: "#F0FDF4",
              borderWidth: 1,
              borderColor: "#BBF7D0",
              borderRadius: 12,
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
                backgroundColor: "#16A34A",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{"\u2713"}</Text>
            </View>
            <Text style={{ color: "#059669", fontSize: 13, flex: 1 }}>{successMsg}</Text>
          </View>
        ) : null}

        {/* ── Step 1: Destination ── */}
        {step === "destination" && (
          <View>
            {/* Contact Method Toggle */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "#F9FAFB",
                borderRadius: 14,
                padding: 4,
                marginBottom: 20,
              }}
            >
              {(["phone", "email"] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => {
                    setContactMethod(m);
                    setError("");
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    alignItems: "center",
                    backgroundColor: contactMethod === m ? "#fff" : "transparent",
                    ...(contactMethod === m
                      ? {
                          shadowColor: "#000",
                          shadowOpacity: 0.08,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: 3,
                        }
                      : {}),
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: contactMethod === m ? "700" : "500",
                      color: contactMethod === m ? "#1E88FF" : "#94A3B8",
                    }}
                  >
                    {m === "phone" ? "Phone" : "Email"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Input */}
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: "#6B7280",
                  marginBottom: 8,
                  marginLeft: 4,
                }}
              >
                {contactMethod === "phone" ? "Phone Number" : "Email Address"}
              </Text>
              <View style={{ position: "relative" }}>
                <View
                  style={{
                    position: "absolute",
                    left: 16,
                    top: 16,
                    zIndex: 1,
                    width: 24,
                    height: 24,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      color: focusedField === "dest" ? "#1E88FF" : "#94A3B8",
                    }}
                  >
                    {contactMethod === "phone" ? "\u260E" : "\u2709"}
                  </Text>
                </View>
                <TextInput
                  placeholder={
                    contactMethod === "phone" ? "(555) 123-4567" : "you@example.com"
                  }
                  value={contactMethod === "phone" ? formatPhone(phone) : email}
                  onChangeText={
                    contactMethod === "phone"
                      ? (t: string) => setPhone(t.replace(/\D/g, ""))
                      : setEmail
                  }
                  keyboardType={
                    contactMethod === "phone" ? "phone-pad" : "email-address"
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={inputStyle("dest")}
                  placeholderTextColor="#CBD5E1"
                  onFocus={() => setFocusedField("dest")}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Send Button */}
            <TouchableOpacity
              onPress={handleSendCode}
              disabled={loading}
              activeOpacity={0.8}
              style={{
                backgroundColor: loading ? "#7EC8FF" : "#1E88FF",
                borderRadius: 14,
                padding: 18,
                alignItems: "center",
                shadowColor: "#1E88FF",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
                elevation: 6,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>
                  Send Reset Code
                </Text>
              )}
            </TouchableOpacity>

            {/* Back to Sign In */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ alignItems: "center", marginTop: 24 }}
            >
              <Text style={{ fontSize: 15, color: "#1E88FF", fontWeight: "600" }}>
                Back to Sign In
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: OTP ── */}
        {step === "otp" && (
          <View>
            {/* OTP Digit Inputs */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 10,
                marginBottom: 20,
              }}
            >
              {otpDigits.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref: any) => {
                    otpRefs.current[i] = ref;
                  }}
                  value={digit}
                  onChangeText={(val: string) => handleOtpChange(i, val)}
                  onKeyPress={({ nativeEvent }: any) => handleOtpKeyPress(i, nativeEvent.key)}
                  keyboardType="number-pad"
                  maxLength={i === 0 ? 6 : 1}
                  style={{
                    width: 48,
                    height: 56,
                    borderWidth: 2,
                    borderColor: digit ? "#1E88FF" : focusedField === `otp${i}` ? "#1E88FF" : "#E5E7EB",
                    borderRadius: 12,
                    textAlign: "center",
                    fontSize: 22,
                    fontWeight: "700",
                    color: colors.foreground,
                    backgroundColor: digit ? "#F0F7FF" : "#0F2244",
                  }}
                  onFocus={() => setFocusedField(`otp${i}`)}
                  onBlur={() => setFocusedField(null)}
                />
              ))}
            </View>

            {/* Timer */}
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              {countdown > 0 ? (
                <Text style={{ fontSize: 14, color: "#6B7280" }}>
                  Code expires in{" "}
                  <Text style={{ fontWeight: "700", color: countdown < 60 ? "#EF4444" : "#1E88FF" }}>
                    {formatTime(countdown)}
                  </Text>
                </Text>
              ) : (
                <Text style={{ fontSize: 14, color: "#EF4444", fontWeight: "600" }}>
                  Code expired. Please request a new one.
                </Text>
              )}
            </View>

            {/* Verify Button */}
            <TouchableOpacity
              onPress={handleVerifyOtp}
              disabled={loading || countdown <= 0}
              activeOpacity={0.8}
              style={{
                backgroundColor: loading || countdown <= 0 ? "#7EC8FF" : "#1E88FF",
                borderRadius: 14,
                padding: 18,
                alignItems: "center",
                shadowColor: "#1E88FF",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
                elevation: 6,
                marginBottom: 16,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>
                  Verify Code
                </Text>
              )}
            </TouchableOpacity>

            {/* Resend */}
            <TouchableOpacity
              onPress={handleResend}
              disabled={resendCooldown > 0 || loading}
              style={{ alignItems: "center", marginBottom: 16 }}
            >
              <Text
                style={{
                  fontSize: 15,
                  color: resendCooldown > 0 ? "#94A3B8" : "#1E88FF",
                  fontWeight: "600",
                }}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend Code"}
              </Text>
            </TouchableOpacity>

            {/* Back */}
            <TouchableOpacity
              onPress={() => {
                setStep("destination");
                setError("");
              }}
              style={{ alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, color: "#94A3B8", fontWeight: "500" }}>
                Change {contactMethod === "phone" ? "phone number" : "email"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 3: New Password ── */}
        {step === "new-password" && (
          <View>
            {/* New Password */}
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: "#6B7280",
                  marginBottom: 8,
                  marginLeft: 4,
                }}
              >
                New Password
              </Text>
              <View style={{ position: "relative" }}>
                <View
                  style={{
                    position: "absolute",
                    left: 16,
                    top: 16,
                    zIndex: 1,
                    width: 24,
                    height: 24,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      color: focusedField === "newpass" ? "#1E88FF" : "#94A3B8",
                    }}
                  >
                    {"\u{1F512}"}
                  </Text>
                </View>
                <TextInput
                  placeholder="Enter new password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={passwordInputStyle("newpass")}
                  placeholderTextColor="#CBD5E1"
                  onFocus={() => setFocusedField("newpass")}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 16,
                    top: 16,
                    width: 28,
                    height: 28,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 18, color: "#94A3B8" }}>
                    {showPassword ? "\u{1F441}" : "\u{1F441}\u200D\u{1F5E8}"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Password Strength Indicator */}
            {newPassword.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  {[1, 2, 3, 4].map((bar) => (
                    <View
                      key={bar}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: bar <= strength.score ? strength.color : "#E5E7EB",
                      }}
                    />
                  ))}
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: strength.color,
                    marginLeft: 2,
                  }}
                >
                  {strength.label}
                </Text>
              </View>
            )}

            {/* Requirements Checklist */}
            <View style={{ marginBottom: 20, gap: 8 }}>
              {requirements.map((req) => (
                <View
                  key={req.label}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: req.met ? "#16A34A" : "#E5E7EB",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: req.met ? "#fff" : "#94A3B8",
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {req.met ? "\u2713" : "\u2022"}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      color: req.met ? "#16A34A" : "#94A3B8",
                      fontWeight: req.met ? "600" : "400",
                    }}
                  >
                    {req.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Confirm Password */}
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: "#6B7280",
                  marginBottom: 8,
                  marginLeft: 4,
                }}
              >
                Confirm Password
              </Text>
              <View style={{ position: "relative" }}>
                <View
                  style={{
                    position: "absolute",
                    left: 16,
                    top: 16,
                    zIndex: 1,
                    width: 24,
                    height: 24,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      color: focusedField === "confirm" ? "#1E88FF" : "#94A3B8",
                    }}
                  >
                    {"\u{1F512}"}
                  </Text>
                </View>
                <TextInput
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={passwordInputStyle("confirm")}
                  placeholderTextColor="#CBD5E1"
                  onFocus={() => setFocusedField("confirm")}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: "absolute",
                    right: 16,
                    top: 16,
                    width: 28,
                    height: 28,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 18, color: "#94A3B8" }}>
                    {showConfirmPassword ? "\u{1F441}" : "\u{1F441}\u200D\u{1F5E8}"}
                  </Text>
                </TouchableOpacity>
              </View>
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <Text
                  style={{
                    fontSize: 12,
                    color: "#EF4444",
                    marginTop: 6,
                    marginLeft: 4,
                  }}
                >
                  Passwords do not match
                </Text>
              )}
            </View>

            {/* Reset Button */}
            <TouchableOpacity
              onPress={handleResetPassword}
              disabled={loading}
              activeOpacity={0.8}
              style={{
                backgroundColor: loading ? "#7EC8FF" : "#1E88FF",
                borderRadius: 14,
                padding: 18,
                alignItems: "center",
                shadowColor: "#1E88FF",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
                elevation: 6,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>
                  Reset Password
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 4: Success ── */}
        {step === "success" && (
          <View style={{ alignItems: "center", paddingTop: 10 }}>
            <View
              style={{
                backgroundColor: "#F0FDF4",
                borderWidth: 1,
                borderColor: "#BBF7D0",
                borderRadius: 16,
                padding: 24,
                alignItems: "center",
                width: "100%",
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#16A34A",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 28, fontWeight: "700" }}>{"\u2713"}</Text>
              </View>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "700",
                  color: "#065F46",
                  marginBottom: 8,
                  textAlign: "center",
                }}
              >
                Your password has been reset successfully
              </Text>
              <Text
                style={{ fontSize: 14, color: "#059669", textAlign: "center" }}
              >
                You can now sign in with your new password.
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => router.replace("/auth/sign-in")}
              style={{
                marginTop: 24,
                backgroundColor: "#1E88FF",
                borderRadius: 14,
                padding: 18,
                alignItems: "center",
                width: "100%",
                shadowColor: "#1E88FF",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
                elevation: 6,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>
                Go to Sign In
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Security Note */}
        {step !== "success" && (
          <View style={{ alignItems: "center", paddingTop: 32, paddingBottom: 20 }}>
            <Text style={{ fontSize: 11, color: "#CBD5E1", textAlign: "center" }}>
              Protected by 256-bit encryption. Your data is secure.
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
