import { fail, ok } from "@/lib/api/response";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";

export const runtime = "nodejs";

/** KINS rate via DexScreener / CoinGecko (same as /api/price/kins). */
export async function GET() {
  try {
    const rate = await resolveKinsUsd();
    if (!rate) {
      return fail("TICKER_UNAVAILABLE", "KINS price unavailable.", {
        status: 503,
        retryable: true,
      });
    }
    return ok(
      {
        kinsUsd: String(rate.kinsUsd),
        goldFloorUsd: null,
      },
      {
        source: rate.source,
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=20, stale-while-revalidate=60",
      },
    );
  } catch (e) {
    return fail(
      "TICKER_ERROR",
      e instanceof Error ? e.message : "Ticker fetch failed",
      { status: 502, retryable: true },
    );
  }
}
