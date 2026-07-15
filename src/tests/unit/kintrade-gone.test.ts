import { describe, expect, it } from "vitest";
import {
  filterActiveListings,
  isListingGone,
} from "@/lib/kintara/kintrade-gone";

describe("kintrade gone filter", () => {
  it("detects gone listing ids", () => {
    const set = new Set(["955787", "956350"]);
    expect(isListingGone(955787, set)).toBe(true);
    expect(isListingGone("956350", set)).toBe(true);
    expect(isListingGone(1, set)).toBe(false);
    expect(isListingGone(null, set)).toBe(false);
  });

  it("filters active listings", () => {
    const listings = [
      { id: "1", unitPriceKins: "1" },
      { id: "2", unitPriceKins: "2" },
      { id: "3", unitPriceKins: "3" },
    ];
    const active = filterActiveListings(listings, new Set(["2"]));
    expect(active.map((l) => l.id)).toEqual(["1", "3"]);
  });
});
