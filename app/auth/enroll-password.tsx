import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context-v2";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Step = "otp" | "new-password" | "success";

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

export default function EnrollPasswordScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams();
  const { requestPasswordReset, verifyPasswordResetOtp, resetPassword } = useAuth();

  const method = (params.method as "phone" | "email") ?? "phone";
  const destination = (params.destination as string) ?? "";

  const [step, setStep] = useState<Step>("otp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // OTP step
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const otpRefs = useRef<any[]>([]);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resetToken, setResetToken] = useState("");

  // New password step
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Success redirect countdown
  const [redirectCountdown, setRedirectCountdown] = useState(4);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (step !== "success") return;
    if (redirectCountdown <= 0) {
      router.replace("/auth/sign-in");
      return;
    }
    const t = setInterval(() => setRedirectCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [step, redirectCountdown, router]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
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
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
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
      const token = await verifyPasswordResetOtp({ method, destination, code });
      setResetToken(token);
      setStep("new-password");
    } catch (e: any) {
      setError(e?.message || "Invalid or expired code. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [otpDigits, method, destination, verifyPasswordResetOtp]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    setError("");
    setLoading(true);
    try {
      await requestPasswordReset({ method, destination });
      setOtpDigits(["", "", "", "", "", ""]);
      setResendCooldown(60);
    } catch (e: any) {
      setError(e?.message || "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  }, [resendCooldown, method, destination, requestPasswordReset]);

  const handleSetPassword = useCallback(async () => {
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
      await resetPassword({ method, destination, resetToken, newPassword });
      setStep("success");
    } catch (e: any) {
      setError(e?.message || "Failed to set password. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [newPassword, confirmPassword, method, destination, resetToken, resetPassword]);

  const inputStyle = (field: string) => ({
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
              {step === "success" ? "✓" : step === "new-password" ? "\u{1F512}" : "\u{1F4E7}"}
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
            {step === "otp" && "Verify Your Number"}
            {step === "new-password" && "Create Password"}
            {step === "success" && "Password Created!"}
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
            {step === "otp" && `Enter the 6-digit code sent to ${destination}`}
            {step === "new-password" && "Create a strong password for your account"}
            {step === "success" && `Redirecting to sign in in ${redirectCountdown}s...`}
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

        {/* ── Step 1: OTP ── */}
        {step === "otp" && (
          <View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 10,
                marginBottom: 28,
              }}
            >
              {otpDigits.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref: any) => { otpRefs.current[i] = ref; }}
                  value={digit}
                  onChangeText={(val: string) => handleOtpChange(i, val)}
                  onKeyPress={({ nativeEvent }: any) => handleOtpKeyPress(i, nativeEvent.key)}
                  keyboardType="number-pad"
                  maxLength={i === 0 ? 6 : 1}
                  style={{
                    width: 48,
                    height: 56,
                    borderWidth: 2,
                    borderColor: digit
                      ? "#1E88FF"
                      : focusedField === `otp${i}`
                        ? "#1E88FF"
                        : "#E5E7EB",
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

            <TouchableOpacity
              onPress={handleVerifyOtp}
              disabled={loading || otpDigits.join("").length !== 6}
              activeOpacity={0.8}
              style={{
                backgroundColor:
                  loading || otpDigits.join("").length !== 6 ? "#7EC8FF" : "#1E88FF",
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

            <TouchableOpacity
              onPress={() => router.back()}
              style={{ alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, color: "#94A3B8", fontWeight: "500" }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: New Password ── */}
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
                  style={inputStyle("newpass")}
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
                    {showPassword ? "\u{1F441}" : "\u{1F441}‍\u{1F5E8}"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Strength indicator */}
            {newPassword.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
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
                <Text style={{ fontSize: 12, fontWeight: "600", color: strength.color, marginLeft: 2 }}>
                  {strength.label}
                </Text>
              </View>
            )}

            {/* Requirements */}
            <View style={{ marginBottom: 20, gap: 8 }}>
              {requirements.map((req) => (
                <View key={req.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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
                    <Text style={{ color: req.met ? "#fff" : "#94A3B8", fontSize: 11, fontWeight: "700" }}>
                      {req.met ? "✓" : "•"}
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
                  style={inputStyle("confirm")}
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
                    {showConfirmPassword ? "\u{1F441}" : "\u{1F441}‍\u{1F5E8}"}
                  </Text>
                </TouchableOpacity>
              </View>
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <Text style={{ fontSize: 12, color: "#EF4444", marginTop: 6, marginLeft: 4 }}>
                  Passwords do not match
                </Text>
              )}
            </View>

            <TouchableOpacity
              onPress={handleSetPassword}
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
                  Create Password
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 3: Success ── */}
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
                <Text style={{ color: "#fff", fontSize: 28, fontWeight: "700" }}>{"✓"}</Text>
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
                Password created successfully
              </Text>
              <Text style={{ fontSize: 14, color: "#059669", textAlign: "center" }}>
                You can now log in using either OTP or Password.
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
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
        )}

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
