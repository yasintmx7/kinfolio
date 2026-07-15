import { fetchCoinGeckoKinsPrice } from "@/lib/prices/coingecko";
import { fetchDexScreenerKinsPrice } from "@/lib/prices/dexscreener";

/** Public KINS/USD for valuation — DexScreener then CoinGecko only. */
export async function resolveKinsUsd(): Promise<{
  kinsUsd: number;
  source: string;
} | null> {
  try {
    const dex = await fetchDexScreenerKinsPrice();
    if (dex?.priceUsd) {
      const n = Number(dex.priceUsd);
      if (Number.isFinite(n) && n > 0) {
        return { kinsUsd: n, source: "dexscreener" };
      }
    }
  } catch {
    // continue
  }

  try {
    const cg = await fetchCoinGeckoKinsPrice();
    if (cg?.priceUsd) {
      const n = Number(cg.priceUsd);
      if (Number.isFinite(n) && n > 0) {
        return { kinsUsd: n, source: "coingecko" };
      }
    }
  } catch {
    // continue
  }

  return null;
}
