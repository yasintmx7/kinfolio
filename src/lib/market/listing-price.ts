/**
 * Canonical marketplace price math for official kintara.com listings.
 *
 * Official field semantics (verified against sort=cheap order):
 *   - priceUsd  = LOT total USD for the stack (not per-unit)
 *   - unitUsd   = priceUsd / quantity
 *   - priceGold = gold cost (gold listings often have priceUsd=null)
 *
 * All market UI / API mapping MUST use these helpers so feature work
 * cannot re-break prices.
 */

import { d, Decimal } from "@/lib/accounting/decimal";

export type ListingPriceFields = {
  quantity: number;
  /** Lot total USD for the whole stack */
  lotUsd: number | null;
  /** USD per single unit */
  unitUsd: number | null;
  /** USD per 1000 units */
  per1kUsd: number | null;
  priceGold: number | null;
  currency: "token" | "gold" | string;
};

export type ListingPriceInput = {
  quantity?: number | string | null;
  /** Official API: lot total for token listings */
  priceUsd?: number | string | null;
  /** Already-computed unit (optional override) */
  unitUsd?: number | string | null;
  /** Already-computed lot total (optional) */
  usdTotal?: number | string | null;
  priceGold?: number | string | null;
  currency?: string | null;
};

function finitePositive(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize any listing-like row into lot / unit / per-1k.
 * Prefer explicit unitUsd+usdTotal when both present; else derive from priceUsd lot.
 */
export function normalizeListingPrice(
  input: ListingPriceInput,
): ListingPriceFields {
  const qtyRaw = toNum(input.quantity);
  // "?" or invalid qty → do not invent unit prices
  const hasQty = qtyRaw != null && qtyRaw > 0;
  const quantity = hasQty ? Math.max(qtyRaw, 1) : 1;
  const currency = (input.currency ?? "token") || "token";

  const explicitLot = finitePositive(toNum(input.usdTotal) ?? NaN);
  const explicitUnit = finitePositive(toNum(input.unitUsd) ?? NaN);
  // Official kintara.com field: priceUsd is always LOT total for the stack
  const apiLotUsd = finitePositive(toNum(input.priceUsd) ?? NaN);
  const priceGold = finitePositive(toNum(input.priceGold) ?? NaN);

  let lotUsd: number | null = null;
  let unitUsd: number | null = null;

  // Priority: official priceUsd (lot) > usdTotal (lot) > unitUsd×qty
  if (apiLotUsd != null) {
    lotUsd = apiLotUsd;
    unitUsd = hasQty ? (explicitUnit ?? lotUsd / quantity) : explicitUnit;
  } else if (explicitLot != null) {
    lotUsd = explicitLot;
    // Only divide when qty is real — never treat missing qty as 1
    unitUsd = hasQty ? (explicitUnit ?? lotUsd / quantity) : explicitUnit;
  } else if (explicitUnit != null && hasQty) {
    unitUsd = explicitUnit;
    lotUsd = unitUsd * quantity;
  } else if (explicitUnit != null) {
    unitUsd = explicitUnit;
  }

  // Guard: if unit ≈ lot while qty >> 1, unit was never divided (bad data)
  if (
    hasQty &&
    quantity > 1 &&
    lotUsd != null &&
    unitUsd != null &&
    Math.abs(unitUsd - lotUsd) / Math.max(lotUsd, 1e-12) < 0.01
  ) {
    unitUsd = lotUsd / quantity;
  }

  const per1kUsd = unitUsd != null ? unitUsd * 1000 : null;

  return {
    quantity,
    lotUsd,
    unitUsd,
    per1kUsd,
    priceGold,
    currency,
  };
}

/** High-accuracy $ for market (does not collapse tiny unit prices). */
export function formatUsdMarket(
  value: string | number | Decimal | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = d(value);
  if (!n.isFinite() || n.lte(0)) return "—";
  const abs = n.abs();
  let decimals = 2;
  if (abs.lt(0.000001)) decimals = 10;
  else if (abs.lt(0.0001)) decimals = 8;
  else if (abs.lt(0.01)) decimals = 6;
  else if (abs.lt(0.1)) decimals = 5;
  else if (abs.lt(1)) decimals = 4;
  else if (abs.lt(100)) decimals = 3;
  else decimals = 2;
  const sign = n.lt(0) ? "-" : "";
  return `${sign}$${trimZeros(abs.toFixed(decimals))}`;
}

export function formatUsdPer1kMarket(
  unitUsd: string | number | Decimal | null | undefined,
): string {
  if (unitUsd === null || unitUsd === undefined || unitUsd === "") return "—";
  const n = d(unitUsd);
  if (!n.isFinite() || n.lte(0)) return "—";
  return formatUsdMarket(n.mul(1000));
}

function trimZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

/** Display strings for list rows / sheets */
export function listingPriceLabels(input: ListingPriceInput): {
  lotLabel: string;
  per1kLabel: string | null;
  goldLabel: string | null;
  lotUsd: number | null;
  unitUsd: number | null;
  per1kUsd: number | null;
} {
  const p = normalizeListingPrice(input);
  let lotLabel: string;
  if (p.lotUsd != null) lotLabel = formatUsdMarket(p.lotUsd);
  else if (p.priceGold != null) lotLabel = `${trimZeros(String(p.priceGold))}g`;
  else lotLabel = "—";

  const per1kLabel =
    p.per1kUsd != null ? formatUsdMarket(p.per1kUsd) : null;
  const goldLabel =
    p.priceGold != null && p.lotUsd != null
      ? `${trimZeros(String(p.priceGold))}g`
      : null;

  return {
    lotLabel,
    per1kLabel,
    goldLabel,
    lotUsd: p.lotUsd,
    unitUsd: p.unitUsd,
    per1kUsd: p.per1kUsd,
  };
}
