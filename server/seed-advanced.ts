/**
 * Seeds all new advanced admin tables with realistic sample data.
 * Run once: npx tsx server/seed-advanced.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  featureFlags, abTests, webhooks, pricingRules, incidents, incidentActions, fraudFlags,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

async function seed() {
  console.log("🌱 Seeding advanced admin tables…");

  // ── Feature Flags ──────────────────────────────────────────────────────────
  const existingFlags = await db.select({ id: featureFlags.id }).from(featureFlags).limit(1);
  if (existingFlags.length === 0) {
    await db.insert(featureFlags).values([
      {
        name: "New Ride UI",
        key: "new_ride_ui",
        description: "Redesigned booking flow with map-first UX and improved ETA display",
        enabled: true,
        rolloutPercent: 80,
        targeting: { allowlist: "", environments: "production,staging" },
      },
      {
        name: "Surge Notifications",
        key: "surge_notifications",
        description: "Notify users when surge pricing is active in their area before they book",
        enabled: true,
        rolloutPercent: 100,
        targeting: { allowlist: "", environments: "production" },
      },
      {
        name: "Driver Earnings Dashboard V2",
        key: "driver_earnings_v2",
        description: "New earnings dashboard with daily/weekly breakdowns and tip tracking",
        enabled: false,
        rolloutPercent: 20,
        targeting: { allowlist: "1,2,3", environments: "staging" },
      },
      {
        name: "Carpool Matching V3",
        key: "carpool_v3",
        description: "ML-based carpool matching algorithm replacing rule-based matcher",
        enabled: true,
        rolloutPercent: 50,
        targeting: { allowlist: "", environments: "production,staging" },
      },
      {
        name: "In-App Chat",
        key: "in_app_chat",
        description: "Real-time driver-passenger messaging during active rides",
        enabled: false,
        rolloutPercent: 10,
        targeting: { allowlist: "", environments: "staging" },
      },
      {
        name: "Scheduled Rides",
        key: "scheduled_rides",
        description: "Allow passengers to book rides up to 7 days in advance",
        enabled: true,
        rolloutPercent: 100,
        targeting: { allowlist: "", environments: "production,staging,dev" },
      },
    ]);
    console.log("  ✓ Feature flags seeded (6 flags)");
  } else {
    console.log("  • Feature flags already exist, skipping");
  }

  // ── A/B Tests ──────────────────────────────────────────────────────────────
  const existingTests = await db.select({ id: abTests.id }).from(abTests).limit(1);
  if (existingTests.length === 0) {
    await db.insert(abTests).values([
      {
        name: "Fare Display Format",
        hypothesis: "Showing upfront pricing with breakdown increases booking conversion by 12%",
        metric: "booking_conversion_rate",
        controlLabel: "control",
        variantLabel: "variant_a",
        sampleSize: 5000,
        status: "running" as const,
        startedAt: new Date(Date.now() - 7 * 86400000),
        controlValue: "0.6230",
        variantValue: "0.6890",
      },
      {
        name: "Driver ETA Precision",
        hypothesis: "Showing exact ETA seconds instead of rounded minutes reduces cancellations",
        metric: "cancellation_rate",
        controlLabel: "control",
        variantLabel: "exact_eta",
        sampleSize: 3000,
        status: "completed" as const,
        winner: "variant" as const,
        startedAt: new Date(Date.now() - 21 * 86400000),
        endedAt: new Date(Date.now() - 7 * 86400000),
        controlValue: "0.1820",
        variantValue: "0.1340",
        pValue: "0.0230",
      },
      {
        name: "Promo Banner Placement",
        hypothesis: "Placing promo codes at checkout increases promo redemption rate by 25%",
        metric: "promo_redemption_rate",
        controlLabel: "top_banner",
        variantLabel: "checkout_inline",
        sampleSize: 2000,
        status: "draft" as const,
      },
      {
        name: "Rating Prompt Timing",
        hypothesis: "Prompting for rating 2 hours after ride increases 5-star rate vs immediate prompt",
        metric: "avg_rating",
        controlLabel: "immediate",
        variantLabel: "delayed_2h",
        sampleSize: 4000,
        status: "running" as const,
        startedAt: new Date(Date.now() - 3 * 86400000),
        controlValue: "4.2100",
        variantValue: "4.5600",
      },
    ]);
    console.log("  ✓ A/B tests seeded (4 tests)");
  } else {
    console.log("  • A/B tests already exist, skipping");
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────
  const existingWebhooks = await db.select({ id: webhooks.id }).from(webhooks).limit(1);
  if (existingWebhooks.length === 0) {
    await db.insert(webhooks).values([
      ...(process.env.SLACK_OPS_WEBHOOK_URL
        ? [{
            name: "Slack Ops Alerts",
            url: process.env.SLACK_OPS_WEBHOOK_URL,
            events: ["ride.created", "incident.created", "incident.resolved", "payment.failed"],
            secret: "slack_webhook_secret_placeholder",
            isActive: true,
          }]
        : []),
      {
        name: "CRM Integration",
        url: "https://api.hubspot.com/crm/v3/objects/contacts/webhook",
        events: ["user.banned", "driver.approved", "driver.suspended"],
        secret: "crm_secret_key_placeholder",
        isActive: true,
      },
      {
        name: "Data Warehouse Pipeline",
        url: "https://ingest.analytics.example.com/events",
        events: ["ride.completed", "payment.succeeded", "payment.refunded"],
        secret: "warehouse_pipeline_secret",
        isActive: false,
      },
    ]);
    console.log(`  ✓ Webhooks seeded (${process.env.SLACK_OPS_WEBHOOK_URL ? 3 : 2} webhooks)`);
  } else {
    console.log("  • Webhooks already exist, skipping");
  }

  // ── Pricing Rules ──────────────────────────────────────────────────────────
  const existingRules = await db.select({ id: pricingRules.id }).from(pricingRules).limit(1);
  if (existingRules.length === 0) {
    await db.insert(pricingRules).values([
      {
        name: "Morning Rush Surge",
        description: "Weekday morning peak hours",
        conditions: { condition: "hour >= 7 AND hour <= 9", type: "time_based", startTime: "07:00", endTime: "09:00", daysOfWeek: "1,2,3,4,5", flatAdjustment: null, zoneIds: "" },
        multiplier: "1.50",
        cap: "2.50",
        priority: 10,
        isActive: true,
      },
      {
        name: "Evening Peak",
        description: "Weekday evening commute surge",
        conditions: { condition: "hour >= 17 AND hour <= 19", type: "time_based", startTime: "17:00", endTime: "19:00", daysOfWeek: "1,2,3,4,5", flatAdjustment: null, zoneIds: "" },
        multiplier: "1.40",
        cap: "2.00",
        priority: 9,
        isActive: true,
      },
      {
        name: "Weekend Night Surge",
        description: "Friday/Saturday night demand spike",
        conditions: { condition: "hour >= 22 OR hour <= 3", type: "time_based", startTime: "22:00", endTime: "03:00", daysOfWeek: "5,6", flatAdjustment: null, zoneIds: "" },
        multiplier: "2.00",
        cap: "3.00",
        priority: 15,
        isActive: true,
      },
      {
        name: "Airport Zone Premium",
        description: "Fixed premium for airport pickups/dropoffs",
        conditions: { condition: "zone = 'airport'", type: "zone_based", startTime: null, endTime: null, daysOfWeek: "", flatAdjustment: 300, zoneIds: "SFO,OAK,SJC" },
        multiplier: "1.00",
        cap: "1.50",
        priority: 5,
        isActive: true,
      },
      {
        name: "Bad Weather Discount",
        description: "Incentivize rides during rain/storms",
        conditions: { condition: "weather = 'rain'", type: "discount", startTime: null, endTime: null, daysOfWeek: "", flatAdjustment: -100, zoneIds: "" },
        multiplier: "0.90",
        cap: "1.00",
        priority: 3,
        isActive: false,
      },
    ]);
    console.log("  ✓ Pricing rules seeded (5 rules)");
  } else {
    console.log("  • Pricing rules already exist, skipping");
  }

  // ── Incidents ──────────────────────────────────────────────────────────────
  const existingIncidents = await db.select({ id: incidents.id }).from(incidents).limit(1);
  if (existingIncidents.length === 0) {
    const [r1] = await db.insert(incidents).values({
      title: "Driver App Crashes on iOS 17.4",
      severity: "sev2" as const,
      status: "investigating" as const,
      city: "San Francisco",
      description: "Multiple reports of driver app crashing when accepting rides on iOS 17.4. Affects approximately 15% of active drivers.",
      impact: "~150 affected drivers, estimated 40 lost rides/hour",
      createdBy: 1,
    });
    const inc1Id = (r1 as any).insertId;
    await db.insert(incidentActions).values([
      { incidentId: inc1Id, adminId: 1, adminEmail: "admin@yoo.app", action: "opened", details: "Incident reported by 12 drivers via support tickets" },
      { incidentId: inc1Id, adminId: 1, adminEmail: "admin@yoo.app", action: "update", details: "Engineering team notified. Isolating crash to ride acceptance callback" },
      { incidentId: inc1Id, adminId: 1, adminEmail: "admin@yoo.app", action: "update", details: "Identified null pointer in ride acceptance flow — fix in progress" },
    ]);

    const [r2] = await db.insert(incidents).values({
      title: "Stripe Webhook Delays — Payment Processing Lag",
      severity: "sev3" as const,
      status: "resolved" as const,
      city: null,
      description: "Stripe experiencing elevated webhook delivery delays (2-5 min) causing ride completion payments to lag.",
      impact: "Payment confirmations delayed, no revenue loss",
      resolvedAt: new Date(Date.now() - 2 * 3600000),
      createdBy: 1,
    });
    const inc2Id = (r2 as any).insertId;
    await db.insert(incidentActions).values([
      { incidentId: inc2Id, adminId: 1, adminEmail: "admin@yoo.app", action: "opened", details: "Monitoring alert triggered: payment webhook lag > 60s" },
      { incidentId: inc2Id, adminId: 1, adminEmail: "admin@yoo.app", action: "resolved", details: "Stripe confirmed resolution. All pending webhooks delivered." },
    ]);

    console.log("  ✓ Incidents seeded (2 incidents)");
  } else {
    console.log("  • Incidents already exist, skipping");
  }

  // ── Fraud Flags ────────────────────────────────────────────────────────────
  const existingFraud = await db.select({ id: fraudFlags.id }).from(fraudFlags).limit(1);
  if (existingFraud.length === 0) {
    await db.insert(fraudFlags).values([
      {
        userId: 1,
        flagType: "high_cancellation_rate",
        score: "82.00",
        signals: { total: 18, cancelled: 15, rate: 83, period: "7 days" },
        status: "open" as const,
      },
      {
        userId: 2,
        flagType: "immediate_promo_use",
        score: "55.00",
        signals: { promoCode: "WELCOME20", usedWithinSeconds: 45, accountAgeMinutes: 3 },
        status: "open" as const,
      },
      {
        userId: 3,
        flagType: "gps_anomaly",
        score: "91.00",
        signals: { zeroDistanceRides: 5, suspiciousRoutes: 2 },
        status: "blocked" as const,
        reviewNote: "Confirmed GPS spoofing — account blocked",
        reviewedAt: new Date(Date.now() - 86400000),
      },
    ]);
    console.log("  ✓ Fraud flags seeded (3 flags)");
  } else {
    console.log("  • Fraud flags already exist, skipping");
  }

  console.log("\n✅ Seed complete. Run 'pnpm dev:server' to start the server.\n");
  await pool.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
