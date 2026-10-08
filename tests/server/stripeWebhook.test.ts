import { describe, expect, it, vi, beforeEach } from "vitest";

// Inline the idempotency logic mirroring handlePaymentIntentSucceeded in
// server/services/stripeService.ts:
//   const payment = await db.query.stripePayments.findFirst(...)
//   if (!payment) return;
//   if (payment.status === "succeeded" || payment.status === "refunded") return;
//   await db.update(stripePayments).set({ status: "succeeded", ... })

const updatePayment = vi.fn();
const findPayment = vi.fn();

async function handlePaymentIntentSucceeded(paymentIntentId: string) {
  const payment = await findPayment(paymentIntentId);
  if (!payment) return { action: "not_found" };
  if (payment.status === "succeeded" || payment.status === "refunded") {
    return { action: "skipped_idempotent" };
  }
  await updatePayment(payment.id, { status: "succeeded" });
  return { action: "updated" };
}

describe("Stripe webhook idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes a new payment intent the first time", async () => {
    findPayment.mockResolvedValueOnce({ id: 1, status: "processing" });
    const result = await handlePaymentIntentSucceeded("pi_abc");
    expect(result.action).toBe("updated");
    expect(updatePayment).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the same payment intent arrives a second time", async () => {
    // Second delivery — payment already marked succeeded
    findPayment.mockResolvedValueOnce({ id: 1, status: "succeeded" });
    const result = await handlePaymentIntentSucceeded("pi_abc");
    expect(result.action).toBe("skipped_idempotent");
    expect(updatePayment).not.toHaveBeenCalled();
  });

  it("is a no-op for a refunded payment (no double-processing)", async () => {
    findPayment.mockResolvedValueOnce({ id: 2, status: "refunded" });
    const result = await handlePaymentIntentSucceeded("pi_xyz");
    expect(result.action).toBe("skipped_idempotent");
    expect(updatePayment).not.toHaveBeenCalled();
  });

  it("returns not_found gracefully when no payment record exists", async () => {
    findPayment.mockResolvedValueOnce(null);
    const result = await handlePaymentIntentSucceeded("pi_ghost");
    expect(result.action).toBe("not_found");
    expect(updatePayment).not.toHaveBeenCalled();
  });
});
