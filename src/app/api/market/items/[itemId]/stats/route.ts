import { isMarketplaceConfigured } from "@/config/kintara-api";
import { marketplaceAdapter } from "@/lib/kintara/marketplace-adapter";
import { fail, ok } from "@/lib/api/response";
import {
  fetchRecentSales,
  medianUnitKins,
  salesToSoldSamples,
} from "@/lib/kintara/kintrade-sales";
import { portfolioIdToMarketType } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  if (!itemId || itemId.length > 128) {
    return fail("INVALID_ITEM", "Invalid item id", { status: 400 });
  }

  const marketType = portfolioIdToMarketType(itemId, STATIC_CATALOG);
  // Also accept raw market itemType ids (e.g. cooked_fish_meat)
  const typeCandidates = Array.from(
    new Set([itemId, marketType, itemId.replace(/-/g, "_")]),
  );

  try {
    let baseStats =
      isMarketplaceConfigured()
        ? await marketplaceAdapter.getItemStats(marketType).catch(() => null)
        : null;

    if (!baseStats) {
      baseStats = {
        itemId: marketType,
        currency: "token" as const,
        samples: [],
        updatedAt: new Date().toISOString(),
      };
    }

    // Enrich with completed sales from kintrade.xyz
    let recentMedian: string | null = null;
    let salesSamples = baseStats.samples;
    let salesCount = 0;
    try {
      const allSales = await fetchRecentSales({ limit: 100 });
      const matched = allSales.filter((s) =>
        typeCandidates.some(
          (c) =>
            s.itemType === c ||
            s.itemType.replace(/_/g, "-") === c.replace(/_/g, "-"),
        ),
      );
      salesCount = matched.length;
      if (matched.length) {
        recentMedian = medianUnitKins(matched);
        salesSamples = salesToSoldSamples(matched);
      }
    } catch {
      // listings-only still OK
    }

    return ok(
      {
        ...baseStats,
        itemId,
        marketType,
        medianRecentSalesKins: recentMedian ?? undefined,
        samples: salesSamples,
        sales30d: salesCount || baseStats.sales30d,
        configured: true,
        sources: {
          listings: isMarketplaceConfigured() ? "kintaramarket.xyz" : null,
          recentSales: salesCount > 0 ? "kintrade.xyz" : null,
        },
      },
      {
        source: salesCount > 0 ? "kintaramarket+kintrade" : "marketplace",
        updatedAt: new Date().toISOString(),
      },
    );
  } catch (e) {
    return fail(
      "MARKET_STATS_ERROR",
      e instanceof Error ? e.message : "Failed to load item stats",
      { status: 502, retryable: true },
    );
  }
}
