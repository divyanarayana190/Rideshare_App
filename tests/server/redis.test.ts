import { describe, it, expect } from "vitest";
import { getRedisUrlAudit } from "@/server/redis";

describe("redis integration audit", () => {
  it("getRedisUrlAudit reports REDIS_URL env var usage", () => {
    const audit = getRedisUrlAudit();
    expect(audit.envVarName).toBe("REDIS_URL");
    expect(typeof audit.configuredViaEnv).toBe("boolean");
    expect(audit.connectionTarget).not.toContain("password");
  });

  it("redacts credentials from connection target", () => {
    const prev = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://:secretpass@redis.example.com:6379/0";
    const audit = getRedisUrlAudit();
    expect(audit.connectionTarget).toContain("***");
    expect(audit.connectionTarget).not.toContain("secretpass");
    if (prev !== undefined) process.env.REDIS_URL = prev;
    else delete process.env.REDIS_URL;
  });
});
