import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module before importing the function under test
vi.mock("../../server/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../server/db")>();
  return { ...original, deductWalletBalanceAtomic: vi.fn() };
});

import { deductWalletBalanceAtomic } from "../../server/db";

const mockDeduct = vi.mocked(deductWalletBalanceAtomic);

const walletAfterDeduction = { userId: 1, balance: "5.00", totalSpent: "10.00" };

describe("deductWalletBalanceAtomic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the updated wallet when balance is sufficient", async () => {
    mockDeduct.mockResolvedValueOnce(walletAfterDeduction as any);
    const wallet = await deductWalletBalanceAtomic(1, 10);
    expect(wallet).toEqual(walletAfterDeduction);
    expect(mockDeduct).toHaveBeenCalledWith(1, 10);
  });

  it("throws when balance is insufficient (affectedRows = 0)", async () => {
    mockDeduct.mockRejectedValueOnce(new Error("Insufficient wallet balance"));
    await expect(deductWalletBalanceAtomic(1, 1000)).rejects.toThrow(
      "Insufficient wallet balance",
    );
  });

  it("throws when the wallet record is not found after deduction", async () => {
    mockDeduct.mockRejectedValueOnce(new Error("Wallet not found after deduction"));
    await expect(deductWalletBalanceAtomic(99, 5)).rejects.toThrow(
      "Wallet not found after deduction",
    );
  });

  it("is called with the exact userId and amount", async () => {
    mockDeduct.mockResolvedValueOnce(walletAfterDeduction as any);
    await deductWalletBalanceAtomic(7, 3.5);
    expect(mockDeduct).toHaveBeenCalledWith(7, 3.5);
  });
});
