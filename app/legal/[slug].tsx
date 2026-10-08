import { ScreenContainer } from "@/components/screen-container";
import { LegalDocumentViewer } from "@/components/legal/LegalDocumentViewer";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getLegalDocument } from "@/shared/legal/documents";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { trpc } from "@/lib/trpc";

export default function LegalDocumentScreen() {
  const colors = useColors();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const localDoc = slug ? getLegalDocument(slug) : undefined;

  const { data, isLoading } = trpc.legal.getDocument.useQuery(
    { slug: slug ?? "" },
    { enabled: !!slug && !localDoc },
  );

  const document = localDoc ?? data;

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
          gap: 12,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
          {document?.title ?? "Legal"}
        </Text>
      </View>

      {isLoading && !document ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !document ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: colors.muted, textAlign: "center" }}>Document not found.</Text>
        </View>
      ) : (
        <LegalDocumentViewer document={document} />
      )}
    </ScreenContainer>
  );
}
