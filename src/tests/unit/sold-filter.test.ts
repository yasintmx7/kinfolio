import { describe, expect, it } from "vitest";
import {
  filterSoldStillOpen,
  listingDedupeKey,
} from "@/lib/market/sold-filter";

describe("filterSoldStillOpen", () => {
  it("keeps sold rows when listing is not on the open book", () => {
    const sold = [
      { id: "sale-1", listingId: "100", isSold: true },
      { id: "sale-2", listingId: "200", isSold: true },
    ];
    const open = [{ id: "300", listingId: "300" }];
    expect(filterSoldStillOpen(sold, open)).toHaveLength(2);
  });

  it("drops sold rows still present on the open book (false positive)", () => {
    const sold = [
      { id: "sale-1", listingId: "996981", isSold: true },
      { id: "sale-2", listingId: "200", isSold: true },
    ];
    const open = [
      { id: "996981", listingId: "996981" },
      { id: "999", listingId: "999" },
    ];
    const out = filterSoldStillOpen(sold, open);
    expect(out).toHaveLength(1);
    expect(out[0].listingId).toBe("200");
  });

  it("does not use non-numeric sale document ids as listing ids", () => {
    const sold = [{ id: "kh7abc", listingId: "kh7abc", isSold: true }];
    const open = [{ id: "kh7abc" }];
    // officialListingId rejects non-numeric → only id collision check applies
    expect(filterSoldStillOpen(sold, open)).toHaveLength(0);
  });

  it("returns sold unchanged when open book is empty", () => {
    const sold = [{ id: "sale-1", listingId: "1", isSold: true }];
    expect(filterSoldStillOpen(sold, [])).toEqual(sold);
  });
});

describe("listingDedupeKey", () => {
  it("prefers numeric listing id", () => {
    expect(listingDedupeKey({ id: "sale-doc", listingId: "42" })).toBe(
      "listing:42",
    );
  });

  it("falls back to row id", () => {
    expect(listingDedupeKey({ id: "sale-doc" })).toBe("id:sale-doc");
  });
});
