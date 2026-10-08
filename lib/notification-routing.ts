type RouteTarget =
  | string
  | { pathname: string; params?: Record<string, string> };

type NotificationLike = {
  type?: string;
  deepLink?: string | null;
  data?: Record<string, unknown> | null;
  recipientRole?: string;
};

function route(target: RouteTarget): RouteTarget {
  return target;
}

/** Resolve the best in-app route for a notification tap. */
export function resolveNotificationHref(
  item: NotificationLike,
  isDriverView: boolean,
): RouteTarget | null {
  if (item.deepLink) return item.deepLink;

  const data = item.data ?? {};
  const rideId = data.rideId ? String(data.rideId) : null;
  const requestId = data.requestId ? String(data.requestId) : null;

  switch (item.type) {
    case "ride_request":
      if (isDriverView) {
        return requestId
          ? route({ pathname: "/driver/request-detail", params: { requestId, source: "broadcast" } })
          : route("/driver/(tabs)/requests");
      }
      return route("/(tabs)/requests");

    case "driver_assigned":
    case "driver_arrived":
    case "ride_started":
      return rideId
        ? route({ pathname: "/active-ride", params: { rideId } })
        : route("/active-ride");

    case "ride_completed":
    case "rating_request":
      return rideId
        ? route({ pathname: "/rate-ride-v2", params: { rideId } })
        : route("/(tabs)/rides");

    case "ride_cancelled":
      return isDriverView
        ? route("/driver/(tabs)/rides")
        : route("/(tabs)/requests");

    case "payment_received":
      return isDriverView
        ? route("/driver/(tabs)/earnings")
        : (rideId ? route({ pathname: "/trip-receipt", params: { rideId } }) : route("/wallet"));

    case "promo_code":
      return route("/wallet");

    case "system":
      if (data.notificationType === "payout_update") {
        return route("/driver/(tabs)/earnings");
      }
      if (data.notificationType === "scheduled_ride_reminder" && rideId) {
        return isDriverView
          ? route({ pathname: "/driver/ride-detail", params: { rideId } })
          : route({ pathname: "/ride-detail", params: { rideId } });
      }
      break;

    default:
      break;
  }

  if (rideId && isDriverView) {
    return route({ pathname: "/driver/ride-detail", params: { rideId } });
  }
  if (rideId) {
    return route({ pathname: "/ride-detail", params: { rideId } });
  }
  if (requestId && isDriverView) {
    return route("/driver/(tabs)/requests");
  }

  return null;
}
