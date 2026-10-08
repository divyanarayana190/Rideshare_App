/**
 * Socket.IO operational metrics (in-process counters).
 */
const eventCounts = new Map<string, number>();
let messagesLastMinute = 0;
let eventsLastMinute = 0;
let reconnectCount = 0;
let failedConnections = 0;
let droppedConnections = 0;
let minuteTick = Date.now();

const EVENT_LABELS = [
  "ride_request",
  "ride_accepted",
  "driver_location",
  "trip_started",
  "trip_completed",
  "notification_sent",
  "join_ride",
  "chat_message",
] as const;

function rollMinute() {
  const now = Date.now();
  if (now - minuteTick >= 60_000) {
    messagesLastMinute = 0;
    eventsLastMinute = 0;
    minuteTick = now;
  }
}

export function recordSocketEvent(event: string, isMessage = false) {
  rollMinute();
  eventsLastMinute++;
  if (isMessage) messagesLastMinute++;
  const key = normalizeEvent(event);
  eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1);
}

export function normalizeEvent(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("location")) return "driver_location";
  if (e.includes("ride_request") || e.includes("driver:request")) return "ride_request";
  if (e.includes("accept")) return "ride_accepted";
  if (e.includes("started") || e.includes("ride_started")) return "trip_started";
  if (e.includes("completed")) return "trip_completed";
  if (e.includes("notification")) return "notification_sent";
  return event.slice(0, 40);
}

export function recordSocketConnect() {
  rollMinute();
  eventsLastMinute++;
}

export function recordSocketReconnect() {
  reconnectCount++;
  recordSocketConnect();
}

export function recordSocketFailedConnect() {
  failedConnections++;
}

export function recordSocketDisconnect(reason: string) {
  if (reason === "transport close" || reason === "ping timeout") {
    droppedConnections++;
  }
}

export function getSocketMetricsSnapshot() {
  const topEvents = [...eventCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([event, count]) => ({ event, count }));

  const labeled = EVENT_LABELS.map((event) => ({
    event,
    count: eventCounts.get(event) ?? 0,
  }));

  return {
    messagesPerMinute: messagesLastMinute,
    eventsPerMinute: eventsLastMinute,
    reconnectCount,
    failedConnections,
    droppedConnections,
    topEvents,
    labeledEvents: labeled,
    totalEventsTracked: [...eventCounts.values()].reduce((a, b) => a + b, 0),
  };
}

export function resetSocketMinuteCounters() {
  messagesLastMinute = 0;
  eventsLastMinute = 0;
  minuteTick = Date.now();
}
