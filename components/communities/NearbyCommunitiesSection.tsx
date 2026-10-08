import { FlatList } from "react-native";
import { useRouter, type Href } from "expo-router";

import { CommunitySectionSkeleton } from "@/components/communities/CommunitySkeleton";
import { EmptyStateCard } from "@/components/communities/EmptyStateCard";
import { LocationPermissionCard } from "@/components/communities/LocationPermissionCard";
import { NEARBY_SCROLL_WIDTH, NearbyCommunityCard } from "@/components/communities/NearbyCommunityCard";
import { SectionError } from "@/components/communities/MyCommunitiesSection";
import { SectionHeader } from "@/components/communities/SectionHeader";
import { H_PAD, type CommunityItem } from "@/components/communities/types";
import type { LocationPermissionState } from "@/components/communities/useCommunitiesLocation";

type Props = {
  items: CommunityItem[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  locationState: LocationPermissionState;
  onEnableLocation: () => void;
  onCreate: () => void;
  isFirstTimeUser?: boolean;
};

const PREVIEW = 6;
const SNAP = NEARBY_SCROLL_WIDTH + 12;

export function NearbyCommunitiesSection({
  items,
  total,
  isLoading,
  isError,
  onRetry,
  locationState,
  onEnableLocation,
  onCreate,
}: Props) {
  const router = useRouter();
  const open = (id: number) => router.push(`/communities/${id}` as Href);

  return (
    <>
      <SectionHeader
        title="Nearby Communities"
        subtitle="Communities near you within 5 miles"
        icon="location"
        showViewAll={total > PREVIEW}
        onViewAll={() => router.push("/communities/nearby" as Href)}
      />

      {locationState === "loading" || isLoading ? (
        <CommunitySectionSkeleton variant="nearby" />
      ) : locationState === "denied" ? (
        <LocationPermissionCard onEnable={onEnableLocation} />
      ) : isError ? (
        <SectionError message="Couldn't load nearby communities" onRetry={onRetry} />
      ) : items.length === 0 ? (
        <EmptyStateCard
          title="Be the first to build your local community"
          description="No communities were found near you yet. Create one and help riders in your area connect."
          actions={[{ label: "Create Community", onPress: onCreate, primary: true }]}
          compact
        />
      ) : (
        <FlatList
          horizontal
          data={items.slice(0, PREVIEW)}
          keyExtractor={(item: CommunityItem) => `nearby-${item.id}`}
          renderItem={({ item }: { item: CommunityItem }) => (
            <NearbyCommunityCard
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
