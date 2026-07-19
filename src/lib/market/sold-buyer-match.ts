/** Match kintrade sale rows (buyer wallet + listingId) onto KM sale events. */

export type KinTradeMatchRow = {
  ts: number;
  itemType: string;
  qty: string;
  usd: string | null;
  signature?: string;
  buyer?: string;
  seller?: string;
  listingId?: string;
  hasItem: boolean;
  name: string;
  unitUsd: string | null;
  kinsTotal: string;
  unitKins: string;
  id: string;
};

/**
 * Match kintrade (has buyer wallet + listingId + solscan) to a KM sale event.
 * KM sales only have sellerName/item/qty/price — no buyer fields.
 */
export function findKinTradeMatch(
  ktBySig: KinTradeMatchRow[],
  tsMs: number,
  itemType: string,
  qty: number,
  lotUsd: number | null,
): KinTradeMatchRow | null {
  let best: KinTradeMatchRow | null = null;
  let bestScore = -1;

  for (const row of ktBySig) {
    if (!row.signature) continue;
    const dt = Math.abs(row.ts - tsMs);
    // Clocks between indexers can drift; prefer close matches
    if (dt > 120_000) continue;

    let score = 0;
    if (row.hasItem) {
      if (row.itemType !== itemType) continue;
      if (Number(row.qty) !== qty) continue;
      score += 50;
      if (
        lotUsd != null &&
        row.usd != null &&
        Math.abs(Number(row.usd) - lotUsd) <= Math.max(0.03, lotUsd * 0.2)
      ) {
        score += 20;
      }
    } else {
      // Incomplete kintrade: only tight USD + time
      if (lotUsd == null || row.usd == null) continue;
      if (Math.abs(Number(row.usd) - lotUsd) > Math.max(0.015, lotUsd * 0.08)) {
        continue;
      }
      score += 10;
    }

    // Closer in time wins
    score += Math.max(0, 30 - Math.floor(dt / 2000));

    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}
