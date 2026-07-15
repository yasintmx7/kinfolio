import { fail, ok } from "@/lib/api/response";
import { fetchOfficialRecentActivity } from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";

export const runtime = "nodejs";

/**
 * Live marketplace feed — official listings.
 * Query: limit (default 800), pages (default 8 × 100 parallel), gold=1.
 * Fast enough for ~10s client poll without hanging refresh.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const limit = Number(sp.get("limit") ?? "1200");
  const pages = Number(sp.get("pages") ?? "10");
  const includeGold = sp.get("gold") === "1" || sp.get("gold") === "true";
  const sort = sp.get("sort") === "cheap" ? "cheap" : "new";

  try {
    const rate = await resolveKinsUsd();
    const rows = await fetchOfficialRecentActivity({
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 2500) : 1200,
      pages: Number.isFinite(pages) ? Math.min(Math.max(pages, 1), 20) : 10,
      kinsUsd: rate?.kinsUsd,
      includeGold,
      sort,
    });

    return ok(
      {
        activity: rows.map((r) => ({
          id: r.id,
          listingId: r.listingId,
          name: r.name,
          itemType: r.itemType,
          quantity: r.quantity,
          unitKins: r.unitKins,
          totalKins: r.totalKins,
          unitUsd: r.unitUsd,
          usdTotal: r.usdTotal,
          priceGold: r.priceGold,
          currency: r.currency,
          timestamp: r.timestamp,
          sellerName: r.sellerName,
          sellerId: r.sellerId,
          seller: r.sellerName,
          buyerId: r.buyerId,
          buyerName: r.buyerName,
          reserved: r.reserved,
          reservedUntilMs: r.reservedUntilMs,
          itemDurability: r.itemDurability,
          portfolioItemId: marketTypeToPortfolioId(r.itemType, STATIC_CATALOG),
          solscanUrl: null,
        })),
        count: rows.length,
        kinsUsd: rate != null ? String(rate.kinsUsd) : null,
        rateSource: rate?.source ?? null,
        note:
          "Sales activity = newest official listings (live market). Full feed until API empty. ~10s refresh. Read-only.",
      },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
        // short browser/CDN cache so 10s polling gets fresh data
        cacheControl: "public, s-maxage=5, stale-while-revalidate=15",
      },
    );
  } catch (e) {
    return fail(
      "ACTIVITY_ERROR",
      e instanceof Error ? e.message : "Failed to load market activity",
      { status: 502, retryable: true },
    );
  }
}
