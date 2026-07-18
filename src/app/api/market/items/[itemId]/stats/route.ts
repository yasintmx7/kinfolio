import { fail, ok } from "@/lib/api/response";
import {
  portfolioIdToMarketType,
  humanizeItemType,
} from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import {
  fetchItemListingsAsDtos,
  type MarketListingDto,
} from "@/lib/kintara/kintaramarket-xyz";
import {
  bookCoverageNote,
  fetchOfficialItemStats,
  fetchOfficialMarketBook,
  filterBookByItemType,
  toOfficialListingDto,
} from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";

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

function statsFromListings(listings: MarketListingDto[]) {
  const open = listings.filter((l) => !l.reserved);
  const locked = listings.filter((l) => l.reserved);
  const unitUsds = open
    .map((l) => (l.unitUsd != null ? Number(l.unitUsd) : NaN))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  const floorUsd = unitUsds[0] ?? null;
  const medianUsd =
    unitUsds.length === 0
      ? null
      : unitUsds.length % 2 === 1
        ? unitUsds[Math.floor(unitUsds.length / 2)]!
        : (unitUsds[unitUsds.length / 2 - 1]! + unitUsds[unitUsds.length / 2]!) /
          2;

  let totalQty = 0;
  let totalLotUsd = 0;
  let hasLot = false;
  for (const l of listings) {
    const q = Number(l.quantity);
    if (Number.isFinite(q) && q > 0) totalQty += q;
    const lot = l.usdTotal != null ? Number(l.usdTotal) : NaN;
    if (Number.isFinite(lot) && lot > 0) {
      totalLotUsd += lot;
      hasLot = true;
    }
  }

  return {
    floorUsd,
    medianUsd,
    openCount: open.length,
    lockedCount: locked.length,
    totalQty,
    totalLotUsd: hasLot ? totalLotUsd : null,
  };
}

/**
 * Item detail: complete price list + stats.
 * Primary listings: kintaramarket.xyz full item book (same as their site).
 * 30d samples: official stats when available.
 * Fallback: official cheap-book scan if kintaramarket fails.
 */
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

    const [official, kmListings] = await Promise.all([
      fetchOfficialItemStats(marketType).catch(() => null),
      fetchItemListingsAsDtos(marketType).catch(() => null),
    ]);

    let listings: MarketListingDto[] = kmListings ?? [];
    let source = "kintaramarket.xyz";
    let bookSize = listings.length;
    let bookComplete = true;
    let coverageNote =
      listings.length > 0
        ? `Full price list · ${listings.length} lots (kintaramarket).`
        : "No open listings for this item right now.";

    // Fallback / enrich from official book if KM empty
    if (!listings.length) {
      const book = await fetchOfficialMarketBook({ pages: 10 }).catch(
        () => null,
      );
      if (book) {
        const fromOfficial = filterBookByItemType(book.listings, marketType).map(
          toOfficialListingDto,
        );
        listings = fromOfficial;
        source = "kintara.com";
        bookSize = book.size;
        bookComplete = book.complete;
        coverageNote = bookCoverageNote(book, listings.length, "item");
      }
    }

    const live = statsFromListings(listings);

    const avg30dRaw =
      official?.avg30dKins != null && official.avg30dKins !== ""
        ? Number(official.avg30dKins)
        : NaN;
    const avg30dUsd = Number.isFinite(avg30dRaw) ? avg30dRaw : null;
    const avg30dKins =
      avg30dUsd != null && kinsUsd && kinsUsd > 0
        ? String(avg30dUsd / kinsUsd)
        : null;

    const samples = (official?.samples ?? []).map((s) => {
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
        floorUsd: live.floorUsd != null ? String(live.floorUsd) : null,
        floorPer1kUsd:
          live.floorUsd != null ? String(live.floorUsd * 1000) : null,
        medianUsd: live.medianUsd != null ? String(live.medianUsd) : null,
        avg30dUsd:
          avg30dUsd != null && Number.isFinite(avg30dUsd)
            ? String(avg30dUsd)
            : null,
        avg30dKins,
        sales30d: official?.sales30d ?? null,
        openCount: live.openCount,
        lockedCount: live.lockedCount,
        totalQty: live.totalQty,
        totalLotUsd:
          live.totalLotUsd != null ? String(live.totalLotUsd) : null,
        samples,
        listings,
        bookSize,
        bookComplete,
        coverageNote,
        updatedAt: new Date().toISOString(),
        configured: true,
        note: coverageNote,
        provider: source,
      },
      {
        source,
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=12, stale-while-revalidate=30",
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
