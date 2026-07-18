/**
 * Compare portfolio average cost (USD/unit) to live market floor (USD/unit).
 * Positive delta = floor above your cost (paper green).
 */

export type CostVsFloor = {
  avgCostUsd: number;
  floorUsd: number;
  /** floor − cost (per unit) */
  deltaUsd: number;
  /** % vs your cost */
  deltaPct: number;
  status: "profit" | "loss" | "flat";
};

export function costVsFloor(
  avgCostUsd: number | string | null | undefined,
  floorUsd: number | string | null | undefined,
): CostVsFloor | null {
  const avg = typeof avgCostUsd === "string" ? Number(avgCostUsd) : avgCostUsd;
  const floor = typeof floorUsd === "string" ? Number(floorUsd) : floorUsd;
  if (
    avg == null ||
    floor == null ||
    !Number.isFinite(avg) ||
    !Number.isFinite(floor) ||
    avg <= 0 ||
    floor <= 0
  ) {
    return null;
  }
  const deltaUsd = floor - avg;
  const deltaPct = (deltaUsd / avg) * 100;
  const status: CostVsFloor["status"] =
    deltaPct > 1 ? "profit" : deltaPct < -1 ? "loss" : "flat";
  return { avgCostUsd: avg, floorUsd: floor, deltaUsd, deltaPct, status };
}

export function formatDeltaPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
