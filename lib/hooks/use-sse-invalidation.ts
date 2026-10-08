import { useRideEvents } from "@/lib/ride-events-context";
import { trpc } from "@/lib/trpc";
import { useEffect } from "react";

/** Invalidate driver/passenger queries when SSE pushes ride or notification events. */
export function useSseInvalidation(role: "driver" | "passenger" = "passenger") {
  const utils = trpc.useUtils();
  const { lastRideUpdate, lastNotification, lastRequestMatched } = useRideEvents();

  useEffect(() => {
    if (!lastRideUpdate) return;
    void utils.rides.getRide.invalidate();
    void utils.rides.myRides.invalidate();
    if (role === "driver") {
      void utils.driver.getDriverRides.invalidate();
      void utils.driver.getDashboardStats.invalidate();
    }
  }, [lastRideUpdate?.timestamp, role, utils]);

  useEffect(() => {
    if (!lastNotification) return;
    void utils.notifications.getAll.invalidate();
    void utils.notifications.unreadCount.invalidate();
    if (role === "driver") {
      void utils.notifications.getDriverNotifications?.invalidate?.();
    }
  }, [lastNotification, role, utils]);

  useEffect(() => {
    if (!lastRequestMatched || role !== "driver") return;
    void utils.driver.getRideRequests.invalidate();
    void utils.driver.getPendingRequest.invalidate();
    void utils.driver.getNearbyPassengerRequests?.invalidate?.();
  }, [lastRequestMatched, role, utils]);
}
