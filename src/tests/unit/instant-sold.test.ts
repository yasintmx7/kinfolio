import { describe, expect, it } from "vitest";
import {
  detectGoneListings,
  mergeSoldFeeds,
  pruneBookDeltaSold,
  removeSoldFromOpenBook,
  soldListingIdSet,
  toInstantSold,
} from "@/lib/market/instant-sold";

describe("detectGoneListings", () => {
  const big = (n: number, start = 1) =>
    Array.from({ length: n }, (_, i) => ({ id: String(start + i) }));

  it("returns listings missing from next when feed is healthy", () => {
    const prev = [...big(200), { id: "gone-1" }, { id: "gone-2" }];
    const next = big(200);
    const gone = detectGoneListings(prev, next);
    expect(gone.map((g) => g.id).sort()).toEqual(["gone-1", "gone-2"]);
  });

  it("skips when next book is too small (incomplete scan)", () => {
    const prev = big(200);
    const next = big(50);
    expect(detectGoneListings(prev, next)).toEqual([]);
  });

  it("skips mass disappearances (bad feed)", () => {
    const prev = big(300);
    const next = big(200); // 100 gone > max 35
    expect(detectGoneListings(prev, next)).toEqual([]);
  });

  it("skips when next collapses vs prev", () => {
    const prev = big(400);
    const next = big(180); // < 55% retention
    expect(detectGoneListings(prev, next)).toEqual([]);
  });
});

describe("removeSoldFromOpenBook", () => {
  it("drops open rows whose listing id appears in sold feed", () => {
    const open = [
      { id: "10", listingId: "10" },
      { id: "20", listingId: "20" },
      { id: "30", listingId: "30" },
    ];
    const sold = [
      { id: "sale-a", listingId: "20" },
      { id: "book-sold-30" },
    ];
    const next = removeSoldFromOpenBook(open, sold);
    expect(next.map((r) => r.id)).toEqual(["10"]);
    expect(soldListingIdSet(sold).has("20")).toBe(true);
    expect(soldListingIdSet(sold).has("30")).toBe(true);
  });
});

describe("toInstantSold + mergeSoldFeeds", () => {
  it("builds instant sold from open listing snapshot", () => {
    const sold = toInstantSold({
      id: "991",
      listingId: "991",
      name: "Coal",
      itemType: "coal",
      quantity: "5000",
      unitKins: "0",
      unitUsd: "0.00002",
      usdTotal: "0.1",
      timestamp: "2026-01-01T00:00:00.000Z",
      solscanUrl: null,
      sellerName: "Alice",
      sellerId: "12",
      isSold: false,
    });
    expect(sold.isSold).toBe(true);
    expect(sold.fromBookDelta).toBe(true);
    expect(sold.listingId).toBe("991");
    expect(sold.name).toBe("Coal");
    expect(sold.sellerName).toBe("Alice");
  });

  it("never stores full wallet as sellerName (instant sold)", () => {
    const w = "7fauE6LpwpmMPjeqbcuJY6RM6WyJwEQrKPBiYxHMV3GH";
    const sold = toInstantSold({
      id: "50",
      listingId: "50",
      name: "Stone",
      itemType: "stone",
      quantity: "100",
      unitKins: "0",
      usdTotal: "0.01",
      timestamp: "2026-01-01T00:00:00.000Z",
      solscanUrl: null,
      // Bad data: wallet leaked into name fields (regression from fallback)
      sellerName: w,
      seller: w,
      sellerId: "7",
      sellerWallet: w,
    });
    expect(sold.sellerName).toBeNull();
    expect(sold.seller).toBeNull();
    expect(sold.sellerWallet).toBe(w);
    expect(sold.sellerId).toBe("7");
  });

  it("chain tx upgrades book-delta row without losing item name", () => {
    const book = [
      toInstantSold({
        id: "100",
        listingId: "100",
        name: "Wood",
        itemType: "wood",
        quantity: "1000",
        unitKins: "0",
        unitUsd: "0.0001",
        usdTotal: "0.1",
        timestamp: "2026-01-01T00:00:10.000Z",
        solscanUrl: null,
        sellerName: "Bob",
      }),
    ];
    const chain = [
      {
        id: "sale-doc",
        listingId: "100",
        name: "Sale",
        itemType: "unknown",
        quantity: "?",
        unitKins: "0",
        unitUsd: null,
        usdTotal: "0.1",
        timestamp: "2026-01-01T00:00:20.000Z",
        solscanUrl: "https://solscan.io/tx/abc",
        sellerName: null,
        itemPending: true,
        isSold: true,
      },
    ];
    const merged = mergeSoldFeeds(book, chain);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("Wood");
    expect(merged[0].quantity).toBe("1000");
    expect(merged[0].solscanUrl).toContain("solscan");
    expect(merged[0].itemPending).toBe(false);
  });
});

describe("pruneBookDeltaSold", () => {
  it("drops old rows", () => {
    const now = Date.parse("2026-01-01T01:00:00.000Z");
    const rows = [
      {
        id: "a",
        name: "A",
        itemType: "a",
        quantity: "1",
        unitKins: "0",
        usdTotal: null,
        timestamp: "2026-01-01T00:50:00.000Z",
        solscanUrl: null,
        fromBookDelta: true,
      },
      {
        id: "b",
        name: "B",
        itemType: "b",
        quantity: "1",
        unitKins: "0",
        usdTotal: null,
        timestamp: "2026-01-01T00:30:00.000Z",
        solscanUrl: null,
        fromBookDelta: true,
      },
    ];
    const out = pruneBookDeltaSold(rows, 15 * 60 * 1000, now);
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });
});
