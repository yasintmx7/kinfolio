import { describe, expect, it } from "vitest";
import {
  normalizeSummary,
  summarizeMarketBoard,
} from "@/lib/kintara/kintaramarket-xyz";

describe("normalizeSummary", () => {
  it("converts USD floor to KINS when rate provided", () => {
    const rows = normalizeSummary(
      [
        {
          itemType: "stone",
          listings: 10,
          totalQty: 100,
          lowestUsdPerUnit: 0.00002,
          lowestGoldPerUnit: null,
          kinsListings: 8,
          goldListings: 2,
        },
      ],
      0.008, // $0.008 per KINS
    );
    expect(rows[0].lowestUsdPerUnit).toBe("0.00002");
    // 0.00002 / 0.008 = 0.0025 KINS per unit
    expect(Number(rows[0].lowestKinsPerUnit)).toBeCloseTo(0.0025, 8);
  });

  it("sorts by most listings first (kintaramarket style)", () => {
    const rows = normalizeSummary([
      {
        itemType: "coal",
        listings: 5,
        totalQty: 10,
        lowestUsdPerUnit: 0.01,
        kinsListings: 5,
        goldListings: 0,
      },
      {
        itemType: "gold",
        listings: 391,
        totalQty: 4473,
        lowestUsdPerUnit: 0.57,
        kinsListings: 391,
        goldListings: 0,
      },
    ]);
    expect(rows[0].itemType).toBe("gold");
    expect(rows[1].itemType).toBe("coal");
  });
});

describe("summarizeMarketBoard", () => {
  it("aggregates board totals", () => {
    const rows = normalizeSummary([
      {
        itemType: "gold",
        listings: 100,
        totalQty: 200,
        lowestUsdPerUnit: 0.5,
        kinsListings: 80,
        goldListings: 20,
      },
      {
        itemType: "wood",
        listings: 50,
        totalQty: 10000,
        lowestUsdPerUnit: 0.00002,
        kinsListings: 40,
        goldListings: 10,
      },
    ]);
    const s = summarizeMarketBoard(rows);
    expect(s.itemCount).toBe(2);
    expect(s.itemsWithListings).toBe(2);
    expect(s.totalListings).toBe(150);
    expect(s.totalQty).toBe(10200);
    expect(s.tokenListings).toBe(120);
    expect(s.goldListings).toBe(30);
  });
});
