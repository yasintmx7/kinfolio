import { describe, expect, it } from "vitest";
import { normalizeListingPrice } from "@/lib/market/listing-price";
import { getListingRateDisplay } from "@/lib/market/listing-price";

/**
 * Live kintaramarket.xyz shapes (verified against /api/market/gold):
 *   qty 1 · priceUsd 0.57 · unitPrice 0.57
 *   qty 3 · priceUsd 1.71 · unitPrice 0.57
 */
describe("kintaramarket listing price shape", () => {
  it("qty 1 gold lot $0.57 → unit $0.57/1", () => {
    const p = normalizeListingPrice({
      quantity: 1,
      priceUsd: 0.57,
      unitUsd: 0.57,
      currency: "token",
    });
    expect(p.lotUsd).toBeCloseTo(0.57, 6);
    expect(p.unitUsd).toBeCloseTo(0.57, 6);
    const d = getListingRateDisplay({
      quantity: 1,
      priceUsd: 0.57,
      unitUsd: 0.57,
      currency: "token",
    });
    expect(d.rateSuffix).toBe("/1");
    expect(d.rateLabel).not.toMatch(/570/);
  });

  it("qty 3 gold lot $1.71 → unit $0.57/1 not $570/1k", () => {
    const p = normalizeListingPrice({
      quantity: 3,
      priceUsd: 1.71,
      unitUsd: 0.57,
      currency: "token",
    });
    expect(p.lotUsd).toBeCloseTo(1.71, 6);
    expect(p.unitUsd).toBeCloseTo(0.57, 6);
    const d = getListingRateDisplay({
      quantity: 3,
      usdTotal: 1.71,
      unitUsd: 0.57,
      currency: "token",
    });
    expect(d.rateSuffix).toBe("/1");
    expect(d.unitUsd).toBeCloseTo(0.57, 6);
    expect(d.rateLabel).not.toMatch(/570/);
  });

  it("bulk coal qty 5000 · lot $0.09 → /1k display", () => {
    const d = getListingRateDisplay({
      quantity: 5000,
      priceUsd: 0.09,
      unitUsd: 0.000018,
      currency: "token",
    });
    expect(d.rateSuffix).toBe("/1k");
    expect(d.totalLine).toMatch(/0\.09/);
  });
});
