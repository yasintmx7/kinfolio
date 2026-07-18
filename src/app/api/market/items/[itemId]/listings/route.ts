import { fail, ok } from "@/lib/api/response";
import { portfolioIdToMarketType } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { fetchItemListingsAsDtos } from "@/lib/kintara/kintaramarket-xyz";
import { fetchOfficialListingsForItem } from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";

export const runtime = "nodejs";

/** Accept portfolio id or market type. */
function toMarketType(itemId: string): string {
  const dashed = itemId.replace(/_/g, "-");
  const inCatalog = STATIC_CATALOG.some(
    (i) => i.id === itemId || i.id === dashed || i.slug === itemId,
  );
  if (inCatalog) return portfolioIdToMarketType(itemId, STATIC_CATALOG);
  return itemId.replace(/-/g, "_");
}

/**
 * Complete open listings for one item.
 * Primary: kintaramarket.xyz full book (same as All-items board).
 * Fallback: official cheap-book scan.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  if (!itemId || itemId.length > 128) {
    return fail("INVALID_ITEM", "Invalid item id", { status: 400 });
  }

  try {
    const marketType = toMarketType(itemId);
    const rate = await resolveKinsUsd();

    try {
      const listings = await fetchItemListingsAsDtos(marketType);
      return ok(
        {
          itemId,
          marketType,
          listings,
          count: listings.length,
          configured: true,
          note: "Full item book from kintaramarket.xyz (cheap → expensive).",
        },
        {
          source: "kintaramarket.xyz",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=12, stale-while-revalidate=30",
        },
      );
    } catch {
      const listings = await fetchOfficialListingsForItem(marketType, {
        pages: 6,
        kinsUsd: rate?.kinsUsd,
      });
      return ok(
        {
          itemId,
          marketType,
          listings,
          count: listings.length,
          configured: true,
          note: "Fallback: official cheap-book scan (may be incomplete).",
        },
        {
          source: "kintara.com",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=20, stale-while-revalidate=40",
        },
      );
    }
  } catch (e) {
    return fail(
      "MARKET_LISTINGS_ERROR",
      e instanceof Error ? e.message : "Failed to load listings",
      { status: 502, retryable: true },
    );
  }
}
