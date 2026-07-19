import { d, Decimal, safeDiv } from "@/lib/accounting/decimal";
import type {
  ApplyTransactionResult,
  FeeTargetMode,
  InventoryLotState,
  InventoryPosition,
  PortfolioSummary,
  PortfolioTransaction,
  RealizedSaleResult,
  TransactionType,
} from "@/lib/accounting/types";

const EARNED_TYPES: TransactionType[] = [
  "mined",
  "gathered",
  "crafted",
  "drop",
  "reward",
  "gift",
];

function emptyLot(itemId: string): InventoryLotState {
  return {
    itemId,
    quantity: d(0),
    usdCostBasis: d(0),
    kinsCostBasis: d(0),
    purchasedQuantity: d(0),
    earnedQuantity: d(0),
  };
}

function getLot(
  state: Map<string, InventoryLotState>,
  itemId: string,
): InventoryLotState {
  let lot = state.get(itemId);
  if (!lot) {
    lot = emptyLot(itemId);
    state.set(itemId, lot);
  }
  return lot;
}

export function protectedCost(
  actual: Decimal,
  feePercent: Decimal,
  mode: FeeTargetMode,
): Decimal {
  if (mode === "off" || feePercent.lte(0)) return actual;
  if (mode === "simple_add") {
    return actual.mul(d(1).plus(feePercent.div(100)));
  }
  // exact_gross_up: actual / (1 - fee)
  const denom = d(1).minus(feePercent.div(100));
  if (denom.lte(0)) return actual;
  return actual.div(denom);
}

export function applyTransaction(
  state: Map<string, InventoryLotState>,
  tx: PortfolioTransaction,
  options?: { defaultSellFeePercent?: string; feeTargetMode?: FeeTargetMode },
): ApplyTransactionResult {
  const next = cloneState(state);
  const lot = getLot(next, tx.itemId);
  const qty = d(tx.quantity);

  if (qty.isZero() || (qty.isNegative() && tx.type !== "adjustment")) {
    return {
      ok: false,
      error: { code: "INVALID_QUANTITY", message: "Quantity must be positive (except for negative adjustments)." },
    };
  }

  switch (tx.type) {
    case "buy":
    case "opening_balance": {
      const usd = d(tx.usdAmountAtTransaction);
      const kins = d(tx.kinsAmount);
      lot.quantity = lot.quantity.plus(qty);
      lot.usdCostBasis = lot.usdCostBasis.plus(usd);
      lot.kinsCostBasis = lot.kinsCostBasis.plus(kins);
      lot.purchasedQuantity = lot.purchasedQuantity.plus(qty);
      break;
    }
    case "mined":
    case "gathered":
    case "crafted":
    case "drop":
    case "reward":
    case "gift": {
      const expenseUsd = d(tx.usdAmountAtTransaction || "0");
      const expenseKins = d(tx.kinsAmount || "0");
      lot.quantity = lot.quantity.plus(qty);
      lot.usdCostBasis = lot.usdCostBasis.plus(expenseUsd);
      lot.kinsCostBasis = lot.kinsCostBasis.plus(expenseKins);
      lot.earnedQuantity = lot.earnedQuantity.plus(qty);
      break;
    }
    case "adjustment": {
      if (qty.gt(0)) {
        // Positive: add stock with optional cost basis (e.g. correction entry)
        const usd = d(tx.usdAmountAtTransaction || "0");
        const kins = d(tx.kinsAmount || "0");
        lot.quantity = lot.quantity.plus(qty);
        lot.usdCostBasis = lot.usdCostBasis.plus(usd);
        lot.kinsCostBasis = lot.kinsCostBasis.plus(kins);
      } else {
        // Negative: reduce qty + cost basis proportionally (write-off / correction)
        const absQty = qty.abs();
        if (absQty.gt(lot.quantity)) {
          return {
            ok: false,
            error: {
              code: "OVERSELL",
              message: `Adjustment of -${absQty.toFixed()} exceeds available ${lot.quantity.toFixed()}.`,
            },
          };
        }
        if (lot.quantity.gt(0)) {
          const ratio = absQty.div(lot.quantity);
          lot.usdCostBasis = lot.usdCostBasis.minus(lot.usdCostBasis.mul(ratio));
          lot.kinsCostBasis = lot.kinsCostBasis.minus(lot.kinsCostBasis.mul(ratio));
          lot.purchasedQuantity = Decimal.max(d(0), lot.purchasedQuantity.minus(lot.purchasedQuantity.mul(ratio)));
          lot.earnedQuantity = Decimal.max(d(0), lot.earnedQuantity.minus(lot.earnedQuantity.mul(ratio)));
        }
        lot.quantity = Decimal.max(d(0), lot.quantity.minus(absQty));
      }
      break;
    }
    case "sell": {
      if (qty.gt(lot.quantity)) {
        return {
          ok: false,
          error: {
            code: "OVERSELL",
            message: `Cannot sell ${qty.toFixed()} — only ${lot.quantity.toFixed()} available.`,
          },
        };
      }

      const usdCostBasisSold = safeDiv(lot.usdCostBasis, lot.quantity).mul(qty);
      const kinsCostBasisSold = safeDiv(lot.kinsCostBasis, lot.quantity).mul(qty);

      lot.quantity = lot.quantity.minus(qty);
      lot.usdCostBasis = lot.usdCostBasis.minus(usdCostBasisSold);
      lot.kinsCostBasis = lot.kinsCostBasis.minus(kinsCostBasisSold);

      // Keep purchased/earned split proportional when possible
      const totalBefore = lot.purchasedQuantity.plus(lot.earnedQuantity);
      if (totalBefore.gt(0)) {
        const purchasedShare = safeDiv(lot.purchasedQuantity, totalBefore).mul(qty);
        const earnedShare = qty.minus(purchasedShare);
        lot.purchasedQuantity = Decimal.max(d(0), lot.purchasedQuantity.minus(purchasedShare));
        lot.earnedQuantity = Decimal.max(d(0), lot.earnedQuantity.minus(earnedShare));
      }

      // Round tiny dust to zero
      if (lot.quantity.abs().lt("1e-12")) {
        lot.quantity = d(0);
        lot.usdCostBasis = d(0);
        lot.kinsCostBasis = d(0);
        lot.purchasedQuantity = d(0);
        lot.earnedQuantity = d(0);
      }

      void options;
      break;
    }
    default: {
      return {
        ok: false,
        error: { code: "UNKNOWN_TYPE", message: `Unknown transaction type: ${tx.type}` },
      };
    }
  }

  next.set(tx.itemId, lot);
  return { ok: true, state: next };
}

