import { fail, ok } from "@/lib/api/response";
import { portfolioIdToMarketType } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { fetchOfficialListingsForItem } from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  if (!itemId || itemId.length > 128) {
    return fail("INVALID_ITEM", "Invalid item id", { status: 400 });
  }

  try {
    const marketType = portfolioIdToMarketType(itemId, STATIC_CATALOG);
    const rate = await resolveKinsUsd();
    const listings = await fetchOfficialListingsForItem(marketType, {
      pages: 4,
      kinsUsd: rate?.kinsUsd,
    });

    return ok(
      {
        itemId,
        marketType,
        listings,
        configured: true,
        note: "Official Kintara marketplace listings (read-only).",
      },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
      },
    );
  } catch (e) {
    return fail(
      "MARKET_LISTINGS_ERROR",
      e instanceof Error ? e.message : "Failed to load listings",
      { status: 502, retryable: true },
    );
  }
}
