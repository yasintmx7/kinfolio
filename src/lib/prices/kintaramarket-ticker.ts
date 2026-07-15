import { fetchWithTimeout, getCached, setCache } from "@/lib/api/cache";
import type { KinsPrice } from "@/lib/prices/dexscreener";
import { z } from "zod";

const tickerSchema = z.object({
  kinsUsd: z.number().positive(),
  goldFloorUsd: z.number().nullable().optional(),
});

export type KintaraMarketTicker = {
  kinsUsd: number;
  goldFloorUsd: number | null;
  updatedAt: string;
  source: "kintaramarket.xyz";
};

const CACHE_KEY = "kmxyz:ticker";
const TTL = 30;

export async function fetchKintaraMarketTicker(): Promise<KintaraMarketTicker | null> {
  const cached = getCached<KintaraMarketTicker>(CACHE_KEY);
  if (cached && !cached.stale) return cached.value;

  try {
    const res = await fetchWithTimeout("https://kintaramarket.xyz/api/ticker", {
      timeoutMs: 8000,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (cached) return { ...cached.value };
      return null;
    }
    const json: unknown = await res.json();
    const parsed = tickerSchema.safeParse(json);
    if (!parsed.success) {
      if (cached) return { ...cached.value };
      return null;
    }
    const value: KintaraMarketTicker = {
      kinsUsd: parsed.data.kinsUsd,
      goldFloorUsd:
        parsed.data.goldFloorUsd != null && Number.isFinite(parsed.data.goldFloorUsd)
          ? parsed.data.goldFloorUsd
          : null,
      updatedAt: new Date().toISOString(),
      source: "kintaramarket.xyz",
    };
    setCache(CACHE_KEY, value, TTL);
    return value;
  } catch {
    if (cached) return { ...cached.value };
    return null;
  }
}

export function tickerToKinsPrice(ticker: KintaraMarketTicker): KinsPrice {
  return {
    priceUsd: String(ticker.kinsUsd),
    goldFloorUsd:
      ticker.goldFloorUsd != null ? String(ticker.goldFloorUsd) : undefined,
    updatedAt: ticker.updatedAt,
    source: "kintaramarket",
  };
}

/** Prefer market ticker so USD floors convert with the same rate the market site uses. */
export async function resolveKinsUsdForMarket(): Promise<{
  kinsUsd: number;
  goldFloorUsd: number | null;
  source: string;
} | null> {
  const ticker = await fetchKintaraMarketTicker();
  if (ticker) {
    return {
      kinsUsd: ticker.kinsUsd,
      goldFloorUsd: ticker.goldFloorUsd,
      source: "kintaramarket.xyz/ticker",
    };
  }

  try {
    const { fetchDexScreenerKinsPrice } = await import("@/lib/prices/dexscreener");
    const dex = await fetchDexScreenerKinsPrice();
    if (dex?.priceUsd) {
      return {
        kinsUsd: Number(dex.priceUsd),
        goldFloorUsd: null,
        source: dex.source,
      };
    }
  } catch {
    // continue
  }

  try {
    const { fetchCoinGeckoKinsPrice } = await import("@/lib/prices/coingecko");
    const cg = await fetchCoinGeckoKinsPrice();
    if (cg?.priceUsd) {
      return {
        kinsUsd: Number(cg.priceUsd),
        goldFloorUsd: null,
        source: cg.source,
      };
    }
  } catch {
    // continue
  }

  return null;
}
