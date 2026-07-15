import { fail, ok } from "@/lib/api/response";
import { fetchRecentSales } from "@/lib/kintara/kintrade-sales";
import { humanizeItemType } from "@/lib/kintara/item-type-map";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";

export const runtime = "nodejs";

/**
 * Real completed sales for Activity card.
 * Official kintara.com has no sold-history feed — disappear-from-book
 * detection was wrong (cancels + aging out of sort=new looked like sales).
 * This uses on-chain sale events (itemType/qty when present).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const limit = Number(sp.get("limit") ?? "40");

  try {
    const sales = await fetchRecentSales({
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 40,
      requireItem: true,
    });

    return ok(
      {
        sold: sales.map((s) => ({
          id: s.id,
          listingId: s.listingId ?? s.id,
          name: s.name || humanizeItemType(s.itemType),
          itemType: s.itemType,
          quantity: s.quantity,
          unitKins: s.unitKins,
          totalKins: s.kinsTotal,
          unitUsd: s.unitUsd,
          usdTotal: s.usdTotal,
          priceGold: null,
          currency: "token",
          timestamp: s.timestamp,
          // On-chain only has wallets — never put address in sellerName
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
          solscanUrl: s.signature
            ? `https://solscan.io/tx/${s.signature}`
            : null,
          portfolioItemId: marketTypeToPortfolioId(s.itemType, STATIC_CATALOG),
        })),
        count: sales.length,
        note: "Completed marketplace sales (on-chain). Official site has no sold feed.",
      },
      {
        source: "marketplace-sales",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=15, stale-while-revalidate=30",
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
