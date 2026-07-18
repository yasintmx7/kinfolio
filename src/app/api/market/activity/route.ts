import { fail, ok } from "@/lib/api/response";
import { fetchOfficialRecentActivity } from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { sanitizePersonName } from "@/lib/market/seller-label";

export const runtime = "nodejs";

/**
 * Live marketplace feed — official listings.
 * Query: limit (default 3000), pages (default 18 × 100 parallel per currency), gold=1.
 * Client polls ~3s with in-flight guard + short CDN cache.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const limit = Number(sp.get("limit") ?? "3000");
  const pages = Number(sp.get("pages") ?? "18");
  const includeGold = sp.get("gold") === "1" || sp.get("gold") === "true";
  const sort = sp.get("sort") === "cheap" ? "cheap" : "new";

  try {
    const rate = await resolveKinsUsd();
    const rows = await fetchOfficialRecentActivity({
      // Soft cap: enough for full-ish book without blowing serverless time
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 4000) : 3000,
      pages: Number.isFinite(pages) ? Math.min(Math.max(pages, 1), 25) : 18,
      kinsUsd: rate?.kinsUsd,
      includeGold,
      sort,
    });

    return ok(
      {
        activity: rows.map((r) => {
          const sellerName = sanitizePersonName(r.sellerName);
          return {
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
            sellerName,
            sellerId: r.sellerId,
            // Never put wallet into seller / sellerName
            seller: sellerName,
            buyerId: r.buyerId,
            buyerName: sanitizePersonName(r.buyerName),
            reserved: r.reserved,
            reservedUntilMs: r.reservedUntilMs,
            itemDurability: r.itemDurability,
            portfolioItemId: marketTypeToPortfolioId(r.itemType, STATIC_CATALOG),
            solscanUrl: null,
          };
        }),
        count: rows.length,
        kinsUsd: rate != null ? String(rate.kinsUsd) : null,
        rateSource: rate?.source ?? null,
        note:
          "Live official listings (cheap book). ~5s client poll. Read-only.",
      },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
        // Match ~5s client poll
        cacheControl: "public, s-maxage=3, stale-while-revalidate=8",
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
