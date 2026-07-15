import { getCached, setCache } from "@/lib/api/cache";
import { fail, ok } from "@/lib/api/response";
import { fetchCoinGeckoKinsPrice } from "@/lib/prices/coingecko";
import {
  fetchDexScreenerKinsPrice,
  type KinsPrice,
} from "@/lib/prices/dexscreener";
import {
  fetchKintaraMarketTicker,
  tickerToKinsPrice,
} from "@/lib/prices/kintaramarket-ticker";

export const runtime = "nodejs";

const CACHE_KEY = "kins-price";
const TTL = 45;

/**
 * Price sources (first success wins):
 * 1. DexScreener (highest-liquidity pair)
 * 2. kintaramarket.xyz /api/ticker (game market rate)
 * 3. CoinGecko
 * 4. Stale cache
 */
export async function GET() {
  const cached = getCached<KinsPrice>(CACHE_KEY);
  if (cached && !cached.stale) {
    return ok(cached.value, {
      source: cached.value.source,
      updatedAt: cached.updatedAt,
      cached: true,
      stale: false,
      cacheControl: "public, s-maxage=30, stale-while-revalidate=60",
    });
  }

  try {
    const dex = await fetchDexScreenerKinsPrice();
    if (dex) {
      setCache(CACHE_KEY, dex, TTL);
      return ok(dex, {
        source: dex.source,
        updatedAt: dex.updatedAt,
        cached: false,
        stale: false,
        cacheControl: "public, s-maxage=30, stale-while-revalidate=60",
      });
    }

    const ticker = await fetchKintaraMarketTicker();
    if (ticker) {
      const price = tickerToKinsPrice(ticker);
      setCache(CACHE_KEY, price, TTL);
      return ok(price, {
        source: price.source,
        updatedAt: price.updatedAt,
        cached: false,
        stale: false,
        cacheControl: "public, s-maxage=30, stale-while-revalidate=60",
      });
    }

    const cg = await fetchCoinGeckoKinsPrice();
    if (cg) {
      setCache(CACHE_KEY, cg, TTL);
      return ok(cg, {
        source: cg.source,
        updatedAt: cg.updatedAt,
        cached: false,
        stale: false,
        cacheControl: "public, s-maxage=30, stale-while-revalidate=60",
      });
    }

    if (cached) {
      return ok(
        { ...cached.value, source: "cache" as const },
        {
          source: "cache",
          updatedAt: cached.updatedAt,
          cached: true,
          stale: true,
          cacheControl: "public, s-maxage=10, stale-while-revalidate=60",
        },
      );
    }

    return fail("PRICE_UNAVAILABLE", "KINS price unavailable from all sources.", {
      status: 503,
      retryable: true,
    });
  } catch {
    if (cached) {
      return ok(
        { ...cached.value, source: "cache" as const },
        {
          source: "cache",
          updatedAt: cached.updatedAt,
          cached: true,
          stale: true,
        },
      );
    }
    return fail("PRICE_ERROR", "Failed to fetch KINS price.", {
      status: 502,
      retryable: true,
    });
  }
}
