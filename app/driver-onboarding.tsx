import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { getApiBaseUrl } from "@/constants/oauth";
import { useColors } from "@/hooks/use-colors";
import { getSessionToken } from "@/lib/_core/auth";
import { trpc } from "@/lib/trpc";

// ── Colors ───────────────────────────────────────────────────────────────────
const P = "#1E88FF"; // Primary blue
const G = "#16A34A"; // Green
const A = "#F59E0B"; // Amber
const V = "#8B5CF6"; // Violet
const T = "#0EA5E9"; // Teal

const TOTAL_STEPS = 7;

type VehicleType = "sedan" | "suv" | "van";

interface OnboardingData {
  // Step 1: Personal Info
  fullName: string;
  phoneVerified: boolean;
  profilePhotoUri: string;
  // Step 2: Driver License
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: string;
  licenseFrontUri: string;
  licenseBackUri: string;
  // Step 3: Vehicle Details
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  plateNumber: string;
  vehicleType: VehicleType;
  vehicleRegistrationUri: string;
  // Step 4: Insurance
  insurancePolicyNumber: string;
  insuranceProvider: string;
  insuranceExpiry: string;
  insuranceDocUri: string;
  // Step 5: Bank / Payout
  bankName: string;
  accountLast4: string;
  routingLast4: string;
  // Step 6: Agreements
  tosAccepted: boolean;
  privacyAccepted: boolean;
  driverAgreementAccepted: boolean;
  icAgreementAccepted: boolean;
}

const INITIAL_DATA: OnboardingData = {
  fullName: "",
  phoneVerified: false,
  profilePhotoUri: "",
  licenseNumber: "",
  licenseState: "",
  licenseExpiry: "",
  licenseFrontUri: "",
  licenseBackUri: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  vehicleColor: "",
  plateNumber: "",
  vehicleType: "sedan",
  vehicleRegistrationUri: "",
  insurancePolicyNumber: "",
  insuranceProvider: "",
  insuranceExpiry: "",
  insuranceDocUri: "",
  bankName: "",
  accountLast4: "",
  routingLast4: "",
  tosAccepted: false,
  privacyAccepted: false,
  driverAgreementAccepted: false,
  icAgreementAccepted: false,
};

const STEP_TITLES = [
  "Personal Info",
  "Driver License",
  "Vehicle Details",
  "Insurance",
  "Bank & Payout",
  "Agreements",
  "Review & Submit",
];

const STEP_ICONS: IconSymbolName[] = [
  "person.fill",
  "doc.text.fill",
  "car.fill",
  "shield.fill",
  "wallet.pass.fill",
  "doc.text.fill",
  "checkmark.circle.fill",
];

// ── Helper ───────────────────────────────────────────────────────────────────

function webAlert(title: string, message?: string) {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n${message}` : title);
  }
}

type UploadPurpose = "profile_photo" | "license_front" | "license_back" | "insurance_doc" | "vehicle_photo" | "vehicle_registration" | "misc";

async function pickAndUpload(
  purpose: UploadPurpose,
  onSuccess: (key: string) => void,
  onError?: (msg: string) => void,
) {
  try {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo library access to upload documents.");
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: false,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    const token = await getSessionToken();
    const formData = new FormData();
    formData.append("purpose", purpose);

    if (Platform.OS === "web") {
      // On web: fetch the asset URI as a Blob so the browser sends real binary data
      const fetchRes = await fetch(asset.uri);
      const blob = await fetchRes.blob();
      const fileName = asset.fileName ?? `${purpose}_${Date.now()}.jpg`;
      formData.append("file", blob, fileName);
    } else {
      // On native: pass the { uri, name, type } object — React Native fetch handles it
      formData.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? `${purpose}_${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      } as any);
    }

    const res = await fetch(`${getApiBaseUrl()}/api/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Upload failed (${res.status})`);
    }

    const data = await res.json();
    // data.key is the R2 object key — store it, not a URL
    onSuccess(data.key ?? "");
  } catch (err: any) {
    const msg = err?.message ?? "Upload failed";
    if (onError) onError(msg);
    else if (Platform.OS === "web") window.alert(msg);
    else Alert.alert("Upload failed", msg);
  }
}

// ── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  children,
  colors,
}: {
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {children}
    </View>
  );
}

// ── Upload Button (real expo-image-picker) ────────────────────────────────────

