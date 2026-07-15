import { KINS_MINT } from "@/config/kintara";
import { fetchWithTimeout } from "@/lib/api/cache";
import type { KinsPrice } from "@/lib/prices/dexscreener";
import { z } from "zod";

const simplePriceSchema = z.record(
  z.string(),
  z.object({
    usd: z.number().optional(),
    usd_24h_change: z.number().optional(),
    last_updated_at: z.number().optional(),
  }),
);

export async function fetchCoinGeckoKinsPrice(): Promise<KinsPrice | null> {
  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: HeadersInit = { Accept: "application/json" };
  if (apiKey) headers["x-cg-pro-api-key"] = apiKey;

  // Prefer id lookup first
  const idUrl =
    "https://api.coingecko.com/api/v3/simple/price?ids=kintara&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true";

  try {
    const res = await fetchWithTimeout(idUrl, { timeoutMs: 8000, headers });
    if (res.ok) {
      const json: unknown = await res.json();
      const parsed = simplePriceSchema.safeParse(json);
      if (parsed.success && parsed.data.kintara?.usd) {
        const row = parsed.data.kintara;
        return {
          priceUsd: String(row.usd),
          change24h: row.usd_24h_change,
          updatedAt: row.last_updated_at
            ? new Date(row.last_updated_at * 1000).toISOString()
            : new Date().toISOString(),
          source: "coingecko",
        };
      }
    }
  } catch {
    // fall through to contract lookup
  }

  const contractUrl = `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${KINS_MINT}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
  try {
    const res = await fetchWithTimeout(contractUrl, { timeoutMs: 8000, headers });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = simplePriceSchema.safeParse(json);
    if (!parsed.success) return null;
    const key = Object.keys(parsed.data).find(
      (k) => k.toLowerCase() === KINS_MINT.toLowerCase(),
    );
    if (!key) return null;
    const row = parsed.data[key];
    if (!row?.usd || row.usd <= 0) return null;
    return {
      priceUsd: String(row.usd),
      change24h: row.usd_24h_change,
      updatedAt: row.last_updated_at
        ? new Date(row.last_updated_at * 1000).toISOString()
        : new Date().toISOString(),
      source: "coingecko",
    };
  } catch {
    return null;
  }
}
