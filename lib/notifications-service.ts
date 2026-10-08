// Push Notifications Service
// Handles local and remote push notifications using expo-notifications
// Integrates with Firebase Cloud Messaging for production

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: string;
  badge?: number;
}

export interface NotificationResponse {
  notification: PushNotification;
  actionId?: string;
}

// ============================================================================
// Notifications Manager
// ============================================================================

export class NotificationsManager {
  private static instance: NotificationsManager;
  private notificationHandlers: Map<string, (notification: NotificationResponse) => void> = new Map();
  private expoPushToken: string | null = null;

  private constructor() {
    this.initializeNotifications();
  }

  public static getInstance(): NotificationsManager {
    if (!NotificationsManager.instance) {
      NotificationsManager.instance = new NotificationsManager();
    }
    return NotificationsManager.instance;
  }

  private initializeNotifications(): void {
    try {
      // In production: import * as Notifications from "expo-notifications";
      // Notifications.setNotificationHandler({
      //   handleNotification: async () => ({
      //     shouldShowAlert: true,
      //     shouldPlaySound: true,
      //     shouldSetBadge: true,
      //   }),
      // });
      console.log("[Notifications] Manager initialized");
    } catch (error) {
      console.error("[Notifications] Error initializing:", error);
    }
  }

  // ============================================================================
  // Get Device Token
  // ============================================================================

  public async getExpoPushToken(): Promise<string | null> {
    try {
      // In production:
      // const token = (await Notifications.getExpoPushTokenAsync()).data;
      // this.expoPushToken = token;
      // return token;

      // For now, generate a mock token
      this.expoPushToken = `ExponentPushToken[${Math.random().toString(36).substr(2, 9)}]`;
      console.log("[Notifications] Expo push token:", this.expoPushToken);
      return this.expoPushToken;
    } catch (error) {
      console.error("[Notifications] Error getting push token:", error);
      return null;
    }
  }

  public getStoredToken(): string | null {
    return this.expoPushToken;
  }

  // ============================================================================
  // Send Local Notifications
  // ============================================================================

  public async sendLocalNotification(notification: PushNotification): Promise<string | null> {
    try {
      // In production:
      // const notificationId = await Notifications.scheduleNotificationAsync({
      //   content: {
      //     title: notification.title,
      //     body: notification.body,
      //     data: notification.data || {},
      //     sound: notification.sound || "default",
      //     badge: notification.badge || 1,
      //   },
      //   trigger: null, // Send immediately
      // });
      // return notificationId;

      console.log("[Notifications] Sending local notification:", notification);
      return `notif_${Date.now()}`;
    } catch (error) {
      console.error("[Notifications] Error sending local notification:", error);
      return null;
    }
  }

  public async scheduleNotification(
    notification: PushNotification,
    delaySeconds: number
  ): Promise<string | null> {
    try {
      // In production:
      // const notificationId = await Notifications.scheduleNotificationAsync({
      //   content: {
      //     title: notification.title,
      //     body: notification.body,
      //     data: notification.data || {},
      //     sound: notification.sound || "default",
      //   },
      //   trigger: { seconds: delaySeconds },
      // });
      // return notificationId;

      console.log(`[Notifications] Scheduling notification in ${delaySeconds}s:`, notification);
      return `notif_${Date.now()}`;
    } catch (error) {
      console.error("[Notifications] Error scheduling notification:", error);
      return null;
    }
  }

  // ============================================================================
  // Notification Handlers
  // ============================================================================

  public registerNotificationHandler(
    eventType: string,
    handler: (notification: NotificationResponse) => void
  ): void {
    try {
      this.notificationHandlers.set(eventType, handler);
      console.log(`[Notifications] Registered handler for ${eventType}`);

      // In production:
      // if (eventType === "received") {
      //   this.notificationReceivedSubscription = Notifications.addNotificationReceivedListener(
      //     (notification) => {
      //       handler({
      //         notification: {
      //           id: notification.request.identifier,
      //           title: notification.request.content.title || "",
      //           body: notification.request.content.body || "",
      //           data: notification.request.content.data,
      //         },
      //       });
      //     }
      //   );
      // } else if (eventType === "response") {
      //   this.notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener(
      //     (response) => {
      //       handler({
      //         notification: {
      //           id: response.notification.request.identifier,
      //           title: response.notification.request.content.title || "",
      //           body: response.notification.request.content.body || "",
      //           data: response.notification.request.content.data,
      //         },
      //         actionId: response.actionId,
      //       });
      //     }
      //   );
      // }
    } catch (error) {
      console.error("[Notifications] Error registering handler:", error);
    }
  }

