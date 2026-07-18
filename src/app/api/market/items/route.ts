import { fail, ok } from "@/lib/api/response";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import {
  fetchMarketSummary,
  normalizeSummary,
  summarizeMarketBoard,
} from "@/lib/kintara/kintaramarket-xyz";
import { buildOfficialFloorBoard } from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * All-items board — same shape as kintaramarket.xyz /api/market.
 * Primary: kintaramarket complete summary (listings, totalQty, floor, token/gold split).
 * Fallback: official cheap-book aggregate if kintaramarket is down.
 */
export async function GET() {
  try {
    const rate = await resolveKinsUsd();

    try {
      const raw = await fetchMarketSummary();
      const rows = normalizeSummary(raw, rate?.kinsUsd);
      const board = summarizeMarketBoard(rows);

      return ok(
        {
          items: rows.map((r) => ({
            id: r.itemType,
            name: r.name,
            portfolioItemId: marketTypeToPortfolioId(
              r.itemType,
              STATIC_CATALOG,
            ),
            listings: r.listings,
            totalQty: r.totalQty,
            lowestUsdPerUnit: r.lowestUsdPerUnit,
            lowestKinsPerUnit: r.lowestKinsPerUnit,
            lowestGoldPerUnit: r.lowestGoldPerUnit,
            kinsListings: r.kinsListings,
            goldListings: r.goldListings,
          })),
          stats: board,
          configured: true,
          provider: "kintaramarket.xyz",
          kinsUsd: rate != null ? String(rate.kinsUsd) : null,
          goldFloorUsd: null,
          rateSource: rate?.source ?? null,
          note:
            "All-items summary from kintaramarket.xyz (full live book). Click an item for the complete price list.",
        },
        {
          source: "kintaramarket.xyz",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=20, stale-while-revalidate=45",
        },
      );
    } catch {
      // Fallback: official scan (partial)
      const rows = await buildOfficialFloorBoard({
        pages: 12,
        limit: 100,
        kinsUsd: rate?.kinsUsd,
      });
      const items = rows.map((r) => ({
        id: r.itemType,
        name: r.name,
        portfolioItemId: marketTypeToPortfolioId(r.itemType, STATIC_CATALOG),
        listings: r.listings,
        totalQty: r.totalQty,
        lowestUsdPerUnit: r.lowestUsdPerUnit,
        lowestKinsPerUnit: r.lowestKinsPerUnit,
        lowestGoldPerUnit: null as string | null,
        kinsListings: r.kinsListings,
        goldListings: r.goldListings,
      }));
      const board = summarizeMarketBoard(
        items.map((r) => ({
          itemType: r.id,
          name: r.name,
          listings: r.listings,
          totalQty: r.totalQty ?? 0,
          lowestUsdPerUnit: r.lowestUsdPerUnit,
          lowestGoldPerUnit: null,
          kinsListings: r.kinsListings ?? 0,
          goldListings: r.goldListings ?? 0,
          lowestKinsPerUnit: r.lowestKinsPerUnit,
        })),
      );

      return ok(
        {
          items,
          stats: board,
          configured: true,
          provider: "kintara.com",
          kinsUsd: rate != null ? String(rate.kinsUsd) : null,
          goldFloorUsd: null,
          rateSource: rate?.source ?? null,
          note:
            "Fallback floors from official cheap book (may be incomplete). Prefer kintaramarket when available.",
        },
        {
          source: "kintara.com",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=40, stale-while-revalidate=90",
        },
      );
    }
  } catch (e) {
    return fail(
      "MARKET_CATALOG_ERROR",
      e instanceof Error ? e.message : "Failed to load market floors",
      { status: 502, retryable: true },
    );
  }
}
