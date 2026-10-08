import { useRouter, type Href } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useDriverAccess } from "@/lib/use-driver-access";
import { trpc } from "@/lib/trpc";

const STATUS_CONFIG: Record<string, {
  icon: IconSymbolName;
  color: string;
  bgColor: string;
  label: string;
  description: string;
}> = {
  pending: {
    icon: "clock.fill",
    color: "#F59E0B",
    bgColor: "#FEF3C7",
    label: "Pending Review",
    description: "Your application is in the review queue. We'll get to it shortly.",
  },
  under_review: {
    icon: "eye.fill",
    color: "#1E88FF",
    bgColor: "#DBEAFE",
    label: "Under Review",
    description: "An admin is currently reviewing your application.",
  },
  approved: {
    icon: "checkmark.circle.fill",
    color: "#16A34A",
    bgColor: "#ECFDF5",
    label: "Approved",
    description: "You're approved! Toggle Driver Mode in your Profile to start accepting rides.",
  },
  rejected: {
    icon: "xmark.circle.fill",
    color: "#EF4444",
    bgColor: "#FEE2E2",
    label: "Not Approved",
    description: "Unfortunately your application was not approved.",
  },
};

export default function DriverApplicationStatusScreen() {
  const colors = useColors();
  const router = useRouter();
  const { access, isLoading: accessLoading, isSuspended, banReason } = useDriverAccess(true);
  const { data: app, isLoading: appLoading } = trpc.driver.getApplicationStatus.useQuery(undefined);
  const isLoading = accessLoading || appLoading;

  const status = isSuspended
    ? "suspended"
    : (app?.status ?? access?.driverStatus ?? "pending");
  const config = STATUS_CONFIG[status] ?? (isSuspended
    ? {
        icon: "exclamationmark.shield.fill" as IconSymbolName,
        color: "#EF4444",
        bgColor: "#FEE2E2",
        label: "Access Inactive",
        description: banReason ?? "Driver access is not active. Please contact support or update your documents.",
      }
    : STATUS_CONFIG.pending!);

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, marginLeft: 12 }}>
            Application Status
          </Text>
        </View>

        {isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !app ? (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <IconSymbol name="doc.text" size={48} color={colors.muted} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>
              No Application Found
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4, textAlign: "center" }}>
              {"You haven't submitted a driver application yet."}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#1E88FF", marginTop: 20 }]}
              onPress={() => router.push("/driver-onboarding" as Href)}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Apply Now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Status Badge */}
            <View style={[styles.statusCard, { backgroundColor: config.bgColor }]}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: config.color + "20", alignItems: "center", justifyContent: "center" }}>
                <IconSymbol name={config.icon} size={36} color={config.color} />
              </View>
              <Text style={{ fontSize: 22, fontWeight: "800", color: config.color, marginTop: 12 }}>
                {config.label}
              </Text>
              <Text style={{ fontSize: 14, color: "#666", textAlign: "center", marginTop: 6, lineHeight: 20 }}>
                {config.description}
              </Text>
            </View>

            {/* Rejection Reason */}
            {status === "rejected" && app.rejectionReason && (
              <View style={[styles.infoCard, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#991B1B", marginBottom: 4 }}>
                  Reason:
                </Text>
                <Text style={{ fontSize: 13, color: "#B91C1C", lineHeight: 18 }}>
                  {app.rejectionReason}
                </Text>
              </View>
            )}

            {/* Application Details */}
            <View style={[styles.detailsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
                Application Details
              </Text>

              <DetailRow label="Full Name" value={app.fullName} colors={colors} />
              <DetailRow label="Vehicle" value={`${app.vehicleYear} ${app.vehicleMake} ${app.vehicleModel}`} colors={colors} />
              <DetailRow label="Color" value={app.vehicleColor} colors={colors} />
              <DetailRow label="Plate" value={app.plateNumber} colors={colors} />
              <DetailRow label="Type" value={app.vehicleType} colors={colors} />
              <DetailRow label="Submitted" value={app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : "N/A"} colors={colors} />
              {app.reviewedAt && (
                <DetailRow label="Reviewed" value={new Date(app.reviewedAt).toLocaleDateString()} colors={colors} />
              )}
            </View>

            {/* Timeline */}
            <View style={[styles.detailsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
                Timeline
              </Text>

              <TimelineItem
                label="Application Submitted"
                date={app.submittedAt}
                done={true}
                colors={colors}
              />
              <TimelineItem
                label="Under Review"
                date={status === "under_review" ? "In progress" : app.reviewedAt}
                done={status !== "pending"}
                colors={colors}
              />
              <TimelineItem
                label={status === "rejected" ? "Not Approved" : "Approved"}
                date={app.approvedAt || app.rejectedAt}
                done={status === "approved" || status === "rejected"}
                isLast
                colors={colors}
              />
            </View>

            {/* Actions */}
            {status === "approved" && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: "#16A34A" }]}
                onPress={() => router.push("/(tabs)/profile" as Href)}
              >
                <IconSymbol name="car.fill" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginLeft: 8 }}>
                  Go to Profile & Enable Driver Mode
                </Text>
              </TouchableOpacity>
            )}

            {status === "rejected" && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: "#1E88FF" }]}
                onPress={() => router.push("/driver-onboarding" as Href)}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  Reapply
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 13, color: colors.muted }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{value}</Text>
    </View>
  );
}

function TimelineItem({ label, date, done, isLast, colors }: {
  label: string;
  date?: string | null;
  done: boolean;
  isLast?: boolean;
  colors: any;
}) {
  return (
    <View style={{ flexDirection: "row", marginBottom: isLast ? 0 : 4 }}>
      <View style={{ alignItems: "center", width: 24, marginRight: 12 }}>
        <View style={{
          width: 12, height: 12, borderRadius: 6,
          backgroundColor: done ? "#16A34A" : colors.border,
        }} />
        {!isLast && (
          <View style={{ width: 2, flex: 1, backgroundColor: done ? "#16A34A" : colors.border, marginVertical: 2 }} />
        )}
      </View>
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: done ? colors.foreground : colors.muted }}>
          {label}
        </Text>
        {date && (
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
            {typeof date === "string" && date.includes("T") ? new Date(date).toLocaleDateString() : date}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    alignItems: "center",
    padding: 28,
    borderRadius: 16,
    marginBottom: 16,
  },
  infoCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  detailsCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
});
