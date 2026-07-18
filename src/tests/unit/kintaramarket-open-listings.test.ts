import { describe, expect, it } from "vitest";
import { openListingsToActivity } from "@/lib/kintara/kintaramarket-xyz";

describe("kintaramarket open listings → activity", () => {
  it("maps lot priceUsd to unit and sorts cheap open first", () => {
    const rows = openListingsToActivity(
      [
        {
          id: 2,
          itemType: "gold",
          quantity: 1,
          currency: "token",
          priceUsd: 10,
          sellerName: "B",
          reservedBy: 99,
          reservedUntilMs: Date.now() + 60_000,
          lastSeen: 1_700_000_000_200,
        },
        {
          id: 1,
          itemType: "wood",
          quantity: 1000,
          currency: "token",
          priceUsd: 1,
          sellerName: "A",
          reservedBy: null,
          lastSeen: 1_700_000_000_100,
        },
      ],
      { kinsUsd: 0.01, sort: "cheap", limit: 10 },
    );

    expect(rows).toHaveLength(2);
    // Open wood first (locked gold second)
    expect(rows[0].itemType).toBe("wood");
    expect(rows[0].reserved).toBe(false);
    expect(Number(rows[0].unitUsd)).toBeCloseTo(0.001, 6);
    expect(rows[1].reserved).toBe(true);
    expect(rows[1].buyerId).toBe("99");
    expect(rows[0].unitKins).not.toBe("0");
  });
});
