import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ActivityIndicator, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/ui/ErrorState";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useNotification } from "@/lib/use-notification";
import { trpc } from "@/lib/trpc";
import type { NotificationRole } from "@/lib/use-role-notification-count";
import { formatDistanceToNow } from "@/lib/utils";
import { resolveNotificationHref } from "@/lib/notification-routing";

// Track which join requests have been acted on (optimistic)
const actedRequests = new Set<string>();

// Map backend notification types → icon + color
const TYPE_META: Record<string, { icon: IconSymbolName; colorKey: "primary" | "success" | "error" }> = {
  ride_request:     { icon: "car.fill",               colorKey: "primary" },
  driver_assigned:  { icon: "car.fill",               colorKey: "primary" },
  driver_arrived:   { icon: "mappin",                 colorKey: "success" },
  ride_started:     { icon: "road.lanes",             colorKey: "primary" },
  ride_completed:   { icon: "checkmark.circle.fill",  colorKey: "success" },
  ride_cancelled:   { icon: "xmark.circle.fill",      colorKey: "error" },
  payment_received: { icon: "dollarsign.circle.fill", colorKey: "success" },
  rating_request:   { icon: "star.fill",              colorKey: "primary" },
  promo_code:       { icon: "tag.fill",               colorKey: "primary" },
  system:           { icon: "bell.fill",              colorKey: "primary" },
  safety_alert:     { icon: "shield.fill",            colorKey: "error" },
};

