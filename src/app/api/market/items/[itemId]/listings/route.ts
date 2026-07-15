import { isMarketplaceConfigured } from "@/config/kintara-api";
import { marketplaceAdapter } from "@/lib/kintara/marketplace-adapter";
import { fail, ok } from "@/lib/api/response";
import { fetchGoneListingIds } from "@/lib/kintara/kintrade-gone";
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

  if (!isMarketplaceConfigured()) {
    return ok(
      { itemId, listings: [], configured: false },
      { source: "unconfigured" },
    );
  }

  try {
    const marketType = portfolioIdToMarketType(itemId, STATIC_CATALOG);
    const [listings, gone] = await Promise.all([
      marketplaceAdapter.getActiveListings(marketType),
      fetchGoneListingIds().catch(() => null),
    ]);

    // Adapter already filters for kintaramarket path; re-filter for custom adapters
    const active = gone
      ? listings.filter((l) => !gone.idSet.has(String(l.id)))
      : listings;
    const removed = listings.length - active.length;

    return ok(
      {
        itemId,
        marketType,
        listings: active,
        filteredGone: removed,
        goneSource: gone ? "kintrade.xyz/api/gone" : null,
        configured: true,
        note:
          "Active listings only. IDs in kintrade /api/gone (sold/cancelled/expired) are excluded.",
      },
      {
        source: "marketplace",
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
