import { describe, expect, it } from "vitest";
import {
  LEGAL_TABLES,
  PASSENGER_REQUEST_TABLES,
  PRODUCTION_REQUIRED_TABLES,
  STRIPE_TABLES,
} from "../../server/services/schemaHealth";

describe("PRODUCTION_REQUIRED_TABLES", () => {
  it("includes legal, passenger request, push, and credit redemption tables", () => {
    expect(PRODUCTION_REQUIRED_TABLES).toContain("legal_acceptances");
    expect(PRODUCTION_REQUIRED_TABLES).toContain("legal_policy_versions");
    expect(PRODUCTION_REQUIRED_TABLES).toContain("passenger_requests");
    expect(PRODUCTION_REQUIRED_TABLES).toContain("push_tokens");
    expect(PRODUCTION_REQUIRED_TABLES).toContain("credit_redemptions");
    for (const t of STRIPE_TABLES) {
      expect(PRODUCTION_REQUIRED_TABLES).toContain(t);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(PRODUCTION_REQUIRED_TABLES).size).toBe(PRODUCTION_REQUIRED_TABLES.length);
  });

  it("includes all Stripe tables in production required set", () => {
    for (const t of STRIPE_TABLES) {
      expect(PRODUCTION_REQUIRED_TABLES).toContain(t);
    }
  });

  it("defines legal and passenger request table groups", () => {
    expect(LEGAL_TABLES).toEqual(["legal_acceptances", "legal_policy_versions"]);
    expect(PASSENGER_REQUEST_TABLES).toEqual(["passenger_requests"]);
    expect(STRIPE_TABLES.length).toBe(7);
  });
});
