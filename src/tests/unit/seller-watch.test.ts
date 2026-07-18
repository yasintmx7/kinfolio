import { describe, expect, it, beforeEach } from "vitest";
import {
  getWatchedSellers,
  isSellerWatched,
  setWatchedSellers,
  toggleSellerWatch,
} from "@/lib/market/seller-watch";

describe("seller-watch", () => {
  beforeEach(() => {
    setWatchedSellers([]);
  });

  it("toggles watch by name case-insensitively", () => {
    let list = toggleSellerWatch("Alice", "1");
    expect(list).toHaveLength(1);
    expect(isSellerWatched("alice")).toBe(true);
    expect(getWatchedSellers()[0]?.sellerId).toBe("1");
    list = toggleSellerWatch("ALICE");
    expect(list).toHaveLength(0);
    expect(isSellerWatched("Alice")).toBe(false);
  });
});
