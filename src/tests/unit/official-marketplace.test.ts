import { describe, expect, it } from "vitest";
import {
  BLOCKED_WRITE_ENDPOINTS,
  bookCoverageNote,
  filterBookByItemType,
  filterBookBySeller,
  type MarketBookSnapshot,
  type OfficialListing,
} from "@/lib/kintara/official-marketplace";

function fakeListing(
  partial: Partial<OfficialListing> & { id: string | number; itemType: string },
): OfficialListing {
  return {
    quantity: 1,
    unitUsd: 0.01,
    isReserved: false,
    ...partial,
  };
}

describe("official marketplace policy", () => {
  it("blocks purchase/reserve endpoints", () => {
    expect(
      BLOCKED_WRITE_ENDPOINTS.some((e) => e.includes("token-quote")),
    ).toBe(true);
    expect(
      BLOCKED_WRITE_ENDPOINTS.some((e) => e.includes("token-buy-confirm")),
    ).toBe(true);
    expect(BLOCKED_WRITE_ENDPOINTS.some((e) => e.includes("reserve"))).toBe(
      true,
    );
  });
});

describe("market book filters + coverage notes", () => {
  const rows: OfficialListing[] = [
    fakeListing({
      id: 1,
      itemType: "wood",
      sellerId: 42,
      sellerName: "Oreymorey",
      unitUsd: 0.001,
    }),
    fakeListing({
      id: 2,
      itemType: "stone",
      sellerId: 99,
      sellerName: "Other",
      unitUsd: 0.002,
      isReserved: true,
    }),
    fakeListing({
      id: 3,
      itemType: "wood",
      sellerId: 42,
      sellerName: "Oreymorey",
      unitUsd: 0.002,
    }),
  ];

  it("filters by item type", () => {
    const wood = filterBookByItemType(rows, "wood");
    expect(wood).toHaveLength(2);
    expect(wood.every((r) => r.itemType === "wood")).toBe(true);
  });

  it("filters by seller id or name", () => {
    expect(filterBookBySeller(rows, { sellerId: "42" })).toHaveLength(2);
    expect(
      filterBookBySeller(rows, { sellerName: "oreymorey" }),
    ).toHaveLength(2);
    expect(filterBookBySeller(rows, { sellerId: "99" })).toHaveLength(1);
  });

  it("writes honest coverage notes", () => {
    const incomplete: MarketBookSnapshot = {
      listings: rows,
      size: 900,
      complete: false,
      tokenComplete: false,
      goldComplete: true,
      pagesScannedToken: 10,
      pagesScannedGold: 3,
      updatedAt: new Date().toISOString(),
    };
    const complete: MarketBookSnapshot = {
      ...incomplete,
      complete: true,
      tokenComplete: true,
      goldComplete: true,
      size: 400,
    };

    expect(bookCoverageNote(incomplete, 0, "item")).toMatch(/higher-priced/i);
    expect(bookCoverageNote(complete, 0, "item")).toMatch(/no open listings/i);
    expect(bookCoverageNote(incomplete, 3, "seller")).toMatch(/may be missing/i);
    expect(bookCoverageNote(complete, 2, "seller")).toMatch(/live book/i);
  });
});
