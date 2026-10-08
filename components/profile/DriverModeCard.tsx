import { Platform, Text, TouchableOpacity, Switch, View } from "react-native";
import { GradientView } from "@/components/GradientView";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { D, SHADOW_CARD } from "@/constants/design";
import { useColors } from "@/hooks/use-colors";

export interface DriverModeCardProps {
  isApprovedDriver: boolean;
  driverMode: boolean;
  onToggleDriverMode: (value: boolean) => void;
  onOpenDashboard: () => void;
  onOpenDocuments: () => void;
  onBecomeDriver: () => void;
  hasPendingApp: boolean;
  isDriverActionRequired: boolean;
  isDriverSuspended: boolean;
  wasRejected: boolean;
  driverAccessLoading: boolean;
  driverAccessError: boolean;
  driverActionRequiredReason?: string | null;
  driverAppActionRequiredReason?: string | null;
  driverRejectionReason?: string | null;
  driverAppRejectionReason?: string | null;
  driverBanReason?: string | null;
  onUpdateApplication: () => void;
  onReapply: () => void;
}

function BecomeDriverBanner({ onPress }: { onPress: () => void }) {
  const bannerGradient = Platform.select({
    web: {
      background: "linear-gradient(120deg, #0A2D6E 0%, #1565D8 55%, #1E4FA8 100%)",
      backgroundColor: "#0A2D6E",
    } as Record<string, string>,
    default: { backgroundColor: "#0A2D6E" },
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.92}
      style={{ marginHorizontal: 16, marginBottom: 14, borderRadius: 26, overflow: "hidden", ...SHADOW_CARD }}
    >
      <GradientView style={{ minHeight: 130, padding: 18, ...(bannerGradient as object) }}>
        <View style={{ position: "absolute", top: -20, right: -10, opacity: 0.15 }}>
          <Text style={{ fontSize: 64 }}>🪙</Text>
        </View>
        <View style={{ position: "absolute", top: 20, right: 30, opacity: 0.2 }}>
          <Text style={{ fontSize: 28 }}>🪙</Text>
        </View>
        <View style={{ position: "absolute", bottom: 10, right: 8, opacity: 0.9 }}>
          <IconSymbol name="car.fill" size={72} color="rgba(255,255,255,0.22)" />
        </View>

        <View style={{ maxWidth: "68%", zIndex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: -0.3 }}>Become a Driver</Text>
          <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", marginTop: 5, lineHeight: 18 }}>
            Earn more by giving rides
          </Text>
          <View
            style={{
              marginTop: 14,
              alignSelf: "flex-start",
              backgroundColor: "#fff",
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              minHeight: 44,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: D.blue }}>Get Started</Text>
            <IconSymbol name="chevron.right" size={14} color={D.blue} />
          </View>
        </View>

        <View style={{ position: "absolute", right: 14, top: "50%", marginTop: -10 }}>
          <IconSymbol name="chevron.right" size={20} color="rgba(255,255,255,0.45)" />
        </View>
      </GradientView>
    </TouchableOpacity>
  );
}

