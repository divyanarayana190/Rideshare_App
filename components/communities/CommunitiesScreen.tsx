import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";

import { CommunitiesCtaCard } from "@/components/communities/CommunitiesCtaCard";
import { CommunitiesHeader } from "@/components/communities/CommunitiesHeader";
import { CommunitiesSearchResults } from "@/components/communities/CommunitiesSearchResults";
import { CommunitySearchBar } from "@/components/communities/CommunitySearchBar";
import { CreateCommunityButton } from "@/components/communities/CreateCommunityButton";
import { MyCommunitiesSection } from "@/components/communities/MyCommunitiesSection";
import { NearbyCommunitiesSection } from "@/components/communities/NearbyCommunitiesSection";
import { TopCommunitiesSection } from "@/components/communities/TopCommunitiesSection";
import { C, SPACE } from "@/components/communities/communityTheme";
import { H_PAD, type CommunityItem } from "@/components/communities/types";
import { useCommunitiesLocation } from "@/components/communities/useCommunitiesLocation";
import { useDebouncedValue } from "@/components/communities/useDebouncedValue";
import { ScreenContainer } from "@/components/screen-container";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { trpc } from "@/lib/trpc";

const PAGE = 20;

function mapFeedItem(c: Record<string, unknown>): CommunityItem {
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
    distanceMiles: c.distanceMiles as number | undefined,
    trendingScore: c.trendingScore as number | undefined,
  };
}

export function CommunitiesScreen() {
  const router = useRouter();
  const { isOffline } = useNetworkStatus();
  const { permission, coords, refresh: refreshLocation, openSettings } = useCommunitiesLocation();

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 400);
  const isSearching = debouncedSearch.trim().length > 0;
  const scrollRef = useRef<any>(null);
  const nearbyY = useRef(0);

  const feedQuery = trpc.communities.homeFeed.useQuery(undefined, {
    enabled: !isSearching,
    staleTime: 30_000,
    placeholderData: (prev: unknown) => prev,
  });

  const nearbyQuery = trpc.communities.nearby.useQuery(
    { lat: coords?.lat ?? 0, lng: coords?.lng ?? 0, maxMiles: 5, limit: PAGE, offset: 0 },
    {
      enabled: !isSearching && permission === "granted" && coords != null,
      staleTime: 30_000,
      placeholderData: (prev: unknown) => prev,
    },
  );

  const topQuery = trpc.communities.top.useQuery(
    { limit: PAGE, offset: 0 },
    {
      enabled: !isSearching,
      staleTime: 30_000,
      placeholderData: (prev: unknown) => prev,
    },
  );

  const searchQuery = trpc.communities.search.useQuery(
    {
      query: debouncedSearch.trim(),
      lat: coords?.lat,
      lng: coords?.lng,
    },
    {
      enabled: isSearching && !isOffline,
      staleTime: 15_000,
    },
  );

  const myCommunities = useMemo(
    () => (feedQuery.data?.myCommunities ?? []).map((c: Record<string, unknown>) => mapFeedItem(c)),
    [feedQuery.data?.myCommunities],
  );

  const nearbyItems = useMemo(
    () => (nearbyQuery.data?.items ?? []).map((c: Record<string, unknown>) => mapFeedItem(c)),
    [nearbyQuery.data?.items],
  );

  const topItems = useMemo(
    () => (topQuery.data?.items ?? []).map((c: Record<string, unknown>) => mapFeedItem(c)),
    [topQuery.data?.items],
  );

  const searchBuckets = useMemo(() => {
    if (!searchQuery.data) return undefined;
    const map = (arr: unknown[]) => arr.map((c) => mapFeedItem(c as Record<string, unknown>));
    return {
      joined: map(searchQuery.data.joined),
      nearby: map(searchQuery.data.nearby),
      top: map(searchQuery.data.top),
      other: map(searchQuery.data.other),
    };
  }, [searchQuery.data]);

  const isFirstTimeUser = myCommunities.length === 0;
  const showCachedFeed =
    isOffline &&
    (feedQuery.data != null || nearbyQuery.data != null || topQuery.data != null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        feedQuery.refetch(),
        topQuery.refetch(),
        permission === "granted" ? nearbyQuery.refetch() : Promise.resolve(),
        permission !== "granted" ? refreshLocation() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [feedQuery, topQuery, nearbyQuery, permission, refreshLocation]);

  const goCreate = useCallback(() => {
    if (isOffline) return;
    router.push("/communities/create" as Href);
  }, [isOffline, router]);

  const scrollToNearby = useCallback(() => {
    scrollRef.current?.scrollTo({ y: nearbyY.current, animated: true });
  }, []);

  const offlineBannerAnim = useRef(new Animated.Value(-48)).current;
  useEffect(() => {
    Animated.timing(offlineBannerAnim, {
      toValue: isOffline ? 0 : -48,
      duration: 280,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [isOffline, offlineBannerAnim]);

  return (
    <ScreenContainer edges={["top", "left", "right"]} style={{ backgroundColor: C.bg }}>
      {isOffline ? (
        <Animated.View style={[s.offlineBanner, { transform: [{ translateY: offlineBannerAnim }] }]}>
          <Text style={s.offlineText}>You're offline. Showing saved communities.</Text>
        </Animated.View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.blue}
            enabled={!isSearching}
          />
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <CommunitiesHeader onNotifications={() => router.push("/notifications" as Href)} />

        <View style={s.searchRow}>
          <CommunitySearchBar value={search} onChangeText={setSearch} disabled={isOffline} />
          <CreateCommunityButton onPress={goCreate} disabled={isOffline} />
        </View>

        {isSearching ? (
          <CommunitiesSearchResults
            buckets={searchBuckets}
            isLoading={searchQuery.isLoading || searchQuery.isFetching}
            onOpen={(id) => router.push(`/communities/${id}` as Href)}
            onCreate={goCreate}
          />
        ) : (
          <>
            <MyCommunitiesSection
              items={myCommunities}
              isLoading={feedQuery.isLoading && !feedQuery.data && !isOffline}
              isError={feedQuery.isError && !showCachedFeed}
              onRetry={() => void feedQuery.refetch()}
              isFirstTimeUser={isFirstTimeUser}
            />

            <View
              onLayout={(e: { nativeEvent: { layout: { y: number } } }) => {
                nearbyY.current = e.nativeEvent.layout.y;
              }}
            >
              <NearbyCommunitiesSection
                items={nearbyItems}
                total={nearbyQuery.data?.total ?? nearbyItems.length}
                isLoading={
                  permission === "loading" ||
                  (permission === "granted" && nearbyQuery.isLoading && !nearbyQuery.data && !isOffline)
                }
                isError={nearbyQuery.isError && permission === "granted" && !showCachedFeed}
                onRetry={() => void nearbyQuery.refetch()}
                locationState={permission}
                onEnableLocation={openSettings}
                onCreate={goCreate}
              />
            </View>

            <TopCommunitiesSection
              items={topItems}
              hasMore={topQuery.data?.hasMore ?? false}
              isLoading={topQuery.isLoading && !topQuery.data && !isOffline}
              isError={topQuery.isError && !showCachedFeed}
              onRetry={() => void topQuery.refetch()}
            />

            <CommunitiesCtaCard
              onLearnMore={() => router.push("/legal/community-guidelines" as Href)}
            />
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: H_PAD,
    marginBottom: SPACE.xs,
  },
  offlineBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: "#D97706",
    paddingVertical: 10,
    paddingHorizontal: H_PAD,
    alignItems: "center",
  },
  offlineText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