export function cloneState(
  state: Map<string, InventoryLotState>,
): Map<string, InventoryLotState> {
  const next = new Map<string, InventoryLotState>();
  for (const [id, lot] of state) {
    next.set(id, {
      itemId: lot.itemId,
      quantity: d(lot.quantity),
      usdCostBasis: d(lot.usdCostBasis),
      kinsCostBasis: d(lot.kinsCostBasis),
      purchasedQuantity: d(lot.purchasedQuantity),
      earnedQuantity: d(lot.earnedQuantity),
    });
  }
  return next;
}

export function sortTransactions(txs: PortfolioTransaction[]): PortfolioTransaction[] {
  return [...txs].sort((a, b) => {
    const ta = new Date(a.transactionAt).getTime();
    const tb = new Date(b.transactionAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}

export function computeRealizedSale(
  stateBefore: Map<string, InventoryLotState>,
  tx: PortfolioTransaction,
): RealizedSaleResult | null {
  if (tx.type !== "sell") return null;
  const lot = stateBefore.get(tx.itemId) ?? emptyLot(tx.itemId);
  const qty = d(tx.quantity);
  if (qty.lte(0) || lot.quantity.lte(0)) return null;
  if (qty.gt(lot.quantity)) return null;

  const usdCostBasisSold = safeDiv(lot.usdCostBasis, lot.quantity).mul(qty);
  const kinsCostBasisSold = safeDiv(lot.kinsCostBasis, lot.quantity).mul(qty);

  // Received is net by default — do not re-deduct fee
  const netUsd = d(tx.usdAmountAtTransaction);
  const netKins = d(tx.kinsAmount);

  const realizedUsdProfit = netUsd.minus(usdCostBasisSold);
  const realizedKinsProfit = netKins.minus(kinsCostBasisSold);
  const usdROI = usdCostBasisSold.isZero()
    ? d(0)
    : realizedUsdProfit.div(usdCostBasisSold).mul(100);
  const kinsROI = kinsCostBasisSold.isZero()
    ? d(0)
    : realizedKinsProfit.div(kinsCostBasisSold).mul(100);

  return {
    transactionId: tx.id,
    itemId: tx.itemId,
    quantitySold: qty.toFixed(),
    netKinsReceived: netKins.toFixed(),
    netUsdReceived: netUsd.toFixed(),
    usdCostBasisSold: usdCostBasisSold.toFixed(),
    kinsCostBasisSold: kinsCostBasisSold.toFixed(),
    realizedUsdProfit: realizedUsdProfit.toFixed(),
    realizedKinsProfit: realizedKinsProfit.toFixed(),
    usdROI: usdROI.toFixed(),
    kinsROI: kinsROI.toFixed(),
    transactionAt: tx.transactionAt,
  };
}

export function rebuildPortfolio(transactions: PortfolioTransaction[]): PortfolioSummary {
  const ordered = sortTransactions(transactions);
  let state = new Map<string, InventoryLotState>();
  const realizedSales: RealizedSaleResult[] = [];

  for (const tx of ordered) {
    // Snapshot state before applying so computeRealizedSale can use pre-sell basis.
    // Only record the realized sale if applyTransaction ALSO succeeds (Bug #4 fix:
    // previously the sale was pushed before apply, so rejected oversells inflated P&L).
    const stateBefore = tx.type === "sell" ? state : null;
    const result = applyTransaction(state, tx);
    if (!result.ok) {
      // Skip invalid historical transactions to keep rebuild resilient
      continue;
    }
    if (tx.type === "sell" && stateBefore) {
      const sale = computeRealizedSale(stateBefore, tx);
      if (sale) realizedSales.push(sale);
    }
    state = result.state;
  }

  const positions: InventoryPosition[] = [];
  let totalUsdCostBasis = d(0);
  let totalKinsCostBasis = d(0);
  let totalQuantity = d(0);
  let totalEarnedQuantity = d(0);
  let totalPurchasedQuantity = d(0);

  for (const lot of state.values()) {
    if (lot.quantity.lte(0) && lot.usdCostBasis.lte(0) && lot.kinsCostBasis.lte(0)) {
      continue;
    }
    positions.push({
      itemId: lot.itemId,
      quantity: lot.quantity.toFixed(),
      purchasedQuantity: lot.purchasedQuantity.toFixed(),
      earnedQuantity: lot.earnedQuantity.toFixed(),
      usdCostBasis: lot.usdCostBasis.toFixed(),
      kinsCostBasis: lot.kinsCostBasis.toFixed(),
      averageUsdPerItem: safeDiv(lot.usdCostBasis, lot.quantity).toFixed(),
      averageKinsPerItem: safeDiv(lot.kinsCostBasis, lot.quantity).toFixed(),
    });
    totalUsdCostBasis = totalUsdCostBasis.plus(lot.usdCostBasis);
    totalKinsCostBasis = totalKinsCostBasis.plus(lot.kinsCostBasis);
    totalQuantity = totalQuantity.plus(lot.quantity);
    totalEarnedQuantity = totalEarnedQuantity.plus(lot.earnedQuantity);
    totalPurchasedQuantity = totalPurchasedQuantity.plus(lot.purchasedQuantity);
  }

  const totalRealizedUsdProfit = realizedSales.reduce(
    (acc, s) => acc.plus(d(s.realizedUsdProfit)),
    d(0),
  );
  const totalRealizedKinsProfit = realizedSales.reduce(
    (acc, s) => acc.plus(d(s.realizedKinsProfit)),
    d(0),
  );
  const totalNetSalesUsd = realizedSales.reduce(
    (acc, s) => acc.plus(d(s.netUsdReceived)),
    d(0),
  );
  const totalNetSalesKins = realizedSales.reduce(
    (acc, s) => acc.plus(d(s.netKinsReceived)),
    d(0),
  );

  return {
    positions: positions.sort((a, b) => a.itemId.localeCompare(b.itemId)),
    realizedSales,
    totalRealizedUsdProfit: totalRealizedUsdProfit.toFixed(),
    totalRealizedKinsProfit: totalRealizedKinsProfit.toFixed(),
    totalUsdCostBasis: totalUsdCostBasis.toFixed(),
    totalKinsCostBasis: totalKinsCostBasis.toFixed(),
    totalQuantity: totalQuantity.toFixed(),
    totalEarnedQuantity: totalEarnedQuantity.toFixed(),
    totalPurchasedQuantity: totalPurchasedQuantity.toFixed(),
    totalNetSalesUsd: totalNetSalesUsd.toFixed(),
    totalNetSalesKins: totalNetSalesKins.toFixed(),
  };
}

export function canSell(
  transactions: PortfolioTransaction[],
  itemId: string,
  quantity: string,
): { ok: true } | { ok: false; available: string; message: string } {
  const summary = rebuildPortfolio(transactions);
  const pos = summary.positions.find((p) => p.itemId === itemId);
  const available = d(pos?.quantity ?? "0");
  const qty = d(quantity);
  if (qty.lte(0)) {
    return { ok: false, available: available.toFixed(), message: "Quantity must be positive." };
  }
  if (qty.gt(available)) {
    return {
      ok: false,
      available: available.toFixed(),
      message: `Cannot sell ${qty.toFixed()} — only ${available.toFixed()} available.`,
    };
  }
  return { ok: true };
}

export function previewSell(
  transactions: PortfolioTransaction[],
  itemId: string,
  quantity: string,
  netUsd: string,
  netKins: string,
): RealizedSaleResult | { error: string } {
  const ordered = sortTransactions(transactions);
  let state = new Map<string, InventoryLotState>();
  for (const tx of ordered) {
    const result = applyTransaction(state, tx);
    if (result.ok) state = result.state;
  }
  const mock: PortfolioTransaction = {
    id: "preview",
    schemaVersion: 1,
    type: "sell",
    itemId,
    quantity,
    transactionAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    kinsAmount: netKins,
    usdAmountAtTransaction: netUsd,
    fingerprint: "preview",
    sellAmountIsNet: true,
  };
  const sale = computeRealizedSale(state, mock);
  if (!sale) {
    const lot = state.get(itemId);
    return {
      error: `Cannot sell ${quantity} — only ${(lot?.quantity ?? d(0)).toFixed()} available.`,
    };
  }
  return sale;
}

export function estimateUnrealized(params: {
  quantity: string;
  remainingUsdCostBasis: string;
  remainingKinsCostBasis: string;
  itemReferencePriceKins: string;
  currentKinsUsd: string;
  sellingFeePercent: string;
}): {
  grossCurrentKins: string;
  netCurrentKins: string;
  grossCurrentUsd: string;
  netCurrentUsd: string;
  unrealizedUsdProfit: string;
  unrealizedKinsProfit: string;
} {
  const qty = d(params.quantity);
  const ref = d(params.itemReferencePriceKins);
  const kinsUsd = d(params.currentKinsUsd);
  const fee = d(params.sellingFeePercent).div(100);

  const grossCurrentKins = qty.mul(ref);
  const netCurrentKins = grossCurrentKins.mul(d(1).minus(fee));
  const grossCurrentUsd = grossCurrentKins.mul(kinsUsd);
  const netCurrentUsd = netCurrentKins.mul(kinsUsd);

  return {
    grossCurrentKins: grossCurrentKins.toFixed(),
    netCurrentKins: netCurrentKins.toFixed(),
    grossCurrentUsd: grossCurrentUsd.toFixed(),
    netCurrentUsd: netCurrentUsd.toFixed(),
    unrealizedUsdProfit: netCurrentUsd.minus(d(params.remainingUsdCostBasis)).toFixed(),
    unrealizedKinsProfit: netCurrentKins.minus(d(params.remainingKinsCostBasis)).toFixed(),
  };
}

export function isEarnedType(type: TransactionType): boolean {
  return EARNED_TYPES.includes(type);
}
