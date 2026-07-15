import { d, Decimal } from "@/lib/accounting/decimal";

export function formatKins(value: string | number | Decimal, maxDecimals = 8): string {
  const n = d(value);
  if (n.isZero()) return "0";
  const fixed = n.toFixed(maxDecimals);
  return trimTrailingZeros(fixed);
}

export function formatUsd(
  value: string | number | Decimal | null | undefined,
  options?: { maxDecimals?: number; unavailableLabel?: string },
): string {
  if (value === null || value === undefined || value === "") {
    return options?.unavailableLabel ?? "Not available";
  }
  const n = d(value);
  if (!n.isFinite()) return options?.unavailableLabel ?? "Not available";

  const abs = n.abs();
  let decimals = options?.maxDecimals ?? 6;
  if (abs.gte(1000)) decimals = 2;
  else if (abs.gte(1)) decimals = Math.min(decimals, 4);
  else if (abs.gte(0.01)) decimals = Math.min(decimals, 6);
  else decimals = Math.min(decimals, 8);

  const sign = n.lt(0) ? "-" : "";
  return `${sign}$${trimTrailingZeros(abs.toFixed(decimals))}`;
}

export function formatPercent(value: string | number | Decimal, decimals = 2): string {
  const n = d(value);
  const sign = n.gt(0) ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

export function formatQty(value: string | number | Decimal): string {
  const n = d(value);
  if (n.isInteger()) return n.toFixed(0);
  return trimTrailingZeros(n.toFixed(8));
}

/** Compact qty: 5000 → 5k, 1200 → 1.2k, 1500000 → 1.5m */
export function formatQtyCompact(value: string | number | Decimal): string {
  const n = d(value);
  if (!n.isFinite() || n.isZero()) return "0";
  const abs = n.abs();
  const sign = n.lt(0) ? "-" : "";
  if (abs.gte(1_000_000)) {
    const m = abs.div(1_000_000);
    return `${sign}${trimTrailingZeros(m.toFixed(m.gte(10) ? 1 : 2))}m`;
  }
  if (abs.gte(1_000)) {
    const k = abs.div(1_000);
    return `${sign}${trimTrailingZeros(k.toFixed(k.gte(10) ? 1 : 2))}k`;
  }
  if (n.isInteger()) return n.toFixed(0);
  return trimTrailingZeros(n.toFixed(2));
}

/** Short $ for market lists: $0.1, $1.25, $12 */
export function formatUsdShort(
  value: string | number | Decimal | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = d(value);
  if (!n.isFinite()) return "—";
  const abs = n.abs();
  let decimals = 2;
  if (abs.gt(0) && abs.lt(0.01)) decimals = 6;
  else if (abs.lt(0.1)) decimals = 4;
  else if (abs.lt(1)) decimals = 3;
  else if (abs.gte(100)) decimals = 2;
  const sign = n.lt(0) ? "-" : "";
  return `${sign}$${trimTrailingZeros(abs.toFixed(decimals))}`;
}

/** Unit price as $/1k units (e.g. $0.000026/u → $0.026/1k). */
export function formatUsdPer1k(
  unitUsd: string | number | Decimal | null | undefined,
): string {
  if (unitUsd === null || unitUsd === undefined || unitUsd === "") return "—";
  const n = d(unitUsd);
  if (!n.isFinite()) return "—";
  return formatUsdShort(n.mul(1000));
}

function trimTrailingZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

export function signedClass(value: string | number | Decimal): string {
  const n = d(value);
  if (n.gt(0)) return "text-profit";
  if (n.lt(0)) return "text-loss";
  return "text-muted";
}