function UploadPlaceholder({
  label,
  hasFile,
  colors,
  purpose,
  onUploaded,
}: {
  label: string;
  hasFile: boolean;
  colors: ReturnType<typeof useColors>;
  purpose: UploadPurpose;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const handlePress = async () => {
    setUploading(true);
    await pickAndUpload(purpose, onUploaded);
    setUploading(false);
  };

  return (
    <TouchableOpacity
      style={[
        styles.uploadBox,
        {
          borderColor: hasFile ? G : uploading ? "#1E88FF" : colors.border,
          backgroundColor: hasFile ? G + "08" : uploading ? "#1E88FF08" : colors.surface,
        },
      ]}
      onPress={handlePress}
      disabled={uploading}
    >
      {uploading
        ? <ActivityIndicator color="#1E88FF" size="small" />
        : <IconSymbol
            name={hasFile ? "checkmark.circle.fill" : "photo.fill"}
            size={28}
            color={hasFile ? G : colors.muted}
          />
      }
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: hasFile ? G : uploading ? "#1E88FF" : colors.muted,
          marginTop: 6,
        }}
      >
        {hasFile ? "Uploaded" : label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Input Field ──────────────────────────────────────────────────────────────

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  colors,
  icon,
  keyboardType,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  colors: ReturnType<typeof useColors>;
  icon?: IconSymbolName;
  keyboardType?: "default" | "numeric" | "phone-pad";
  maxLength?: number;
}) {
  const filled = value.trim().length > 0;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
        {label}
      </Text>
      <View
        style={[
          styles.inputRow,
          {
            borderColor: filled ? G : colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        {icon && (
          <View style={[styles.inputIcon, { backgroundColor: P + "10" }]}>
            <IconSymbol name={icon} size={16} color={P} />
          </View>
        )}
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? label}
          placeholderTextColor={colors.muted}
          keyboardType={keyboardType}
          maxLength={maxLength}
        />
        {filled && (
          <IconSymbol name="checkmark.circle.fill" size={18} color={G} />
        )}
      </View>
    </View>
  );
}

// ── Vehicle Type Selector ────────────────────────────────────────────────────

function VehicleTypeSelector({
  value,
  onChange,
  colors,
}: {
  value: VehicleType;
  onChange: (v: VehicleType) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const options: { key: VehicleType; label: string; icon: IconSymbolName }[] = [
    { key: "sedan", label: "Sedan", icon: "car.fill" },
    { key: "suv", label: "SUV", icon: "car.2.fill" },
    { key: "van", label: "Van", icon: "car.fill" },
  ];

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
        Vehicle Type
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {options.map((opt) => {
          const selected = value === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.vehicleOption,
                {
                  borderColor: selected ? P : colors.border,
                  backgroundColor: selected ? P + "10" : colors.surface,
                },
              ]}
              onPress={() => onChange(opt.key)}
            >
              <IconSymbol
                name={opt.icon}
                size={22}
                color={selected ? P : colors.muted}
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: selected ? P : colors.foreground,
                  marginTop: 4,
                }}
              >
                {opt.label}
              </Text>
              {selected && (
                <View style={[styles.selectedDot, { backgroundColor: P }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, colors }: { step: number; colors: ReturnType<typeof useColors> }) {
  const progress = ((step + 1) / TOTAL_STEPS) * 100;
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>
          Step {step + 1} of {TOTAL_STEPS}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: "600", color: P }}>
          {Math.round(progress)}%
        </Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress}%`, backgroundColor: P },
          ]}
        />
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function Step1PersonalInfo({
  data,
  setData,
  colors,
}: {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <SectionCard colors={colors}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconBg, { backgroundColor: P + "12" }]}>
          <IconSymbol name="person.fill" size={20} color={P} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Personal Information
        </Text>
      </View>

      <InputField
        label="Full Name"
        value={data.fullName}
        onChangeText={(v) => setData((d) => ({ ...d, fullName: v }))}
        placeholder="Enter your full name"
        colors={colors}
        icon="person.fill"
      />

      {/* Phone Verification Status */}
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
          Phone Verification
        </Text>
        <View
          style={[
            styles.verificationStatus,
            {
              backgroundColor: data.phoneVerified ? G + "10" : A + "10",
              borderColor: data.phoneVerified ? G : A,
            },
          ]}
        >
          <IconSymbol
            name={data.phoneVerified ? "checkmark.shield.fill" : "exclamationmark.triangle.fill"}
            size={20}
            color={data.phoneVerified ? G : A}
          />
          <Text
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: "600",
              color: data.phoneVerified ? G : A,
              marginLeft: 10,
            }}
          >
            {data.phoneVerified ? "Phone Verified" : "Phone Not Verified"}
          </Text>
          {!data.phoneVerified && (
            <TouchableOpacity
              style={[styles.verifyBtn, { backgroundColor: A }]}
              onPress={() => webAlert("Verify Phone", "Phone verification flow would open here.")}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>Verify</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Profile Photo Placeholder */}
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
        Profile Photo
      </Text>
      <UploadPlaceholder
        label="Upload Profile Photo"
        hasFile={data.profilePhotoUri.length > 0}
        colors={colors}
        purpose="profile_photo"
        onUploaded={(url) => setData((d) => ({ ...d, profilePhotoUri: url }))}
      />
    </SectionCard>
  );
}

function Step2DriverLicense({
  data,
  setData,
  colors,
}: {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <SectionCard colors={colors}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconBg, { backgroundColor: V + "12" }]}>
          <IconSymbol name="doc.text.fill" size={20} color={V} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Driver License
        </Text>
      </View>

      <InputField
        label="License Number"
        value={data.licenseNumber}
        onChangeText={(v) => setData((d) => ({ ...d, licenseNumber: v }))}
        placeholder="e.g. D1234567"
        colors={colors}
        icon="doc.text.fill"
      />

      <InputField
        label="State"
        value={data.licenseState}
        onChangeText={(v) => setData((d) => ({ ...d, licenseState: v }))}
        placeholder="e.g. CA, NY, TX"
        colors={colors}
        maxLength={2}
      />

      <InputField
        label="Expiry Date"
        value={data.licenseExpiry}
        onChangeText={(v) => setData((d) => ({ ...d, licenseExpiry: v }))}
        placeholder="MM/YYYY"
        colors={colors}
        icon="calendar"
      />

      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8, marginTop: 4 }}>
        Upload License Photos
      </Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <UploadPlaceholder
            label="Front"
            hasFile={data.licenseFrontUri.length > 0}
            colors={colors}
            purpose="license_front"
            onUploaded={(url) => setData((d) => ({ ...d, licenseFrontUri: url }))}
          />
        </View>
        <View style={{ flex: 1 }}>
          <UploadPlaceholder
            label="Back"
            hasFile={data.licenseBackUri.length > 0}
            colors={colors}
            purpose="license_back"
            onUploaded={(url) => setData((d) => ({ ...d, licenseBackUri: url }))}
          />
        </View>
      </View>
    </SectionCard>
  );
}

function Step3VehicleDetails({
  data,
  setData,
  colors,
}: {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <SectionCard colors={colors}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconBg, { backgroundColor: T + "12" }]}>
          <IconSymbol name="car.fill" size={20} color={T} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Vehicle Details
        </Text>
      </View>

      <InputField
        label="Make"
        value={data.vehicleMake}
        onChangeText={(v) => setData((d) => ({ ...d, vehicleMake: v }))}
        placeholder="e.g. Toyota, Honda"
        colors={colors}
        icon="car.fill"
      />

      <InputField
        label="Model"
        value={data.vehicleModel}
        onChangeText={(v) => setData((d) => ({ ...d, vehicleModel: v }))}
        placeholder="e.g. Camry, Civic"
        colors={colors}
      />

      <InputField
        label="Year"
        value={data.vehicleYear}
        onChangeText={(v) => setData((d) => ({ ...d, vehicleYear: v }))}
        placeholder="e.g. 2022"
        colors={colors}
        keyboardType="numeric"
        maxLength={4}
      />

      <InputField
        label="Color"
        value={data.vehicleColor}
        onChangeText={(v) => setData((d) => ({ ...d, vehicleColor: v }))}
        placeholder="e.g. White, Black, Silver"
        colors={colors}
      />

      <InputField
        label="License Plate Number"
        value={data.plateNumber}
        onChangeText={(v) => setData((d) => ({ ...d, plateNumber: v }))}
        placeholder="e.g. ABC-1234"
        colors={colors}
        icon="doc.text.fill"
      />

      <VehicleTypeSelector
        value={data.vehicleType}
        onChange={(v) => setData((d) => ({ ...d, vehicleType: v }))}
        colors={colors}
      />

      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8, marginTop: 4 }}>
        Vehicle Registration (Optional)
      </Text>
      <UploadPlaceholder
        label="Upload Registration Doc"
        hasFile={data.vehicleRegistrationUri.length > 0}
        colors={colors}
        purpose="vehicle_registration"
        onUploaded={(url) => setData((d) => ({ ...d, vehicleRegistrationUri: url }))}
      />
    </SectionCard>
  );
}

function Step4Insurance({
  data,
  setData,
  colors,
}: {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <SectionCard colors={colors}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconBg, { backgroundColor: G + "12" }]}>
          <IconSymbol name="shield.fill" size={20} color={G} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Insurance Details
        </Text>
      </View>

      <InputField
        label="Policy Number"
        value={data.insurancePolicyNumber}
        onChangeText={(v) => setData((d) => ({ ...d, insurancePolicyNumber: v }))}
        placeholder="Enter policy number"
        colors={colors}
        icon="shield.fill"
      />

      <InputField
        label="Insurance Provider"
        value={data.insuranceProvider}
        onChangeText={(v) => setData((d) => ({ ...d, insuranceProvider: v }))}
        placeholder="e.g. State Farm, Geico"
        colors={colors}
      />

      <InputField
        label="Expiry Date"
        value={data.insuranceExpiry}
        onChangeText={(v) => setData((d) => ({ ...d, insuranceExpiry: v }))}
        placeholder="MM/YYYY"
        colors={colors}
        icon="calendar"
      />

      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8, marginTop: 4 }}>
        Upload Insurance Document
      </Text>
      <UploadPlaceholder
        label="Upload Insurance Card"
        hasFile={data.insuranceDocUri.length > 0}
        colors={colors}
        purpose="insurance_doc"
        onUploaded={(url) => setData((d) => ({ ...d, insuranceDocUri: url }))}
      />
    </SectionCard>
  );
}

function Step5BankPayout({
  data,
  setData,
  colors,
}: {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  colors: ReturnType<typeof useColors>;
}) {
  const [stripeLoading, setStripeLoading] = useState(false);
  const createConnectAccount = trpc.stripe.createConnectedAccount.useMutation();
  const { data: connectStatus } = trpc.stripe.getConnectedAccountStatus.useQuery(undefined, {
    retry: false,
  });

  const isStripeComplete = connectStatus?.chargesEnabled && connectStatus?.payoutsEnabled;

  const handleStripeOnboarding = async () => {
    setStripeLoading(true);
    try {
      const result = await createConnectAccount.mutateAsync();
      // Open Stripe onboarding URL in browser
      if (result.onboardingUrl) {
        if (Platform.OS === "web") {
          window.open(result.onboardingUrl, "_blank");
        } else {
          Linking.openURL(result.onboardingUrl);
        }
        // Mark bank step as done (Stripe handles the rest)
        setData((d) => ({ ...d, bankName: "Stripe Connect", accountLast4: "done", routingLast4: "done" }));
      }
    } catch (err: any) {
      webAlert("Error", err?.message ?? "Failed to start Stripe onboarding.");
    } finally {
      setStripeLoading(false);
    }
  };

  return (
    <SectionCard colors={colors}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconBg, { backgroundColor: A + "12" }]}>
          <IconSymbol name="wallet.pass.fill" size={20} color={A} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Bank & Payout Setup
        </Text>
      </View>

      <View style={[styles.encryptedNote, { backgroundColor: T + "08", borderColor: T + "30" }]}>
        <IconSymbol name="lock.shield.fill" size={16} color={T} />
        <Text style={{ flex: 1, fontSize: 12, color: T, marginLeft: 8, fontWeight: "600" }}>
          {"We use Stripe to securely handle your payouts. You'll verify your identity and bank account directly with Stripe."}
        </Text>
      </View>

      {isStripeComplete ? (
        <View style={{ alignItems: "center", paddingVertical: 20 }}>
          <IconSymbol name="checkmark.circle.fill" size={48} color={G} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: G, marginTop: 10 }}>
            Payout Account Verified
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, textAlign: "center" }}>
            Your bank account is connected and ready to receive payouts.
          </Text>
        </View>
      ) : (
        <View style={{ alignItems: "center", paddingVertical: 16 }}>
          <Text style={{ fontSize: 14, color: colors.foreground, textAlign: "center", marginBottom: 16, lineHeight: 20 }}>
            Set up your payout account with Stripe to receive ride earnings directly to your bank account.
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: "#635BFF",
              paddingHorizontal: 24,
              paddingVertical: 14,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              opacity: stripeLoading ? 0.7 : 1,
            }}
            onPress={handleStripeOnboarding}
            disabled={stripeLoading}
          >
            <IconSymbol name="link" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
              {stripeLoading ? "Opening Stripe..." : "Set Up with Stripe"}
            </Text>
          </TouchableOpacity>
          {connectStatus && !isStripeComplete && (
            <Text style={{ fontSize: 12, color: A, marginTop: 10, textAlign: "center" }}>
              Onboarding started but not yet complete. Tap above to continue.
            </Text>
          )}
        </View>
      )}
    </SectionCard>
  );
}

// ── Step 6: Agreements ───────────────────────────────────────────────────────

function AgreementRow({
  label,
  checked,
  onToggle,
  colors,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "rgba(0,0,0,0.06)",
        gap: 12,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: checked ? G : "#9CA3AF",
          backgroundColor: checked ? G : "transparent",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        {checked && <IconSymbol name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, lineHeight: 20 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Step6Agreements({
  data,
  setData,
  colors,
}: {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <SectionCard colors={colors}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconBg, { backgroundColor: V + "12" }]}>
          <IconSymbol name="doc.text.fill" size={20} color={V} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Agreements
        </Text>
      </View>

      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16, lineHeight: 18 }}>
        Please read and accept all agreements to proceed. These are required to drive on the YOO platform.
      </Text>

      <AgreementRow
        label="I have read and agree to the Terms of Service"
        checked={data.tosAccepted}
        onToggle={() => setData((d) => ({ ...d, tosAccepted: !d.tosAccepted }))}
        colors={colors}
      />
      <AgreementRow
        label="I have read and agree to the Privacy Policy"
        checked={data.privacyAccepted}
        onToggle={() => setData((d) => ({ ...d, privacyAccepted: !d.privacyAccepted }))}
        colors={colors}
      />
      <AgreementRow
        label="I have read and agree to the Driver Agreement"
        checked={data.driverAgreementAccepted}
        onToggle={() => setData((d) => ({ ...d, driverAgreementAccepted: !d.driverAgreementAccepted }))}
        colors={colors}
      />
      <AgreementRow
        label="I have read and agree to the Independent Contractor Agreement"
        checked={data.icAgreementAccepted}
        onToggle={() => setData((d) => ({ ...d, icAgreementAccepted: !d.icAgreementAccepted }))}
        colors={colors}
      />

      <View style={{ marginTop: 16, padding: 12, backgroundColor: P + "08", borderRadius: 10, borderWidth: 1, borderColor: P + "20" }}>
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 16, textAlign: "center" }}>
          By checking all boxes you confirm you are an independent contractor, not an employee of YOO. Agreement version 1.0. Accepted at {new Date().toLocaleDateString()}.
        </Text>
      </View>
    </SectionCard>
  );
}

// ── Step 7: Review ───────────────────────────────────────────────────────────

function ReviewSection({
  title,
  icon,
  iconColor,
  fields,
  stepIndex,
  onEdit,
  colors,
  requiredFields,
}: {
  title: string;
  icon: IconSymbolName;
  iconColor: string;
  fields: { label: string; value: string; required?: boolean }[];
  stepIndex: number;
  onEdit: (step: number) => void;
  colors: ReturnType<typeof useColors>;
  requiredFields?: string[];
}) {
  const required = requiredFields ?? fields.map((f) => f.label);
  const allRequiredFilled = required.every((label) => {
    const f = fields.find((ff) => ff.label === label);
    return f && f.value.trim().length > 0;
  });

  return (
    <SectionCard colors={colors}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <View style={[styles.cardIconBg, { backgroundColor: iconColor + "12" }]}>
          <IconSymbol name={icon} size={18} color={iconColor} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground, flex: 1 }]}>
          {title}
        </Text>
        <IconSymbol
          name={allRequiredFilled ? "checkmark.circle.fill" : "xmark.circle.fill"}
          size={20}
          color={allRequiredFilled ? G : "#DC2626"}
        />
        <TouchableOpacity
          style={[styles.editBtn, { backgroundColor: P + "10" }]}
          onPress={() => onEdit(stepIndex)}
        >
          <IconSymbol name="pencil" size={14} color={P} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: P, marginLeft: 4 }}>Edit</Text>
        </TouchableOpacity>
      </View>
      {fields.map((f) => {
        const isRequired = required.includes(f.label);
        const isMissing = isRequired && f.value.trim().length === 0;
        return (
          <View key={f.label} style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 2 }}>{f.label}</Text>
              <Text style={{
                fontSize: 14,
                fontWeight: "600",
                color: isMissing ? "#DC2626" : f.value.trim().length > 0 ? colors.foreground : colors.muted,
              }}>
                {isMissing ? "❌ Missing" : f.value.trim().length > 0 ? f.value : "Not provided"}
              </Text>
            </View>
            {!isMissing && f.value.trim().length > 0 && (
              <IconSymbol name="checkmark.circle.fill" size={18} color={G} />
            )}
          </View>
        );
      })}
    </SectionCard>
  );
}

function Step7Review({
  data,
  onEdit,
  colors,
}: {
  data: OnboardingData;
  onEdit: (step: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const agreementsStatus = data.tosAccepted && data.privacyAccepted && data.driverAgreementAccepted && data.icAgreementAccepted
    ? "All Accepted" : "";

  return (
    <>
      <ReviewSection
        title="Personal Info"
        icon="person.fill"
        iconColor={P}
        stepIndex={0}
        onEdit={onEdit}
        colors={colors}
        requiredFields={["Full Name", "Profile Photo"]}
        fields={[
          { label: "Full Name", value: data.fullName },
          { label: "Phone Verified", value: data.phoneVerified ? "Yes" : "" },
          { label: "Profile Photo", value: data.profilePhotoUri ? "Uploaded" : "" },
        ]}
      />
      <ReviewSection
        title="Driver License"
        icon="doc.text.fill"
        iconColor={V}
        stepIndex={1}
        onEdit={onEdit}
        colors={colors}
        requiredFields={["License Number", "State", "Expiry", "Front Photo", "Back Photo"]}
        fields={[
          { label: "License Number", value: data.licenseNumber },
          { label: "State", value: data.licenseState },
          { label: "Expiry", value: data.licenseExpiry },
          { label: "Front Photo", value: data.licenseFrontUri ? "Uploaded" : "" },
          { label: "Back Photo", value: data.licenseBackUri ? "Uploaded" : "" },
        ]}
      />
      <ReviewSection
        title="Vehicle Details"
        icon="car.fill"
        iconColor={T}
        stepIndex={2}
        onEdit={onEdit}
        colors={colors}
        requiredFields={["Make", "Model", "Year", "Color", "Plate Number", "Vehicle Type"]}
        fields={[
          { label: "Make", value: data.vehicleMake },
          { label: "Model", value: data.vehicleModel },
          { label: "Year", value: data.vehicleYear },
          { label: "Color", value: data.vehicleColor },
          { label: "Plate Number", value: data.plateNumber },
          { label: "Vehicle Type", value: data.vehicleType },
          { label: "Registration", value: data.vehicleRegistrationUri ? "Uploaded" : "Optional — not uploaded" },
        ]}
      />
      <ReviewSection
        title="Insurance"
        icon="shield.fill"
        iconColor={G}
        stepIndex={3}
        onEdit={onEdit}
        colors={colors}
        requiredFields={["Policy Number", "Provider", "Expiry", "Insurance Document"]}
        fields={[
          { label: "Policy Number", value: data.insurancePolicyNumber },
          { label: "Provider", value: data.insuranceProvider },
          { label: "Expiry", value: data.insuranceExpiry },
          { label: "Insurance Document", value: data.insuranceDocUri ? "Uploaded" : "" },
        ]}
      />
      <ReviewSection
        title="Bank & Payout"
        icon="wallet.pass.fill"
        iconColor={A}
        stepIndex={4}
        onEdit={onEdit}
        colors={colors}
        requiredFields={[]}
        fields={[
          { label: "Payout Account", value: data.bankName === "Stripe Connect" ? "Stripe Connect (verified)" : "Skipped for Beta" },
        ]}
      />
      <ReviewSection
        title="Agreements"
        icon="doc.text.fill"
        iconColor={V}
        stepIndex={5}
        onEdit={onEdit}
        colors={colors}
        requiredFields={["All Agreements"]}
        fields={[
          { label: "All Agreements", value: agreementsStatus },
          { label: "Terms of Service", value: data.tosAccepted ? "Accepted" : "" },
          { label: "Privacy Policy", value: data.privacyAccepted ? "Accepted" : "" },
          { label: "Driver Agreement", value: data.driverAgreementAccepted ? "Accepted" : "" },
          { label: "IC Agreement", value: data.icAgreementAccepted ? "Accepted" : "" },
        ]}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export default function DriverOnboardingScreen() {
  const colors = useColors();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [submitting, setSubmitting] = useState(false);

  const utils = trpc.useUtils();
  const submitMutation = trpc.driver.submitOnboarding.useMutation();
  const draftMutation = trpc.driver.saveDraft.useMutation();

  // Pre-fill data from a previously rejected application
  const { data: prevApp } = trpc.driver.getApplicationStatus.useQuery(undefined);

  // Pre-fill data from a previously rejected or action_required application
  const prefilled = useRef(false);

  useEffect(() => {
    const refillStatuses = ["rejected", "action_required"];
    if (prefilled.current || !prevApp || !refillStatuses.includes(prevApp.status)) return;
    prefilled.current = true;
    setData((d) => ({
      ...d,
      fullName: prevApp.fullName ?? d.fullName,
      vehicleMake: prevApp.vehicleMake ?? d.vehicleMake,
      vehicleModel: prevApp.vehicleModel ?? d.vehicleModel,
      vehicleYear: prevApp.vehicleYear != null ? String(prevApp.vehicleYear) : d.vehicleYear,
      vehicleColor: prevApp.vehicleColor ?? d.vehicleColor,
      plateNumber: prevApp.plateNumber ?? d.plateNumber,
    }));
   
  }, [prevApp]);

  const goBack = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
    else router.back();
  }, [step, router]);

  const goToStep = useCallback((s: number) => {
    setStep(s);
  }, []);

  const canProceed = useMemo(() => {
    const currentYear = new Date().getFullYear();

    function isExpiryInFuture(mmYYYY: string): boolean {
      const parts = mmYYYY.split("/");
      if (parts.length !== 2) return false;
      const month = parseInt(parts[0] ?? "", 10);
      const year = parseInt(parts[1] ?? "", 10);
      if (isNaN(month) || isNaN(year) || month < 1 || month > 12) return false;
      const now = new Date();
      return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
    }

    switch (step) {
      case 0:
        return data.fullName.trim().length > 0;
      case 1:
        return (
          data.licenseNumber.trim().length > 0 &&
          data.licenseState.trim().length === 2 &&
          isExpiryInFuture(data.licenseExpiry)
        );
      case 2: {
        const year = parseInt(data.vehicleYear, 10);
        const validYear = !isNaN(year) && year >= 1990 && year <= currentYear + 1;
        return (
          data.vehicleMake.trim().length > 0 &&
          data.vehicleModel.trim().length > 0 &&
          validYear &&
          data.vehicleColor.trim().length > 0 &&
          data.plateNumber.trim().length > 0
        );
      }
      case 3:
        return (
          data.insurancePolicyNumber.trim().length > 0 &&
          data.insuranceProvider.trim().length > 0 &&
          isExpiryInFuture(data.insuranceExpiry)
        );
      case 4:
        return true; // payout is optional (beta skip allowed)
      case 5:
        // All 4 agreements required
        return data.tosAccepted && data.privacyAccepted && data.driverAgreementAccepted && data.icAgreementAccepted;
      case 6: {
        // Review step: all required items must be complete
        const requiredItems = [
          data.fullName.trim().length > 0,
          data.profilePhotoUri.length > 0,
          data.licenseNumber.trim().length > 0,
          data.licenseState.trim().length === 2,
          data.licenseFrontUri.length > 0,
          data.licenseBackUri.length > 0,
          data.vehicleMake.trim().length > 0,
          data.vehicleModel.trim().length > 0,
          data.vehicleYear.trim().length > 0,
          data.vehicleColor.trim().length > 0,
          data.plateNumber.trim().length > 0,
          data.insurancePolicyNumber.trim().length > 0,
          data.insuranceProvider.trim().length > 0,
          data.insuranceDocUri.length > 0,
          data.tosAccepted,
          data.privacyAccepted,
          data.driverAgreementAccepted,
          data.icAgreementAccepted,
        ];
        return requiredItems.every(Boolean);
      }
      default:
        return false;
    }
  }, [step, data]);

  const saveDraft = useCallback(async () => {
    try {
      await draftMutation.mutateAsync({
        fullName: data.fullName || undefined,
        phoneNumber: data.phoneVerified ? "verified" : undefined,
        profilePhotoUrl: data.profilePhotoUri || undefined,
        licenseNumber: data.licenseNumber || undefined,
        licenseState: data.licenseState || undefined,
        licenseExpiry: data.licenseExpiry || undefined,
        licenseFrontUrl: data.licenseFrontUri || undefined,
        licenseBackUrl: data.licenseBackUri || undefined,
        vehicleMake: data.vehicleMake || undefined,
        vehicleModel: data.vehicleModel || undefined,
        vehicleYear: data.vehicleYear || undefined,
        vehicleColor: data.vehicleColor || undefined,
        plateNumber: data.plateNumber || undefined,
        vehicleType: data.vehicleType || undefined,
        vehicleRegistrationUrl: data.vehicleRegistrationUri || undefined,
        insurancePolicyNumber: data.insurancePolicyNumber || undefined,
        insuranceProvider: data.insuranceProvider || undefined,
        insuranceExpiry: data.insuranceExpiry || undefined,
        insuranceDocUrl: data.insuranceDocUri || undefined,
      });
    } catch {
      // Draft save is best-effort — don't interrupt the user
    }
  }, [data, draftMutation]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    const now = new Date().toISOString();
    try {
      await submitMutation.mutateAsync({
        fullName: data.fullName,
        licenseNumber: data.licenseNumber,
        licenseState: data.licenseState,
        licenseExpiry: data.licenseExpiry,
        licenseFrontUrl: data.licenseFrontUri || undefined,
        licenseBackUrl: data.licenseBackUri || undefined,
        profilePhotoUrl: data.profilePhotoUri || undefined,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        vehicleYear: data.vehicleYear,
        vehicleColor: data.vehicleColor,
        plateNumber: data.plateNumber,
        vehicleType: data.vehicleType,
        vehicleRegistrationUrl: data.vehicleRegistrationUri || undefined,
        insurancePolicyNumber: data.insurancePolicyNumber,
        insuranceProvider: data.insuranceProvider,
        insuranceExpiry: data.insuranceExpiry,
        insuranceDocUrl: data.insuranceDocUri || undefined,
        bankName: data.bankName || "Stripe Connect",
        accountLast4: data.accountLast4 || "0000",
        routingLast4: data.routingLast4 || "0000",
        tosAcceptedAt: data.tosAccepted ? now : undefined,
        tosVersion: "1.0",
        privacyAcceptedAt: data.privacyAccepted ? now : undefined,
        driverAgreementAcceptedAt: data.driverAgreementAccepted ? now : undefined,
        icAgreementAcceptedAt: data.icAgreementAccepted ? now : undefined,
      });
      utils.driver.getApplicationStatus.invalidate();
      utils.driver.getAccessStatus.invalidate();
      utils.auth.me.invalidate();
      webAlert(
        "Application Submitted!",
        "Your driver application has been submitted for review. Estimated review time: 24–48 hours.",
      );
      router.back();
    } catch (err: any) {
      webAlert("Submission Failed", err?.message ?? "Please try again later.");
    } finally {
      setSubmitting(false);
    }
  }, [data, submitMutation, router, utils.driver.getApplicationStatus, utils.driver.getAccessStatus, utils.auth.me]);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) {
      saveDraft(); // best-effort draft save on each step advance
      setStep((s) => s + 1);
    }
  }, [step, saveDraft]);

  const renderStep = () => {
    switch (step) {
      case 0:
        return <Step1PersonalInfo data={data} setData={setData} colors={colors} />;
      case 1:
        return <Step2DriverLicense data={data} setData={setData} colors={colors} />;
      case 2:
        return <Step3VehicleDetails data={data} setData={setData} colors={colors} />;
      case 3:
        return <Step4Insurance data={data} setData={setData} colors={colors} />;
      case 4:
        return <Step5BankPayout data={data} setData={setData} colors={colors} />;
      case 5:
        return <Step6Agreements data={data} setData={setData} colors={colors} />;
      case 6:
        return <Step7Review data={data} onEdit={goToStep} colors={colors} />;
      default:
        return null;
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      {/* Header with gradient feel */}
      <View style={[styles.header, { backgroundColor: P }]}>
        <TouchableOpacity onPress={goBack} style={styles.headerBack}>
          <IconSymbol name="chevron.left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <IconSymbol name={STEP_ICONS[step]} size={20} color="#fff" />
            <Text style={styles.headerTitle}>{STEP_TITLES[step]}</Text>
          </View>
          <Text style={styles.headerSubtitle}>Driver Onboarding</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress Bar */}
      <ProgressBar step={step} colors={colors} />

      {/* Step Content */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Resubmission / Action Required banner */}
        {step === 0 && prevApp?.status === "rejected" && prevApp?.rejectionReason && (
          <View style={{ backgroundColor: "#FEE2E2", borderColor: "#FCA5A5", borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 16, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <IconSymbol name="exclamationmark.triangle.fill" size={18} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#991B1B", marginBottom: 4 }}>Previous Application Rejected</Text>
              <Text style={{ fontSize: 13, color: "#B91C1C", lineHeight: 18 }}>{prevApp.rejectionReason}</Text>
              <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>Please address the issue above and resubmit.</Text>
            </View>
          </View>
        )}
        {step === 0 && prevApp?.status === "action_required" && (prevApp as any)?.actionRequiredReason && (
          <View style={{ backgroundColor: "#FFFBEB", borderColor: "#FCD34D", borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 16, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <IconSymbol name="exclamationmark.circle.fill" size={18} color="#D97706" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#92400E", marginBottom: 4 }}>Changes Requested by Admin</Text>
              <Text style={{ fontSize: 13, color: "#B45309", lineHeight: 18 }}>{(prevApp as any).actionRequiredReason}</Text>
              <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>Please update the required items and resubmit.</Text>
            </View>
          </View>
        )}
        {renderStep()}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={goBack}
        >
          <IconSymbol name="chevron.left" size={18} color={colors.foreground} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginLeft: 6 }}>
            Back
          </Text>
        </TouchableOpacity>

        {step < TOTAL_STEPS - 1 ? (
          <TouchableOpacity
            style={[
              styles.navBtn,
              styles.navBtnPrimary,
              { backgroundColor: canProceed ? P : colors.border },
            ]}
            onPress={goNext}
            disabled={!canProceed}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff", marginRight: 6 }}>
              Next
            </Text>
            <IconSymbol name="chevron.right" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.navBtn,
              styles.navBtnPrimary,
              { backgroundColor: submitting ? colors.border : G },
            ]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <IconSymbol name="checkmark.circle.fill" size={18} color="#fff" />
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff", marginLeft: 6 }}>
              {submitting ? "Submitting..." : "Submit for Review"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScreenContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 18,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cardIconBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginLeft: 12,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  fieldIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  uploadBox: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  vehicleOption: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  selectedDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  verificationStatus: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  verifyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  encryptedNote: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
    borderTopWidth: 1,
    gap: 12,
  },
  navBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  navBtnPrimary: {
    borderWidth: 0,
  },
});
