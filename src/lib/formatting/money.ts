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
