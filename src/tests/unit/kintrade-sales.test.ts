import { describe, expect, it } from "vitest";
import {
  medianUnitKins,
  normalizeSale,
  salesToSoldSamples,
} from "@/lib/kintara/kintrade-sales";

describe("kintrade sales normalizer", () => {
  it("computes unit KINS from kinsTotal / quantity", () => {
    const sale = normalizeSale({
      _id: "abc",
      itemType: "wood",
      quantity: 10000,
      kinsTotal: 24.60392,
      treasuryKins: 1.230196,
      usd: 0.19,
      ts: 1_700_000_000_000,
      signature: "sig123",
    });
    expect(sale.name).toBe("Wood");
    expect(Number(sale.unitKins)).toBeCloseTo(0.002460392, 8);
    expect(Number(sale.unitKinsNetSeller)).toBeCloseTo(
      (24.60392 - 1.230196) / 10000,
      8,
    );
    expect(sale.signature).toBe("sig123");
  });

  it("median and sold samples", () => {
    const a = normalizeSale({
      itemType: "stone",
      quantity: 1000,
      kinsTotal: 10,
      ts: 1,
    });
    const b = normalizeSale({
      itemType: "stone",
      quantity: 1000,
      kinsTotal: 20,
      ts: 2,
    });
    const c = normalizeSale({
      itemType: "stone",
      quantity: 1000,
      kinsTotal: 30,
      ts: 3,
    });
    expect(Number(medianUnitKins([a, b, c]))).toBeCloseTo(0.02, 8);
    expect(salesToSoldSamples([a])).toHaveLength(1);
    expect(salesToSoldSamples([a])[0].unitPriceKins).toBe(a.unitKins);
  });
});
