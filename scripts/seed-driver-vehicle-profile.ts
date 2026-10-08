#!/usr/bin/env tsx
/**
 * Backfill driver vehicle profile fields for approved applications missing
 * photo URL, fuel type, or seat count. Safe to run multiple times.
 *
 * Usage: pnpm tsx scripts/seed-driver-vehicle-profile.ts
 */
import { desc, eq, isNull, or } from "drizzle-orm";
import { driverApplications } from "../drizzle/schema";
import { db } from "../server/db";

const SEATS_BY_TYPE: Record<string, number> = {
  sedan: 5,
  suv: 5,
  van: 7,
  truck: 3,
  luxury: 4,
};

function inferFuelType(make: string, model: string): "electric" | "hybrid" | "gasoline" {
  const haystack = `${make} ${model}`.toLowerCase();
  if (["tesla", "rivian", "lucid", "polestar"].some((m) => haystack.includes(m))) return "electric";
  if (haystack.includes("hybrid") || haystack.includes("prius")) return "hybrid";
  return "gasoline";
}

async function main() {
  const rows = await db
    .select()
    .from(driverApplications)
    .where(
      or(
        isNull(driverApplications.vehiclePhotoUrl),
        isNull(driverApplications.fuelType),
        isNull(driverApplications.seatCount),
      ),
    )
    .orderBy(desc(driverApplications.createdAt));

  let updated = 0;
  for (const app of rows) {
    const fuelType = app.fuelType ?? inferFuelType(app.vehicleMake, app.vehicleModel);
    const seatCount = app.seatCount ?? SEATS_BY_TYPE[app.vehicleType] ?? 5;
    const makeLower = app.vehicleMake.toLowerCase();
    const modelLower = app.vehicleModel.toLowerCase();
    const vehiclePhotoUrl =
      app.vehiclePhotoUrl ??
      (makeLower.includes("tesla") && modelLower.includes("model 3")
        ? "/assets/vehicles/tesla-model-3.png"
        : null);

    await db
      .update(driverApplications)
      .set({
        fuelType,
        seatCount,
        ...(vehiclePhotoUrl ? { vehiclePhotoUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(driverApplications.id, app.id));
    updated += 1;
    console.log(`Updated application ${app.applicationId} (${app.vehicleMake} ${app.vehicleModel})`);
  }

  console.log(`Done. Updated ${updated} driver application(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
