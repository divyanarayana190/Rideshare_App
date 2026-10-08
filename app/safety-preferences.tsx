import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context-v2";

type SafetyMode = "none" | "women_drivers_only" | "women_companions_only" | "women_only";
type Gender = "male" | "female" | "non_binary" | "prefer_not_to_say";

const SAFETY_OPTIONS: { value: SafetyMode; label: string; description: string }[] = [
  {
    value: "none",
    label: "No Preference",
    description: "Match with any available driver and passengers",
  },
  {
    value: "women_drivers_only",
    label: "Women Drivers Only",
    description: "Only be matched with female drivers",
  },
  {
    value: "women_companions_only",
    label: "Women Co-Riders Only",
    description: "Only share rides with female passengers (shared rides)",
  },
  {
    value: "women_only",
    label: "Women-Only Ride",
    description: "Female driver AND female passengers only",
  },
];

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "prefer_not_to_say", label: "Prefer not to say" },
  { value: "female",            label: "Female" },
  { value: "male",              label: "Male" },
  { value: "non_binary",        label: "Non-binary" },
];

export default function SafetyPreferencesScreen() {
  const router = useRouter();
  const colors = useColors();
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isFemale = user?.gender === "female";
  const visibleSafetyOptions = isFemale
    ? SAFETY_OPTIONS
    : SAFETY_OPTIONS.filter(o => !["women_drivers_only", "women_companions_only", "women_only"].includes(o.value));

  const { data: prefs, isLoading } = trpc.user.getPreferences.useQuery(undefined);
  const updatePrefs = trpc.user.updatePreferences.useMutation({
    onSettled: () => utils.user.getPreferences.invalidate(),
  } as any);
  const updateGender = trpc.user.updateGender.useMutation();

  const [safetyMode, setSafetyMode] = useState<SafetyMode>("none");
  const [gender, setGender] = useState<Gender>("prefer_not_to_say");
  const [notifyDriverAssigned, setNotifyDriverAssigned] = useState(true);
  const [notifyDriverArrived, setNotifyDriverArrived] = useState(true);
  const [notifyRideStart, setNotifyRideStart] = useState(true);
  const [notifyRideComplete, setNotifyRideComplete] = useState(true);
  const [saved, setSaved] = useState(false);

  // Pre-fill from server
  useEffect(() => {
    if (prefs) {
      setSafetyMode((prefs.safetyMode as SafetyMode) ?? "none");
      setNotifyDriverAssigned(prefs.notifyOnDriverAssigned ?? true);
      setNotifyDriverArrived(prefs.notifyOnDriverArrived ?? true);
      setNotifyRideStart(prefs.notifyOnRideStart ?? true);
      setNotifyRideComplete(prefs.notifyOnRideComplete ?? true);
    }
  }, [prefs]);

  const handleSave = async () => {
    await Promise.all([
      updatePrefs.mutateAsync({
        safetyMode,
        notifyOnDriverAssigned: notifyDriverAssigned,
        notifyOnDriverArrived: notifyDriverArrived,
        notifyOnRideStart: notifyRideStart,
        notifyOnRideComplete: notifyRideComplete,
      }),
      updateGender.mutateAsync({ gender }),
    ]);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      router.back();
    }, 800);
  };

  const isSaving = updatePrefs.isPending || updateGender.isPending;

  const ToggleRow = ({
    label,
    value,
    onToggle,
  }: {
    label: string;
    value: boolean;
    onToggle: () => void;
  }) => (
    <TouchableOpacity
      onPress={onToggle}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: "500" }}>{label}</Text>
      <View
        style={{
          width: 48,
          height: 26,
          borderRadius: 13,
          backgroundColor: value ? colors.primary : colors.border,
          justifyContent: "center",
          paddingHorizontal: 2,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: "#fff",
            transform: [{ translateX: value ? 22 : 0 }],
          }}
        />
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <ScreenContainer className="p-6">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-6">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ gap: 28, marginTop: 8, paddingBottom: 32 }}>

          {/* Header */}
          <View>
            <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground }}>
              Safety Preferences
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 6 }}>
              Customize your ride experience and stay safe
            </Text>
          </View>

          {/* Safety Mode */}
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
              🛡️ Safety Mode
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>
              Control who you ride with
            </Text>
            {visibleSafetyOptions.map((opt) => {
              const selected = safetyMode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setSafetyMode(opt.value)}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary + "12" : colors.surface,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: selected ? colors.primary : colors.foreground,
                    }}
                  >
                    {selected ? "✓  " : ""}{opt.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                    {opt.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Gender Identity */}
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
              👤 Gender Identity
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>
              Used to enable safety mode matching — never shared publicly
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {GENDER_OPTIONS.map((opt) => {
                const selected = gender === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setGender(opt.value)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      borderWidth: 2,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary + "12" : colors.surface,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: selected ? colors.primary : colors.foreground,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Notification Settings */}
          <View>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
              🔔 Notifications
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
              Choose what you want to be notified about
            </Text>
            <ToggleRow
              label="Driver Assigned"
              value={notifyDriverAssigned}
              onToggle={() => setNotifyDriverAssigned((v) => !v)}
            />
            <ToggleRow
              label="Driver Arrived"
              value={notifyDriverArrived}
              onToggle={() => setNotifyDriverArrived((v) => !v)}
            />
            <ToggleRow
              label="Ride Started"
              value={notifyRideStart}
              onToggle={() => setNotifyRideStart((v) => !v)}
            />
            <ToggleRow
              label="Ride Complete"
              value={notifyRideComplete}
              onToggle={() => setNotifyRideComplete((v) => !v)}
            />
          </View>

          {/* Info Banner */}
          <View
            style={{
              backgroundColor: colors.primary + "12",
              borderWidth: 1,
              borderColor: colors.primary + "40",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
              💡 How safety matching works
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
              When women-only modes are active, our dispatch engine only offers your ride to drivers
              matching your preferences. Co-rider matching also enforces gender compatibility.
              You can change these settings at any time.
            </Text>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving || saved}
            style={{
              backgroundColor: saved ? colors.success : colors.primary,
              paddingVertical: 16,
              borderRadius: 14,
              alignItems: "center",
            }}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                {saved ? "✓  Saved!" : "Save Preferences"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
