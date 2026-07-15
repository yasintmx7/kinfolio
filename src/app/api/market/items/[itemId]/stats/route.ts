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
import { fetchOfficialItemStats } from "@/lib/kintara/official-marketplace";
import { resolveKinsUsdForMarket } from "@/lib/prices/kintaramarket-ticker";

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
  const typeCandidates = Array.from(
    new Set([itemId, marketType, itemId.replace(/-/g, "_")]),
  );

  try {
    const rate = await resolveKinsUsdForMarket();
    const kinsUsd = rate?.kinsUsd;

    // 1) Official 30d stats (kintara.com)
    let official = null as Awaited<ReturnType<typeof fetchOfficialItemStats>> | null;
    try {
      official = await fetchOfficialItemStats(marketType, kinsUsd);
    } catch {
      // optional
    }

    // 2) Community floors / listings stats
    let community =
      isMarketplaceConfigured()
        ? await marketplaceAdapter.getItemStats(marketType).catch(() => null)
        : null;

    // 3) Completed sales (kintrade)
    let recentMedian: string | null = null;
    let salesSamples: { timestamp: string; unitPriceKins: string; quantity?: string; saleCount?: number }[] = [];
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
      // optional
    }

    const samples =
      salesSamples.length > 0
        ? salesSamples
        : official?.samples?.length
          ? official.samples
          : community?.samples ?? [];

    return ok(
      {
        itemId,
        marketType,
        currency: "token" as const,
        avg30dKins: official?.avg30dKins ?? community?.avg30dKins,
        lowestActiveKins: community?.lowestActiveKins,
        medianCheapest3Kins: community?.medianCheapest3Kins,
        medianRecentSalesKins: recentMedian ?? undefined,
        sales30d: official?.sales30d ?? (salesCount || community?.sales30d),
        samples,
        updatedAt: new Date().toISOString(),
        configured: true,
        sources: {
          officialStats: official ? "kintara.com/api/marketplace/stats" : null,
          listings: isMarketplaceConfigured() ? "kintaramarket.xyz" : null,
          recentSales: salesCount > 0 ? "kintrade.xyz" : null,
          rate: rate?.source ?? null,
        },
        note:
          "avg30d from official stats (USD→KINS). Floors from community market. Recent median from completed sales. Estimates only.",
      },
      {
        source: "merged",
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
