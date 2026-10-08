import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { RequestWalletCard } from "@/components/requests/RequestWalletCard";
import { RideSectionHeader } from "@/components/requests/RideSectionHeader";
import { RequestsAnalyticsDashboard } from "@/components/requests/RequestsAnalyticsDashboard";
import { RequestsEmptyState } from "@/components/requests/RequestsEmptyState";
import { RequestsHeader } from "@/components/requests/RequestsHeader";
import { RequestsOrganizerHub } from "@/components/requests/RequestsOrganizerHub";
import { RequestsSegmentedControl } from "@/components/requests/RequestsSegmentedControl";
import { RequestsSkeletonList } from "@/components/requests/RequestsSkeletonList";
import {
  RequestsBottomDock,
  RequestsLiveInsights,
  RequestsQuickActions,
} from "@/components/requests/RequestsSupportSections";
import { RQ } from "@/components/requests/theme";
import type { RequestItem, RequestListRow, RideRequestSection, TabKey } from "@/components/requests/types";
import { countSince, countToday, getItemStatus, showAlert } from "@/components/requests/utils";
import { useIsFocused } from "@/hooks/use-is-focused";
import { useDriverAccess } from "@/lib/use-driver-access";
import { useRideEvents } from "@/lib/use-ride-events";
import { useToastStore } from "@/lib/stores";
import { trpc } from "@/lib/trpc";

