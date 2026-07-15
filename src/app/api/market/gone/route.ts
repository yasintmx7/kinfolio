import { fail, ok } from "@/lib/api/response";
import { fetchGoneListingIds } from "@/lib/kintara/kintrade-gone";

export const runtime = "nodejs";

/**
 * Read-only proxy for https://www.kintrade.xyz/api/gone
 * Returns listing IDs that are no longer active (sold, cancelled, expired).
 */
export async function GET() {
  try {
    const gone = await fetchGoneListingIds();
    return ok(
      {
        ids: gone.ids,
        count: gone.count,
        note:
          "Listing IDs that are gone from the live book. Used to filter stale active listings. Read-only.",
      },
      {
        source: gone.source,
        updatedAt: gone.updatedAt,
        cacheControl: "public, s-maxage=20, stale-while-revalidate=60",
      },
    );
  } catch (e) {
    return fail(
      "GONE_LISTINGS_ERROR",
      e instanceof Error ? e.message : "Failed to load gone listing ids",
      { status: 502, retryable: true },
    );
  }
}
