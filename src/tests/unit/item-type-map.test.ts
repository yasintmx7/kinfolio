import { describe, expect, it } from "vitest";
import { STATIC_CATALOG } from "@/data/static-catalog";
import {
  humanizeItemType,
  marketTypeToPortfolioId,
} from "@/lib/kintara/item-type-map";

describe("item-type-map", () => {
  it("maps common market types to catalog ids", () => {
    expect(marketTypeToPortfolioId("stone", STATIC_CATALOG)).toBe("stone");
    expect(marketTypeToPortfolioId("cooked_fish_meat", STATIC_CATALOG)).toBe(
      "cooked-fish-meat",
    );
    expect(marketTypeToPortfolioId("molten_rock", STATIC_CATALOG)).toBe(
      "molten-rock",
    );
    expect(marketTypeToPortfolioId("tool_pickaxe_l2", STATIC_CATALOG)).toBe(
      "pickaxe",
    );
  });

  it("humanizes item types", () => {
    expect(humanizeItemType("cooked_fish_meat")).toBe("Cooked Fish Meat");
    expect(humanizeItemType("potion_health")).toBe("Health Potion");
  });
});
