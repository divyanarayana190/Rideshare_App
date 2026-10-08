import { describe, expect, it } from "vitest";
import { capCreditReserveAmount } from "../../server/services/walletCreditService";

describe("capCreditReserveAmount", () => {
  it("caps requested credits to server maximum", () => {
    expect(capCreditReserveAmount(500, 300)).toBe(300);
  });

  it("returns 0 when nothing requested or available", () => {
    expect(capCreditReserveAmount(0, 300)).toBe(0);
    expect(capCreditReserveAmount(200, 0)).toBe(0);
  });

  it("passes through when under cap", () => {
    expect(capCreditReserveAmount(150, 300)).toBe(150);
  });
});
