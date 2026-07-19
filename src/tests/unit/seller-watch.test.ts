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

  it("unwatch by sellerId when name casing differs", () => {
    toggleSellerWatch("Bob", "42");
    expect(isSellerWatched("bob", "42")).toBe(true);
    const next = toggleSellerWatch("BOB", "42");
    expect(next).toHaveLength(0);
  });

  it("rejects pure id watches without a username", () => {
    const next = toggleSellerWatch("", "99");
    expect(next).toHaveLength(0);
    expect(isSellerWatched("", "99")).toBe(false);
  });
});
