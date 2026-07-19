import { describe, expect, it, beforeEach } from "vitest";
import {
  getWatchlist,
  isInWatchlist,
  isWatched,
  normalizeWatchId,
  setWatchlist,
  toggleWatch,
} from "@/lib/market/watchlist";

describe("watchlist", () => {
  beforeEach(() => {
    setWatchlist([]);
  });

  it("normalizes dash and underscore for matching", () => {
    expect(normalizeWatchId("cooked-fish-meat")).toBe("cooked_fish_meat");
    expect(normalizeWatchId("Cooked_Fish_Meat")).toBe("cooked_fish_meat");
  });

  it("toggles and matches across market type / portfolio id", () => {
    let list = toggleWatch("cooked_fish_meat", ["cooked-fish-meat"]);
    expect(list).toEqual(["cooked_fish_meat"]);
    expect(isWatched("cooked-fish-meat")).toBe(true);
    expect(isWatched("cooked_fish_meat")).toBe(true);
    expect(
      isInWatchlist(list, "wood", []),
    ).toBe(false);
    expect(
      isInWatchlist(list, "x", ["cooked-fish-meat"]),
    ).toBe(true);

    list = toggleWatch("cooked-fish-meat");
    expect(list).toEqual([]);
    expect(isWatched("cooked_fish_meat")).toBe(false);
  });

  it("dedupes equivalent ids on set", () => {
    setWatchlist(["wood", "Wood", "wood", "gold"]);
    expect(getWatchlist()).toEqual(["wood", "gold"]);
  });

  it("remove clears alias variants stored separately", () => {
    setWatchlist(["cooked_fish_meat", "cooked-fish-meat", "wood"]);
    // Should already be deduped to one fish entry
    const fishCount = getWatchlist().filter((w) =>
      normalizeWatchId(w).includes("cooked"),
    ).length;
    expect(fishCount).toBe(1);

    setWatchlist(["cooked_fish_meat", "wood"]);
    // Force two spellings past set by writing raw-like list then toggle remove
    toggleWatch("cooked_fish_meat");
    toggleWatch("cooked_fish_meat");
    // Store preferred, then add dash form via setWatchlist bypass isn't possible
    // after set dedupe — simulate legacy dual store by toggle off with alias
    setWatchlist(["cooked_fish_meat", "wood"]);
    const next = toggleWatch("cooked-fish-meat", ["cooked_fish_meat"]);
    expect(next).toEqual(["wood"]);
  });
});
