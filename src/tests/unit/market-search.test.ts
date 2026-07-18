import { describe, expect, it } from "vitest";
import { openListingMatchesQuery } from "@/lib/kintara/kintaramarket-xyz";

describe("market open-listing search match", () => {
  const row = {
    id: 99,
    itemType: "cooked_fish_meat",
    sellerName: "Cenoraaa",
    quantity: 500,
    currency: "token" as const,
    priceUsd: 0.5,
    priceGold: 1,
    unitPrice: 0.001,
    reservedBy: null,
    reservedUntilMs: null,
    firstSeen: 1,
    lastSeen: 2,
  };

  it("matches seller username case-insensitively and partially", () => {
    expect(openListingMatchesQuery(row, "cenora")).toBe(true);
    expect(openListingMatchesQuery(row, "CENORAAA")).toBe(true);
    expect(openListingMatchesQuery(row, "zzz")).toBe(false);
  });

  it("matches item type variants", () => {
    expect(openListingMatchesQuery(row, "cooked fish")).toBe(true);
    expect(openListingMatchesQuery(row, "cooked-fish")).toBe(true);
    expect(openListingMatchesQuery(row, "fish_meat")).toBe(true);
  });

  it("matches listing id", () => {
    expect(openListingMatchesQuery(row, "99")).toBe(true);
  });
});