export default function NotificationsScreen() {
  const colors = useColors();
  const notify = useNotification();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const audience: NotificationRole = roleParam === "driver" ? "driver" : "passenger";
  const isDriverView = audience === "driver";

  const { data, isLoading, isError, refetch, isRefetching } = trpc.notifications.getAll.useQuery(
    { limit: 50, role: audience },
    { refetchInterval: 30_000, staleTime: 15_000 },
  );
  const invalidateNotifs = () => {
    void utils.notifications.getAll.invalidate({ role: audience });
    void utils.notifications.unreadCount.invalidate({ role: audience });
  };
  const markRead = trpc.notifications.markRead.useMutation({ onSettled: invalidateNotifs } as any);
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSettled: invalidateNotifs } as any);
  const removeNotif = trpc.notifications.remove.useMutation({ onSettled: invalidateNotifs } as any);
  const clearAll = trpc.notifications.clearAll.useMutation({ onSettled: invalidateNotifs } as any);

  const approveMut = trpc.rides.approveMidRideJoin.useMutation({ onSettled: invalidateNotifs } as any);
  const rejectMut = trpc.rides.rejectMidRideJoin.useMutation({ onSettled: invalidateNotifs } as any);

  const handleApprove = async (joinRequestId: string, notifId: string) => {
    setPendingAction(joinRequestId + ":approve");
    try {
      await approveMut.mutateAsync({ joinRequestId } as any);
      actedRequests.add(joinRequestId);
      markRead.mutate({ notificationId: notifId } as any);
    } catch (e: any) {
      notify.showError(e?.message ?? "Failed to approve request.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleReject = async (joinRequestId: string, notifId: string) => {
    setPendingAction(joinRequestId + ":reject");
    try {
      await rejectMut.mutateAsync({ joinRequestId } as any);
      actedRequests.add(joinRequestId);
      markRead.mutate({ notificationId: notifId } as any);
    } catch (e: any) {
      notify.showError(e?.message ?? "Failed to reject request.");
    } finally {
      setPendingAction(null);
    }
  };

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  const getIconColor = (type: string) => {
    const meta = TYPE_META[type];
    if (!meta) return colors.primary;
    return colors[meta.colorKey] ?? colors.primary;
  };

  const getIcon = (type: string): IconSymbolName =>
    TYPE_META[type]?.icon ?? ("bell.fill" as IconSymbolName);

  const handleClearAll = () => {
    const doClear = () => clearAll.mutate({ role: audience } as any);
    if (Platform.OS === "web") {
      if (window.confirm("Clear all notifications? This cannot be undone.")) {
        doClear();
      }
    } else {
      Alert.alert("Clear All", "Clear all notifications? This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: doClear },
      ]);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
            {isDriverView ? "Driver Notifications" : "Notifications"}
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={{ fontSize: 11, color: "#fff", fontWeight: "700" }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => markAllRead.mutate({ role: audience } as any)}
          disabled={unreadCount === 0 || markAllRead.isPending}
        >
          <Text style={{ fontSize: 13, color: unreadCount > 0 ? colors.primary : colors.muted, fontWeight: "600" }}>
            {markAllRead.isPending ? "…" : "Mark all read"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Clear all bar */}
      {notifications.length > 0 && (
        <View style={[styles.clearBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
          </Text>
          <TouchableOpacity
            onPress={handleClearAll}
            disabled={clearAll.isPending}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <IconSymbol name="trash" size={14} color={colors.error} />
            <Text style={{ fontSize: 13, color: colors.error, fontWeight: "600" }}>
              {clearAll.isPending ? "Clearing…" : "Clear all"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isError ? (
        <ErrorState
          title="Could not load notifications"
          message="Pull to refresh or tap try again."
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 }}>
          <IconSymbol name="bell.slash.fill" size={52} color={colors.muted} />
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
            No notifications yet
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
            {isDriverView
              ? "You'll see pickup requests, ride reminders, cancellations, and earnings updates here."
              : "We'll notify you when your driver is assigned, arrives, or when your ride is complete."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item: any) => item.notificationId}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item }: { item: any }) => {
            const iconColor = getIconColor(item.type);
            return (
              <TouchableOpacity
                style={[
                  styles.notifRow,
                  {
                    backgroundColor: item.isRead ? colors.surface : colors.primary + "08",
                    borderBottomColor: colors.border,
                  },
                ]}
                onPress={() => {
                  if (!item.isRead) markRead.mutate({ notificationId: item.notificationId });
                  const href = resolveNotificationHref(item, isDriverView);
                  if (href) router.push(href as any);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconContainer, { backgroundColor: iconColor + "18" }]}>
                  <IconSymbol name={getIcon(item.type)} size={22} color={iconColor} />
                </View>

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: item.isRead ? "600" : "700",
                        color: colors.foreground,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    {!item.isRead && (
                      <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <Text
                    style={{ fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 }}
                    numberOfLines={2}
                  >
                    {item.body}
                  </Text>

                  {/* Inline approve / reject for join requests */}
                  {item.type === "ride_request" && item.data?.joinRequestId && !actedRequests.has(item.data.joinRequestId) && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: colors.success ?? "#16A34A", borderRadius: 8, paddingVertical: 7, alignItems: "center" }}
                        onPress={() => handleApprove(item.data.joinRequestId, item.notificationId)}
                        disabled={pendingAction != null}
                      >
                        {pendingAction === item.data.joinRequestId + ":approve"
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Accept</Text>
                        }
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: colors.error + "18", borderRadius: 8, paddingVertical: 7, alignItems: "center", borderWidth: 1, borderColor: colors.error }}
                        onPress={() => handleReject(item.data.joinRequestId, item.notificationId)}
                        disabled={pendingAction != null}
                      >
                        {pendingAction === item.data.joinRequestId + ":reject"
                          ? <ActivityIndicator size="small" color={colors.error} />
                          : <Text style={{ color: colors.error, fontSize: 13, fontWeight: "700" }}>Decline</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  )}

                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 5, fontWeight: "600" }}>
                    {formatDistanceToNow(new Date(item.createdAt))}
                  </Text>
                </View>

                {/* Delete button */}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={(e: any) => {
                    e.stopPropagation?.();
                    removeNotif.mutate({ notificationId: item.notificationId });
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <IconSymbol name="xmark" size={14} color={colors.muted} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  clearBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
});
