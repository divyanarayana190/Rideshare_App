import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { LEGAL_DOCUMENTS } from "@/shared/legal/documents";
import { CURRENT_LEGAL_VERSION } from "@/shared/legal/version";
import { useRouter, type Href } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const PRIMARY_ROUTES: Record<string, string> = {
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  "driver-terms": "/legal/driver-terms",
  "community-guidelines": "/legal/community-guidelines",
  "safety-policy": "/legal/safety-policy",
};

export default function LegalCenterScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>Legal Center</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
              YOO policies · Version {CURRENT_LEGAL_VERSION}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        {LEGAL_DOCUMENTS.map((doc) => {
          const href = (PRIMARY_ROUTES[doc.slug] ?? `/legal/${doc.slug}`) as Href;
          return (
            <TouchableOpacity
              key={doc.slug}
              onPress={() => router.push(href)}
              style={{
                padding: 16,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{doc.title}</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 18 }}>
                {doc.description}
              </Text>
              <Text style={{ fontSize: 12, color: colors.primary, marginTop: 8, fontWeight: "600" }}>
                Read document →
              </Text>
            </TouchableOpacity>
          );
        })}
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 18 }}>
          Questions? Contact legal@yoo.app or privacy@yoo.app
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}
