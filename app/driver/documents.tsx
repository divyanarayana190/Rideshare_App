import { ScrollView, View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import BrandedBackButton from "@/components/BrandedBackButton";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";

const P = "#6C47FF";
const G = "#10B981";
const R = "#EF4444";
const A = "#F59E0B";

function daysBetween(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryColor(dateStr: string): string {
  const days = daysBetween(dateStr);
  if (days < 0) return R;
  if (days <= 30) return R;
  if (days <= 60) return A;
  return G;
}

function expiryLabel(dateStr: string): string {
  const days = daysBetween(dateStr);
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days}d`;
}

export default function DriverDocumentsPage() {
  const colors = useColors();
  const router = useRouter();

  const { data: app, isLoading } = trpc.driver.getApplicationStatus.useQuery(undefined, {
    staleTime: 2 * 60_000,
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={P} />
      </View>
    );
  }

  if (!app || app.status !== "approved") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 32 }}>
        <IconSymbol name="exclamationmark.circle.fill" size={48} color={A} />
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginTop: 16, textAlign: "center" }}>
          Not an Approved Driver
        </Text>
        <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, textAlign: "center" }}>
          Your driver documents are only accessible once your application is approved.
        </Text>
        <BrandedBackButton onPress={() => router.back()} style={{ marginTop: 24 }} />
      </View>
    );
  }

  const licenseExpiry = app.licenseExpiry ?? null;
  const insuranceExpiry = app.insuranceExpiry ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <IconSymbol name="chevron.left" size={22} color={P} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, flex: 1 }}>
          My Driver Documents
        </Text>
      </View>

      {/* Approved badge */}
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: G + "18", borderRadius: 12, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: G + "40" }}>
        <IconSymbol name="checkmark.seal.fill" size={22} color={G} />
        <Text style={{ fontSize: 15, fontWeight: "700", color: G, marginLeft: 10 }}>
          Driver Status: Approved
        </Text>
      </View>

      {/* License Card */}
      <DocCard
        title="Driver License"
        icon="doc.text.fill"
        iconColor={P}
        colors={colors}
        rows={[
          { label: "License Number", value: app.fullName ?? "—" },
          ...(licenseExpiry ? [{ label: "Expiry", value: licenseExpiry, expiryDate: licenseExpiry }] : []),
        ]}
        onUpdate={() => router.push("/driver-onboarding" as any)}
        updateLabel="Update License"
      />

      {/* Vehicle Card */}
      <DocCard
        title="Vehicle"
        icon="car.fill"
        iconColor="#0EA5E9"
        colors={colors}
        rows={[
          { label: "Make / Model", value: [app.vehicleMake, app.vehicleModel].filter(Boolean).join(" ") || "—" },
          { label: "Year", value: app.vehicleYear ?? "—" },
          { label: "Color", value: (app as any).vehicleColor ?? "—" },
          { label: "Plate Number", value: (app as any).plateNumber ?? "—" },
        ]}
        verified
        onUpdate={() => router.push("/driver-onboarding" as any)}
        updateLabel="Update Vehicle Info"
      />

      {/* Insurance Card */}
      <DocCard
        title="Insurance"
        icon="shield.fill"
        iconColor="#8B5CF6"
        colors={colors}
        rows={[
          ...(insuranceExpiry ? [{ label: "Expiry", value: insuranceExpiry, expiryDate: insuranceExpiry }] : []),
        ]}
        onUpdate={() => router.push("/driver-onboarding" as any)}
        updateLabel="Update Insurance"
      />

      {/* Registration Card */}
      {"vehicleRegistrationUrl" in app && app.vehicleRegistrationUrl && (
        <DocCard
          title="Vehicle Registration"
          icon="doc.text.fill"
          iconColor={G}
          colors={colors}
          rows={[
            { label: "Status", value: "On file" },
          ]}
          verified
          onUpdate={() => router.push("/driver-onboarding" as any)}
          updateLabel="Replace Registration"
        />
      )}

      {/* Info note */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 8 }}>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
          To update any documents, use the driver onboarding form. Changes will be reviewed by our team before taking effect.
        </Text>
      </View>
    </ScrollView>
  );
}

function DocCard({
  title,
  icon,
  iconColor,
  colors,
  rows,
  verified,
  onUpdate,
  updateLabel,
}: {
  title: string;
  icon: IconSymbolName;
  iconColor: string;
  colors: ReturnType<typeof useColors>;
  rows: { label: string; value: string; expiryDate?: string }[];
  verified?: boolean;
  onUpdate: () => void;
  updateLabel: string;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      {/* Card Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: iconColor + "0E",
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            backgroundColor: iconColor + "22",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconSymbol name={icon} size={20} color={iconColor} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginLeft: 12, flex: 1 }}>
          {title}
        </Text>
        {verified && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <IconSymbol name="checkmark.circle.fill" size={16} color={G} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: G }}>Verified</Text>
          </View>
        )}
      </View>

      {/* Rows */}
      <View style={{ padding: 14 }}>
        {rows.map((row, i) => {
          const color = row.expiryDate ? expiryColor(row.expiryDate) : colors.foreground;
          const sublabel = row.expiryDate ? expiryLabel(row.expiryDate) : null;
          return (
            <View
              key={i}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: i < rows.length - 1 ? 10 : 0,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.muted, flex: 1 }}>{row.label}</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: row.expiryDate ? color : colors.foreground }}>
                  {row.value}
                </Text>
                {sublabel && (
                  <Text style={{ fontSize: 11, fontWeight: "600", color }}>
                    {sublabel}
                  </Text>
                )}
              </View>
            </View>
          );
        })}

        {/* Update Button */}
        <TouchableOpacity
          onPress={onUpdate}
          style={{
            marginTop: 12,
            borderWidth: 1.5,
            borderColor: iconColor + "80",
            borderRadius: 8,
            paddingVertical: 8,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: iconColor }}>
            {updateLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
