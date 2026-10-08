/**
 * Student Verification Screen
 *
 * Flow:
 *  1. User enters (or confirms) their .edu email
 *  2. OTP is sent → user enters 6-digit code
 *  3. On success, badge appears in profile and screen shows confirmation
 *
 * Supports:
 *  - live countdown timer (5-min OTP expiry)
 *  - 60-second resend cooldown
 *  - attempt counter feedback
 *  - revoke + re-verify for email changes
 */

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Focusable = { focus(): void };
type KeyEvent = { nativeEvent: { key: string } };

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ── OTP Input ────────────────────────────────────────────────────────────────

function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const inputs = useRef<(Focusable | null)[]>([]);

  // Pad with space (not ""), empty string fill is a no-op in JS
  const digits = value.padEnd(6, " ").slice(0, 6).split("");

  const handleChange = (text: string, idx: number) => {
    const clean = text.replace(/\D/g, "").slice(-1);
    const arr = value.padEnd(6, " ").slice(0, 6).split("");
    arr[idx] = clean || " "; // space = unfilled slot
    onChange(arr.join(""));
    if (clean && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKeyPress = (e: KeyEvent, idx: number) => {
    if (e.nativeEvent.key === "Backspace" && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  return (
    <View style={{ flexDirection: "row", gap: 10, justifyContent: "center", marginVertical: 24 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <TextInput
          key={i}
          ref={(r: Focusable | null) => { inputs.current[i] = r; }}
          value={digits[i] === " " ? "" : digits[i]}
          onChangeText={(t: string) => handleChange(t, i)}
          onKeyPress={(e: KeyEvent) => handleKeyPress(e, i)}
          keyboardType="number-pad"
          maxLength={1}
          editable={!disabled}
          style={{
            width: 46,
            height: 56,
            borderRadius: 12,
            borderWidth: digits[i] && digits[i] !== " " ? 2 : 1.5,
            borderColor: digits[i] && digits[i] !== " " ? "#3B5EF5" : "#CBD5E1",
            backgroundColor: disabled ? "#F1F5F9" : colors.surface ?? "#0F2244",
            fontSize: 24,
            fontWeight: "800",
            color: colors.foreground,
            textAlign: "center",
          }}
          selectTextOnFocus
        />
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

type Phase = "email" | "otp" | "success";

export default function StudentVerificationScreen() {
  const router = useRouter();
  const colors = useColors();

  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Result data from sendVerificationOtp
  const [universityName, setUniversityName] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");

  // Countdown timer (OTP expiry)
  const [countdown, setCountdown] = useState(300);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const utils = trpc.useUtils();

  // ── Status query (for showing current state on mount) ───────────────────────
  const { data: status } = trpc.student.getStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // If already verified, jump straight to success
  useEffect(() => {
    if (status?.status === "verified") {
      setUniversityName(status.universityName ?? "");
      setPhase("success");
    } else if (status?.status === "pending") {
      setMaskedEmail(status.maskedEmail ?? "");
      setUniversityName(status.universityName ?? "");
      const remaining = Math.max(
        0,
        Math.round(
          (new Date(status.expiresAt!).getTime() - Date.now()) / 1_000,
        ),
      );
      setCountdown(remaining);
      if (remaining > 0) setPhase("otp");
    }
  }, [status]);

  // ── Timer management ─────────────────────────────────────────────────────────

  const startTimer = useCallback((secs: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCountdown(secs);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1_000);
  }, []);

  const startResendCooldown = useCallback(() => {
    if (resendRef.current) clearInterval(resendRef.current);
    setResendCooldown(60);
    resendRef.current = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) { clearInterval(resendRef.current!); return 0; }
        return c - 1;
      });
    }, 1_000);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (resendRef.current) clearInterval(resendRef.current);
  }, []);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const sendOtpMut = trpc.student.sendVerificationOtp.useMutation();
  const verifyOtpMut = trpc.student.verifyOtp.useMutation();
  const resendOtpMut = trpc.student.resendOtp.useMutation();
  const revokeMut = trpc.student.revoke.useMutation();

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSendOtp = async () => {
    setError("");
    if (!email.trim()) { setError("Please enter your .edu email address."); return; }
    if (!email.toLowerCase().endsWith(".edu")) {
      setError("Only .edu university email addresses are supported.");
      return;
    }
    setLoading(true);
    try {
      const res = await sendOtpMut.mutateAsync({ email: email.trim() });
      setUniversityName(res.universityName);
      setMaskedEmail(res.maskedEmail);
      startTimer(res.expiresIn);
      startResendCooldown();
      setPhase("otp");
    } catch (e: any) {
      setError(e?.message ?? "Failed to send code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const digits6 = otp.replace(/\s/g, "");
    if (digits6.length < 6) { setError("Please enter all 6 digits."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await verifyOtpMut.mutateAsync({ otp: digits6 });
      setUniversityName(res.universityName ?? universityName);
      await utils.student.getStatus.invalidate();
      setPhase("success");
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (e: any) {
      setError(e?.message ?? "Verification failed. Please try again.");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setLoading(true);
    try {
      const res = await resendOtpMut.mutateAsync();
      setMaskedEmail(res.maskedEmail);
      startTimer(res.expiresIn);
      startResendCooldown();
      setOtp("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = () => {
    Alert.alert(
      "Remove verification?",
      "You can re-verify with a different .edu address. Your current verified status will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await revokeMut.mutateAsync();
            await utils.student.getStatus.invalidate();
            setPhase("email");
            setEmail("");
            setOtp("");
          },
        },
      ],
    );
  };

  // ── Shared styles ────────────────────────────────────────────────────────────

  const btn = (active: boolean) => ({
    backgroundColor: active ? "#3B5EF5" : "#E2E8F0",
    borderRadius: 14,
    padding: 16,
    alignItems: "center" as const,
    marginTop: 4,
  });

  const inputStyle = {
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.surface ?? "#0F2244",
    marginBottom: 4,
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back nav */}
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 20 }}>
            <Text style={{ color: "#3B5EF5", fontWeight: "600", fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>

          {/* ═══ SUCCESS ════════════════════════════════════════════════════════ */}
          {phase === "success" && (
            <View style={{ alignItems: "center", gap: 20, paddingTop: 20 }}>
              {/* Trophy */}
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  backgroundColor: "#EEF2FF",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 40 }}>🎓</Text>
              </View>

              <View style={{ alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 26, fontWeight: "900", color: colors.foreground }}>
                  Student Verified!
                </Text>
                <Text style={{ fontSize: 15, color: colors.muted, textAlign: "center", lineHeight: 22 }}>
                  Your student identity at{"\n"}
                  <Text style={{ fontWeight: "700", color: "#3B5EF5" }}>{universityName}</Text>
                  {"\n"}has been confirmed.
                </Text>
              </View>

              {/* Badge card */}
              <View
                style={{
                  width: "100%",
                  backgroundColor: "#EEF2FF",
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: "#C7D2FE",
                  padding: 20,
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "#3B5EF5",
                    borderRadius: 20,
                    paddingHorizontal: 16,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>
                    ✓  Verified Student
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: "#4338CA", fontWeight: "600", marginTop: 4 }}>
                  {universityName}
                </Text>
              </View>

              {/* Benefits */}
              <View style={{ width: "100%", gap: 10 }}>
                {[
                  { icon: "🎯", text: "Higher trust score in ride matching" },
                  { icon: "🚗", text: "Access to Students-Only shared rides" },
                  { icon: "🎁", text: "Free rides after every 5 completed trips" },
                  { icon: "🏫", text: "University community ride visibility" },
                ].map(({ icon, text }) => (
                  <View
                    key={text}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      backgroundColor: colors.surface ?? "#0F2244",
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>{icon}</Text>
                    <Text style={{ fontSize: 14, color: colors.foreground, flex: 1 }}>{text}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={{ ...btn(true), width: "100%", marginTop: 12 }}
                onPress={() => router.back()}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>
                  Back to Profile
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleRevoke} style={{ paddingVertical: 8 }}>
                <Text style={{ fontSize: 13, color: colors.muted, textDecorationLine: "underline" }}>
                  Verify a different email address
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══ EMAIL ENTRY ════════════════════════════════════════════════════ */}
          {phase === "email" && (
            <View style={{ gap: 16 }}>
              {/* Header */}
              <View style={{ gap: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 28, fontWeight: "900", color: colors.foreground }}>
                  Student Verification
                </Text>
                <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 21 }}>
                  {"Enter your university email address. We'll send a one-time code to confirm you're a student."}
                </Text>
              </View>

              {/* Trust badge row */}
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {["🔒 Secure", "⚡ 5-min code", "🎓 One-time verify"].map((label) => (
                  <View
                    key={label}
                    style={{
                      backgroundColor: "#EEF2FF",
                      borderRadius: 20,
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#4338CA" }}>{label}</Text>
                  </View>
                ))}
              </View>

              {/* Email input */}
              <View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 6 }}>
                  University Email (.edu)
                </Text>
                <TextInput
                  placeholder="you@university.edu"
                  placeholderTextColor={colors.muted}
                  value={email}
                  onChangeText={(t: string) => { setEmail(t); setError(""); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={inputStyle}
                />
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                  Only .edu addresses are accepted. Disposable emails are rejected.
                </Text>
              </View>

              {/* Error */}
              {error ? (
                <View
                  style={{
                    backgroundColor: "#FEE2E2",
                    borderRadius: 10,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: "#FCA5A5",
                  }}
                >
                  <Text style={{ color: "#DC2626", fontSize: 13 }}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={btn(!loading && email.toLowerCase().includes(".edu"))}
                onPress={handleSendOtp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>
                    Send Verification Code
                  </Text>
                )}
              </TouchableOpacity>

              {/* Info box */}
              <View
                style={{
                  backgroundColor: "#F0FDF4",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#BBF7D0",
                  padding: 16,
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#15803D" }}>
                  Why verify?
                </Text>
                {[
                  "Earn a Verified Student badge visible to drivers and co-riders",
                  "Access to Students-Only campus rides",
                  "Increased trust score and ride acceptance rate",
                  "Unlock student free-ride benefit program",
                ].map((item) => (
                  <Text key={item} style={{ fontSize: 12, color: "#166534", lineHeight: 18 }}>
                    • {item}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {/* ═══ OTP ENTRY ══════════════════════════════════════════════════════ */}
          {phase === "otp" && (
            <View style={{ gap: 16 }}>
              {/* Header */}
              <View style={{ gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 28, fontWeight: "900", color: colors.foreground }}>
                  Enter the code
                </Text>
                <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 21 }}>
                  We sent a 6-digit code to{" "}
                  <Text style={{ fontWeight: "700", color: colors.foreground }}>{maskedEmail}</Text>
                  {universityName ? (
                    <>
                      {"\n"}
                      <Text style={{ color: "#3B5EF5", fontWeight: "600" }}>{universityName}</Text>
                    </>
                  ) : null}
                </Text>
              </View>

              {/* Timer */}
              <View style={{ alignItems: "center" }}>
                {countdown > 0 ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: countdown < 60 ? "#FEF3C7" : "#EEF2FF",
                      borderRadius: 20,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: countdown < 60 ? "#92400E" : "#4338CA", fontWeight: "600" }}>
                      ⏱ Code expires in {formatSeconds(countdown)}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={{
                      backgroundColor: "#FEE2E2",
                      borderRadius: 20,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: "#DC2626", fontWeight: "600" }}>
                      Code expired — request a new one
                    </Text>
                  </View>
                )}
              </View>

              {/* OTP digit inputs */}
              <OtpInput value={otp} onChange={setOtp} disabled={loading || countdown === 0} />

              {/* Error */}
              {error ? (
                <View
                  style={{
                    backgroundColor: "#FEE2E2",
                    borderRadius: 10,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: "#FCA5A5",
                  }}
                >
                  <Text style={{ color: "#DC2626", fontSize: 13 }}>{error}</Text>
                </View>
              ) : null}

              {/* Verify button */}
              <TouchableOpacity
                style={btn(!loading && otp.replace(/\s/g, "").length === 6 && countdown > 0)}
                onPress={handleVerifyOtp}
                disabled={loading || otp.replace(/\s/g, "").length < 6 || countdown === 0}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>
                    Verify Code
                  </Text>
                )}
              </TouchableOpacity>

              {/* Resend */}
              <View style={{ alignItems: "center", gap: 4, marginTop: 4 }}>
                {resendCooldown > 0 ? (
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    Resend available in {resendCooldown}s
                  </Text>
                ) : (
                  <TouchableOpacity onPress={handleResend} disabled={loading}>
                    <Text style={{ fontSize: 14, color: "#3B5EF5", fontWeight: "600" }}>
                      Resend code
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => {
                    setPhase("email");
                    setOtp("");
                    setError("");
                    if (timerRef.current) clearInterval(timerRef.current);
                  }}
                >
                  <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                    Change email address
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Security note */}
              <View
                style={{
                  backgroundColor: "#F8FAFC",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  padding: 12,
                  marginTop: 8,
                }}
              >
                <Text style={{ fontSize: 11, color: colors.muted, lineHeight: 17 }}>
                  🔒 YOO will never ask for this code via phone, chat, or any other channel.
                  Do not share it with anyone.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
