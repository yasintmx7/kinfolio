import { fail, ok } from "@/lib/api/response";
import { portfolioIdToMarketType } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import {
  fetchOfficialItemStats,
  fetchOfficialListingsForItem,
} from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { d } from "@/lib/accounting/decimal";

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

  try {
    const rate = await resolveKinsUsd();
    const kinsUsd = rate?.kinsUsd;

    const [official, listings] = await Promise.all([
      fetchOfficialItemStats(marketType, kinsUsd).catch(() => null),
      fetchOfficialListingsForItem(marketType, {
        pages: 3,
        kinsUsd,
      }).catch(() => [] as Awaited<ReturnType<typeof fetchOfficialListingsForItem>>),
    ]);

    const units = listings
      .map((l) => d(l.unitPriceKins))
      .filter((v) => v.gt(0))
      .sort((a, b) => a.cmp(b));
    const lowest = units[0]?.toFixed();
    const cheapest3 = units.slice(0, 3);
    const medianCheapest3 =
      cheapest3.length === 0
        ? undefined
        : cheapest3.length === 1
          ? cheapest3[0].toFixed()
          : cheapest3.length === 2
            ? cheapest3[0].plus(cheapest3[1]).div(2).toFixed()
            : cheapest3[1].toFixed();

    return ok(
      {
        itemId,
        marketType,
        currency: "token" as const,
        avg30dKins: official?.avg30dKins,
        lowestActiveKins: lowest,
        medianCheapest3Kins: medianCheapest3,
        sales30d: official?.sales30d,
        samples: official?.samples ?? [],
        updatedAt: new Date().toISOString(),
        configured: true,
        sources: {
          officialStats: official
            ? "kintara.com/api/marketplace/stats"
            : null,
          listings: "kintara.com/api/marketplace/listings",
          rate: rate?.source ?? null,
        },
        note:
          "Official marketplace stats and listings only. Estimates, not guaranteed sales.",
      },
      {
        source: "kintara.com",
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
