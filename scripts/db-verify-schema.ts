/**
 * Read-only production schema verification.
 * Validates Stripe, legal, passenger-request, and core production tables.
 *
 * Usage:
 *   pnpm db:verify-schema
 *   pnpm db:verify-schema --json
 */
import "dotenv/config";
import {
  checkProductionSchemaHealth,
  STRIPE_TABLES,
  LEGAL_TABLES,
  PASSENGER_REQUEST_TABLES,
  verifyTableGroup,
} from "../server/services/schemaHealth";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[db:verify-schema] DATABASE_URL is required");
    process.exit(1);
  }

  const json = process.argv.includes("--json");
  const health = await checkProductionSchemaHealth();
  const stripe = await verifyTableGroup(STRIPE_TABLES);
  const legal = await verifyTableGroup(LEGAL_TABLES);
  const passenger = await verifyTableGroup(PASSENGER_REQUEST_TABLES);

  const report = {
    ok: health.ok && stripe.ok && legal.ok && passenger.ok,
    production: health,
    stripe,
    legal,
    passengerRequests: passenger,
    checkedAt: new Date().toISOString(),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("=== YOO Schema Verification ===\n");
    printGroup("Production required", health.ok, health.missingTables, health.warnings);
    printGroup("Stripe tables", stripe.ok, stripe.missing, stripe.present);
    printGroup("Legal tables", legal.ok, legal.missing, legal.present);
    printGroup("Passenger request tables", passenger.ok, passenger.missing, passenger.present);
    console.log(`\nOverall: ${report.ok ? "PASS" : "FAIL"}`);
  }

  process.exit(report.ok ? 0 : 1);
}

function printGroup(
  label: string,
  ok: boolean,
  missing: string[],
  extra: string[] | string[],
) {
  console.log(`${label}: ${ok ? "✓ OK" : "✗ FAIL"}`);
  if (missing.length > 0) console.log(`  Missing: ${missing.join(", ")}`);
  if (Array.isArray(extra) && extra.length > 0 && ok) {
    console.log(`  Present (${extra.length}): ${extra.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("[db:verify-schema] Error:", err);
  process.exit(1);
});
