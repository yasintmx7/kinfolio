import { fail, ok } from "@/lib/api/response";
import { fetchRecentSales } from "@/lib/kintara/kintrade-sales";
import { humanizeItemType } from "@/lib/kintara/item-type-map";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { officialListingId } from "@/lib/market/seller-label";

export const runtime = "nodejs";

/**
 * Real completed sales for Activity card.
 *
 * kintrade posts many sales first with only wallets + totals (no item/qty).
 * Item metadata often arrives 30s–2min later. If we require item+listingId only,
 * Activity's "latest" clock lags wall time by ~2 minutes.
 *
 * Strategy: show any on-chain sale with a signature immediately (lot $).
 * Full item/qty rows preferred in the list; incomplete labeled "Sale".
 * Rows still open on the book are filtered client-side (false sold guard).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const limit = Number(sp.get("limit") ?? "40");

  try {
    const want = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 40;
    // requireItem:false — newest incomplete sales first (fixes multi-minute lag)
    const sales = (
      await fetchRecentSales({
        limit: Math.min(Math.max(want * 3, 80), 200),
        requireItem: false,
      })
    ).filter((s) => Boolean(s.signature && s.signature.length >= 32));

    // Prefer complete rows, but never drop fresher incomplete ones ahead of them
    const sliced = sales.slice(0, want);

    return ok(
      {
        sold: sliced.map((s) => {
          const lid = officialListingId(s.listingId) ?? undefined;
          const complete = s.hasItem && Boolean(lid);
          return {
            id: s.id,
            listingId: lid,
            name: complete
              ? s.name || humanizeItemType(s.itemType)
              : s.hasItem
                ? s.name || humanizeItemType(s.itemType)
                : "Sale",
            itemType: s.hasItem ? s.itemType : "unknown",
            quantity: s.hasItem ? s.quantity : "?",
            unitKins: s.hasItem ? s.unitKins : "0",
            totalKins: s.kinsTotal,
            unitUsd: s.hasItem ? s.unitUsd : null,
            usdTotal: s.usdTotal,
            priceGold: null,
            currency: "token",
            timestamp: s.timestamp,
            seller: null as string | null,
            sellerName: null as string | null,
            sellerId: null as string | null,
            buyerId: null as string | null,
            buyerName: null as string | null,
            buyerWallet: s.buyer ?? null,
            sellerWallet: s.seller ?? null,
            reserved: false,
            reservedUntilMs: null,
            itemDurability: null,
            isSold: true,
            /** Item/qty not yet known from indexer */
            itemPending: !s.hasItem,
            solscanUrl: s.signature
              ? `https://solscan.io/tx/${s.signature}`
              : null,
            portfolioItemId: s.hasItem
              ? marketTypeToPortfolioId(s.itemType, STATIC_CATALOG)
              : null,
          };
        }),
        count: sliced.length,
        note:
          "On-chain sales (tx required). New rows may show as “Sale” until item/qty indexes (~0–2 min).",
      },
      {
        source: "marketplace-sales",
        updatedAt: new Date().toISOString(),
        // Keep short — sold feed is the live Activity clock
        cacheControl: "public, s-maxage=2, stale-while-revalidate=6",
      },
    );
  } catch (e) {
    return fail(
      "SOLD_ERROR",
      e instanceof Error ? e.message : "Failed to load sold activity",
      { status: 502, retryable: true },
    );
  }
}
