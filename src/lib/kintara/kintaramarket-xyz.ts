import { fetchWithTimeout, getCached, setCache } from "@/lib/api/cache";
import { d } from "@/lib/accounting/decimal";
import { humanizeItemType } from "@/lib/kintara/item-type-map";
import type {
  ItemMarketStats,
  MarketplaceItem,
  MarketplaceListing,
  ReferencePrice,
} from "@/lib/kintara/marketplace-adapter";
import { normalizeListingPrice } from "@/lib/market/listing-price";
import { sanitizePersonName } from "@/lib/market/seller-label";
import { z } from "zod";

const BASE = "https://kintaramarket.xyz";

const summarySchema = z.object({
  itemType: z.string(),
  listings: z.number().optional(),
  totalQty: z.number().optional(),
  lowestUsdPerUnit: z.number().nullable().optional(),
  lowestGoldPerUnit: z.number().nullable().optional(),
  kinsListings: z.number().optional(),
  goldListings: z.number().optional(),
});

const listingSchema = z.object({
  id: z.union([z.string(), z.number()]),
  sellerName: z.string().optional(),
  quantity: z.number(),
  currency: z.string().optional(),
  priceUsd: z.number().nullable().optional(),
  priceGold: z.number().nullable().optional(),
  nativePrice: z.number().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  reservedBy: z.unknown().nullable().optional(),
  reservedUntilMs: z.number().nullable().optional(),
  firstSeen: z.number().optional(),
  lastSeen: z.number().optional(),
});

export type MarketSummaryRow = z.infer<typeof summarySchema>;

/** Completed sales feed (longer history than kintrade ~50). */
const saleEventSchema = z.object({
  ts: z.number(),
  itemType: z.string(),
  quantity: z.number(),
  currency: z.string().optional(),
  priceUsd: z.number().nullable().optional(),
  sellerName: z.string().optional(),
  confidence: z.string().optional(),
});

export type MarketSaleEvent = z.infer<typeof saleEventSchema>;

export type NormalizedMarketRow = {
  itemType: string;
  name: string;
  listings: number;
  totalQty: number;
  lowestUsdPerUnit: string | null;
  lowestGoldPerUnit: string | null;
  kinsListings: number;
  goldListings: number;
  /** KINS per unit when kinsUsd provided */
  lowestKinsPerUnit: string | null;
};

function usdToKins(usdPerUnit: number | null | undefined, kinsUsd: number): string | null {
  if (usdPerUnit == null || !Number.isFinite(usdPerUnit) || usdPerUnit <= 0) return null;
  if (!Number.isFinite(kinsUsd) || kinsUsd <= 0) return null;
  return d(usdPerUnit).div(kinsUsd).toFixed();
}

