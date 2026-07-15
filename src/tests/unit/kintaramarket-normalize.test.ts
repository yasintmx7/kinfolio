import { describe, expect, it } from "vitest";
import { normalizeSummary } from "@/lib/kintara/kintaramarket-xyz";

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
});
