import { useRouter, type Href } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

const LINKS: { label: string; href: Href; icon: string }[] = [
  { label: "Privacy Policy", href: "/legal/privacy", icon: "hand.raised.fill" },
  { label: "Terms of Service", href: "/legal/terms", icon: "doc.text.fill" },
  { label: "Community Guidelines", href: "/legal/community-guidelines", icon: "person.3.fill" },
  { label: "Safety Policy", href: "/legal/safety-policy", icon: "shield.fill" },
  { label: "Account Deletion Policy", href: "/legal/account-deletion", icon: "trash.fill" },
  { label: "Request My Data", href: "/settings/data-export", icon: "arrow.down.doc.fill" },
  { label: "Delete Account", href: "/settings/delete-account", icon: "person.crop.circle.badge.minus" },
  { label: "Location Permissions", href: "/permissions/location", icon: "location.fill" },
  { label: "Notification Permissions", href: "/permissions/notifications", icon: "bell.fill" },
];

export default function PrivacySettingsScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <ScreenContainer className="p-4">
      <ScrollView>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: 4 }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Privacy & Compliance</Text>
        {LINKS.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => router.push(item.href)}
          >
            <IconSymbol name={item.icon as any} size={18} color={colors.primary} />
            <Text style={{ flex: 1, marginLeft: 12, color: colors.foreground, fontWeight: "600" }}>{item.label}</Text>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
});
