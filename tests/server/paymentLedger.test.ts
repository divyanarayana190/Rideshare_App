import { describe, expect, it } from "vitest";
import {
  isRefundedStatus,
  isSucceededStatus,
  LEGACY_PAYMENTS_TABLE,
} from "../../server/services/paymentLedgerService";

describe("paymentLedgerService helpers", () => {
  it("treats succeeded and completed as paid", () => {
    expect(isSucceededStatus("succeeded")).toBe(true);
    expect(isSucceededStatus("completed")).toBe(true);
    expect(isSucceededStatus("pending")).toBe(false);
  });

  it("detects refunded statuses", () => {
    expect(isRefundedStatus("refunded")).toBe(true);
    expect(isRefundedStatus("partially_refunded")).toBe(true);
    expect(isRefundedStatus("succeeded")).toBe(false);
  });

  it("marks legacy table name for deprecation", () => {
    expect(LEGACY_PAYMENTS_TABLE).toBe("payments");
  });
});
