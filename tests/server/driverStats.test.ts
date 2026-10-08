import { describe, expect, it } from "vitest";
import { rangeToSince } from "../../server/services/driverStatsService";

describe("driverStatsService", () => {
  it("rangeToSince returns start of today for today range", () => {
    const since = rangeToSince("today");
    expect(since).not.toBeNull();
    const now = new Date();
    expect(since!.getFullYear()).toBe(now.getFullYear());
    expect(since!.getMonth()).toBe(now.getMonth());
    expect(since!.getDate()).toBe(now.getDate());
  });

  it("rangeToSince returns null for all_time", () => {
    expect(rangeToSince("all_time")).toBeNull();
  });
});
