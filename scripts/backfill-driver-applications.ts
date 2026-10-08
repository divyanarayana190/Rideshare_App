#!/usr/bin/env tsx
/**
 * Backfill approved driver_applications records for users who have
 * userProfiles.isDriver = true but no approved application row.
 *
 * Root cause this fixes:
 *   The admin dashboard's "Driver Access" toggle only wrote to user_profiles.isDriver.
 *   The mobile app's getDriverAccessStatus() reads ONLY from driver_applications.status.
 *   Users set as drivers by an admin therefore saw "Become a Driver" on mobile.
 *
 * Safe to run multiple times (idempotent — skips users that already have an
 * approved application).
 *
 * Usage:
 *   pnpm tsx scripts/backfill-driver-applications.ts
 *   pnpm tsx scripts/backfill-driver-applications.ts --dry-run
 */

import { and, desc, eq, ne } from "drizzle-orm";
import crypto from "crypto";
import { driverApplications, userProfiles, users } from "../drizzle/schema";
import { db } from "../server/db";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n=== Driver Application Backfill ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  // Find all profiles where isDriver = true
  const driverProfiles = await db
    .select({
      userId: userProfiles.userId,
      isDriver: userProfiles.isDriver,
    })
    .from(userProfiles)
    .where(eq(userProfiles.isDriver, true));

  console.log(`Found ${driverProfiles.length} user(s) with isDriver = true`);

  let skipped = 0;
  let created = 0;
  let promoted = 0;

  for (const profile of driverProfiles) {
    const userId = profile.userId;

    // Check for an existing approved application
    const [latestApp] = await db
      .select({
        applicationId: driverApplications.applicationId,
        status: driverApplications.status,
      })
      .from(driverApplications)
      .where(eq(driverApplications.userId, userId))
      .orderBy(desc(driverApplications.createdAt))
      .limit(1);

    if (latestApp?.status === "approved") {
      console.log(`  [SKIP]    userId=${userId} — already has approved application ${latestApp.applicationId}`);
      skipped++;
      continue;
    }

    // Look up the user's name for the fullName field
    const [userRow] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const now = new Date();

    if (!latestApp) {
      // No application at all — create a synthetic approved record
      const applicationId = crypto.randomUUID();
      console.log(`  [CREATE]  userId=${userId} name="${userRow?.name}" — inserting synthetic approved application ${applicationId}`);
      if (!DRY_RUN) {
        await db.insert(driverApplications).values({
          applicationId,
          userId,
          fullName: userRow?.name || "Admin Approved Driver",
          phoneNumber: "",
          licenseNumber: "ADMIN_BACKFILL",
          licenseState: "N/A",
          licenseExpiry: "N/A",
          vehicleMake: "N/A",
          vehicleModel: "N/A",
          vehicleYear: new Date().getFullYear(),
          vehicleColor: "N/A",
          plateNumber: "N/A",
          vehicleType: "sedan",
          insurancePolicyNumber: "N/A",
          insuranceProvider: "N/A",
          insuranceExpiry: "N/A",
          status: "approved",
          reviewedAt: now,
          approvedAt: now,
        } as any);
      }
      created++;
    } else {
      // Has an application in another status (pending, rejected, etc.) — promote it
      console.log(`  [PROMOTE] userId=${userId} name="${userRow?.name}" — updating application ${latestApp.applicationId} from "${latestApp.status}" → "approved"`);
      if (!DRY_RUN) {
        await db
          .update(driverApplications)
          .set({
            status: "approved",
            reviewedAt: now,
            approvedAt: now,
            actionRequiredReason: null,
          } as any)
          .where(eq(driverApplications.applicationId, latestApp.applicationId));
      }
      promoted++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Skipped (already approved): ${skipped}`);
  console.log(`  Created new applications:   ${created}`);
  console.log(`  Promoted existing apps:     ${promoted}`);
  console.log(`  Total processed:            ${driverProfiles.length}`);
  if (DRY_RUN) {
    console.log(`\n  This was a DRY RUN — no changes were written to the DB.`);
    console.log(`  Re-run without --dry-run to apply.\n`);
  } else {
    console.log(`\n  Done. Affected users should now see "Switch to Driver Mode" in the mobile app.\n`);
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
