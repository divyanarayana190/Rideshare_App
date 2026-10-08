import { useCallback, useEffect, useMemo, useState } from "react";

import { CommunityListScreen } from "@/components/communities/CommunityListScreen";
import type { CommunityItem } from "@/components/communities/types";
import { useCommunitiesLocation } from "@/components/communities/useCommunitiesLocation";
import { trpc } from "@/lib/trpc";

const PAGE = 20;

function mapItem(c: Record<string, unknown>): CommunityItem {
  return {
    id: c.id as number,
    name: c.name as string,
    category: c.category as string,
    visibility: c.visibility as string | undefined,
    memberCount: Number(c.memberCount ?? 0),
    onlineCount: c.onlineCount != null ? Number(c.onlineCount) : undefined,
    logoUrl: (c.logoUrl as string | null) ?? null,
    isVerified: Boolean(c.isVerified),
    themeColor: (c.themeColor as string | null) ?? null,
    distanceMiles: c.distanceMiles as number | undefined,
  };
}

export default function NearbyCommunitiesListScreen() {
  const { permission, coords, openSettings } = useCommunitiesLocation();
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<CommunityItem[]>([]);

  const query = trpc.communities.nearby.useQuery(
    {
      lat: coords?.lat ?? 0,
      lng: coords?.lng ?? 0,
      maxMiles: 5,
      limit: PAGE,
      offset,
    },
    {
      enabled: permission === "granted" && coords != null,
      staleTime: 30_000,
    },
  );

  useEffect(() => {
    if (!query.data?.items) return;
    const page = query.data.items.map((c: Record<string, unknown>) => mapItem(c));
    setAccumulated((prev) => (offset === 0 ? page : [...prev, ...page]));
  }, [query.data?.items, offset]);

  const items = useMemo(() => accumulated, [accumulated]);

  const loadMore = useCallback(() => {
    if (!query.data?.hasMore || query.isFetching) return;
    setOffset((o) => o + PAGE);
  }, [query.data?.hasMore, query.isFetching]);

  if (permission === "denied") {
    return (
      <CommunityListScreen
        title="Nearby Communities"
        items={[]}
        isLoading={false}
        isFetchingMore={false}
        isError={false}
        hasMore={false}
        onRefresh={openSettings}
        onLoadMore={() => {}}
        onRetry={openSettings}
        showDistance
        emptyMessage="Enable location to see nearby communities"
      />
    );
  }

  return (
    <CommunityListScreen
      title="Nearby Communities"
      items={items}
      isLoading={(query.isLoading || permission === "loading") && items.length === 0}
      isFetchingMore={query.isFetching && offset > 0}
      isError={query.isError}
      hasMore={query.data?.hasMore ?? false}
      onRefresh={() => {
        setOffset(0);
        setAccumulated([]);
        void query.refetch();
      }}
      onLoadMore={loadMore}
      onRetry={() => void query.refetch()}
      layout="nearby"
      emptyMessage="No communities found within 5 miles"
    />
  );
}
