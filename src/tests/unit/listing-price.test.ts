import { describe, expect, it } from "vitest";
import {
  formatUsdMarket,
  formatUsdPer1kMarket,
  getListingRateDisplay,
  listingPriceLabels,
  normalizeListingPrice,
} from "@/lib/market/listing-price";

describe("normalizeListingPrice (official API)", () => {
  it("treats priceUsd as LOT total — 2k stone example", () => {
    // User example: 2000 stone, lot ~$0.0528 → unit ~$0.0000264
    const p = normalizeListingPrice({
      quantity: 2000,
      priceUsd: 0.0528,
      currency: "token",
    });
    expect(p.lotUsd).toBeCloseTo(0.0528, 8);
    expect(p.unitUsd).toBeCloseTo(0.0000264, 10);
    expect(p.per1kUsd).toBeCloseTo(0.0264, 8);
  });

  it("matches sort=cheap wood samples from live API", () => {
    // 1181 wood @ priceUsd 0.0118 (lot) is cheaper per unit than 1000 @ 0.01994
    const a = normalizeListingPrice({ quantity: 1181, priceUsd: 0.0118 });
    const b = normalizeListingPrice({ quantity: 1000, priceUsd: 0.01994 });
    expect(a.unitUsd!).toBeLessThan(b.unitUsd!);
    expect(a.lotUsd).toBeCloseTo(0.0118, 8);
    expect(b.unitUsd).toBeCloseTo(0.00001994, 10);
  });

  it("derives lot from unit when only unitUsd present", () => {
    const p = normalizeListingPrice({
      quantity: 1000,
      unitUsd: 0.00002,
    });
    expect(p.lotUsd).toBeCloseTo(0.02, 8);
    expect(p.per1kUsd).toBeCloseTo(0.02, 8);
  });

  it("gold listings without USD", () => {
    const p = normalizeListingPrice({
      quantity: 1,
      priceUsd: null,
      priceGold: 350,
      currency: "gold",
    });
    expect(p.lotUsd).toBeNull();
    expect(p.unitUsd).toBeNull();
    expect(p.priceGold).toBe(350);
    const labels = listingPriceLabels({
      quantity: 1,
      priceGold: 350,
      currency: "gold",
    });
    expect(labels.lotLabel).toBe("350g");
  });

  it("does not invert lot/unit when both usdTotal and unitUsd set", () => {
    const p = normalizeListingPrice({
      quantity: 3000,
      usdTotal: 0.06,
      unitUsd: 0.00002,
    });
    expect(p.lotUsd).toBeCloseTo(0.06, 8);
    expect(p.unitUsd).toBeCloseTo(0.00002, 10);
  });

  it("does not invent unit when quantity missing", () => {
    const p = normalizeListingPrice({
      quantity: "?",
      usdTotal: 5.5,
    });
    expect(p.lotUsd).toBeCloseTo(5.5, 8);
    expect(p.unitUsd).toBeNull();
    expect(p.per1kUsd).toBeNull();
  });

  it("repairs unit when unit accidentally equals lot for multi-qty", () => {
    const p = normalizeListingPrice({
      quantity: 2000,
      usdTotal: 0.0528,
      unitUsd: 0.0528, // bug shape: unit never divided
    });
    expect(p.lotUsd).toBeCloseTo(0.0528, 8);
    expect(p.unitUsd).toBeCloseTo(0.0000264, 10);
  });
});

describe("formatUsdMarket", () => {
  it("keeps tiny unit prices readable", () => {
    expect(formatUsdMarket(0.00002345)).toMatch(/\$0\.000023/);
    expect(formatUsdPer1kMarket(0.00002345)).toMatch(/\$0\.023/);
  });

  it("formats lot totals cleanly", () => {
    expect(formatUsdMarket(0.0528)).toBe("$0.0528");
    expect(formatUsdMarket(1.5)).toMatch(/\$1\.5/);
  });
});

describe("getListingRateDisplay", () => {
  it("qty 2 · lot $1.10 → $0.55/1 not $550/1k (gold resource case)", () => {
    // Live bug: itemType gold, currency token, qty 2–3, lot ~$1.1
    const d = getListingRateDisplay({
      quantity: 2,
      usdTotal: 1.1,
      currency: "token",
    });
    expect(d.rateSuffix).toBe("/1");
    expect(d.rateLabel).toMatch(/\$0\.55/);
    expect(d.totalLine).toMatch(/1\.1/);
    expect(d.rateLabel).not.toMatch(/550/);
  });

  it("gold resource qty 3 · $1.80 → $0.60/1 not $600/1k", () => {
    const d = getListingRateDisplay({
      quantity: 3,
      usdTotal: 1.8,
      currency: "token",
    });
    expect(d.rateSuffix).toBe("/1");
    expect(d.unitUsd).toBeCloseTo(0.6, 8);
    expect(d.rateLabel).not.toMatch(/600/);
  });

  it("unit ≥ $0.01 always uses /1 even if qty is large", () => {
    const d = getListingRateDisplay({
      quantity: 500,
      usdTotal: 275, // unit $0.55
      currency: "token",
    });
    expect(d.rateSuffix).toBe("/1");
    expect(d.rateLabel).toMatch(/\$0\.55/);
  });

  it("bulk dust materials keep /1k", () => {
    const d = getListingRateDisplay({
      quantity: 2000,
      usdTotal: 0.0528,
      currency: "token",
    });
    expect(d.rateSuffix).toBe("/1k");
    expect(d.totalLine).toMatch(/0\.0528|\$0\.0528/);
  });
});
