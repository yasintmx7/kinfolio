import { fail, ok } from "@/lib/api/response";
import { fetchRecentSales } from "@/lib/kintara/kintrade-sales";
import { fetchMarketSales } from "@/lib/kintara/kintaramarket-xyz";
import { humanizeItemType } from "@/lib/kintara/item-type-map";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { normalizeListingPrice } from "@/lib/market/listing-price";
import {
  isSolanaAddress,
  officialListingId,
  sanitizePersonName,
} from "@/lib/market/seller-label";
import {
  findKinTradeMatch,
  type KinTradeMatchRow,
} from "@/lib/market/sold-buyer-match";

export const runtime = "nodejs";
export const maxDuration = 30;

type SoldRow = {
  id: string;
  listingId?: string;
  name: string;
  itemType: string;
  quantity: string;
  unitKins: string;
  totalKins: string | null;
  unitUsd: string | null;
  usdTotal: string | null;
  priceGold: string | null;
  currency: string;
  timestamp: string;
  seller: string | null;
  sellerName: string | null;
  sellerId: string | null;
  buyerId: string | null;
  buyerName: string | null;
  buyerWallet: string | null;
  sellerWallet: string | null;
  reserved: boolean;
  reservedUntilMs: null;
  itemDurability: null;
  isSold: true;
  itemPending: boolean;
  solscanUrl: string | null;
  portfolioItemId: string | null;
};

function walletOrNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t) return null;
  return isSolanaAddress(t) ? t : null;
}

/**
 * Sold / Activity feed — longer history.
 *
 * Primary: kintaramarket.xyz/api/sales?limit=N  (seller name, item, qty, $).
 * Enrich: kintrade for buyer wallet, listingId, Solscan.
 * Note: neither feed reliably exposes buyer username / game id.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const limit = Number(sp.get("limit") ?? "300");
  const want = Number.isFinite(limit)
    ? Math.min(Math.max(limit, 1), 500)
    : 300;

  try {
    const [kmSettled, ktSettled] = await Promise.allSettled([
      fetchMarketSales({ limit: want }),
      fetchRecentSales({ limit: 200, requireItem: false }),
    ]);

    const km = kmSettled.status === "fulfilled" ? kmSettled.value : [];
    const kt = ktSettled.status === "fulfilled" ? ktSettled.value : [];

    const ktBySig: KinTradeMatchRow[] = kt.map((s) => ({
      ts: Date.parse(s.timestamp),
      itemType: s.itemType,
      qty: s.quantity,
      usd: s.usdTotal,
      signature: s.signature,
      buyer: s.buyer,
      seller: s.seller,
      listingId: s.listingId,
      hasItem: s.hasItem,
      name: s.name,
      unitUsd: s.unitUsd,
      kinsTotal: s.kinsTotal,
      unitKins: s.unitKins,
      id: s.id,
    }));

    const sold: SoldRow[] = [];

    if (km.length > 0) {
      for (const s of km) {
        const qty = Math.max(s.quantity, 1);
        const priced = normalizeListingPrice({
          quantity: qty,
          priceUsd: s.priceUsd,
          currency: s.currency ?? "token",
        });
        const tsMs = s.ts;
        const match = findKinTradeMatch(
          ktBySig,
          tsMs,
          s.itemType,
          qty,
          priced.lotUsd,
        );
        const sellerName = sanitizePersonName(s.sellerName);
        const buyerWallet = walletOrNull(match?.buyer);
        const sellerWallet = walletOrNull(match?.seller);

        sold.push({
          id: match?.id ?? `km-sale-${s.ts}-${s.itemType}-${qty}`,
          listingId: officialListingId(match?.listingId) ?? undefined,
          name: humanizeItemType(s.itemType),
          itemType: s.itemType,
          quantity: String(qty),
          unitKins: match?.hasItem ? match.unitKins : "0",
          totalKins: match?.kinsTotal ?? null,
          unitUsd:
            priced.unitUsd != null
              ? String(priced.unitUsd)
              : match?.unitUsd ?? null,
          usdTotal:
            priced.lotUsd != null
              ? String(priced.lotUsd)
              : s.priceUsd != null
                ? String(s.priceUsd)
                : match?.usd ?? null,
          priceGold: null,
          currency: s.currency ?? "token",
          timestamp: new Date(tsMs).toISOString(),
          seller: sellerName,
          sellerName,
          sellerId: null,
          // Public sales feeds do not include buyer username/id — wallet when matched
          buyerId: null,
          buyerName: null,
          buyerWallet,
          sellerWallet,
          reserved: false,
          reservedUntilMs: null,
          itemDurability: null,
          isSold: true,
          itemPending: false,
          solscanUrl: match?.signature
            ? `https://solscan.io/tx/${match.signature}`
            : null,
          portfolioItemId:
            marketTypeToPortfolioId(s.itemType, STATIC_CATALOG) ?? null,
        });
      }
    } else {
      // Fallback: kintrade only (~50)
      for (const s of kt) {
        if (!s.signature || s.signature.length < 32) continue;
        const lid = officialListingId(s.listingId) ?? undefined;
        const complete = s.hasItem && Boolean(lid);
        sold.push({
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
          seller: null,
          sellerName: null,
          sellerId: null,
          buyerId: null,
          buyerName: null,
          buyerWallet: walletOrNull(s.buyer),
          sellerWallet: walletOrNull(s.seller),
          reserved: false,
          reservedUntilMs: null,
          itemDurability: null,
          isSold: true,
          itemPending: !s.hasItem,
          solscanUrl: `https://solscan.io/tx/${s.signature}`,
          portfolioItemId: s.hasItem
            ? marketTypeToPortfolioId(s.itemType, STATIC_CATALOG) ?? null
            : null,
        });
      }
    }

    const sliced = sold.slice(0, want);
    const withBuyer = sliced.filter((r) => r.buyerWallet || r.buyerId).length;

    return ok(
      {
        sold: sliced,
        count: sliced.length,
        note:
          km.length > 0
            ? `Sold history up to ${want} (kintaramarket). Buyer wallet/tx when matched (${withBuyer}/${sliced.length}). Name/#id when listing was locked before sale.`
            : "Fallback: kintrade only (~50 recent). Buyer shown as wallet when present.",
      },
      {
        source: km.length > 0 ? "kintaramarket+kintrade" : "kintrade",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=3, stale-while-revalidate=8",
      },
    );
  } catch (e) {
    return fail(
      "MARKET_SOLD_ERROR",
      e instanceof Error ? e.message : "Failed to load sold feed",
      { status: 502, retryable: true },
    );
  }
}
