import { describe, expect, it } from "vitest";
import { tickerToKinsPrice } from "@/lib/prices/kintaramarket-ticker";

describe("tickerToKinsPrice", () => {
  it("maps ticker payload to KinsPrice", () => {
    const price = tickerToKinsPrice({
      kinsUsd: 0.007734,
      goldFloorUsd: 0.619375,
      updatedAt: "2026-07-15T00:00:00.000Z",
      source: "kintaramarket.xyz",
    });
    expect(price.source).toBe("kintaramarket");
    expect(price.priceUsd).toBe("0.007734");
    expect(price.goldFloorUsd).toBe("0.619375");
  });
});
