/**
 * Passenger Request Broadcast — Geofenced push to online drivers within radius.
 *
 * Flow:
 *   1. Bounding-box query on driverSessions (SQL-level filter)
 *   2. Exact Haversine filter for circle precision
 *   3. Fetch active push tokens for the in-range driver set
 *   4. WebSocket notification + persisted in-app notification + Expo push
 *
 * Returns the count of drivers notified so the caller can persist it.
 */

import { db } from "../db";
import { driverSessions, pushTokens } from "../../drizzle/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getWebSocketManager } from "./websocket";
import { notifyDriverPickupRequest } from "./userNotifications";

export interface PassengerBroadcastInput {
  requestId: string;
  passengerId: number;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress: string;
  passengerCount: number;
  offerPrice: number;
  distanceKm: number;
  radiusKm?: number;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function broadcastPassengerRequest(
  input: PassengerBroadcastInput,
): Promise<number> {
  const radius = input.radiusKm ?? 3;
  const latDelta = radius / 111;
  const lngDelta = radius / 85;
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);

  const candidates = await db
    .select({
      driverId: driverSessions.driverId,
      currentLat: driverSessions.currentLat,
      currentLng: driverSessions.currentLng,
    })
    .from(driverSessions)
    .where(
      and(
        eq(driverSessions.status, "online"),
        sql`${driverSessions.currentLat} BETWEEN ${input.pickupLat - latDelta} AND ${input.pickupLat + latDelta}`,
        sql`${driverSessions.currentLng} BETWEEN ${input.pickupLng - lngDelta} AND ${input.pickupLng + lngDelta}`,
        sql`${driverSessions.lastSeenAt} >= ${cutoff}`,
      ),
    )
    .limit(50);

  const inRange = candidates.filter((d) => {
    const dLat = parseFloat(String(d.currentLat ?? "0"));
    const dLng = parseFloat(String(d.currentLng ?? "0"));
    return haversineKm(input.pickupLat, input.pickupLng, dLat, dLng) <= radius;
  });

  if (inRange.length === 0) return 0;

  const driverIds = inRange.map((d) => d.driverId);
  const tokens = await db
    .select({ userId: pushTokens.userId, token: pushTokens.token })
    .from(pushTokens)
    .where(and(inArray(pushTokens.userId, driverIds), eq(pushTokens.isActive, true)));
  const tokenMap = new Map(tokens.map((t) => [t.userId, t.token]));

  const wsManager = getWebSocketManager();
  const pickupShort = input.pickupAddress.split(",")[0];
  const dropoffShort = input.dropoffAddress.split(",")[0];
  const paxLabel = `${input.passengerCount} passenger${input.passengerCount > 1 ? "s" : ""}`;

  let notified = 0;
  for (const driver of inRange) {
    wsManager?.sendNotification(driver.driverId, {
      id: `pr_${Date.now()}_${driver.driverId}`,
      userId: driver.driverId,
      type: "ride_match",
      title: "New pickup nearby",
      message: `${pickupShort} → ${dropoffShort} · $${input.offerPrice.toFixed(2)} · ${paxLabel}`,
      data: {
        requestId: input.requestId,
        eventType: "passenger_request_broadcast",
        offerPrice: input.offerPrice,
        passengerCount: input.passengerCount,
        pickupAddress: input.pickupAddress,
        dropoffAddress: input.dropoffAddress,
        recipientRole: "driver",
      },
      timestamp: Date.now(),
    });

    void notifyDriverPickupRequest(
      driver.driverId,
      {
        requestId: input.requestId,
        pickupAddress: input.pickupAddress,
        dropoffAddress: input.dropoffAddress,
        offerPrice: input.offerPrice,
        passengerCount: input.passengerCount,
      },
      tokenMap.get(driver.driverId) ?? null,
    );

    notified++;
  }

  return notified;
}
