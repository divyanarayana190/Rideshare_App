import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import type { LegalDocument } from "@/shared/legal/types";
import { useCallback, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BOTTOM_THRESHOLD = 48;

interface Props {
  document: LegalDocument;
  visible: boolean;
  onClose: () => void;
  onAccept: () => void;
  alreadyAccepted?: boolean;
}

export function LegalDocumentScreen({
  document,
  visible,
  onClose,
  onAccept,
  alreadyAccepted = false,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<{ scrollTo: (opts: { y: number; animated?: boolean }) => void } | null>(null);

  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  const maxScroll = Math.max(contentHeight - viewportHeight, 1);
  const scrollProgress = Math.min(1, scrollY / maxScroll);
  const reachedBottom =
    contentHeight > 0 &&
    viewportHeight > 0 &&
    scrollY + viewportHeight >= contentHeight - BOTTOM_THRESHOLD;
  const canAccept = alreadyAccepted || reachedBottom;

  const resetScroll = useCallback(() => {
    setScrollY(0);
    setContentHeight(0);
    setViewportHeight(0);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const handleClose = () => {
    resetScroll();
    onClose();
  };

  const handleAccept = () => {
    if (!canAccept || alreadyAccepted) return;
    resetScroll();
    onAccept();
  };

  const effectiveDate = document.effectiveDate ?? document.lastUpdated;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
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
          <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
            <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
              {document.title}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
              v{document.version} · Effective {effectiveDate}
            </Text>
          </View>
        </View>

        <View style={{ height: 3, backgroundColor: colors.border }}>
          <View
            style={{
              height: 3,
              width: `${Math.round(scrollProgress * 100)}%`,
              backgroundColor: colors.primary,
            }}
          />
        </View>

        {!alreadyAccepted && !reachedBottom && (
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              backgroundColor: colors.surface,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
              Scroll to the bottom to enable acceptance ({Math.round(scrollProgress * 100)}% read)
            </Text>
          </View>
        )}

        <ScrollView
          ref={scrollRef as any}
          onLayout={(e: { nativeEvent: { layout: { height: number } } }) => setViewportHeight(e.nativeEvent.layout.height)}
          onContentSizeChange={(_w: number, h: number) => setContentHeight(h)}
          onScroll={(e: { nativeEvent: { contentOffset: { y: number } } }) => setScrollY(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        >
          <Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted, marginBottom: 20 }}>
            {document.description}
          </Text>
          {document.sections.map((section) => (
            <View key={section.id} style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: colors.foreground,
                  marginBottom: 8,
                }}
              >
                {section.title}
              </Text>
              {section.content.split("\n\n").map((para, i) => (
                <Text
                  key={i}
                  style={{
                    fontSize: 14,
                    lineHeight: 22,
                    color: colors.foreground,
                    marginTop: i > 0 ? 10 : 0,
                  }}
                >
                  {para}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 10,
          }}
        >
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Back</Text>
          </Pressable>

          {alreadyAccepted ? (
            <View
              style={{
                borderRadius: 12,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.primary,
                paddingVertical: 14,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <IconSymbol name="checkmark.circle.fill" size={18} color={colors.primary} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.primary }}>Already accepted</Text>
            </View>
          ) : (
            <Pressable
              onPress={handleAccept}
              disabled={!canAccept}
              accessibilityRole="button"
              accessibilityLabel="Accept this document"
              accessibilityState={{ disabled: !canAccept }}
              style={{
                borderRadius: 12,
                backgroundColor: canAccept ? colors.primary : colors.muted,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>Accept this document</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}
