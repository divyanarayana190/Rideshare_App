import { useCallback, useMemo, useState } from "react";

import { CommunityListScreen } from "@/components/communities/CommunityListScreen";
import type { CommunityItem } from "@/components/communities/types";
import { trpc } from "@/lib/trpc";

const PAGE = 30;

function mapItem(c: Record<string, unknown>): CommunityItem {
  return {
    id: c.id as number,
    name: c.name as string,
    category: c.category as string,
    visibility: c.visibility as string | undefined,
    memberCount: Number(c.memberCount ?? 0),
    onlineCount: c.onlineCount != null ? Number(c.onlineCount) : undefined,
    logoUrl: (c.logoUrl as string | null) ?? null,
    membershipStatus: (c.membershipStatus as string | null) ?? null,
    isVerified: Boolean(c.isVerified),
    themeColor: (c.themeColor as string | null) ?? null,
  };
}

export default function MyCommunitiesListScreen() {
  const [limit, setLimit] = useState(PAGE);

  const query = trpc.communities.listMyCommunities.useQuery(
    { limit },
    { staleTime: 30_000 },
  );

  const items = useMemo(
    () => (query.data ?? []).map((c: Record<string, unknown>) => mapItem(c)),
    [query.data],
  );

  const loadMore = useCallback(() => {
    if (query.isFetching) return;
    if ((query.data?.length ?? 0) < limit) return;
    setLimit((l) => l + PAGE);
  }, [query.data?.length, query.isFetching, limit]);

  return (
    <CommunityListScreen
      title="My Communities"
      items={items}
      isLoading={query.isLoading && items.length === 0}
      isFetchingMore={query.isFetching && limit > PAGE}
      isError={query.isError}
      hasMore={(query.data?.length ?? 0) >= limit}
      onRefresh={() => {
        setLimit(PAGE);
        void query.refetch();
      }}
      onLoadMore={loadMore}
      onRetry={() => void query.refetch()}
      layout="my"
      emptyMessage="You haven't joined any communities yet"
    />
  );
}
