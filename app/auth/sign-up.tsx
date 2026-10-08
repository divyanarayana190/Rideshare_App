import { AUTH } from "@/constants/design";
import BrandedBackButton from "@/components/BrandedBackButton";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context-v2";
import { consumePendingSignup, setPendingSignup } from "@/lib/pending-signup";
import { useNotification } from "@/lib/use-notification";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import {
  createEmptyLegalAcceptanceState,
  isLegalFullyAccepted,
  type LegalAcceptanceState,
} from "@/components/legal/LegalAcceptancePanel";
import { LegalDocumentScreen } from "@/components/legal/LegalDocumentScreen";
import { CURRENT_LEGAL_VERSION, SIGNUP_LEGAL_DOCUMENTS, type SignupLegalDocKey } from "@/shared/legal";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";

const D = {
  bg: "#07152D",
  card: "#13274B",
  primary: "#1E88FF",
  accent: "#38BDF8",
  text: "#FFFFFF",
  textSec: "#A9B5CF",
  textMut: "#6F7D98",
  iconInactive: "#7F8DAA",
  iconActive: "#38BDF8",
  border: "rgba(255,255,255,0.08)",
  borderActive: "#38BDF8",
  success: "#22C55E",
  error: "#EF4444",
} as const;

type Gender = "male" | "female" | "non_binary" | "prefer_not_to_say";

const GENDER_OPTIONS: { value: Gender; label: string; symbol: string }[] = [
  { value: "male", label: "Male", symbol: "♂" },
  { value: "female", label: "Female", symbol: "♀" },
  { value: "non_binary", label: "Non-Binary", symbol: "NB" },
  { value: "prefer_not_to_say", label: "Prefer not to say", symbol: "—" },
];

const STEPS = ["Personal Info", "Contact Details", "Review"];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            backgroundColor: i <= current ? D.primary : "rgba(255,255,255,0.08)",
          }}
        />
      ))}
      <Text style={{ fontSize: 12, fontWeight: "700", color: D.primary, minWidth: 28, textAlign: "right" }}>
        {current + 1}/{total}
      </Text>
    </View>
  );
}

// Compact single-checkbox legal agreement with clickable links
function CompactLegal({
  state,
  onChange,
}: {
  state: LegalAcceptanceState;
  onChange: (s: LegalAcceptanceState) => void;
}) {
  const [activeDoc, setActiveDoc] = useState<SignupLegalDocKey | null>(null);
  const allAccepted = isLegalFullyAccepted(state);
  const activeRow = SIGNUP_LEGAL_DOCUMENTS.find((d) => d.key === activeDoc);

  const toggleAll = () => {
    const now = new Date().toISOString();
    if (allAccepted) {
      onChange(createEmptyLegalAcceptanceState());
    } else {
      onChange({
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        communityAcceptedAt: now,
        termsReviewed: true,
        privacyReviewed: true,
        communityReviewed: true,
      });
    }
  };

  const handleLinkPress = (key: SignupLegalDocKey) => setActiveDoc(key);

  const handleAccept = (key: SignupLegalDocKey) => {
    const now = new Date().toISOString();
    onChange({ ...state, [`${key}AcceptedAt`]: now, [`${key}Reviewed`]: true });
    setActiveDoc(null);
  };

  return (
    <View
      style={{
        backgroundColor: D.card,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: allAccepted ? D.primary : D.border,
        padding: 16,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 14,
      }}
    >
      <TouchableOpacity
        onPress={toggleAll}
        activeOpacity={0.8}
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: allAccepted ? D.primary : D.iconInactive,
          backgroundColor: allAccepted ? D.primary : "transparent",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
          flexShrink: 0,
        }}
      >
        {allAccepted && <IconSymbol name="checkmark" size={12} color="#fff" />}
      </TouchableOpacity>

      <Text style={{ fontSize: 13, color: D.textSec, lineHeight: 22, flex: 1 }}>
        {"I agree to the "}
        <Text
          style={{ color: D.accent, fontWeight: "600" }}
          onPress={() => handleLinkPress("terms")}
        >
          Terms of Service
        </Text>
        {", "}
        <Text
          style={{ color: D.accent, fontWeight: "600" }}
          onPress={() => handleLinkPress("privacy")}
        >
          Privacy Policy
        </Text>
        {", and "}
        <Text
          style={{ color: D.accent, fontWeight: "600" }}
          onPress={() => handleLinkPress("community")}
        >
          Community Guidelines
        </Text>
      </Text>

      {activeRow && (
        <LegalDocumentScreen
          document={activeRow.document}
          visible={activeDoc !== null}
          onClose={() => setActiveDoc(null)}
          onAccept={() => handleAccept(activeDoc!)}
          alreadyAccepted={!!state[`${activeDoc}AcceptedAt` as keyof LegalAcceptanceState]}
        />
      )}
    </View>
  );
}

