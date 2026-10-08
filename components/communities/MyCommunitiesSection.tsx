import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";

import { MyCommunityRow } from "@/components/communities/MyCommunityRow";
import { CommunitySectionSkeleton } from "@/components/communities/CommunitySkeleton";
import { EmptyStateCard } from "@/components/communities/EmptyStateCard";
import { SectionHeader } from "@/components/communities/SectionHeader";
import { C, cardShadow } from "@/components/communities/communityTheme";
import { H_PAD, type CommunityItem } from "@/components/communities/types";

type Props = {
  items: CommunityItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isFirstTimeUser: boolean;
};

const PREVIEW = 3;

export function MyCommunitiesSection({
  items,
  isLoading,
  isError,
  onRetry,
  isFirstTimeUser,
}: Props) {
  const router = useRouter();
  const open = (id: number) => router.push(`/communities/${id}` as Href);

  if (isFirstTimeUser) return null;

  if (isLoading) {
    return (
      <>
        <SectionHeader title="My Communities" />
        <CommunitySectionSkeleton variant="rows" />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <SectionHeader title="My Communities" />
        <EmptyStateCard
          title="Couldn't load your communities"
          actions={[{ label: "Retry", onPress: onRetry, primary: true }]}
          compact
        />
      </>
    );
  }

  if (items.length === 0) return null;

  const preview = items.slice(0, PREVIEW);

  return (
    <>
      <SectionHeader
        title="My Communities"
        showViewAll={items.length > PREVIEW}
        onViewAll={() => router.push("/communities/my" as Href)}
      />
      <View>
        {preview.map((item) => (
          <MyCommunityRow key={item.id} item={item} onPress={() => open(item.id)} />
        ))}
      </View>
    </>
  );
}

export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={[s.errorWrap, cardShadow]}>
      <Text style={s.errorText}>{message}</Text>
      <Pressable onPress={onRetry} hitSlop={8}>
        <Text style={s.retry}>Retry</Text>
      </Pressable>
    </View>
  );
}

const s = {
  errorWrap: {
    marginHorizontal: H_PAD,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: C.canvas,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  errorText: { color: C.text, fontSize: 14, flex: 1 },
  retry: { color: C.blue, fontWeight: "700" as const, fontSize: 14 },
};
