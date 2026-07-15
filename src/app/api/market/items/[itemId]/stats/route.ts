import { fail, ok } from "@/lib/api/response";
import {
  portfolioIdToMarketType,
  humanizeItemType,
} from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
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

    // Shared book cache (~28s) — opening many items reuses one scan
    const [official, book] = await Promise.all([
      fetchOfficialItemStats(marketType).catch(() => null),
      fetchOfficialMarketBook({ pages: 10 }),
    ]);

    const listings = filterBookByItemType(book.listings, marketType);
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

    // official.avg30dKins holds USD/unit when kinsUsd was not passed
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

    const coverageNote = bookCoverageNote(book, listings.length, "item");

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
        listings: listings.map(toOfficialListingDto),
        bookSize: book.size,
        bookComplete: book.complete,
        coverageNote,
        updatedAt: new Date().toISOString(),
        configured: true,
        note: coverageNote,
      },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=20, stale-while-revalidate=40",
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
