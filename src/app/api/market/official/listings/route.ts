import { fail, ok } from "@/lib/api/response";
import {
  fetchOfficialListings,
  fetchOfficialListingsForItem,
} from "@/lib/kintara/official-marketplace";
import { resolveKinsUsdForMarket } from "@/lib/prices/kintaramarket-ticker";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { humanizeItemType } from "@/lib/kintara/item-type-map";

export const runtime = "nodejs";

/**
 * Official kintara.com marketplace listings (read-only).
 * Query: itemType?, sort?, currency?, limit?, offset?
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemType = searchParams.get("itemType")?.trim() || undefined;
  const sort = searchParams.get("sort") ?? "cheap";
  const currency = (searchParams.get("currency") ?? "token") as "token" | "gold";
  const limit = Number(searchParams.get("limit") ?? "60");
  const offset = Number(searchParams.get("offset") ?? "0");

  try {
    const rate = await resolveKinsUsdForMarket();
    const kinsUsd = rate?.kinsUsd;

    if (itemType) {
      const listings = await fetchOfficialListingsForItem(itemType, {
        pages: 4,
        limit: 60,
        kinsUsd,
      });
      return ok(
        {
          itemType,
          listings,
          count: listings.length,
          provider: "kintara.com",
          kinsUsd: kinsUsd != null ? String(kinsUsd) : null,
          note:
            "Official listings filtered client-side by itemType; gone IDs excluded. Read-only.",
        },
        {
          source: "kintara.com",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=30, stale-while-revalidate=90",
        },
      );
    }

    const rows = await fetchOfficialListings({
      sort,
      currency,
      category: searchParams.get("category") ?? "all",
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 60,
      offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
    });

    return ok(
      {
        listings: rows
          .filter((r) => !r.isReserved)
          .map((r) => ({
            id: String(r.id),
            itemType: r.itemType,
            name: humanizeItemType(r.itemType),
            portfolioItemId: marketTypeToPortfolioId(r.itemType, STATIC_CATALOG),
            quantity: r.quantity,
            priceUsd: r.priceUsd,
            unitUsd: r.unitUsd,
            unitKins:
              kinsUsd != null && r.unitUsd != null
                ? String(r.unitUsd / kinsUsd)
                : null,
            currency: r.currency,
            sellerName: r.sellerName,
            createdAt: r.createdAt,
            reserved: r.isReserved,
          })),
        count: rows.length,
        provider: "kintara.com",
        kinsUsd: kinsUsd != null ? String(kinsUsd) : null,
        note: "Official marketplace listings. priceUsd is lot total. Read-only.",
      },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=30, stale-while-revalidate=90",
      },
    );
  } catch (e) {
    return fail(
      "OFFICIAL_LISTINGS_ERROR",
      e instanceof Error ? e.message : "Failed to load official listings",
      { status: 502, retryable: true },
    );
  }
}
