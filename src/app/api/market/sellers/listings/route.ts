import { fail, ok } from "@/lib/api/response";
import {
  bookCoverageNote,
  fetchOfficialMarketBook,
  filterBookBySeller,
  toOfficialListingDto,
  type OfficialListingDto,
} from "@/lib/kintara/official-marketplace";
import { fetchListingsForSellerName } from "@/lib/kintara/kintaramarket-xyz";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { sanitizePersonName } from "@/lib/market/seller-label";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Seller inventory.
 * Primary: kintaramarket open book (seller name match).
 * Enrich/fallback: official cheap book scan by sellerId/name.
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
    const rate = await resolveKinsUsd();
    const byId = new Map<string, OfficialListingDto>();
    const sources: string[] = [];

    // 1) KM open book by seller name (covers more of the live market)
    if (sellerName) {
      try {
        const km = await fetchListingsForSellerName(sellerName, {
          kinsUsd: rate?.kinsUsd,
        });
        for (const r of km) {
          const name = sanitizePersonName(r.sellerName);
          byId.set(r.id, {
            id: r.id,
            itemType: r.itemType,
            name: r.name,
            quantity: r.quantity,
            unitUsd: r.unitUsd,
            usdTotal: r.usdTotal,
            priceGold: r.priceGold,
            currency: r.currency,
            sellerName: name,
            sellerId: r.sellerId,
            reserved: r.reserved,
            reservedUntilMs: r.reservedUntilMs,
            buyerId: r.buyerId,
            timestamp: r.timestamp,
          });
        }
        if (km.length) sources.push("kintaramarket.xyz");
      } catch {
        // fall through to official
      }
    }

    // 2) Official book (sellerId match + name)
    try {
      const book = await fetchOfficialMarketBook({ pages: 12 });
      const listings = filterBookBySeller(book.listings, {
        sellerId,
        sellerName,
      });
      for (const l of listings) {
        const dto = toOfficialListingDto(l);
        const prev = byId.get(dto.id);
        byId.set(dto.id, prev ? { ...prev, ...dto } : dto);
      }
      if (listings.length) sources.push("kintara.com");
      const all = [...byId.values()];
      const open = all.filter((l) => !l.reserved);
      const coverageNote = bookCoverageNote(book, all.length, "seller");
      return ok(
        {
          sellerId,
          sellerName,
          openCount: open.length,
          lockedCount: all.length - open.length,
          listings: all,
          bookSize: Math.max(book.size, all.length),
          bookComplete: book.complete,
          coverageNote,
          note:
            all.length > 0
              ? `Found ${all.length} listing(s) (${sources.join(" + ") || "merged"}).`
              : coverageNote,
          configured: true,
          sources,
        },
        {
          source: sources.join("+") || "kintara.com",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=15, stale-while-revalidate=40",
        },
      );
    } catch {
      // Official failed — return KM-only if we have it
      const all = [...byId.values()];
      if (all.length) {
        const open = all.filter((l) => !l.reserved);
        return ok(
          {
            sellerId,
            sellerName,
            openCount: open.length,
            lockedCount: all.length - open.length,
            listings: all,
            bookSize: all.length,
            bookComplete: false,
            coverageNote: null,
            note: `Found ${all.length} listing(s) from kintaramarket open book.`,
            configured: true,
            sources,
          },
          {
            source: "kintaramarket.xyz",
            updatedAt: new Date().toISOString(),
            cacheControl: "public, s-maxage=15, stale-while-revalidate=40",
          },
        );
      }
      throw new Error("Seller inventory unavailable");
    }
  } catch (e) {
    return fail(
      "SELLER_LISTINGS_ERROR",
      e instanceof Error ? e.message : "Failed to load seller listings",
      { status: 502, retryable: true },
    );
  }
}
