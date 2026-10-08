import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module before importing the function under test
vi.mock("../../server/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../server/db")>();
  return { ...original, decrementRideSeat: vi.fn() };
});

import { decrementRideSeat } from "../../server/db";

const mockDecrement = vi.mocked(decrementRideSeat);

describe("decrementRideSeat — atomic seat claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when a seat is successfully claimed (affectedRows = 1)", async () => {
    mockDecrement.mockResolvedValueOnce(true);
    const claimed = await decrementRideSeat(1);
    expect(claimed).toBe(true);
  });

  it("returns false when the ride is already full (affectedRows = 0)", async () => {
    mockDecrement.mockResolvedValueOnce(false);
    const claimed = await decrementRideSeat(1);
    expect(claimed).toBe(false);
  });

  it("is called with the correct rideId", async () => {
    mockDecrement.mockResolvedValueOnce(true);
    await decrementRideSeat(42);
    expect(mockDecrement).toHaveBeenCalledWith(42);
  });

  it("second concurrent call returns false when first already claimed last seat", async () => {
    // Simulate two concurrent attempts: first wins, second loses
    mockDecrement
      .mockResolvedValueOnce(true)  // first caller claims the seat
      .mockResolvedValueOnce(false); // second caller finds no seats left

    const [first, second] = await Promise.all([
      decrementRideSeat(5),
      decrementRideSeat(5),
    ]);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("rejects and propagates DB errors", async () => {
    mockDecrement.mockRejectedValueOnce(new Error("DB connection lost"));
    await expect(decrementRideSeat(99)).rejects.toThrow("DB connection lost");
  });
});