export async function fetchMarketSummary(): Promise<MarketSummaryRow[]> {
  const cacheKey = "kmxyz:market-summary";
  const cached = getCached<MarketSummaryRow[]>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const res = await fetchWithTimeout(`${BASE}/api/market`, {
    timeoutMs: 10000,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`kintaramarket.xyz market failed: ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("Unexpected market summary shape");
  const rows = json
    .map((row) => summarySchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => r.data);
  setCache(cacheKey, rows, 60);
  return rows;
}

export async function fetchItemListings(itemType: string): Promise<
  z.infer<typeof listingSchema>[]
> {
  const safe = encodeURIComponent(itemType);
  const cacheKey = `kmxyz:listings:${itemType}`;
  const cached = getCached<z.infer<typeof listingSchema>[]>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const res = await fetchWithTimeout(`${BASE}/api/market/${safe}`, {
    timeoutMs: 10000,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Listings failed for ${itemType}: ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) return [];
  const rows = json
    .map((row) => listingSchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => r.data);
  setCache(cacheKey, rows, 45);
  return rows;
}

/**
 * Recent completed sales (kintaramarket.xyz/api/sales).
 * Supports limit up to ~500 (hours of history). kintrade only has ~50.
 */
export async function fetchMarketSales(options?: {
  limit?: number;
}): Promise<MarketSaleEvent[]> {
  const limit = Math.min(Math.max(options?.limit ?? 300, 1), 500);
  const cacheKey = `kmxyz:sales:v1:${limit}`;
  const cached = getCached<MarketSaleEvent[]>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const url = new URL(`${BASE}/api/sales`);
  url.searchParams.set("limit", String(limit));
  const res = await fetchWithTimeout(url.toString(), {
    timeoutMs: 12000,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`kintaramarket sales failed: ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("Unexpected sales shape");

  const rows: MarketSaleEvent[] = [];
  for (const row of json) {
    const one = saleEventSchema.safeParse(row);
    if (!one.success) continue;
    if (!one.data.itemType || !(one.data.quantity > 0)) continue;
    rows.push(one.data);
  }
  rows.sort((a, b) => b.ts - a.ts);
  setCache(cacheKey, rows, 4);
  return rows;
}

export function normalizeSummary(
  rows: MarketSummaryRow[],
  kinsUsd?: number,
): NormalizedMarketRow[] {
  return rows
    .map((r) => ({
      itemType: r.itemType,
      name: humanizeItemType(r.itemType),
      listings: r.listings ?? 0,
      totalQty: r.totalQty ?? 0,
      lowestUsdPerUnit:
        r.lowestUsdPerUnit != null ? String(r.lowestUsdPerUnit) : null,
      lowestGoldPerUnit:
        r.lowestGoldPerUnit != null ? String(r.lowestGoldPerUnit) : null,
      kinsListings: r.kinsListings ?? 0,
      goldListings: r.goldListings ?? 0,
      lowestKinsPerUnit:
        kinsUsd != null
          ? usdToKins(r.lowestUsdPerUnit ?? null, kinsUsd)
          : null,
    }))
    .sort((a, b) => b.listings - a.listings);
}

/** Aggregate stats for the All-items board header. */
export function summarizeMarketBoard(rows: NormalizedMarketRow[]): {
  itemCount: number;
  itemsWithListings: number;
  totalListings: number;
  totalQty: number;
  tokenListings: number;
  goldListings: number;
} {
  let totalListings = 0;
  let totalQty = 0;
  let tokenListings = 0;
  let goldListings = 0;
  let itemsWithListings = 0;
  for (const r of rows) {
    totalListings += r.listings;
    totalQty += r.totalQty;
    tokenListings += r.kinsListings;
    goldListings += r.goldListings;
    if (r.listings > 0) itemsWithListings += 1;
  }
  return {
    itemCount: rows.length,
    itemsWithListings,
    totalListings,
    totalQty,
    tokenListings,
    goldListings,
  };
}

/** UI DTO matching official listing rows (price list sheet). */
export type MarketListingDto = {
  id: string;
  itemType: string;
  name: string;
  quantity: string;
  unitUsd: string | null;
  usdTotal: string | null;
  priceGold: string | null;
  currency: string;
  sellerName: string | null;
  sellerId: string | null;
  reserved: boolean;
  reservedUntilMs: number | null;
  buyerId: string | null;
  timestamp: string | null;
};

/**
 * Full open book for one item from kintaramarket.xyz (complete list).
 * Includes token + gold lots; sorts open first then cheap unit $.
 */
export async function fetchItemListingsAsDtos(
  itemType: string,
): Promise<MarketListingDto[]> {
  const rows = await fetchItemListings(itemType);
  const out: MarketListingDto[] = [];

  for (const r of rows) {
    const qty = Math.max(r.quantity || 1, 1);
    // unitPrice is authoritative on kintaramarket; priceUsd is lot total
    const priced = normalizeListingPrice({
      quantity: qty,
      priceUsd: r.priceUsd,
      unitUsd: r.unitPrice,
      usdTotal: r.priceUsd,
      priceGold: r.priceGold,
      currency: r.currency ?? "token",
    });
    const reserved = r.reservedBy != null;
    const buyerId =
      r.reservedBy == null
        ? null
        : typeof r.reservedBy === "number" || typeof r.reservedBy === "string"
          ? String(r.reservedBy)
          : null;

    out.push({
      id: String(r.id),
      itemType,
      name: humanizeItemType(itemType),
      quantity: String(priced.quantity),
      unitUsd: priced.unitUsd != null ? String(priced.unitUsd) : null,
      usdTotal: priced.lotUsd != null ? String(priced.lotUsd) : null,
      priceGold: priced.priceGold != null ? String(priced.priceGold) : null,
      currency: r.currency ?? "token",
      sellerName: sanitizePersonName(r.sellerName),
      sellerId: null,
      reserved,
      reservedUntilMs:
        typeof r.reservedUntilMs === "number" ? r.reservedUntilMs : null,
      buyerId,
      timestamp: r.firstSeen
        ? new Date(r.firstSeen).toISOString()
        : r.lastSeen
          ? new Date(r.lastSeen).toISOString()
          : null,
    });
  }

  // Open first, then cheapest unit (token $ first; gold after)
  out.sort((a, b) => {
    const ra = a.reserved ? 1 : 0;
    const rb = b.reserved ? 1 : 0;
    if (ra !== rb) return ra - rb;
    const ua = a.unitUsd != null ? Number(a.unitUsd) : Number.POSITIVE_INFINITY;
    const ub = b.unitUsd != null ? Number(b.unitUsd) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(ua) && Number.isFinite(ub) && ua !== ub) return ua - ub;
    const ga = a.priceGold != null ? Number(a.priceGold) : Number.POSITIVE_INFINITY;
    const gb = b.priceGold != null ? Number(b.priceGold) : Number.POSITIVE_INFINITY;
    return ga - gb;
  });

  return out;
}

export async function getCatalogFromKintaraMarket(): Promise<MarketplaceItem[]> {
  const rows = await fetchMarketSummary();
  return rows.map((r) => ({
    id: r.itemType,
    name: humanizeItemType(r.itemType),
  }));
}

export async function getListingsFromKintaraMarket(
  itemType: string,
  kinsUsd?: number,
): Promise<MarketplaceListing[]> {
  const rows = await fetchItemListings(itemType);

  // Drop sold/cancelled/expired listing ids from kintrade.xyz /api/gone
  let goneSet: Set<string> | null = null;
  try {
    const { fetchGoneListingIds } = await import("@/lib/kintara/kintrade-gone");
    const gone = await fetchGoneListingIds();
    goneSet = gone.idSet;
  } catch {
    // still return listings if gone feed fails
  }

  // Prefer token (KINS) currency listings for KINS unit pricing
  return rows
    .filter((r) => (r.currency ?? "token") === "token")
    .filter((r) => !goneSet?.has(String(r.id)))
    .map((r) => {
      const qty = r.quantity || 1;
      const unitUsd = r.unitPrice ?? (r.priceUsd != null ? r.priceUsd / qty : null);
      const unitKins =
        kinsUsd && unitUsd != null ? usdToKins(unitUsd, kinsUsd) : unitUsd != null
          ? String(unitUsd) // temporary USD label if no kins rate — caller should convert
          : "0";
      const totalKins =
        kinsUsd && r.priceUsd != null
          ? d(r.priceUsd).div(kinsUsd).toFixed()
          : r.priceUsd != null
            ? String(r.priceUsd)
            : "0";
      return {
        id: String(r.id),
        itemId: itemType,
        quantity: String(qty),
        totalPriceKins: totalKins ?? "0",
        unitPriceKins: unitKins ?? "0",
        seller: r.sellerName,
        createdAt: r.firstSeen
          ? new Date(r.firstSeen).toISOString()
          : undefined,
      };
    })
    .sort((a, b) => d(a.unitPriceKins).cmp(d(b.unitPriceKins)));
}

export async function getStatsFromKintaraMarket(
  itemType: string,
  kinsUsd?: number,
): Promise<ItemMarketStats> {
  const [summary, listings, gone] = await Promise.all([
    fetchMarketSummary(),
    fetchItemListings(itemType).catch(() => []),
    import("@/lib/kintara/kintrade-gone")
      .then((m) => m.fetchGoneListingIds())
      .catch(() => null),
  ]);
  const row = summary.find((s) => s.itemType === itemType);
  const goneSet = gone?.idSet;
  const tokenListings = listings
    .filter((l) => (l.currency ?? "token") === "token" && l.unitPrice != null)
    .filter((l) => !goneSet?.has(String(l.id)))
    .sort((a, b) => (a.unitPrice ?? 0) - (b.unitPrice ?? 0));

  const cheapest3 = tokenListings.slice(0, 3).map((l) => l.unitPrice!);
  const medianCheapest3Usd =
    cheapest3.length === 0
      ? null
      : cheapest3.length === 1
        ? cheapest3[0]
        : cheapest3.length === 2
          ? (cheapest3[0] + cheapest3[1]) / 2
          : [...cheapest3].sort((a, b) => a - b)[1];

  const lowestUsd = row?.lowestUsdPerUnit ?? tokenListings[0]?.unitPrice ?? null;

  return {
    itemId: itemType,
    currency: "token",
    lowestActiveKins:
      kinsUsd != null ? usdToKins(lowestUsd, kinsUsd) ?? undefined : undefined,
    medianCheapest3Kins:
      kinsUsd != null
        ? usdToKins(medianCheapest3Usd, kinsUsd) ?? undefined
        : undefined,
    samples: tokenListings.slice(0, 20).map((l) => ({
      timestamp: l.lastSeen
        ? new Date(l.lastSeen).toISOString()
        : new Date().toISOString(),
      unitPriceKins:
        kinsUsd != null && l.unitPrice != null
          ? usdToKins(l.unitPrice, kinsUsd) ?? "0"
          : String(l.unitPrice ?? 0),
      quantity: String(l.quantity),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export async function getReferencePricesFromKintaraMarket(
  itemTypes: string[],
  kinsUsd: number,
): Promise<Record<string, ReferencePrice>> {
  const summary = await fetchMarketSummary();
  const out: Record<string, ReferencePrice> = {};
  const now = new Date().toISOString();
  for (const itemType of itemTypes) {
    const row = summary.find((s) => s.itemType === itemType);
    if (!row?.lowestUsdPerUnit) continue;
    const kins = usdToKins(row.lowestUsdPerUnit, kinsUsd);
    if (!kins) continue;
    out[itemType] = {
      itemId: itemType,
      unitPriceKins: kins,
      method: "lowest_active_listing",
      updatedAt: now,
    };
  }
  return out;
}

export function isKintaraMarketXyzHost(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "kintaramarket.xyz" || host.endsWith(".kintaramarket.xyz");
  } catch {
    return baseUrl.includes("kintaramarket.xyz");
  }
}
