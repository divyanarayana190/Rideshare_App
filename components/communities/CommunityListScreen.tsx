import { useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BrandedBackButton from "@/components/BrandedBackButton";
import { CompactCommunityRow } from "@/components/communities/CompactCommunityRow";
import { MyCommunityRow } from "@/components/communities/MyCommunityRow";
import { NearbyCommunityRow } from "@/components/communities/NearbyCommunityRow";
import { TopCommunityGridCard } from "@/components/communities/TopCommunityGridCard";
import { C, SPACE } from "@/components/communities/communityTheme";
import { GRID_GAP, H_PAD, type CommunityItem } from "@/components/communities/types";
import { ScreenContainer } from "@/components/screen-container";

type Layout = "list" | "my" | "nearby" | "top";

type Props = {
  title: string;
  items: CommunityItem[];
  isLoading: boolean;
  isFetchingMore: boolean;
  isError: boolean;
  hasMore: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
  layout?: Layout;
  showDistance?: boolean;
  emptyMessage?: string;
};

export function CommunityListScreen({
  title,
  items,
  isLoading,
  isFetchingMore,
  isError,
  hasMore,
  onRefresh,
  onLoadMore,
  onRetry,
  layout = "list",
  showDistance,
  emptyMessage = "No communities yet",
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width;
  const gridCardWidth = useMemo(
    () => (screenWidth - H_PAD * 2 - GRID_GAP) / 2,
    [screenWidth],
  );
  const open = (id: number) => router.push(`/communities/${id}` as Href);
  const onEndReachedCalled = useRef(false);

  const handleEndReached = useCallback(() => {
    if (onEndReachedCalled.current || !hasMore || isFetchingMore) return;
    onEndReachedCalled.current = true;
    onLoadMore();
    setTimeout(() => {
      onEndReachedCalled.current = false;
    }, 500);
  }, [hasMore, isFetchingMore, onLoadMore]);

  const renderItem = ({ item }: { item: CommunityItem }) => {
    if (layout === "my") {
      return <MyCommunityRow item={item} onPress={() => open(item.id)} />;
    }
    if (layout === "nearby") {
      return (
        <NearbyCommunityRow
          item={item}
          onPress={() => open(item.id)}
          onJoin={() => open(item.id)}
        />
      );
    }
    if (layout === "top") {
      return (
        <TopCommunityGridCard
          item={item}
          width={gridCardWidth}
          onPress={() => open(item.id)}
          onJoin={() => open(item.id)}
        />
      );
    }
    return (
      <CompactCommunityRow
        item={item}
        onPress={() => open(item.id)}
        showDistance={showDistance}
      />
    );
  };

  const isGrid = layout === "top";

  return (
    <ScreenContainer edges={["top", "left", "right"]} style={{ backgroundColor: C.bg }}>
      <View style={[s.header, { paddingTop: 4 }]}>
        <BrandedBackButton />
        <Text style={s.title} pointerEvents="none">
          {title}
        </Text>
        <View style={s.headerSpacer} />
      </View>

      {isLoading && items.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator color={C.blue} size="large" />
        </View>
      ) : isError && items.length === 0 ? (
        <View style={s.center}>
          <Text style={s.errorText}>Couldn't load communities</Text>
          <Pressable onPress={onRetry} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          key={isGrid ? "grid" : "list"}
          data={items}
          numColumns={isGrid ? 2 : 1}
          keyExtractor={(item: CommunityItem) => String(item.id)}
          renderItem={renderItem}
          columnWrapperStyle={isGrid ? s.gridRow : undefined}
          contentContainerStyle={{
            paddingBottom: insets.bottom + SPACE.lg,
            paddingTop: SPACE.xs,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isLoading && items.length > 0}
              onRefresh={onRefresh}
              tintColor={C.blue}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.empty}>{emptyMessage}</Text>
            </View>
          }
          ListFooterComponent={
            isFetchingMore ? (
              <ActivityIndicator color={C.blue} style={{ paddingVertical: SPACE.md }} />
            ) : null
          }
        />
      )}
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PAD,
    paddingBottom: SPACE.sm,
  },
  headerSpacer: { width: 44 },
  title: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    color: C.text,
  },
  gridRow: {
    paddingHorizontal: H_PAD,
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  errorText: { color: C.text, fontWeight: "600", marginBottom: 12 },
  retryBtn: { padding: 12 },
  retryText: { color: C.blue, fontWeight: "700" },
  empty: { color: C.muted, fontSize: 15 },
});