  // ============================================================================
  // Ride Notifications
  // ============================================================================

  public async notifyRideMatched(driverName: string, eta: number): Promise<void> {
    try {
      await this.sendLocalNotification({
        id: `ride_matched_${Date.now()}`,
        title: "Ride Matched! 🎉",
        body: `${driverName} is on the way. ETA: ${eta} minutes`,
        data: { type: "ride_matched" },
        sound: "default",
        badge: 1,
      });
    } catch (error) {
      console.error("[Notifications] Error notifying ride matched:", error);
    }
  }

  public async notifyDriverArrived(driverName: string): Promise<void> {
    try {
      await this.sendLocalNotification({
        id: `driver_arrived_${Date.now()}`,
        title: "Driver Arrived 🚗",
        body: `${driverName} has arrived. Please come out.`,
        data: { type: "driver_arrived" },
        sound: "default",
        badge: 2,
      });
    } catch (error) {
      console.error("[Notifications] Error notifying driver arrived:", error);
    }
  }

  public async notifyRideStarted(): Promise<void> {
    try {
      await this.sendLocalNotification({
        id: `ride_started_${Date.now()}`,
        title: "Ride Started",
        body: "Your ride is now in progress. Enjoy the journey!",
        data: { type: "ride_started" },
      });
    } catch (error) {
      console.error("[Notifications] Error notifying ride started:", error);
    }
  }

  public async notifyRideCompleted(fare: number, savings: number): Promise<void> {
    try {
      await this.sendLocalNotification({
        id: `ride_completed_${Date.now()}`,
        title: "Ride Completed ✓",
        body: `Fare: $${fare.toFixed(2)} | You saved: $${savings.toFixed(2)}`,
        data: { type: "ride_completed", fare, savings },
        sound: "default",
      });
    } catch (error) {
      console.error("[Notifications] Error notifying ride completed:", error);
    }
  }

  public async notifyPaymentReceived(amount: number): Promise<void> {
    try {
      await this.sendLocalNotification({
        id: `payment_received_${Date.now()}`,
        title: "Payment Received 💰",
        body: `$${amount.toFixed(2)} has been added to your wallet`,
        data: { type: "payment_received", amount },
        sound: "default",
      });
    } catch (error) {
      console.error("[Notifications] Error notifying payment received:", error);
    }
  }

  public async notifyRatingRequest(userName: string): Promise<void> {
    try {
      await this.sendLocalNotification({
        id: `rating_request_${Date.now()}`,
        title: "Rate Your Experience",
        body: `How was your ride with ${userName}?`,
        data: { type: "rating_request" },
      });
    } catch (error) {
      console.error("[Notifications] Error notifying rating request:", error);
    }
  }

  public async notifyPromoApplied(discount: string): Promise<void> {
    try {
      await this.sendLocalNotification({
        id: `promo_applied_${Date.now()}`,
        title: "Promo Applied! 🎁",
        body: `You saved ${discount} on this ride`,
        data: { type: "promo_applied", discount },
        sound: "default",
      });
    } catch (error) {
      console.error("[Notifications] Error notifying promo applied:", error);
    }
  }

  public async notifyEmergencyAlert(message: string): Promise<void> {
    try {
      await this.sendLocalNotification({
        id: `emergency_alert_${Date.now()}`,
        title: "Emergency Alert ⚠️",
        body: message,
        data: { type: "emergency_alert" },
        sound: "default",
        badge: 99,
      });
    } catch (error) {
      console.error("[Notifications] Error notifying emergency alert:", error);
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  public async cancelNotification(notificationId: string): Promise<void> {
    try {
      // In production:
      // await Notifications.dismissNotificationAsync(notificationId);
      console.log(`[Notifications] Cancelled notification: ${notificationId}`);
    } catch (error) {
      console.error("[Notifications] Error cancelling notification:", error);
    }
  }

  public async cancelAllNotifications(): Promise<void> {
    try {
      // In production:
      // await Notifications.dismissAllNotificationsAsync();
      console.log("[Notifications] Cancelled all notifications");
    } catch (error) {
      console.error("[Notifications] Error cancelling all notifications:", error);
    }
  }
}

// Export singleton instance
export function getNotificationsManager(): NotificationsManager {
  return NotificationsManager.getInstance();
}
