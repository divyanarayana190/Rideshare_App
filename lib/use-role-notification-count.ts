import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useRideEvents } from "@/lib/use-ride-events";

export type NotificationRole = "passenger" | "driver";

/** Role-scoped unread notification count with SSE invalidation. */
export function useRoleNotificationCount(
  role: NotificationRole,
  enabled = true,
  refetchInterval = 15_000,
) {
  const utils = trpc.useUtils();
  const { lastNotification } = useRideEvents();

  const query = trpc.notifications.unreadCount.useQuery(
    { role },
    {
      enabled,
      staleTime: 10_000,
      refetchInterval: enabled ? refetchInterval : false,
    },
  );

  useEffect(() => {
    if (!lastNotification || !enabled) return;
    const eventRole = lastNotification.data?.recipientRole as NotificationRole | undefined;
    if (eventRole && eventRole !== role) return;
    void utils.notifications.unreadCount.invalidate({ role });
    void utils.notifications.getAll.invalidate({ role });
  }, [lastNotification, role, enabled, utils.notifications.unreadCount, utils.notifications.getAll]);

  return query;
}
