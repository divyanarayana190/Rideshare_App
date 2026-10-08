import { Text, TouchableOpacity, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { D, SHADOW_CARD } from "@/constants/design";
import type { ComponentProps, ReactNode } from "react";

type IconName = ComponentProps<typeof IconSymbol>["name"];

interface ProfileSectionCardProps {
  title: string;
  icon?: IconName;
  children: ReactNode;
  onViewAll?: () => void;
  viewAllLabel?: string;
}

export function ProfileSectionCard({ title, icon, children, onViewAll, viewAllLabel = "View All" }: ProfileSectionCardProps) {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon ? (
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
              <IconSymbol name={icon} size={15} color="#64748B" />
            </View>
          ) : null}
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>{title}</Text>
        </View>
        {onViewAll ? (
          <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: D.blue }}>{viewAllLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 26,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          paddingHorizontal: 16,
          ...SHADOW_CARD,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export interface ProfileMoreOptionItem {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  label: string;
  subtitle: string;
  onPress: () => void;
}

interface ProfileMoreOptionsGridProps {
  title: string;
  icon?: IconName;
  gridItems: ProfileMoreOptionItem[];
  extraItems?: ProfileMoreOptionItem[];
  onViewAll?: () => void;
}

export function ProfileMoreOptionsGrid({ title, icon, gridItems, extraItems = [], onViewAll }: ProfileMoreOptionsGridProps) {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon ? (
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
              <IconSymbol name={icon} size={15} color="#64748B" />
            </View>
          ) : null}
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>{title}</Text>
        </View>
        {onViewAll ? (
          <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: D.blue }}>View All</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        {gridItems.map((item) => (
          <ProfileMoreOptionTile key={item.label} {...item} />
        ))}
      </View>

      {extraItems.length > 0 && (
        <View style={{ gap: 10, marginTop: 10 }}>
          {extraItems.map((item) => (
            <ProfileMoreOptionRow key={item.label} {...item} />
          ))}
        </View>
      )}
    </View>
  );
}

function ProfileMoreOptionTile({ icon, iconColor, iconBg, label, subtitle, onPress }: ProfileMoreOptionItem) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={{
        flex: 1,
        backgroundColor: "#fff",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        padding: 12,
        minHeight: 110,
        ...SHADOW_CARD,
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: iconBg, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <IconSymbol name={icon} size={18} color={iconColor} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={2}>{label}</Text>
      <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 4, lineHeight: 14 }} numberOfLines={2}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function ProfileMoreOptionRow({ icon, iconColor, iconBg, label, subtitle, onPress }: ProfileMoreOptionItem) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        padding: 14,
        minHeight: 56,
        ...SHADOW_CARD,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
        <IconSymbol name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>{label}</Text>
        <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{subtitle}</Text>
      </View>
      <IconSymbol name="chevron.right" size={14} color="#CBD5E1" />
    </TouchableOpacity>
  );
}

// ponytail: kept for backward compat if imported elsewhere
export function ProfileCompactOptions({ title, icon, onViewAll, children }: { title: string; icon?: IconName; onViewAll?: () => void; children: ReactNode }) {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

export function ProfileCompactOptionCard(props: ProfileMoreOptionItem) {
  return <ProfileMoreOptionRow {...props} />;
}
