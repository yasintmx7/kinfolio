import { fetchWithTimeout, getCached, setCache } from "@/lib/api/cache";
import { d } from "@/lib/accounting/decimal";
import { humanizeItemType } from "@/lib/kintara/item-type-map";
import type {
  ItemMarketStats,
  MarketplaceItem,
  MarketplaceListing,
  ReferencePrice,
} from "@/lib/kintara/marketplace-adapter";
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
  firstSeen: z.number().optional(),
  lastSeen: z.number().optional(),
});

export type MarketSummaryRow = z.infer<typeof summarySchema>;

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

export function normalizeSummary(
  rows: MarketSummaryRow[],
  kinsUsd?: number,
): NormalizedMarketRow[] {
  return rows.map((r) => ({
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
  }));
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
  // Prefer token (KINS) currency listings for KINS unit pricing
  return rows
    .filter((r) => (r.currency ?? "token") === "token")
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
  const [summary, listings] = await Promise.all([
    fetchMarketSummary(),
    fetchItemListings(itemType).catch(() => []),
  ]);
  const row = summary.find((s) => s.itemType === itemType);
  const tokenListings = listings
    .filter((l) => (l.currency ?? "token") === "token" && l.unitPrice != null)
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