export function DriverModeCard({
  isApprovedDriver,
  driverMode,
  onToggleDriverMode,
  onOpenDashboard,
  onOpenDocuments,
  onBecomeDriver,
  hasPendingApp,
  isDriverActionRequired,
  isDriverSuspended,
  wasRejected,
  driverAccessLoading,
  driverAccessError,
  driverActionRequiredReason,
  driverAppActionRequiredReason,
  driverRejectionReason,
  driverAppRejectionReason,
  driverBanReason,
  onUpdateApplication,
  onReapply,
}: DriverModeCardProps) {
  const colors = useColors();
  const accentColor = D.orange;

  if (hasPendingApp) {
    return (
      <View style={[cardStyle, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={statusIconWrap("#F59E0B")}>
            <IconSymbol name="clock.fill" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#92400E" }}>Application Under Review</Text>
            <Text style={{ fontSize: 13, color: "#A16207", marginTop: 2 }}>
              {"We're reviewing your driver application. You'll be notified once approved."}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (isDriverActionRequired && !isDriverSuspended) {
    return (
      <View style={[cardStyle, { backgroundColor: "#FFF7ED", borderColor: "#F97316" }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={statusIconWrap("#F97316")}>
            <IconSymbol name="exclamationmark.triangle.fill" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#9A3412" }}>Action Required</Text>
            <Text style={{ fontSize: 13, color: "#C2410C", marginTop: 2 }}>
              {driverActionRequiredReason || driverAppActionRequiredReason || "Your application needs updates. Please review and resubmit."}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={{ marginTop: 12, backgroundColor: "#F97316", paddingVertical: 12, borderRadius: 12, alignItems: "center", minHeight: 44, justifyContent: "center" }}
          onPress={onUpdateApplication}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Update Application</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (wasRejected && !isDriverSuspended) {
    return (
      <View style={[cardStyle, { backgroundColor: "#FEE2E2", borderColor: "#EF4444" }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={statusIconWrap("#EF4444")}>
            <IconSymbol name="xmark.circle.fill" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#991B1B" }}>Application Not Approved</Text>
            <Text style={{ fontSize: 13, color: "#B91C1C", marginTop: 2 }}>
              {driverRejectionReason || driverAppRejectionReason || "Your application was not approved."}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={{ marginTop: 12, backgroundColor: "#EF4444", paddingVertical: 12, borderRadius: 12, alignItems: "center", minHeight: 44, justifyContent: "center" }}
          onPress={onReapply}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Reapply</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isDriverSuspended) {
    return (
      <View style={[cardStyle, { backgroundColor: "#FEE2E2", borderColor: "#EF4444" }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={statusIconWrap("#EF4444")}>
            <IconSymbol name="exclamationmark.shield.fill" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#991B1B" }}>Driver Access Inactive</Text>
            <Text style={{ fontSize: 13, color: "#B91C1C", marginTop: 2 }}>
              {driverBanReason || "Driver access is not active. Please contact support or update your documents."}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (isApprovedDriver) {
    return (
      <View style={[cardStyle, { backgroundColor: "#fff", borderColor: "#E2E8F0", ...SHADOW_CARD }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: accentColor + "15", alignItems: "center", justifyContent: "center" }}>
            <IconSymbol name="car.2.fill" size={24} color={accentColor} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }}>Driver Mode</Text>
              <View style={{ backgroundColor: D.green + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: D.green }}>APPROVED</Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 18 }}>
              {driverMode
                ? "You are now accepting ride requests as a driver"
                : "Switch to driver mode to earn by giving rides"}
            </Text>
          </View>
          <Switch
            value={driverMode}
            onValueChange={onToggleDriverMode}
            trackColor={{ false: "#E2E8F0", true: accentColor }}
            thumbColor="#fff"
          />
        </View>

        {driverMode && (
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              paddingVertical: 14,
              marginTop: 14,
              gap: 8,
              backgroundColor: accentColor,
              minHeight: 48,
            }}
            onPress={onOpenDashboard}
          >
            <IconSymbol name="car.fill" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Open Driver Dashboard</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={{
            marginTop: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 12,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: accentColor + "45",
            minHeight: 48,
            backgroundColor: "#fff",
          }}
          onPress={onOpenDocuments}
        >
          <IconSymbol name="doc.text.fill" size={15} color={accentColor} />
          <Text style={{ color: accentColor, fontWeight: "700", fontSize: 14 }}>My Documents & Verification</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!driverAccessLoading && !driverAccessError) {
    return <BecomeDriverBanner onPress={onBecomeDriver} />;
  }

  return null;
}

const cardStyle = {
  marginHorizontal: 16,
  marginBottom: 14,
  borderRadius: 26,
  borderWidth: 1,
  padding: 16,
} as const;

function statusIconWrap(bg: string) {
  return {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: bg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
}
