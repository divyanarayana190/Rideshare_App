import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { CompactCommunityRow } from "@/components/communities/CompactCommunityRow";
import { EmptyStateCard } from "@/components/communities/EmptyStateCard";
import { SectionHeader } from "@/components/communities/SectionHeader";
import { C } from "@/components/communities/communityTheme";
import type { CommunityItem } from "@/components/communities/types";

type SearchBuckets = {
  joined: CommunityItem[];
  nearby: CommunityItem[];
  top: CommunityItem[];
  other: CommunityItem[];
};

type Props = {
  buckets: SearchBuckets | undefined;
  isLoading: boolean;
  onOpen: (id: number) => void;
  onCreate: () => void;
};

function Bucket({
  title,
  items,
  onOpen,
  showDistance,
}: {
  title: string;
  items: CommunityItem[];
  onOpen: (id: number) => void;
  showDistance?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <SectionHeader title={title} />
      <View style={s.list}>
        {items.map((item) => (
          <CompactCommunityRow
            key={`${title}-${item.id}`}
            item={item}
            onPress={() => onOpen(item.id)}
            showDistance={showDistance}
          />
        ))}
      </View>
    </>
  );
}

export function CommunitiesSearchResults({
  buckets,
  isLoading,
  onOpen,
  onCreate,
}: Props) {
  if (isLoading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={C.blue} size="large" />
        <Text style={s.loadingText}>Searching communities…</Text>
      </View>
    );
  }

  const joined = buckets?.joined ?? [];
  const nearby = buckets?.nearby ?? [];
  const top = buckets?.top ?? [];
  const other = buckets?.other ?? [];
  const total = joined.length + nearby.length + top.length + other.length;

  if (total === 0) {
    return (
      <EmptyStateCard
        title="No communities found."
        actions={[{ label: "Create Community", onPress: onCreate, primary: true }]}
      />
    );
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
      <Bucket title="My Communities" items={joined} onOpen={onOpen} />
      <Bucket title="Nearby" items={nearby} onOpen={onOpen} showDistance />
      <Bucket title="Top Communities" items={top} onOpen={onOpen} />
      <Bucket title="More Communities" items={other} onOpen={onOpen} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  loading: { paddingVertical: 48, alignItems: "center", gap: 12 },
  loadingText: { color: C.muted, fontSize: 14 },
  list: { marginBottom: 8 },
});
