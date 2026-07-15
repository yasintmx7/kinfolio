import { fail, ok } from "@/lib/api/response";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { buildOfficialFloorBoard } from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";

export const runtime = "nodejs";

/**
 * Market floor board from official Kintara marketplace listings.
 * GET https://kintara.com/api/marketplace/listings (aggregated)
 */
export async function GET() {
  try {
    const rate = await resolveKinsUsd();
    const rows = await buildOfficialFloorBoard({
      pages: 50,
      limit: 100,
      kinsUsd: rate?.kinsUsd,
    });

    return ok(
      {
        items: rows.map((r) => ({
          id: r.itemType,
          name: r.name,
          portfolioItemId: marketTypeToPortfolioId(r.itemType, STATIC_CATALOG),
          listings: r.listings,
          totalQty: r.totalQty,
          lowestUsdPerUnit: r.lowestUsdPerUnit,
          lowestKinsPerUnit: r.lowestKinsPerUnit,
          lowestGoldPerUnit: null,
          kinsListings: r.kinsListings,
          goldListings: r.goldListings,
        })),
        configured: true,
        provider: "kintara.com",
        kinsUsd: rate != null ? String(rate.kinsUsd) : null,
        goldFloorUsd: null,
        rateSource: rate?.source ?? null,
        note:
          "Floors from official Kintara marketplace listings. Estimates only — not guaranteed sale prices.",
      },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=40, stale-while-revalidate=90",
      },
    );
  } catch (e) {
    return fail(
      "MARKET_CATALOG_ERROR",
      e instanceof Error ? e.message : "Failed to load market floors",
      { status: 502, retryable: true },
    );
  }
}
