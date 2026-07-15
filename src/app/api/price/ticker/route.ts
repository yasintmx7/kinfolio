import { fail, ok } from "@/lib/api/response";
import { fetchKintaraMarketTicker } from "@/lib/prices/kintaramarket-ticker";

export const runtime = "nodejs";

/** Direct proxy for https://kintaramarket.xyz/api/ticker */
export async function GET() {
  try {
    const ticker = await fetchKintaraMarketTicker();
    if (!ticker) {
      return fail("TICKER_UNAVAILABLE", "kintaramarket.xyz ticker unavailable.", {
        status: 503,
        retryable: true,
      });
    }
    return ok(
      {
        kinsUsd: String(ticker.kinsUsd),
        goldFloorUsd:
          ticker.goldFloorUsd != null ? String(ticker.goldFloorUsd) : null,
      },
      {
        source: ticker.source,
        updatedAt: ticker.updatedAt,
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
