import { ScreenContainer } from "@/components/screen-container";
import { LegalDocumentViewer } from "@/components/legal/LegalDocumentViewer";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import type { LegalDocument } from "@/shared/legal/types";
import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

export function LegalDocScreen({ document }: { document: LegalDocument }) {
  const colors = useColors();
  const router = useRouter();
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
          {document.title}
        </Text>
      </View>
      <LegalDocumentViewer document={document} />
    </ScreenContainer>
  );
}
