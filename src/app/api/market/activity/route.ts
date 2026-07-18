import { fail, ok } from "@/lib/api/response";
import { fetchOfficialRecentActivity } from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { sanitizePersonName } from "@/lib/market/seller-label";

export const runtime = "nodejs";
/** Allow larger book scans on Vercel (default hobby is often 10s). */
export const maxDuration = 60;

/**
 * Live marketplace feed — official listings.
 * Query: limit (default 1200), pages (default 10 × 100 parallel per currency), gold=1.
 * Client uses a fast pass then optional deep fill.
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
      // Soft cap: full-ish book; client prefers progressive load
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 4000) : 1200,
      pages: Number.isFinite(pages) ? Math.min(Math.max(pages, 1), 25) : 10,
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
