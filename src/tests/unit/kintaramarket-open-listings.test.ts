import { describe, expect, it } from "vitest";
import {
  openListingsToActivity,
  selectActivityRows,
  type MarketActivityRow,
} from "@/lib/kintara/kintaramarket-xyz";

function makeRow(
  id: string,
  itemType: string,
  unitUsd: string,
  locked: boolean,
): MarketActivityRow {
  return {
    id,
    listingId: id,
    itemType,
    name: itemType,
    quantity: "1",
    unitKins: "0",
    totalKins: null,
    unitUsd,
    usdTotal: unitUsd,
    priceGold: null,
    currency: "token",
    timestamp: new Date().toISOString(),
    sellerName: null,
    sellerId: null,
    buyerId: locked ? "12220" : null,
    buyerName: null,
    reserved: locked,
    reservedUntilMs: locked ? Date.now() + 60_000 : null,
    itemDurability: null,
  };
}

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
    expect(rows[0].itemType).toBe("wood");
    expect(rows[0].reserved).toBe(false);
    expect(Number(rows[0].unitUsd)).toBeCloseTo(0.001, 6);
    expect(rows[1].reserved).toBe(true);
    expect(rows[1].buyerId).toBe("99");
    expect(rows[0].unitKins).not.toBe("0");
  });

  it("keeps locked rows when capping below total size", () => {
    const many: MarketActivityRow[] = [];
    for (let i = 0; i < 50; i++) {
      many.push(makeRow(`o${i}`, "wood", String(0.001 + i * 0.0001), false));
    }
    many.push(makeRow("lock-1", "stone", "0.05", true));

    const kept = selectActivityRows(many, 20, "cheap");
    expect(kept).toHaveLength(20);
    expect(kept.some((r) => r.id === "lock-1" && r.reserved)).toBe(true);
  });
});
