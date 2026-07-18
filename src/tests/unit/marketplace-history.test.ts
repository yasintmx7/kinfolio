import { describe, expect, it } from "vitest";
import { STATIC_CATALOG } from "@/data/static-catalog";
import {
  looksLikeMarketplaceHistory,
  parseMarketplaceHistory,
  resolveMarketplaceItemName,
} from "@/lib/parser/marketplace-history";

const SAMPLE = `MarketplaceJul 5 07:24 AM
You bought 500 Wood for $0.01 USD (0.58 $KINS).
MarketplaceJul 5 07:43 AM
You sold 7 Gold for $6.15 USD (362.47 $KINS).
MarketplaceJul 5 07:59 AM
You sold 500 Cooked Fish Meat for $0.69 USD (40.92 $KINS).
MarketplaceJul 6 08:44 AM
You sold 1 Pickaxe (Lvl 2) for $0.10 USD (6.57 $KINS).
MarketplaceJul 6 09:17 AM
You bought 2,600 Wood for $0.02 USD (1.23 $KINS).
`;

describe("marketplace-history parser", () => {
  it("detects marketplace history paste", () => {
    expect(looksLikeMarketplaceHistory(SAMPLE)).toBe(true);
    expect(looksLikeMarketplaceHistory("Sent: 7.15 KINS (~$0.05)")).toBe(
      false,
    );
  });

  it("resolves common item names", () => {
    expect(resolveMarketplaceItemName("Wood", STATIC_CATALOG)?.id).toBe("wood");
    expect(resolveMarketplaceItemName("Gold", STATIC_CATALOG)?.id).toBe("gold");
    expect(
      resolveMarketplaceItemName("Cooked Fish Meat", STATIC_CATALOG)?.id,
    ).toBe("cooked-fish-meat");
    expect(
      resolveMarketplaceItemName("Pickaxe (Lvl 2)", STATIC_CATALOG)?.id,
    ).toBe("lvl-2-pickaxe");
  });

  it("parses buy/sell lines with qty, USD, KINS and dates", () => {
    const r = parseMarketplaceHistory(SAMPLE, STATIC_CATALOG, { year: 2025 });
    expect(r.matched).toBe(true);
    expect(r.lines.length).toBe(5);

    const woodBuy = r.lines.find(
      (l) => l.direction === "buy" && l.itemId === "wood" && l.quantity === "500",
    );
    expect(woodBuy).toBeTruthy();
    expect(woodBuy!.usd).toBe("0.01");
    expect(woodBuy!.kins).toBe("0.58");

    const goldSell = r.lines.find(
      (l) => l.direction === "sell" && l.itemId === "gold",
    );
    expect(goldSell).toBeTruthy();
    expect(goldSell!.quantity).toBe("7");
    expect(goldSell!.usd).toBe("6.15");
    expect(goldSell!.kins).toBe("362.47");

    const pick = r.lines.find((l) => l.itemId === "lvl-2-pickaxe");
    expect(pick?.direction).toBe("sell");
    expect(pick?.quantity).toBe("1");

    // Oldest first for ledger order
    expect(Date.parse(r.lines[0].transactionAt)).toBeLessThanOrEqual(
      Date.parse(r.lines[r.lines.length - 1].transactionAt),
    );
  });

  it("handles comma quantities", () => {
    const r = parseMarketplaceHistory(
      `MarketplaceJul 5 09:09 AM
You sold 1,000 Cooked Fish Meat for $1.27 USD (78.81 $KINS).`,
      STATIC_CATALOG,
      { year: 2025 },
    );
    expect(r.lines[0].quantity).toBe("1000");
    expect(r.lines[0].itemId).toBe("cooked-fish-meat");
  });

  it("associates dates when Marketplace line comes after the trade", () => {
    const paste = `You sold 500 Cooked Fish Meat for $0.69 USD (42.54 $KINS).
MarketplaceJul 5 09:29 AM
You sold 5 Gold for $4.47 USD (275 $KINS).
MarketplaceJul 5 09:34 AM
You bought 638 Stone for $0.02 USD (1.45 $KINS).
MarketplaceJul 5 09:34 AM
You bought 2,600 Wood for $0.02 USD (1.23 $KINS).
MarketplaceJul 6 09:17 AM
`;
    const r = parseMarketplaceHistory(paste, STATIC_CATALOG, { year: 2025 });
    expect(r.matched).toBe(true);
    expect(r.lines.length).toBe(4);

    const fish = r.lines.find((l) => l.itemId === "cooked-fish-meat");
    const gold = r.lines.find((l) => l.itemId === "gold");
    const wood = r.lines.find((l) => l.itemId === "wood");
    expect(fish?.direction).toBe("sell");
    expect(fish?.transactionAt).toContain("2025-07-05");
    // 09:29 local — just check day + that gold is same morning block
    expect(gold?.quantity).toBe("5");
    expect(gold?.usd).toBe("4.47");
    expect(wood?.quantity).toBe("2600");
    expect(wood?.transactionAt).toContain("2025-07-06");
    expect(Date.parse(fish!.transactionAt)).toBeLessThan(
      Date.parse(wood!.transactionAt),
    );
  });

  it("parses a full multi-day marketplace log (user sample)", () => {
    const paste = `You sold 500 Cooked Fish Meat for $0.69 USD (42.54 $KINS).
MarketplaceJul 5 09:29 AM
You sold 5 Gold for $4.47 USD (275 $KINS).
MarketplaceJul 5 09:34 AM
You bought 638 Stone for $0.02 USD (1.45 $KINS).
MarketplaceJul 5 09:34 AM
You bought 1,000 Wood for $0.02 USD (1.24 $KINS).
MarketplaceJul 5 10:58 AM
You bought 1,407 Wood for $0.03 USD (1.83 $KINS).
MarketplaceJul 5 01:36 PM
You bought 2,001 Wood for $0.05 USD (3.05 $KINS).
MarketplaceJul 5 01:37 PM
You bought 500 Cooked Fish Meat for $0.47 USD (28.73 $KINS).
MarketplaceJul 5 01:48 PM
You bought 2,100 Wood for $0.07 USD (4.31 $KINS).
MarketplaceJul 5 01:50 PM
You bought 5,000 Stone for $0.14 USD (8.62 $KINS).
MarketplaceJul 5 02:00 PM
You bought 5,000 Wood for $0.14 USD (8.58 $KINS).
MarketplaceJul 5 02:41 PM
You bought 2,200 Stone for $0.06 USD (3.69 $KINS).
MarketplaceJul 5 02:42 PM
You bought 2,500 Stone for $0.07 USD (4.31 $KINS).
MarketplaceJul 5 02:43 PM
You bought 4,200 Wood for $0.11 USD (6.77 $KINS).
MarketplaceJul 5 02:43 PM
You bought 2,500 Wood for $0.06 USD (3.71 $KINS).
MarketplaceJul 5 02:44 PM
You bought 2,500 Stone for $0.04 USD (2.47 $KINS).
MarketplaceJul 6 08:44 AM
You sold 1 Pickaxe (Lvl 2) for $0.10 USD (6.57 $KINS).
MarketplaceJul 6 09:17 AM
You bought 2,600 Wood for $0.02 USD (1.23 $KINS).
`;
    const r = parseMarketplaceHistory(paste, STATIC_CATALOG, { year: 2025 });
    expect(r.matched).toBe(true);
    expect(r.lines.length).toBe(17);
    expect(r.lines.every((l) => l.itemId)).toBe(true);
    expect(r.lines.filter((l) => l.direction === "buy").length).toBe(14);
    expect(r.lines.filter((l) => l.direction === "sell").length).toBe(3);
    expect(r.lines.find((l) => l.itemId === "lvl-2-pickaxe")?.direction).toBe(
      "sell",
    );
  });
});