export default function SignUpScreen() {
  const router = useRouter();
  const colors = useColors();
  const { requestOtp, socialAuth, isSignedIn } = useAuth();
  const notify = useNotification();
  const [socialLoading, setSocialLoading] = useState<"google" | "apple" | null>(null);

  useEffect(() => {
    if (isSignedIn) router.replace("/(tabs)" as Href);
  }, [isSignedIn, router]);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Step 1: Personal Info — role is always "user" (passenger by default)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);

  // Step 2: Contact
  const [method, setMethod] = useState<"email" | "phone">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [authMode, setAuthMode] = useState<"password" | "otp">("password");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 3: Review — student preference
  const [isStudent, setIsStudent] = useState(false);
  const [collegeEmail, setCollegeEmail] = useState("");

  const [legalAcceptance, setLegalAcceptance] = useState<LegalAcceptanceState>(createEmptyLegalAcceptanceState);
  const legalOk = isLegalFullyAccepted(legalAcceptance);
  const deviceInfo = `${Platform.OS} ${String(Platform.Version)}`;

  const ic = (field: string) => (focusedField === field ? D.iconActive : D.iconInactive);
  const bc = (field: string) => (focusedField === field ? D.borderActive : D.border);

  const inputBase = {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingVertical: 0,
    paddingHorizontal: 18,
    paddingLeft: 48,
    fontSize: 16,
    color: D.text,
    backgroundColor: D.card,
    height: 58,
  };

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!firstName.trim()) return "First name is required";
      if (!lastName.trim()) return "Last name is required";
      if (!gender) return "Please select your gender";
    }
    if (step === 1) {
      if (method === "phone") {
        const cleaned = phone.replace(/\D/g, "");
        if (cleaned.length < 10) return "Enter a valid phone number (10+ digits)";
      } else {
        if (!email.trim().includes("@")) return "Enter a valid email address";
      }
      if (authMode === "password") {
        if (password.length < 8) return "Password must be at least 8 characters";
        if (password !== confirmPassword) return "Passwords do not match";
      }
    }
    if (step === 2) {
      if (isStudent && collegeEmail) {
        if (
          !collegeEmail.includes(".edu") &&
          !collegeEmail.includes("college") &&
          !collegeEmail.includes("university") &&
          !collegeEmail.includes("ac.")
        ) {
          return "Please enter a valid college/university email";
        }
      }
      if (!legalOk) {
        return "Review and accept the Terms of Service, Privacy Policy, and Community Guidelines";
      }
    }
    return null;
  };

  const handleNext = () => {
    setError("");
    const err = validateStep();
    if (err) { setError(err); return; }
    setStep(step + 1);
  };

  const handleBack = () => {
    setError("");
    if (step === 0) router.back();
    else setStep(step - 1);
  };

  const handleSubmit = async () => {
    setError("");
    if (!legalOk) {
      setError("You must accept the Terms of Service and Privacy Policy before continuing.");
      return;
    }
    setLoading(true);
    const loadingId = notify.showLoading("Sending verification code…");
    try {
      const destination =
        method === "email" ? email.trim().toLowerCase() : phone.replace(/\D/g, "");

      if (authMode === "password") setPendingSignup({ password });

      await requestOtp({ method, destination, purpose: "signup" });
      notify.dismiss(loadingId);
      notify.showSuccess("📲 Verification code sent!");
      router.push({
        pathname: "/auth/verify-otp",
        params: {
          method,
          destination,
          purpose: "signup",
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: method === "phone" ? email.trim().toLowerCase() : "",
          gender: gender ?? "",
          role: "user",
          isStudent: isStudent ? "true" : "false",
          collegeEmail: isStudent ? collegeEmail.trim() : "",
          legalVersion: CURRENT_LEGAL_VERSION,
          acceptTerms: legalOk ? "true" : "false",
          acceptPrivacy: legalOk ? "true" : "false",
          acceptCommunity: legalOk ? "true" : "false",
          termsAcceptedAt: legalAcceptance.termsAcceptedAt ?? "",
          privacyAcceptedAt: legalAcceptance.privacyAcceptedAt ?? "",
          communityAcceptedAt: legalAcceptance.communityAcceptedAt ?? "",
          deviceInfo,
        },
      });
    } catch (e: any) {
      consumePendingSignup();
      notify.dismiss(loadingId);
      const msg = e?.message || "Sign up failed. Please try again.";
      setError(msg);
      notify.showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignUp = async (provider: "google" | "apple") => {
    setError("");
    // Clicking a social button is implicit acceptance of all legal documents
    const now = new Date().toISOString();
    setLegalAcceptance({
      termsAcceptedAt: now,
      privacyAcceptedAt: now,
      communityAcceptedAt: now,
      termsReviewed: true,
      privacyReviewed: true,
      communityReviewed: true,
    });
    setSocialLoading(provider);
    try {
      const clientId = GOOGLE_WEB_CLIENT_ID || GOOGLE_CLIENT_ID;
      if (provider === "google" && !clientId) {
        setError("Google Sign-In not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to .env");
        setSocialLoading(null);
        return;
      }

      const redirectUri =
        Platform.OS === "web"
          ? `${window.location.origin}/auth/sign-up`
          : `${process.env.EXPO_PUBLIC_OAUTH_SERVER_URL || "http://localhost:3001"}/auth/${provider}/callback`;

      const authUrl =
        provider === "google"
          ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token+id_token&scope=${encodeURIComponent("openid email profile")}&nonce=${Date.now()}&prompt=select_account`
          : `https://appleid.apple.com/auth/authorize?client_id=${encodeURIComponent(process.env.EXPO_PUBLIC_APPLE_SERVICE_ID || "com.rideshare.auth")}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code+id_token&scope=name+email&response_mode=fragment&nonce=${Date.now()}`;

      if (Platform.OS === "web") {
        const width = 500, height = 600;
        const left = window.screenX + (window.innerWidth - width) / 2;
        const top = window.screenY + (window.innerHeight - height) / 2;
        const popup = window.open(authUrl, `${provider}-signup`, `width=${width},height=${height},left=${left},top=${top}`);

        const checkPopup = setInterval(() => {
          try {
            if (!popup || popup.closed) { clearInterval(checkPopup); setSocialLoading(null); return; }
            const url = popup.location.href;
            if (url.includes("id_token=") || url.includes("access_token=") || url.includes("code=")) {
              clearInterval(checkPopup);
              const hash = popup.location.hash.substring(1);
              const params = new URLSearchParams(hash);
              const idToken = params.get("id_token");
              popup.close();
              if (idToken) {
                socialAuth({
                  provider,
                  idToken,
                  legalVersion: CURRENT_LEGAL_VERSION,
                  acceptTerms: true,
                  acceptPrivacy: true,
                  acceptCommunity: true,
                  termsAcceptedAt: legalAcceptance.termsAcceptedAt!,
                  privacyAcceptedAt: legalAcceptance.privacyAcceptedAt!,
                  communityAcceptedAt: legalAcceptance.communityAcceptedAt!,
                  deviceInfo,
                })
                  .catch((e: any) => setError(e?.message || `${provider} sign-up failed`))
                  .finally(() => setSocialLoading(null));
              } else { setError(`Could not get token from ${provider}`); setSocialLoading(null); }
            }
          } catch { /* cross-origin */ }
        }, 500);
        setTimeout(() => { clearInterval(checkPopup); if (popup && !popup.closed) popup.close(); setSocialLoading(null); }, 120000);
      } else {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
        if (result.type === "success" && result.url) {
          const hash = result.url.split("#")[1] || "";
          const params = new URLSearchParams(hash);
          const idToken = params.get("id_token");
          if (idToken) {
            await socialAuth({
              provider,
              idToken,
              legalVersion: CURRENT_LEGAL_VERSION,
              acceptTerms: true,
              acceptPrivacy: true,
              acceptCommunity: true,
              termsAcceptedAt: legalAcceptance.termsAcceptedAt!,
              privacyAcceptedAt: legalAcceptance.privacyAcceptedAt!,
              communityAcceptedAt: legalAcceptance.communityAcceptedAt!,
              deviceInfo,
            });
          } else { setError(`Could not get token from ${provider}`); }
        }
        setSocialLoading(null);
      }
    } catch (e: any) {
      const msg = e?.message || `${provider} sign-up failed`;
      setError(msg);
      notify.showError(msg);
      setSocialLoading(null);
    }
  };

  const pwStrength =
    password.length >= 12 && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)
      ? { label: "Strong", color: D.success, bars: 4 }
      : password.length >= 10 && (/[A-Z]/.test(password) || /\d/.test(password))
      ? { label: "Good", color: "#F59E0B", bars: 3 }
      : password.length >= 8
      ? { label: "Fair", color: "#F97316", bars: 2 }
      : password.length > 0
      ? { label: "Weak", color: D.error, bars: 1 }
      : null;

  const segBtn = (active: boolean) => ({
    flex: 1,
    paddingVertical: 11,
    borderRadius: 11,
    alignItems: "center" as const,
    backgroundColor: active ? D.primary : "transparent",
  });

  const segBtnText = (active: boolean) => ({
    fontSize: 14,
    fontWeight: "700" as const,
    color: active ? "#FFF" : D.textMut,
  });

  return (
    <ScreenContainer style={{ backgroundColor: D.bg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={{ marginBottom: 28 }}>
          <BrandedBackButton onPress={handleBack} label={step === 0 ? "Back" : "Previous"} style={{ marginBottom: 24, alignSelf: "flex-start" }} />

          <StepIndicator current={step} total={STEPS.length} />

          <Text style={{ fontSize: 32, fontWeight: "800", color: D.text, marginTop: 22, letterSpacing: -0.5 }}>
            {step === 0 ? "Create Account" : step === 1 ? "Contact Details" : "Review & Agree"}
          </Text>
          <Text style={{ fontSize: 15, color: D.textSec, marginTop: 6, lineHeight: 22 }}>
            {step === 0
              ? "Let's start with your basic information."
              : step === 1
              ? "How should we reach you?"
              : "Almost done — confirm your details and agree to our terms."}
          </Text>
        </View>

        {/* ── Error Banner ── */}
        {error ? (
          <View
            style={{
              backgroundColor: "rgba(239,68,68,0.08)",
              borderWidth: 1,
              borderColor: "rgba(239,68,68,0.25)",
              borderRadius: 14,
              padding: 14,
              marginBottom: 20,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 20, height: 20, borderRadius: 10, borderWidth: 1.5,
                borderColor: D.error, alignItems: "center", justifyContent: "center", marginTop: 1,
              }}
            >
              <Text style={{ color: D.error, fontSize: 11, fontWeight: "800" }}>!</Text>
            </View>
            <Text style={{ color: D.error, fontSize: 14, flex: 1, lineHeight: 20 }}>{error}</Text>
          </View>
        ) : null}

        {/* ══════════ STEP 0: Personal Info ══════════ */}
        {step === 0 && (
          <View style={{ gap: 22 }}>
            {/* First Name */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: D.textMut, marginBottom: 8, letterSpacing: 0.6 }}>
                FIRST NAME
              </Text>
              <View style={{ position: "relative" }}>
                <View style={{ position: "absolute", left: 14, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}>
                  <IconSymbol name="person.fill" size={20} color={ic("firstName")} />
                </View>
                <TextInput
                  placeholder="John"
                  value={firstName}
                  onChangeText={setFirstName}
                  onFocus={() => setFocusedField("firstName")}
                  onBlur={() => setFocusedField(null)}
                  style={{ ...inputBase, borderColor: bc("firstName") }}
                  placeholderTextColor={D.textMut}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Last Name */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: D.textMut, marginBottom: 8, letterSpacing: 0.6 }}>
                LAST NAME
              </Text>
              <View style={{ position: "relative" }}>
                <View style={{ position: "absolute", left: 14, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}>
                  <IconSymbol name="person.fill" size={20} color={ic("lastName")} />
                </View>
                <TextInput
                  placeholder="Doe"
                  value={lastName}
                  onChangeText={setLastName}
                  onFocus={() => setFocusedField("lastName")}
                  onBlur={() => setFocusedField(null)}
                  style={{ ...inputBase, borderColor: bc("lastName") }}
                  placeholderTextColor={D.textMut}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Gender */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: D.textMut, marginBottom: 12, letterSpacing: 0.6 }}>
                GENDER
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {GENDER_OPTIONS.map((g) => {
                  const sel = gender === g.value;
                  return (
                    <TouchableOpacity
                      key={g.value}
                      onPress={() => setGender(g.value)}
                      activeOpacity={0.75}
                      style={{
                        flex: 1,
                        minWidth: "45%",
                        paddingVertical: 14,
                        paddingHorizontal: 14,
                        borderRadius: 18,
                        borderWidth: 1.5,
                        borderColor: sel ? D.primary : D.border,
                        backgroundColor: sel ? "rgba(30,136,255,0.1)" : D.card,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        shadowColor: sel ? D.primary : "transparent",
                        shadowOpacity: sel ? 0.3 : 0,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 3 },
                      }}
                    >
                      <View
                        style={{
                          width: 32, height: 32, borderRadius: 16,
                          backgroundColor: sel ? D.primary : "rgba(255,255,255,0.06)",
                          alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: sel ? "#FFF" : D.textMut, fontSize: 13, fontWeight: "700" }}>
                          {g.symbol}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: sel ? "700" : "500", color: sel ? D.primary : D.textSec, flex: 1 }}>
                        {g.label}
                      </Text>
                      {sel && (
                        <View
                          style={{
                            width: 18, height: 18, borderRadius: 9,
                            backgroundColor: D.primary, alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "800" }}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* ══════════ STEP 1: Contact Details ══════════ */}
        {step === 1 && (
          <View style={{ gap: 20 }}>
            {/* Method Toggle */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: D.textMut, marginBottom: 10, letterSpacing: 0.6 }}>
                SIGN UP WITH
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: D.card,
                  borderRadius: 16,
                  padding: 4,
                  borderWidth: 1.5,
                  borderColor: D.border,
                }}
              >
                {(["phone", "email"] as const).map((m) => (
                  <TouchableOpacity key={m} onPress={() => setMethod(m)} activeOpacity={0.7} style={segBtn(method === m)}>
                    <Text style={segBtnText(method === m)}>{m === "phone" ? "Phone" : "Email"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Phone or Email primary field */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: D.textMut, marginBottom: 8, letterSpacing: 0.6 }}>
                {method === "phone" ? "PHONE NUMBER" : "EMAIL ADDRESS"}
              </Text>
              <View style={{ position: "relative" }}>
                <View style={{ position: "absolute", left: 14, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}>
                  <IconSymbol
                    name={method === "phone" ? "phone.fill" : "envelope"}
                    size={20}
                    color={ic("primary")}
                  />
                </View>
                <TextInput
                  placeholder={method === "phone" ? "9735838613" : "john@example.com"}
                  value={method === "phone" ? phone : email}
                  onChangeText={method === "phone" ? setPhone : setEmail}
                  keyboardType={method === "phone" ? "phone-pad" : "email-address"}
                  autoCapitalize="none"
                  onFocus={() => setFocusedField("primary")}
                  onBlur={() => setFocusedField(null)}
                  style={{ ...inputBase, borderColor: bc("primary") }}
                  placeholderTextColor={D.textMut}
                />
              </View>
              {method === "phone" && (
                <Text style={{ fontSize: 11, color: D.textMut, marginTop: 6 }}>
                  {"We'll send a 6-digit verification code"}
                </Text>
              )}
            </View>

            {/* Optional email if phone method */}
            {method === "phone" && (
              <View>
                <Text style={{ fontSize: 11, fontWeight: "700", color: D.textMut, marginBottom: 8, letterSpacing: 0.6 }}>
                  EMAIL ADDRESS{" "}
                  <Text style={{ color: D.textMut, fontSize: 10, fontWeight: "400", letterSpacing: 0 }}>(optional)</Text>
                </Text>
                <View style={{ position: "relative" }}>
                  <View style={{ position: "absolute", left: 14, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}>
                    <IconSymbol name="envelope" size={20} color={ic("optEmail")} />
                  </View>
                  <TextInput
                    placeholder="john@example.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onFocus={() => setFocusedField("optEmail")}
                    onBlur={() => setFocusedField(null)}
                    style={{ ...inputBase, borderColor: bc("optEmail") }}
                    placeholderTextColor={D.textMut}
                  />
                </View>
                <Text style={{ fontSize: 11, color: D.textMut, marginTop: 6 }}>
                  For receipts and account recovery
                </Text>
              </View>
            )}

            {/* Auth Mode Toggle */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: D.textMut, marginBottom: 10, letterSpacing: 0.6 }}>
                SECURE YOUR ACCOUNT WITH
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: D.card,
                  borderRadius: 16,
                  padding: 4,
                  borderWidth: 1.5,
                  borderColor: D.border,
                }}
              >
                {(["password", "otp"] as const).map((m) => (
                  <TouchableOpacity key={m} onPress={() => setAuthMode(m)} activeOpacity={0.7} style={segBtn(authMode === m)}>
                    <Text style={segBtnText(authMode === m)}>{m === "password" ? "Password" : "OTP Code"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Password Fields */}
            {authMode === "password" && (
              <View style={{ gap: 16 }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: D.textMut, marginBottom: 8, letterSpacing: 0.6 }}>
                    CREATE PASSWORD
                  </Text>
                  <View style={{ position: "relative" }}>
                    <View style={{ position: "absolute", left: 14, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}>
                      <IconSymbol name="lock.fill" size={20} color={ic("password")} />
                    </View>
                    <TextInput
                      placeholder="Min 8 characters"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                      style={{ ...inputBase, borderColor: bc("password"), paddingRight: 52 }}
                      placeholderTextColor={D.textMut}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={{ position: "absolute", right: 16, top: 0, bottom: 0, justifyContent: "center" }}
                    >
                      <IconSymbol
                        name={showPassword ? "eye.fill" : "eye.slash.fill"}
                        size={20}
                        color={D.iconInactive}
                      />
                    </TouchableOpacity>
                  </View>
                  {pwStrength && (
                    <View style={{ marginTop: 10 }}>
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        {[1, 2, 3, 4].map((i) => (
                          <View
                            key={i}
                            style={{
                              flex: 1, height: 3, borderRadius: 2,
                              backgroundColor: i <= pwStrength.bars ? pwStrength.color : "rgba(255,255,255,0.08)",
                            }}
                          />
                        ))}
                      </View>
                      <Text style={{ fontSize: 11, marginTop: 5, color: pwStrength.color, fontWeight: "600" }}>
                        {pwStrength.label}
                      </Text>
                    </View>
                  )}
                </View>

                <View>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: D.textMut, marginBottom: 8, letterSpacing: 0.6 }}>
                    CONFIRM PASSWORD
                  </Text>
                  <View style={{ position: "relative" }}>
                    <View style={{ position: "absolute", left: 14, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}>
                      <IconSymbol name="lock.fill" size={20} color={ic("confirmPw")} />
                    </View>
                    <TextInput
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      onFocus={() => setFocusedField("confirmPw")}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        ...inputBase,
                        borderColor:
                          confirmPassword.length > 0 && confirmPassword !== password
                            ? "rgba(239,68,68,0.5)"
                            : confirmPassword.length > 0 && confirmPassword === password
                            ? "rgba(34,197,94,0.5)"
                            : bc("confirmPw"),
                      }}
                      placeholderTextColor={D.textMut}
                    />
                  </View>
                  {confirmPassword.length > 0 && confirmPassword !== password && (
                    <Text style={{ fontSize: 11, color: D.error, marginTop: 6 }}>Passwords do not match</Text>
                  )}
                  {confirmPassword.length > 0 && confirmPassword === password && (
                    <Text style={{ fontSize: 11, color: D.success, marginTop: 6 }}>Passwords match</Text>
                  )}
                </View>
              </View>
            )}

            {/* Info pill */}
            <View
              style={{
                backgroundColor: "rgba(30,136,255,0.07)",
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: "rgba(30,136,255,0.18)",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
                  borderColor: D.accent, alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                <Text style={{ color: D.accent, fontSize: 12, fontWeight: "800" }}>i</Text>
              </View>
              <Text style={{ fontSize: 12, color: D.accent, flex: 1, lineHeight: 18 }}>
                A 6-digit code will be sent to your {method === "phone" ? "phone" : "email"} to verify your account before it is created.
              </Text>
            </View>
          </View>
        )}

        {/* ══════════ STEP 2: Review & Agree ══════════ */}
        {step === 2 && (
          <View style={{ gap: 20 }}>
            {/* Student Toggle */}
            <View
              style={{
                backgroundColor: D.card,
                borderRadius: 22,
                padding: 20,
                borderWidth: 1.5,
                borderColor: isStudent ? D.primary : D.border,
                shadowColor: isStudent ? D.primary : "transparent",
                shadowOpacity: isStudent ? 0.25 : 0,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: D.text }}>Are you a student?</Text>
                  <Text style={{ fontSize: 12, color: D.textMut, marginTop: 4, lineHeight: 18 }}>
                    Get 2 free rides after every 5 completed rides
                  </Text>
                </View>
                <Switch
                  value={isStudent}
                  onValueChange={setIsStudent}
                  trackColor={{ false: "rgba(255,255,255,0.1)", true: D.primary }}
                  thumbColor="#FFF"
                />
              </View>

              {isStudent && (
                <View style={{ marginTop: 18 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: D.textMut, marginBottom: 8, letterSpacing: 0.6 }}>
                    COLLEGE EMAIL
                  </Text>
                  <View style={{ position: "relative" }}>
                    <View style={{ position: "absolute", left: 14, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}>
                      <IconSymbol name="envelope" size={20} color={ic("collegeEmail")} />
                    </View>
                    <TextInput
                      placeholder="john@university.edu"
                      value={collegeEmail}
                      onChangeText={setCollegeEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      onFocus={() => setFocusedField("collegeEmail")}
                      onBlur={() => setFocusedField(null)}
                      style={{ ...inputBase, borderColor: bc("collegeEmail") }}
                      placeholderTextColor={D.textMut}
                    />
                  </View>
                  <Text style={{ fontSize: 11, color: D.primary, marginTop: 8, fontWeight: "600" }}>
                    Verify with your .edu email to unlock student benefits
                  </Text>
                </View>
              )}
            </View>

            {/* Account Summary */}
            <View
              style={{
                backgroundColor: D.card,
                borderRadius: 22,
                padding: 20,
                borderWidth: 1,
                borderColor: D.border,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: D.text, marginBottom: 14 }}>
                Account Summary
              </Text>
              {[
                { label: "Name", value: `${firstName} ${lastName}` },
                { label: "Gender", value: GENDER_OPTIONS.find((g) => g.value === gender)?.label ?? "Not set" },
                { label: "Contact", value: method === "phone" ? phone : email },
                { label: "Role", value: "Passenger" },
                ...(isStudent ? [{ label: "Student", value: collegeEmail || "Yes" }] : []),
              ].map((item, i, arr) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 10,
                    borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                    borderBottomColor: D.border,
                  }}
                >
                  <Text style={{ fontSize: 13, color: D.textMut }}>{item.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: D.text }}>{item.value}</Text>
                </View>
              ))}
            </View>

            {/* Compact Legal Agreement */}
            <CompactLegal state={legalAcceptance} onChange={setLegalAcceptance} />
          </View>
        )}

        {/* ══════════ Action Button ══════════ */}
        <View style={{ marginTop: 32 }}>
          {step < 2 ? (
            <TouchableOpacity
              onPress={handleNext}
              activeOpacity={0.85}
              style={{
                backgroundColor: D.primary,
                borderRadius: 18,
                height: 58,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                shadowColor: D.primary,
                shadowOpacity: 0.45,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 6 },
                elevation: 8,
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>Continue</Text>
              <Text style={{ color: "#FFF", fontSize: 20, lineHeight: 22 }}>→</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading || !legalOk}
              activeOpacity={0.85}
              style={{
                backgroundColor: D.primary,
                borderRadius: 18,
                height: 58,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                opacity: loading || !legalOk ? 0.45 : 1,
                shadowColor: D.primary,
                shadowOpacity: loading || !legalOk ? 0 : 0.45,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 6 },
                elevation: 8,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>Send Verification Code</Text>
                  <Text style={{ color: "#FFF", fontSize: 20, lineHeight: 22 }}>→</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Social Sign Up — step 0 only */}
        {step === 0 && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 22, marginBottom: 20, gap: 14 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: D.border }} />
              <Text style={{ fontSize: 13, color: D.textMut, fontWeight: "500" }}>or sign up with</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: D.border }} />
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                disabled={!!socialLoading}
                activeOpacity={0.75}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                  gap: 10, height: 54, borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: socialLoading === "google" ? D.primary : D.border,
                  backgroundColor: D.card,
                  opacity: socialLoading === "apple" ? 0.45 : 1,
                }}
                onPress={() => handleSocialSignUp("google")}
              >
                {socialLoading === "google" ? (
                  <ActivityIndicator size="small" color={D.primary} />
                ) : (
                  <>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 14, fontWeight: "900", color: "#4285F4" }}>G</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: D.text }}>Google</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!!socialLoading}
                activeOpacity={0.75}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                  gap: 10, height: 54, borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: socialLoading === "apple" ? "#FFFFFF" : D.border,
                  backgroundColor: D.card,
                  opacity: socialLoading === "google" ? 0.45 : 1,
                }}
                onPress={() => handleSocialSignUp("apple")}
              >
                {socialLoading === "apple" ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 14, fontWeight: "900", color: "#000" }}>A</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: D.text }}>Apple</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 11, color: D.textMut, textAlign: "center", marginTop: 14, lineHeight: 17, paddingHorizontal: 8 }}>
              By continuing with Google or Apple, you agree to our{" "}
              <Text style={{ color: D.accent }}>Terms of Service</Text>
              {", "}
              <Text style={{ color: D.accent }}>Privacy Policy</Text>
              {", and "}
              <Text style={{ color: D.accent }}>Community Guidelines</Text>
              {"."}
            </Text>

            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 24 }}>
              <Text style={{ color: D.textMut, fontSize: 14 }}>Already have an account?</Text>
              <TouchableOpacity onPress={() => router.replace("/auth/sign-in")}>
                <Text style={{ color: D.primary, fontWeight: "700", fontSize: 14 }}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