export default function RequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const utils = trpc.useUtils();
  const isFocused = useIsFocused();
  const toast = useToastStore();
  const { lastNotification, lastRideUpdate } = useRideEvents();

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [actioning, setActioning] = useState<Record<string, "approve" | "reject" | null>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: requests = [], isLoading, refetch } = trpc.carpool.getAllJoinRequests.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 15_000,
    refetchInterval: isFocused ? 20_000 : false,
  });
  const { data: postedRides = [] } = trpc.carpool.getMyPostedRides.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 60_000,
  });
  const { canAccessDriverMode: isApprovedDriver } = useDriverAccess(isFocused);
  const hasPostedRides = postedRides.length > 0;

  useEffect(() => {
    if (!isFocused) return;
    const notifType = lastNotification?.notifType;
    const step = lastRideUpdate?.step;
    if (notifType === "ride_request" || step === "join_requested") {
      void utils.carpool.getAllJoinRequests.invalidate();
      void utils.carpool.getMyPostedRides.invalidate();
    }
  }, [isFocused, lastNotification, lastRideUpdate, utils.carpool]);

  const approveMut = trpc.carpool.approveRequest.useMutation();
  const rejectMut = trpc.carpool.rejectRequest.useMutation();

  const handleApprove = async (item: RequestItem) => {
    setActioning((p) => ({ ...p, [item.joinRequestId]: "approve" }));
    try {
      await approveMut.mutateAsync({ joinRequestId: item.joinRequestId });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show("Request approved", "success");
      utils.carpool.getAllJoinRequests.invalidate();
      utils.carpool.getMyPostedRides.invalidate();
      utils.rides.myRides.invalidate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to approve";
      showAlert("Error", msg);
    } finally {
      setActioning((p) => ({ ...p, [item.joinRequestId]: null }));
    }
  };

  const handleReject = async (item: RequestItem) => {
    setActioning((p) => ({ ...p, [item.joinRequestId]: "reject" }));
    try {
      await rejectMut.mutateAsync({ joinRequestId: item.joinRequestId });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show("Request rejected", "info");
      utils.carpool.getAllJoinRequests.invalidate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to reject";
      showAlert("Error", msg);
    } finally {
      setActioning((p) => ({ ...p, [item.joinRequestId]: null }));
    }
  };

  const allRequests = requests as RequestItem[];
  const byTab = {
    all: allRequests,
    pending: allRequests.filter((r) => r.status === "pending"),
    accepted: allRequests.filter((r) => r.status === "approved"),
    rejected: allRequests.filter((r) => r.status === "rejected"),
  };
  const counts: Record<TabKey, number> = {
    all: byTab.all.length,
    pending: byTab.pending.length,
    accepted: byTab.accepted.length,
    rejected: byTab.rejected.length,
  };

  const activeTabItems = byTab[activeTab];
  const pendingCount = byTab.pending.length;
  const acceptRate = allRequests.length > 0
    ? Math.round((counts.accepted / Math.max(counts.accepted + counts.rejected, 1)) * 100)
    : 100;
  const todayCount = countToday(allRequests);
  const weekCount = countSince(allRequests, 7);

  const sections: RideRequestSection[] = useMemo(() => {
    const map = new Map<string, RideRequestSection>();
    for (const item of activeTabItems) {
      const existing = map.get(item.rideId);
      if (existing) {
        existing.data.push(item);
        continue;
      }
      map.set(item.rideId, {
        rideId: item.rideId,
        rideTitle: item.rideTitle,
        departureTime: item.departureTime,
        seatsAvailable: item.seatsAvailable ?? 0,
        data: [item],
      });
    }
    return [...map.values()];
  }, [activeTabItems]);

  const listRows: RequestListRow[] = useMemo(() => {
    const rows: RequestListRow[] = [];
    for (const section of sections) {
      rows.push({ kind: "header", key: `header-${section.rideId}`, section });
      for (const item of section.data) {
        rows.push({ kind: "item", key: item.joinRequestId, item });
      }
    }
    return rows;
  }, [sections]);

  const renderRequestCard = (item: RequestItem) => {
    const status = getItemStatus(item);
    const cardStatus = status === "accepted" ? "accepted" : status === "rejected" ? "rejected" : "pending";
    return (
      <RequestWalletCard
        item={item}
        status={cardStatus}
        expanded={expandedId === item.joinRequestId}
        onToggle={() => setExpandedId((id) => (id === item.joinRequestId ? null : item.joinRequestId))}
        onApprove={() => handleApprove(item)}
        onReject={() => handleReject(item)}
        onMessage={() => router.push(`/chat-screen?rideId=${item.rideId}` as Href)}
        onViewRoute={() => router.push(`/carpool-detail?rideId=${item.rideId}` as Href)}
        isApproving={actioning[item.joinRequestId] === "approve"}
        isRejecting={actioning[item.joinRequestId] === "reject"}
      />
    );
  };

  const quickActions = [
    { icon: "plus.circle.fill" as const, label: "Create Ride", color: RQ.blue, bg: "#EFF6FF", onPress: () => router.push("/create-ride?flow=post" as Href) },
    { icon: "person.badge.plus" as const, label: "Invite Friends", color: RQ.purple, bg: RQ.purpleSoft, onPress: () => router.push("/referral" as Href) },
    ...(isApprovedDriver
      ? [{ icon: "car.fill" as const, label: "Driver Dashboard", color: RQ.orange, bg: RQ.orangeSoft, onPress: () => router.push("/driver/dashboard" as Href) }]
      : []),
    { icon: "clock.arrow.circlepath" as const, label: "Ride History", color: RQ.green, bg: RQ.greenSoft, onPress: () => router.push("/ride-history" as Href) },
    { icon: "info.circle" as const, label: "Support", color: RQ.textSecondary, bg: RQ.surfaceMuted, onPress: () => router.push("/help-support" as Href) },
  ];

  const CommandHeader = (
    <>
      <RequestsHeader
        pendingCount={pendingCount}
        totalCount={allRequests.length}
        isLoading={isLoading}
        onNotifications={() => router.push("/notifications" as Href)}
        onCreate={() => router.push("/create-ride?flow=post" as Href)}
      />
      <RequestsSegmentedControl active={activeTab} counts={counts} onChange={setActiveTab} />
      <RequestsAnalyticsDashboard
        total={allRequests.length}
        pending={counts.pending}
        accepted={counts.accepted}
        rejected={counts.rejected}
        acceptRate={acceptRate}
        todayCount={todayCount}
        weekCount={weekCount}
      />
      <RequestsQuickActions actions={quickActions} />
      <RequestsLiveInsights acceptRate={acceptRate} pendingCount={pendingCount} />
    </>
  );

  const emptySecondary = () => router.push("/help-support" as Href);
  const emptyPrimary = () => {
    if (activeTab === "accepted") setActiveTab("pending");
    else if (!hasPostedRides) router.push("/create-ride?flow=post" as Href);
  };

  return (
    <View style={{ flex: 1, backgroundColor: RQ.bg, paddingTop: insets.top }}>
      <StatusBar style="dark" />

      {isLoading && allRequests.length === 0 ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {CommandHeader}
          <View style={{ alignItems: "center", paddingVertical: 24, gap: 10 }}>
            <ActivityIndicator color={RQ.blue} size="large" />
            <Text style={{ fontSize: 14, color: RQ.textMuted }}>Loading requests…</Text>
          </View>
          <RequestsSkeletonList />
        </ScrollView>
      ) : activeTabItems.length === 0 ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
          {CommandHeader}
          {activeTab === "all" && !hasPostedRides ? (
            <RequestsOrganizerHub
              onPostRide={() => router.push("/create-ride?flow=post" as Href)}
              onHowItWorks={() => router.push("/help-support" as Href)}
            />
          ) : (
            <RequestsEmptyState
              tab={activeTab}
              hasPostedRides={hasPostedRides}
              onPrimary={emptyPrimary}
              onSecondary={emptySecondary}
              onEnableNotifications={() => router.push("/notifications" as Href)}
            />
          )}
          <RequestsBottomDock
            pendingCount={pendingCount}
            acceptRate={acceptRate}
            onTrustPress={() => router.push("/settings/privacy" as Href)}
          />
        </ScrollView>
      ) : (
        <FlatList<RequestListRow>
          data={listRows}
          keyExtractor={(row: RequestListRow) => row.key}
          ListHeaderComponent={CommandHeader}
          ListFooterComponent={
            <RequestsBottomDock
              pendingCount={pendingCount}
              acceptRate={acceptRate}
              onTrustPress={() => router.push("/settings/privacy" as Href)}
            />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          renderItem={({ item: row }: { item: RequestListRow }) => {
            if (row.kind === "header") return <RideSectionHeader section={row.section} />;
            return renderRequestCard(row.item);
          }}
        />
      )}
    </View>
  );
}
