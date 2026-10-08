import { useCallback, useEffect, useMemo, useState } from "react";

import { CommunityListScreen } from "@/components/communities/CommunityListScreen";
import type { CommunityItem } from "@/components/communities/types";
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
    trendingScore: c.trendingScore as number | undefined,
  };
}

export default function TopCommunitiesListScreen() {
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<CommunityItem[]>([]);

  const query = trpc.communities.top.useQuery(
    { limit: PAGE, offset },
    { staleTime: 30_000 },
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

  return (
    <CommunityListScreen
      title="Top Communities"
      items={items}
      isLoading={query.isLoading && items.length === 0}
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
      layout="top"
      emptyMessage="No top communities yet"
    />
  );
}
