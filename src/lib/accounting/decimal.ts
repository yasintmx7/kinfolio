import Decimal from "decimal.js";

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 30,
});

export { Decimal };

export function d(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (cleaned === "" || cleaned === ".") return new Decimal(0);
    return new Decimal(cleaned);
  }
  return new Decimal(value);
}

export function decStr(value: Decimal | string | number, places?: number): string {
  const n = d(value);
  if (places === undefined) {
    return n.toFixed();
  }
  return n.toFixed(places);
}

export function safeDiv(numerator: Decimal, denominator: Decimal): Decimal {
  if (denominator.isZero()) return new Decimal(0);
  return numerator.div(denominator);
}

export function isPositive(value: Decimal | string): boolean {
  return d(value).gt(0);
}

export function clampNonNegative(value: Decimal): Decimal {
  return value.lt(0) ? new Decimal(0) : value;
}
