import { officialListingId } from "@/lib/market/seller-label";

/**
 * Drop "sold" rows whose marketplace listing is still on the open book.
 *
 * kintrade recent-sales can lag or fire early — we observed listingIds that
 * still appear on kintara.com (not reserved). Showing those as Sold is a
 * false positive ("item sold but it's still listed").
 *
 * Only open-book ids are checked — never a long-lived cache of past listings,
 * or real sales would stay hidden forever after we once saw them open.
 */
export function filterSoldStillOpen<
  T extends {
    id: string;
    listingId?: string | null;
    isSold?: boolean;
  },
  O extends { id: string; listingId?: string | null },
>(sold: T[], openListings: O[]): T[] {
  if (!sold.length) return sold;
  if (!openListings.length) return sold;

  const openIds = new Set<string>();
  for (const row of openListings) {
    openIds.add(String(row.id));
    const lid = officialListingId(row.listingId ?? row.id);
    if (lid) openIds.add(lid);
  }

  return sold.filter((row) => {
    const lid = officialListingId(row.listingId);
    if (lid && openIds.has(lid)) return false;
    // Bug #10 fix: also check when the sold row's own id is a numeric listing id
    // (some sold rows have no listingId but their id IS the numeric listing id).
    const lidFromId = officialListingId(row.id);
    if (lidFromId && openIds.has(lidFromId)) return false;
    // Safety: exact raw id collision (catches non-numeric ids shared between
    // the sold feed and open book — e.g. "kh7abc" appearing in both).
    if (openIds.has(String(row.id))) return false;
    return true;
  });
}

/**
 * Build a stable key for open↔sold dedupe in seller sheets.
 * Prefer numeric listing id so a sale event and live row collapse together.
 */
export function listingDedupeKey(row: {
  id: string;
  listingId?: string | null;
}): string {
  const lid = officialListingId(row.listingId);
  if (lid) return `listing:${lid}`;
  return `id:${String(row.id)}`;
}
