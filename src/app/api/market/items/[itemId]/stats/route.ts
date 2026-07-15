import { fail, ok } from "@/lib/api/response";
import {
  portfolioIdToMarketType,
  humanizeItemType,
} from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import {
  fetchOfficialItemStats,
  fetchOfficialListings,
  type OfficialListing,
} from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { normalizeListingPrice } from "@/lib/market/listing-price";

export const runtime = "nodejs";

/** Accept portfolio id (wood) or market type (cooked_fish_meat). */
function toMarketType(itemId: string): string {
  const dashed = itemId.replace(/_/g, "-");
  const inCatalog = STATIC_CATALOG.some(
    (i) => i.id === itemId || i.id === dashed || i.slug === itemId,
  );
  if (inCatalog) return portfolioIdToMarketType(itemId, STATIC_CATALOG);
  return itemId.replace(/-/g, "_");
}

async function collectItemListings(
  marketType: string,
): Promise<OfficialListing[]> {
  const want = marketType.toLowerCase();
  const collected: OfficialListing[] = [];
  const seen = new Set<string>();
  const pageSize = 100;
  const pages = 8;

  for (const currency of ["token", "gold"] as const) {
    for (let p = 0; p < pages; p++) {
      const batch = await fetchOfficialListings({
        sort: "cheap",
        currency,
        category: "all",
        limit: pageSize,
        offset: p * pageSize,
      });
      for (const row of batch) {
        if (row.itemType.toLowerCase() !== want) continue;
        const id = String(row.id);
        if (seen.has(id)) continue;
        seen.add(id);
        collected.push(row);
      }
      if (batch.length < pageSize) break;
    }
  }

  // Open first, then cheapest unit USD (gold last)
  collected.sort((a, b) => {
    const la = a.isReserved ? 1 : 0;
    const lb = b.isReserved ? 1 : 0;
    if (la !== lb) return la - lb;
    const ua = a.unitUsd ?? Number.POSITIVE_INFINITY;
    const ub = b.unitUsd ?? Number.POSITIVE_INFINITY;
    if (ua !== ub) return ua - ub;
    return (a.priceGold ?? 0) - (b.priceGold ?? 0);
  });

  return collected;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  if (!itemId || itemId.length > 128) {
    return fail("INVALID_ITEM", "Invalid item id", { status: 400 });
  }

  const marketType = toMarketType(itemId);

  try {
    const rate = await resolveKinsUsd();
    const kinsUsd = rate?.kinsUsd;

    // Stats without kins conversion so avg30d stays in USD
    const [official, listings] = await Promise.all([
      fetchOfficialItemStats(marketType).catch(() => null),
      collectItemListings(marketType).catch(() => [] as OfficialListing[]),
    ]);

    const open = listings.filter((l) => !l.isReserved);
    const unitUsds = open
      .map((l) => l.unitUsd)
      .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b);

    const floorUsd = unitUsds[0] ?? null;
    const medianUsd =
      unitUsds.length === 0
        ? null
        : unitUsds.length % 2 === 1
          ? unitUsds[Math.floor(unitUsds.length / 2)]!
          : (unitUsds[unitUsds.length / 2 - 1]! +
              unitUsds[unitUsds.length / 2]!) /
            2;

    // official.avg30dKins is USD/unit when kinsUsd was not passed
    const avg30dUsd = official?.avg30dKins
      ? Number(official.avg30dKins)
      : null;
    const avg30dKins =
      avg30dUsd != null && kinsUsd && kinsUsd > 0
        ? String(avg30dUsd / kinsUsd)
        : null;

    const samples = (official?.samples ?? []).map((s) => {
      // samples unitPriceKins is USD/unit without conversion
      const unitUsd = Number(s.unitPriceKins);
      return {
        date: (s.timestamp ?? "").slice(0, 10),
        unitUsd: Number.isFinite(unitUsd) ? String(unitUsd) : null,
        sales: s.saleCount ?? null,
      };
    });

    return ok(
      {
        itemId,
        marketType,
        name: humanizeItemType(marketType),
        kinsUsd: kinsUsd != null ? String(kinsUsd) : null,
        floorUsd: floorUsd != null ? String(floorUsd) : null,
        floorPer1kUsd:
          floorUsd != null ? String(floorUsd * 1000) : null,
        medianUsd: medianUsd != null ? String(medianUsd) : null,
        avg30dUsd:
          avg30dUsd != null && Number.isFinite(avg30dUsd)
            ? String(avg30dUsd)
            : null,
        avg30dKins,
        sales30d: official?.sales30d ?? null,
        openCount: open.length,
        lockedCount: listings.length - open.length,
        samples,
        listings: listings.map((l) => {
          const priced = normalizeListingPrice({
            quantity: l.quantity,
            priceUsd: l.priceUsd,
            unitUsd: l.unitUsd,
            priceGold: l.priceGold,
            currency: l.currency,
          });
          return {
            id: String(l.id),
            quantity: String(priced.quantity),
            unitUsd:
              priced.unitUsd != null ? String(priced.unitUsd) : null,
            usdTotal:
              priced.lotUsd != null ? String(priced.lotUsd) : null,
            priceGold:
              priced.priceGold != null ? String(priced.priceGold) : null,
            currency: l.currency ?? "token",
            sellerName: l.sellerName ?? null,
            sellerId: l.sellerId != null ? String(l.sellerId) : null,
            reserved: l.isReserved,
            reservedUntilMs:
              typeof l.reservedUntilMs === "number"
                ? l.reservedUntilMs
                : null,
            buyerId:
              l.reservedBy != null ? String(l.reservedBy as string | number) : null,
            timestamp: l.createdAt ?? null,
          };
        }),
        updatedAt: new Date().toISOString(),
        configured: true,
        note:
          "Floor from active cheap listings. 30d avg/sales from official stats.",
      },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=25, stale-while-revalidate=50",
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
