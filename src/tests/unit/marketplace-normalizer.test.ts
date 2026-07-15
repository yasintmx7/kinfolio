import { describe, expect, it } from "vitest";
import { normalizeItemStats } from "@/lib/kintara/marketplace-adapter";

describe("normalizeItemStats", () => {
  it("normalizes avg30d samples fixture", () => {
    const stats = normalizeItemStats("molten-rock", {
      ok: true,
      currency: "token",
      avg30d: 0.0002,
      samples: [
        { date: "2026-06-05", avgUnitPrice: 0.0002, sales: 91 },
      ],
    });
    expect(stats.currency).toBe("token");
    expect(stats.avg30dKins).toBe("0.0002");
    expect(stats.samples).toHaveLength(1);
    expect(stats.samples[0].saleCount).toBe(91);
    expect(stats.samples[0].unitPriceKins).toBe("0.0002");
  });
});
