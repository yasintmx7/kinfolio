import { fail, ok } from "@/lib/api/response";
import { searchOpenListings } from "@/lib/kintara/kintaramarket-xyz";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { sanitizePersonName } from "@/lib/market/seller-label";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Full-book market search (seller username, item type, listing id).
 * Uses kintaramarket /api/listings — covers lots missing from the cheap hub feed.
 *
 * GET /api/market/search?q=username
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? sp.get("search") ?? "").trim();
  const limit = Number(sp.get("limit") ?? "200");

  if (!q) {
    return fail("INVALID_QUERY", "q is required", { status: 400 });
  }
  if (q.length > 128) {
    return fail("INVALID_QUERY", "Query too long", { status: 400 });
  }

  try {
    const rate = await resolveKinsUsd();
    const rows = await searchOpenListings(q, {
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200,
      kinsUsd: rate?.kinsUsd,
    });

    const listings = rows.map((r) => {
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
        seller: sellerName,
        sellerId: r.sellerId,
        buyerId: r.buyerId,
        buyerName: null,
        reserved: r.reserved,
        reservedUntilMs: r.reservedUntilMs,
        itemDurability: r.itemDurability,
        portfolioItemId: marketTypeToPortfolioId(r.itemType, STATIC_CATALOG),
        solscanUrl: null,
        isSold: false,
      };
    });

    // Sellers that matched by name (for “open seller” UX)
    const sellers = new Map<string, { sellerName: string; count: number }>();
    for (const row of listings) {
      const n = row.sellerName;
      if (!n) continue;
      const key = n.toLowerCase();
      const cur = sellers.get(key);
      if (cur) cur.count++;
      else sellers.set(key, { sellerName: n, count: 1 });
    }

    return ok(
      {
        query: q,
        listings,
        count: listings.length,
        sellers: [...sellers.values()].sort((a, b) => b.count - a.count),
        note:
          listings.length > 0
            ? `Found ${listings.length} listing(s) in open book for “${q}”.`
            : `No listings matched “${q}” in the open book (max ~1000 live lots).`,
        source: "kintaramarket.xyz",
      },
      {
        source: "kintaramarket.xyz",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=8, stale-while-revalidate=20",
      },
    );
  } catch (e) {
    return fail(
      "MARKET_SEARCH_ERROR",
      e instanceof Error ? e.message : "Search failed",
      { status: 502, retryable: true },
    );
  }
}
