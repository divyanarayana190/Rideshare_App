import { FlatList } from "react-native";
import { useRouter, type Href } from "expo-router";

import { CommunitySectionSkeleton } from "@/components/communities/CommunitySkeleton";
import { SectionError } from "@/components/communities/MyCommunitiesSection";
import { SectionHeader } from "@/components/communities/SectionHeader";
import { TOP_SCROLL_WIDTH, TopCommunityWidget } from "@/components/communities/TopCommunityWidget";
import { H_PAD, type CommunityItem } from "@/components/communities/types";

type Props = {
  items: CommunityItem[];
  hasMore: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

const PREVIEW = 8;
const SNAP = TOP_SCROLL_WIDTH + 12;

export function TopCommunitiesSection({
  items,
  hasMore,
  isLoading,
  isError,
  onRetry,
}: Props) {
  const router = useRouter();
  const open = (id: number) => router.push(`/communities/${id}` as Href);

  return (
    <>
      <SectionHeader
        title="Top Communities"
        subtitle="Most active communities on YOO"
        icon="flame"
        iconColor="#EF4444"
        showViewAll={hasMore || items.length > PREVIEW}
        onViewAll={() => router.push("/communities/top" as Href)}
      />

      {isLoading ? (
        <CommunitySectionSkeleton variant="top" />
      ) : isError ? (
        <SectionError message="Couldn't load top communities" onRetry={onRetry} />
      ) : items.length === 0 ? (
        <SectionError message="No top communities yet" onRetry={onRetry} />
      ) : (
        <FlatList
          horizontal
          data={items.slice(0, PREVIEW)}
          keyExtractor={(item: CommunityItem) => `top-${item.id}`}
          renderItem={({ item }: { item: CommunityItem }) => (
            <TopCommunityWidget
              item={item}
              onPress={() => open(item.id)}
              onJoin={() => open(item.id)}
            />
          )}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={SNAP}
          contentContainerStyle={{ paddingHorizontal: H_PAD, paddingBottom: 8 }}
        />
      )}
    </>
  );
}
