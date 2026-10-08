import { and, eq } from "drizzle-orm";
import { driverAvailabilitySlots, driverScheduleSettings } from "../../drizzle/schema";
import { db } from "../db";

export type RideTypesAccepted = ("instant" | "scheduled" | "shared")[];

const DEFAULT_SETTINGS = {
  preferredPickupLat: null as number | null,
  preferredPickupLng: null as number | null,
  preferredPickupRadiusKm: 10,
  maxDistanceKm: 25,
  rideTypesAccepted: ["instant", "scheduled", "shared"] as RideTypesAccepted,
  scheduledRidesEnabled: true,
};

export async function getOrCreateScheduleSettings(driverId: number) {
  const [existing] = await db
    .select()
    .from(driverScheduleSettings)
    .where(eq(driverScheduleSettings.driverId, driverId))
    .limit(1);

  if (existing) {
    return {
      preferredPickupLat: existing.preferredPickupLat ? Number(existing.preferredPickupLat) : null,
      preferredPickupLng: existing.preferredPickupLng ? Number(existing.preferredPickupLng) : null,
      preferredPickupRadiusKm: Number(existing.preferredPickupRadiusKm ?? 10),
      maxDistanceKm: Number(existing.maxDistanceKm ?? 25),
      rideTypesAccepted: (existing.rideTypesAccepted as RideTypesAccepted) ?? DEFAULT_SETTINGS.rideTypesAccepted,
      scheduledRidesEnabled: existing.scheduledRidesEnabled ?? true,
    };
  }

  await db.insert(driverScheduleSettings).values({
    driverId,
    preferredPickupRadiusKm: String(DEFAULT_SETTINGS.preferredPickupRadiusKm),
    maxDistanceKm: String(DEFAULT_SETTINGS.maxDistanceKm),
    rideTypesAccepted: DEFAULT_SETTINGS.rideTypesAccepted,
    scheduledRidesEnabled: true,
  });

  return { ...DEFAULT_SETTINGS };
}

export async function updateScheduleSettings(
  driverId: number,
  patch: Partial<{
    preferredPickupLat: number | null;
    preferredPickupLng: number | null;
    preferredPickupRadiusKm: number;
    maxDistanceKm: number;
    rideTypesAccepted: RideTypesAccepted;
    scheduledRidesEnabled: boolean;
  }>,
) {
  await getOrCreateScheduleSettings(driverId);
  await db
    .update(driverScheduleSettings)
    .set({
      ...(patch.preferredPickupLat != null
        ? { preferredPickupLat: String(patch.preferredPickupLat) }
        : patch.preferredPickupLat === null
          ? { preferredPickupLat: null }
          : {}),
      ...(patch.preferredPickupLng != null
        ? { preferredPickupLng: String(patch.preferredPickupLng) }
        : patch.preferredPickupLng === null
          ? { preferredPickupLng: null }
          : {}),
      ...(patch.preferredPickupRadiusKm != null
        ? { preferredPickupRadiusKm: String(patch.preferredPickupRadiusKm) }
        : {}),
      ...(patch.maxDistanceKm != null ? { maxDistanceKm: String(patch.maxDistanceKm) } : {}),
      ...(patch.rideTypesAccepted ? { rideTypesAccepted: patch.rideTypesAccepted } : {}),
      ...(patch.scheduledRidesEnabled != null
        ? { scheduledRidesEnabled: patch.scheduledRidesEnabled }
        : {}),
      updatedAt: new Date(),
    } as any)
    .where(eq(driverScheduleSettings.driverId, driverId));

  return getOrCreateScheduleSettings(driverId);
}

export async function getAvailabilitySlots(driverId: number) {
  const rows = await db
    .select()
    .from(driverAvailabilitySlots)
    .where(eq(driverAvailabilitySlots.driverId, driverId))
    .orderBy(driverAvailabilitySlots.dayOfWeek, driverAvailabilitySlots.startTime);

  return rows.map((r) => ({
    slotId: r.slotId,
    slotType: r.slotType as "recurring" | "one_time",
    dayOfWeek: r.dayOfWeek,
    specificDate: r.specificDate?.toISOString() ?? null,
    startTime: r.startTime,
    endTime: r.endTime,
  }));
}

export async function addAvailabilitySlot(
  driverId: number,
  slot: {
    slotId: string;
    slotType: "recurring" | "one_time";
    dayOfWeek?: number | null;
    specificDate?: Date | null;
    startTime: string;
    endTime: string;
  },
) {
  await db.insert(driverAvailabilitySlots).values({
    driverId,
    slotId: slot.slotId,
    slotType: slot.slotType,
    dayOfWeek: slot.dayOfWeek ?? null,
    specificDate: slot.specificDate ?? null,
    startTime: slot.startTime,
    endTime: slot.endTime,
  });
  return slot;
}

export async function removeAvailabilitySlot(driverId: number, slotId: string) {
  await db
    .delete(driverAvailabilitySlots)
    .where(
      and(
        eq(driverAvailabilitySlots.driverId, driverId),
        eq(driverAvailabilitySlots.slotId, slotId),
      ),
    );
  return { success: true };
}

export async function getDriverSchedule(driverId: number) {
  const [settings, slots] = await Promise.all([
    getOrCreateScheduleSettings(driverId),
    getAvailabilitySlots(driverId),
  ]);
  return { settings, slots };
}
