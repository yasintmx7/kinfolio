import { fail, ok } from "@/lib/api/response";
import {
  fetchOfficialListings,
  fetchOfficialListingsForItem,
} from "@/lib/kintara/official-marketplace";
import {
  fetchItemListingsAsDtos,
  fetchMarketActivityFeed,
} from "@/lib/kintara/kintaramarket-xyz";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { marketTypeToPortfolioId, humanizeItemType } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemType = searchParams.get("itemType")?.trim() || undefined;
  const sort = searchParams.get("sort") ?? "cheap";
  const currency = (searchParams.get("currency") ?? "token") as "token" | "gold";
  const limit = Number(searchParams.get("limit") ?? "60");
  const offset = Number(searchParams.get("offset") ?? "0");

  try {
    const rate = await resolveKinsUsd();
    const kinsUsd = rate?.kinsUsd;

    if (itemType) {
      try {
        const listings = await fetchOfficialListingsForItem(itemType, {
          pages: 4,
          limit: 60,
          kinsUsd,
        });
        if (listings.length > 0) {
          return ok(
            {
              itemType,
              listings,
              count: listings.length,
              provider: "kintara.com",
              kinsUsd: kinsUsd != null ? String(kinsUsd) : null,
            },
            {
              source: "kintara.com",
              updatedAt: new Date().toISOString(),
              cacheControl: "public, s-maxage=30, stale-while-revalidate=90",
            },
          );
        }
      } catch {
        // fall through to kintaramarket
      }
      const km = await fetchItemListingsAsDtos(itemType);
      return ok(
        {
          itemType,
          listings: km,
          count: km.length,
          provider: "kintaramarket.xyz",
          kinsUsd: kinsUsd != null ? String(kinsUsd) : null,
        },
        {
          source: "kintaramarket.xyz",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=20, stale-while-revalidate=60",
        },
      );
    }

    try {
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
              portfolioItemId: marketTypeToPortfolioId(
                r.itemType,
                STATIC_CATALOG,
              ),
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
        },
        {
          source: "kintara.com",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=30, stale-while-revalidate=90",
        },
      );
    } catch {
      // kintara.com 429 / down — use kintaramarket open book
      const want = Number.isFinite(limit)
        ? Math.min(Math.max(limit, 1), 200)
        : 60;
      const feed = await fetchMarketActivityFeed({
        limit: want + (Number.isFinite(offset) ? Math.max(offset, 0) : 0) + 50,
        kinsUsd,
        sort: sort === "new" ? "new" : "cheap",
      });
      const sliced = feed
        .filter((r) => (r.currency ?? "token") === currency)
        .slice(
          Number.isFinite(offset) ? Math.max(offset, 0) : 0,
          (Number.isFinite(offset) ? Math.max(offset, 0) : 0) + want,
        );

      return ok(
        {
          listings: sliced.map((r) => ({
            id: r.id,
            itemType: r.itemType,
            name: r.name,
            portfolioItemId: marketTypeToPortfolioId(r.itemType, STATIC_CATALOG),
            quantity: Number(r.quantity),
            priceUsd: r.usdTotal != null ? Number(r.usdTotal) : null,
            unitUsd: r.unitUsd != null ? Number(r.unitUsd) : null,
            unitKins: r.unitKins,
            currency: r.currency,
            sellerName: r.sellerName,
            createdAt: r.timestamp,
            reserved: r.reserved,
          })),
          count: sliced.length,
          provider: "kintaramarket.xyz",
          kinsUsd: kinsUsd != null ? String(kinsUsd) : null,
        },
        {
          source: "kintaramarket.xyz",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=15, stale-while-revalidate=45",
        },
      );
    }
  } catch (e) {
    return fail(
      "OFFICIAL_LISTINGS_ERROR",
      e instanceof Error ? e.message : "Failed to load listings",
      { status: 502, retryable: true },
    );
  }
}
