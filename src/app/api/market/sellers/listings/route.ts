import { fail, ok } from "@/lib/api/response";
import {
  bookCoverageNote,
  fetchOfficialMarketBook,
  filterBookBySeller,
  toOfficialListingDto,
} from "@/lib/kintara/official-marketplace";

export const runtime = "nodejs";

/**
 * Seller inventory from shared cheap book scan.
 * Official API has no seller filter — reuses the same cached book as item detail.
 * Query: sellerId (numeric preferred), sellerName (optional).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const sellerId = sp.get("sellerId")?.trim() || null;
  const sellerName = sp.get("sellerName")?.trim() || null;

  if (!sellerId && !sellerName) {
    return fail("INVALID_SELLER", "sellerId or sellerName required", {
      status: 400,
    });
  }
  if (
    (sellerId && sellerId.length > 128) ||
    (sellerName && sellerName.length > 128)
  ) {
    return fail("INVALID_SELLER", "Seller key too long", { status: 400 });
  }

  try {
    const book = await fetchOfficialMarketBook({ pages: 10 });
    const listings = filterBookBySeller(book.listings, {
      sellerId,
      sellerName,
    });
    const open = listings.filter((l) => !l.isReserved);
    const coverageNote = bookCoverageNote(book, listings.length, "seller");

    return ok(
      {
        sellerId,
        sellerName,
        openCount: open.length,
        lockedCount: listings.length - open.length,
        listings: listings.map(toOfficialListingDto),
        bookSize: book.size,
        bookComplete: book.complete,
        coverageNote,
        note: coverageNote,
        configured: true,
      },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=20, stale-while-revalidate=40",
      },
    );
  } catch (e) {
    return fail(
      "SELLER_LISTINGS_ERROR",
      e instanceof Error ? e.message : "Failed to load seller listings",
      { status: 502, retryable: true },
    );
  }
}
