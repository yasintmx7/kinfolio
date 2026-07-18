import { fail, ok } from "@/lib/api/response";
import { fetchRecentSales } from "@/lib/kintara/kintrade-sales";
import { fetchMarketSales } from "@/lib/kintara/kintaramarket-xyz";
import { humanizeItemType } from "@/lib/kintara/item-type-map";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { normalizeListingPrice } from "@/lib/market/listing-price";
import {
  officialListingId,
  sanitizePersonName,
} from "@/lib/market/seller-label";

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

/**
 * Sold / Activity feed — longer history.
 *
 * Primary: kintaramarket.xyz/api/sales?limit=N  (up to ~500, hours of sales,
 * always has itemType/qty/sellerName).
 * Enrich: kintrade signatures for Solscan links when we can match a sale.
 * Fallback: kintrade-only if kintaramarket is down (~50 max).
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

    const km =
      kmSettled.status === "fulfilled" ? kmSettled.value : [];
    const kt =
      ktSettled.status === "fulfilled" ? ktSettled.value : [];

    // Index kintrade by rough key for solscan attach
    const ktBySig: {
      ts: number;
      itemType: string;
      qty: string;
      usd: string | null;
      signature?: string;
      buyer?: string;
      seller?: string;
      listingId?: string;
      hasItem: boolean;
      name: string;
      unitUsd: string | null;
      kinsTotal: string;
      unitKins: string;
      id: string;
    }[] = kt.map((s) => ({
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

    function findTx(
      tsMs: number,
      itemType: string,
      qty: number,
      lotUsd: number | null,
    ): (typeof ktBySig)[0] | null {
      let best: (typeof ktBySig)[0] | null = null;
      let bestDt = 20_000; // 20s window
      for (const row of ktBySig) {
        if (!row.signature) continue;
        const dt = Math.abs(row.ts - tsMs);
        if (dt > bestDt) continue;
        if (row.hasItem) {
          // Full kintrade row: require item + qty match
          if (row.itemType !== itemType) continue;
          if (Number(row.qty) !== qty) continue;
          if (
            lotUsd != null &&
            row.usd != null &&
            Math.abs(Number(row.usd) - lotUsd) > Math.max(0.02, lotUsd * 0.15)
          ) {
            continue;
          }
        } else {
          // Incomplete kintrade (no item yet): only tight USD + time, avoid wrong tx
          if (lotUsd == null || row.usd == null) continue;
          if (
            Math.abs(Number(row.usd) - lotUsd) > Math.max(0.01, lotUsd * 0.05)
          ) {
            continue;
          }
        }
        best = row;
        bestDt = dt;
      }
      return best;
    }

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
        const match = findTx(tsMs, s.itemType, qty, priced.lotUsd);
        const sellerName = sanitizePersonName(s.sellerName);

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
          buyerId: null,
          buyerName: null,
          buyerWallet: match?.buyer ?? null,
          sellerWallet: match?.seller ?? null,
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
          buyerWallet: s.buyer ?? null,
          sellerWallet: s.seller ?? null,
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

    return ok(
      {
        sold: sliced,
        count: sliced.length,
        note:
          km.length > 0
            ? `Sold history up to ${want} (kintaramarket). Older than ~few hours may drop. Tx links when matched.`
            : "Fallback: kintrade only (~50 recent). kintaramarket sales unavailable.",
      },
      {
        source: km.length > 0 ? "kintaramarket.xyz+kintrade" : "kintrade",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=4, stale-while-revalidate=10",
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
