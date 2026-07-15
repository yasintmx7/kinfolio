import { describe, expect, it } from "vitest";
import { d } from "@/lib/accounting/decimal";
import {
  applyTransaction,
  canSell,
  protectedCost,
  rebuildPortfolio,
} from "@/lib/accounting/engine";
import type { PortfolioTransaction } from "@/lib/accounting/types";
import { buildFingerprint } from "@/lib/parser/fingerprint";

function tx(
  partial: Partial<PortfolioTransaction> &
    Pick<PortfolioTransaction, "type" | "itemId" | "quantity" | "kinsAmount" | "usdAmountAtTransaction">,
): PortfolioTransaction {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? crypto.randomUUID(),
    schemaVersion: 1,
    transactionAt: partial.transactionAt ?? now,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    fingerprint:
      partial.fingerprint ??
      buildFingerprint({
        direction: partial.type,
        itemId: partial.itemId,
        quantity: partial.quantity,
        kinsAmount: partial.kinsAmount,
        usdAmount: partial.usdAmountAtTransaction,
      }),
    sellAmountIsNet: partial.sellAmountIsNet ?? true,
    ...partial,
  };
}

describe("accounting engine", () => {
  it("Test C — full round-trip result", () => {
    const buy = tx({
      id: "buy1",
      type: "buy",
      itemId: "stone",
      quantity: "1",
      kinsAmount: "7.5263",
      usdAmountAtTransaction: "0.060108",
      transactionAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const sell = tx({
      id: "sell1",
      type: "sell",
      itemId: "stone",
      quantity: "1",
      kinsAmount: "9.31",
      usdAmountAtTransaction: "0.0764",
      transactionAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-02T00:00:00.000Z",
      sellAmountIsNet: true,
    });

    const summary = rebuildPortfolio([buy, sell]);
    expect(summary.totalRealizedKinsProfit).toBe("1.7837");
    expect(summary.totalRealizedUsdProfit).toBe("0.016292");
    const roi = d(summary.realizedSales[0].usdROI);
    // Spec: ≈ 27.104% (0.016292 / 0.060108 * 100)
    expect(roi.toDecimalPlaces(3).toNumber()).toBeCloseTo(27.104, 2);
  });

  it("Test D — known Molten Rock calculation", () => {
    const buy1 = tx({
      type: "buy",
      itemId: "molten-rock",
      quantity: "501",
      kinsAmount: "0",
      usdAmountAtTransaction: "12.50",
      transactionAt: "2026-01-01T00:00:00.000Z",
    });
    const buy2 = tx({
      type: "buy",
      itemId: "molten-rock",
      quantity: "154",
      kinsAmount: "0",
      usdAmountAtTransaction: "1.033915",
      transactionAt: "2026-01-02T00:00:00.000Z",
    });
    const summary = rebuildPortfolio([buy1, buy2]);
    const pos = summary.positions.find((p) => p.itemId === "molten-rock")!;
    expect(pos.quantity).toBe("655");
    expect(d(pos.usdCostBasis).toFixed(6)).toBe("13.533915");
    expect(d(pos.averageUsdPerItem).toFixed(10)).toBe(
      d("13.533915").div(655).toFixed(10),
    );
  });

  it("Test E — partial sale", () => {
    const buy = tx({
      type: "buy",
      itemId: "stone",
      quantity: "100",
      kinsAmount: "0",
      usdAmountAtTransaction: "2",
      transactionAt: "2026-01-01T00:00:00.000Z",
    });
    const sell = tx({
      type: "sell",
      itemId: "stone",
      quantity: "30",
      kinsAmount: "0",
      usdAmountAtTransaction: "0.85",
      transactionAt: "2026-01-02T00:00:00.000Z",
    });
    const summary = rebuildPortfolio([buy, sell]);
    const sale = summary.realizedSales[0];
    expect(d(sale.usdCostBasisSold).toNumber()).toBeCloseTo(0.6, 8);
    expect(d(sale.realizedUsdProfit).toNumber()).toBeCloseTo(0.25, 8);
    const pos = summary.positions.find((p) => p.itemId === "stone")!;
    expect(pos.quantity).toBe("70");
    expect(d(pos.usdCostBasis).toNumber()).toBeCloseTo(1.4, 8);
  });

  it("Test F — mined inventory mixed with bought inventory", () => {
    const buy = tx({
      type: "buy",
      itemId: "stone",
      quantity: "100",
      kinsAmount: "0",
      usdAmountAtTransaction: "2",
      transactionAt: "2026-01-01T00:00:00.000Z",
    });
    const mine = tx({
      type: "mined",
      itemId: "stone",
      quantity: "100",
      kinsAmount: "0",
      usdAmountAtTransaction: "0",
      transactionAt: "2026-01-02T00:00:00.000Z",
    });
    const sell = tx({
      type: "sell",
      itemId: "stone",
      quantity: "50",
      kinsAmount: "0",
      usdAmountAtTransaction: "1",
      transactionAt: "2026-01-03T00:00:00.000Z",
    });
    const mid = rebuildPortfolio([buy, mine]);
    const posMid = mid.positions.find((p) => p.itemId === "stone")!;
    expect(posMid.quantity).toBe("200");
    expect(d(posMid.averageUsdPerItem).toFixed(2)).toBe("0.01");

    const summary = rebuildPortfolio([buy, mine, sell]);
    const sale = summary.realizedSales[0];
    expect(d(sale.usdCostBasisSold).toNumber()).toBeCloseTo(0.5, 8);
    expect(d(sale.realizedUsdProfit).toNumber()).toBeCloseTo(0.5, 8);
  });

  it("Test G — oversell", () => {
    const buy = tx({
      type: "buy",
      itemId: "stone",
      quantity: "10",
      kinsAmount: "1",
      usdAmountAtTransaction: "1",
    });
    const result = canSell([buy], "stone", "11");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.available).toBe("10");
    }

    let state = new Map();
    const appliedBuy = applyTransaction(state, buy);
    expect(appliedBuy.ok).toBe(true);
    if (appliedBuy.ok) state = appliedBuy.state;

    const sell = tx({
      type: "sell",
      itemId: "stone",
      quantity: "11",
      kinsAmount: "1",
      usdAmountAtTransaction: "1",
    });
    const appliedSell = applyTransaction(state, sell);
    expect(appliedSell.ok).toBe(false);
    if (!appliedSell.ok) {
      expect(appliedSell.error.code).toBe("OVERSELL");
    }
  });

  it("Test H — sale alert already net does not double-deduct 5%", () => {
    const buy = tx({
      type: "buy",
      itemId: "stone",
      quantity: "1",
      kinsAmount: "10",
      usdAmountAtTransaction: "1",
      transactionAt: "2026-01-01T00:00:00.000Z",
    });
    // Net received already after fee
    const sell = tx({
      type: "sell",
      itemId: "stone",
      quantity: "1",
      kinsAmount: "9.5",
      usdAmountAtTransaction: "0.95",
      sellAmountIsNet: true,
      transactionAt: "2026-01-02T00:00:00.000Z",
    });
    const summary = rebuildPortfolio([buy, sell]);
    const sale = summary.realizedSales[0];
    // Profit = 0.95 - 1 = -0.05, NOT 0.95*0.95 - 1
    expect(d(sale.netUsdReceived).toFixed(2)).toBe("0.95");
    expect(d(sale.realizedUsdProfit).toFixed(2)).toBe("-0.05");
  });

  it("protected cost modes", () => {
    const actual = d(100);
    expect(protectedCost(actual, d(5), "simple_add").toNumber()).toBe(105);
    expect(protectedCost(actual, d(5), "exact_gross_up").toFixed(8)).toBe(
      d(100).div(0.95).toFixed(8),
    );
    expect(protectedCost(actual, d(5), "off").toNumber()).toBe(100);
  });
});
