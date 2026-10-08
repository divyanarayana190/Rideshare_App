import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import type { LegalDocument, LegalSection } from "@/shared/legal/types";
import { useMemo, useRef, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface Props {
  document: LegalDocument;
  showToc?: boolean;
}

export function LegalDocumentViewer({ document, showToc = true }: Props) {
  const colors = useColors();
  const scrollRef = useRef<{ scrollTo: (opts: { y: number; animated?: boolean }) => void } | null>(null);
  const sectionOffsets = useRef<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(document.sections.map((s) => [s.id, true])),
  );
  const [activeSection, setActiveSection] = useState(document.sections[0]?.id ?? "");

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return document.sections;
    return document.sections.filter(
      (s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q),
    );
  }, [document.sections, query]);

  const toggleSection = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    setExpanded((prev) => ({ ...prev, [id]: true }));
    const y = sectionOffsets.current[id];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  const onScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    let current = document.sections[0]?.id ?? "";
    for (const s of document.sections) {
      const offset = sectionOffsets.current[s.id];
      if (offset != null && offset <= y + 80) current = s.id;
    }
    setActiveSection(current);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
          Version {document.version} · Updated {document.lastUpdated}
        </Text>
        <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>
          {document.description}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 12,
            gap: 8,
          }}
        >
          <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search this document…"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search legal document"
            style={{ flex: 1, paddingVertical: 10, color: colors.foreground, fontSize: 15 }}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery("")} accessibilityLabel="Clear search">
              <IconSymbol name="xmark.circle.fill" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {showToc && !query && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
        >
          {document.sections.map((s) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => scrollToSection(s.id)}
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${s.title}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: activeSection === s.id ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: activeSection === s.id ? colors.primary : colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: activeSection === s.id ? "#fff" : colors.foreground,
                }}
                numberOfLines={1}
              >
                {s.title.replace(/^\d+\.\s*/, "")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      >
        {filteredSections.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <Text style={{ color: colors.muted }}>No sections match your search.</Text>
          </View>
        ) : (
          filteredSections.map((section) => (
            <LegalSectionCard
              key={section.id}
              section={section}
              expanded={expanded[section.id] ?? true}
              onToggle={() => toggleSection(section.id)}
              onLayout={(y) => {
                sectionOffsets.current[section.id] = y;
              }}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function LegalSectionCard({
  section,
  expanded,
  onToggle,
  onLayout,
}: {
  section: LegalSection;
  expanded: boolean;
  onToggle: () => void;
  onLayout: (y: number) => void;
}) {
  const colors = useColors();
  return (
    <View
      onLayout={(e: { nativeEvent: { layout: { y: number } } }) => onLayout(e.nativeEvent.layout.y)}
      style={{
        marginBottom: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={section.title}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 14,
          gap: 8,
        }}
      >
        <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.foreground }}>
          {section.title}
        </Text>
        <IconSymbol
          name={expanded ? "chevron.up" : "chevron.down"}
          size={16}
          color={colors.muted}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
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
      )}
    </View>
  );
}
