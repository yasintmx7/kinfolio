import { KINS_MINT } from "@/config/kintara";
import { fetchWithTimeout } from "@/lib/api/cache";
import { z } from "zod";

const pairSchema = z.object({
  chainId: z.string().optional(),
  dexId: z.string().optional(),
  pairAddress: z.string().optional(),
  url: z.string().optional(),
  priceUsd: z.union([z.string(), z.number()]).optional(),
  priceNative: z.union([z.string(), z.number()]).optional(),
  liquidity: z
    .object({
      usd: z.number().optional(),
    })
    .optional(),
  volume: z
    .object({
      h24: z.number().optional(),
    })
    .optional(),
  priceChange: z
    .object({
      h24: z.number().optional(),
    })
    .optional(),
  baseToken: z
    .object({
      address: z.string().optional(),
      symbol: z.string().optional(),
    })
    .optional(),
  quoteToken: z
    .object({
      address: z.string().optional(),
      symbol: z.string().optional(),
    })
    .optional(),
});

export type KinsPrice = {
  priceUsd: string;
  priceNative?: string;
  change24h?: number;
  liquidityUsd?: number;
  volume24h?: number;
  dexId?: string;
  pairAddress?: string;
  pairUrl?: string;
  updatedAt: string;
  source: "dexscreener" | "coingecko" | "cache" | "manual";
};

function mintMatches(address?: string): boolean {
  if (!address) return false;
  return address.toLowerCase() === KINS_MINT.toLowerCase();
}

export async function fetchDexScreenerKinsPrice(): Promise<KinsPrice | null> {
  const url = `https://api.dexscreener.com/token-pairs/v1/solana/${KINS_MINT}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      timeoutMs: 8000,
      headers: { Accept: "application/json" },
      next: { revalidate: 45 },
    } as RequestInit & { timeoutMs: number });
  } catch {
    // retry once
    try {
      res = await fetchWithTimeout(url, {
        timeoutMs: 8000,
        headers: { Accept: "application/json" },
      });
    } catch {
      return null;
    }
  }

  if (!res.ok) return null;
  const json: unknown = await res.json();
  if (!Array.isArray(json)) return null;

  const valid = json
    .map((row) => pairSchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => r.data)
    .filter((p) => {
      const hasMint =
        mintMatches(p.baseToken?.address) || mintMatches(p.quoteToken?.address);
      const price = Number(p.priceUsd);
      return hasMint && Number.isFinite(price) && price > 0;
    })
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));

  const best = valid[0];
  if (!best || !best.priceUsd) return null;

  return {
    priceUsd: String(best.priceUsd),
    priceNative: best.priceNative != null ? String(best.priceNative) : undefined,
    change24h: best.priceChange?.h24,
    liquidityUsd: best.liquidity?.usd,
    volume24h: best.volume?.h24,
    dexId: best.dexId,
    pairAddress: best.pairAddress,
    pairUrl: best.url,
    updatedAt: new Date().toISOString(),
    source: "dexscreener",
  };
}
