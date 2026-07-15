/**
 * Official Kintara.com marketplace — READ-ONLY endpoints only.
 * Never call reserve / token-quote / token-buy-confirm / release-reserve.
 */

import { fetchWithTimeout, getCached, setCache } from "@/lib/api/cache";
import { d } from "@/lib/accounting/decimal";
import { humanizeItemType } from "@/lib/kintara/item-type-map";
import type {
  ItemMarketStats,
  MarketplaceListing,
  SoldSample,
} from "@/lib/kintara/marketplace-adapter";
import { normalizeListingPrice } from "@/lib/market/listing-price";
import { z } from "zod";

const BASE = "https://kintara.com";

const listingSchema = z.object({
  id: z.union([z.string(), z.number()]),
  sellerId: z.number().optional(),
  sellerName: z.string().optional(),
  itemType: z.string(),
  quantity: z.number(),
  priceGold: z.number().nullable().optional(),
  currency: z.string().optional(),
  priceUsd: z.number().nullable().optional(),
  createdAt: z.string().optional(),
  reservedBy: z.unknown().nullable().optional(),
  reservedUntilMs: z.number().nullable().optional(),
  itemDurability: z.unknown().nullable().optional(),
});

const listingsResponseSchema = z.object({
  ok: z.boolean().optional(),
  listings: z.array(listingSchema),
});

const sampleSchema = z.object({
  date: z.string(),
  avgUnitPrice: z.number(),
  sales: z.number().optional(),
});

const statsResponseSchema = z.object({
  ok: z.boolean().optional(),
  currency: z.string().optional(),
  avg30d: z.number().optional(),
  samples: z.array(sampleSchema).optional(),
});

export type OfficialListing = z.infer<typeof listingSchema> & {
  unitUsd: number | null;
  isReserved: boolean;
};

function usdToKins(usd: number | null | undefined, kinsUsd: number): string | null {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return null;
  if (!Number.isFinite(kinsUsd) || kinsUsd <= 0) return null;
  return d(usd).div(kinsUsd).toFixed();
}

export async function fetchOfficialListings(params?: {
  sort?: "cheap" | "new" | string;
  currency?: "token" | "gold";
  category?: string;
  limit?: number;
  offset?: number;
  /** Cache TTL seconds — use short values for live feed */
  cacheTtlSeconds?: number;
}): Promise<OfficialListing[]> {
  const sort = params?.sort ?? "cheap";
  const currency = params?.currency ?? "token";
  const category = params?.category ?? "all";
  const limit = Math.min(Math.max(params?.limit ?? 60, 1), 100);
  const offset = Math.max(params?.offset ?? 0, 0);
  const ttl = params?.cacheTtlSeconds ?? (sort === "new" ? 8 : 40);

  const cacheKey = `official:listings:${sort}:${currency}:${category}:${limit}:${offset}`;
  const cached = getCached<OfficialListing[]>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const url = new URL(`${BASE}/api/marketplace/listings`);
  url.searchParams.set("sort", sort);
  url.searchParams.set("currency", currency);
  url.searchParams.set("category", category);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const res = await fetchWithTimeout(url.toString(), {
    timeoutMs: 12000,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`official listings failed: ${res.status}`);
  const json: unknown = await res.json();
  const parsed = listingsResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error("Unexpected official listings shape");

  const rows: OfficialListing[] = parsed.data.listings.map((l) => {
    // priceUsd is LOT total — unit derived in one place only
    const priced = normalizeListingPrice({
      quantity: l.quantity,
      priceUsd: l.priceUsd,
      priceGold: l.priceGold,
      currency: l.currency,
    });
    return {
      ...l,
      quantity: priced.quantity,
      unitUsd: priced.unitUsd,
      isReserved:
        l.reservedBy != null ||
        (l.reservedUntilMs != null && l.reservedUntilMs > Date.now()),
    };
  });

  setCache(cacheKey, rows, ttl);
  return rows;
}

/** Client-side filter (itemType query is not reliable on the public endpoint). */
export async function fetchOfficialListingsForItem(
  itemType: string,
  options?: { pages?: number; limit?: number; kinsUsd?: number },
): Promise<MarketplaceListing[]> {
  const pages = options?.pages ?? 4;
  const limit = options?.limit ?? 60;
  const want = itemType.toLowerCase();
  const collected: OfficialListing[] = [];

  for (let p = 0; p < pages; p++) {
    const batch = await fetchOfficialListings({
      sort: "cheap",
      currency: "token",
      category: "all",
      limit,
      offset: p * limit,
    });
    for (const row of batch) {
      if (row.itemType.toLowerCase() === want && !row.isReserved) {
        collected.push(row);
      }
    }
    if (batch.length < limit) break;
  }

  const kinsUsd = options?.kinsUsd;
  return collected
    .map((r) => {
      const qty = Math.max(r.quantity || 1, 1);
      const unitKins =
        kinsUsd != null && r.unitUsd != null
          ? usdToKins(r.unitUsd, kinsUsd)
          : null;
      const totalKins =
        kinsUsd != null && r.priceUsd != null
          ? usdToKins(r.priceUsd, kinsUsd)
          : null;
      return {
        id: String(r.id),
        itemId: r.itemType,
        quantity: String(qty),
        totalPriceKins: totalKins ?? String(r.priceUsd ?? 0),
        unitPriceKins: unitKins ?? String(r.unitUsd ?? 0),
        seller: r.sellerName,
        createdAt: r.createdAt,
      };
    })
    .sort((a, b) => d(a.unitPriceKins).cmp(d(b.unitPriceKins)));
}

export type OfficialFloorRow = {
  itemType: string;
  name: string;
  listings: number;
  totalQty: number;
  lowestUsdPerUnit: string | null;
  lowestKinsPerUnit: string | null;
  kinsListings: number;
  goldListings: number;
};

/** Aggregate many pages of official cheap listings into a floor board. */
export async function buildOfficialFloorBoard(options?: {
  pages?: number;
  limit?: number;
  kinsUsd?: number;
}): Promise<OfficialFloorRow[]> {
  const pageSize = Math.min(Math.max(options?.limit ?? 100, 1), 100);
  const pages = Math.min(Math.max(options?.pages ?? 12, 1), 20);
  const cacheKey = `official:floor-board:${pages}:${pageSize}:${options?.kinsUsd ?? "x"}`;
  const cached = getCached<OfficialFloorRow[]>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const byType = new Map<
    string,
    {
      listings: number;
      totalQty: number;
      lowestUsd: number | null;
      kinsListings: number;
      goldListings: number;
    }
  >();

  // Parallel chunks (same pattern as activity feed)
  const PARALLEL = 4;
  let endOffset: number | null = null;
  for (let start = 0; start < pages; start += PARALLEL) {
    if (endOffset != null && start * pageSize >= endOffset) break;
    const idxs = Array.from(
      { length: Math.min(PARALLEL, pages - start) },
      (_, i) => start + i,
    );
    const settled = await Promise.all(
      idxs.map(async (p) => {
        try {
          const batch = await fetchOfficialListings({
            sort: "cheap",
            currency: "token",
            category: "all",
            limit: pageSize,
            offset: p * pageSize,
          });
          return { p, batch, ok: true as const };
        } catch {
          return { p, batch: [] as OfficialListing[], ok: false as const };
        }
      }),
    );
    settled.sort((a, b) => a.p - b.p);
    for (const { p, batch, ok } of settled) {
      if (!ok) continue;
      for (const row of batch) {
        if (row.isReserved) continue;
        const cur = byType.get(row.itemType) ?? {
          listings: 0,
          totalQty: 0,
          lowestUsd: null as number | null,
          kinsListings: 0,
          goldListings: 0,
        };
        cur.listings += 1;
        cur.totalQty += row.quantity || 0;
        if ((row.currency ?? "token") === "token") cur.kinsListings += 1;
        else cur.goldListings += 1;
        if (row.unitUsd != null && Number.isFinite(row.unitUsd)) {
          if (cur.lowestUsd == null || row.unitUsd < cur.lowestUsd) {
            cur.lowestUsd = row.unitUsd;
          }
        }
        byType.set(row.itemType, cur);
      }
      if (batch.length < pageSize) {
        endOffset = p * pageSize + batch.length;
        break;
      }
    }
    if (endOffset != null) break;
  }

  const kinsUsd = options?.kinsUsd;
  const rows: OfficialFloorRow[] = [...byType.entries()]
    .map(([itemType, v]) => ({
      itemType,
      name: humanizeItemType(itemType),
      listings: v.listings,
      totalQty: v.totalQty,
      lowestUsdPerUnit: v.lowestUsd != null ? String(v.lowestUsd) : null,
      lowestKinsPerUnit:
        kinsUsd != null && v.lowestUsd != null
          ? usdToKins(v.lowestUsd, kinsUsd)
          : null,
      kinsListings: v.kinsListings,
      goldListings: v.goldListings,
    }))
    .sort((a, b) => b.listings - a.listings);

  setCache(cacheKey, rows, 45);
  return rows;
}

export type OfficialActivityRow = {
  id: string;
  listingId: string;
  itemType: string;
  name: string;
  quantity: string;
  unitKins: string;
  /** Total KINS for the lot (token listings) */
  totalKins: string | null;
  unitUsd: string | null;
  usdTotal: string | null;
  priceGold: string | null;
  currency: string;
  timestamp: string;
  sellerName: string | null;
  sellerId: string | null;
  reserved: boolean;
  reservedUntilMs: number | null;
  itemDurability: string | null;
};

/**
 * Live market feed: paginate official listings (parallel pages).
 * Default: 8×100 token pages — fast enough for 10s poll / serverless.
 * Stops early when a page returns short/empty.
 */
export async function fetchOfficialRecentActivity(options?: {
  /** Soft max rows (default pages × 100). */
  limit?: number;
  /** Max pages per currency (default 8). */
  pages?: number;
  kinsUsd?: number;
  /** Include gold listings too */
  includeGold?: boolean;
  /** sort=new (activity) or sort=cheap (listings by price) */
  sort?: "new" | "cheap";
}): Promise<OfficialActivityRow[]> {
  const pageSize = 100;
  const pages = Math.min(Math.max(options?.pages ?? 8, 1), 20);
  const maxRows = Math.min(
    Math.max(options?.limit ?? pages * pageSize, 1),
    2000,
  );
  const kinsUsd = options?.kinsUsd;
  const sort = options?.sort ?? "new";
  const collected: OfficialListing[] = [];
  const seen = new Set<string>();

  const currencies: Array<"token" | "gold"> = options?.includeGold
    ? ["token", "gold"]
    : ["token"];

  for (const currency of currencies) {
    // Parallel chunks of 4 — never treat a failed page as "empty book"
    // (empty catch used to mass-mark listings as sold on the client).
    const PARALLEL = 4;
    let endOffset: number | null = null;
    for (let start = 0; start < pages; start += PARALLEL) {
      if (endOffset != null && start * pageSize >= endOffset) break;
      const idxs = Array.from(
        { length: Math.min(PARALLEL, pages - start) },
        (_, i) => start + i,
      );
      const settled = await Promise.all(
        idxs.map(async (p) => {
          try {
            const batch = await fetchOfficialListings({
              sort,
              currency,
              category: "all",
              limit: pageSize,
              offset: p * pageSize,
              cacheTtlSeconds: 6,
            });
            return { p, batch, ok: true as const };
          } catch {
            return { p, batch: [] as OfficialListing[], ok: false as const };
          }
        }),
      );
      // Process in page order so short-page stop is correct
      settled.sort((a, b) => a.p - b.p);
      for (const { p, batch, ok } of settled) {
        if (!ok) {
          // skip failed page — do NOT treat as end-of-book
          continue;
        }
        for (const row of batch) {
          const id = String(row.id);
          if (seen.has(id)) continue;
          seen.add(id);
          collected.push(row);
        }
        if (batch.length < pageSize) {
          endOffset = p * pageSize + batch.length;
          break;
        }
      }
      if (collected.length >= maxRows) break;
      if (endOffset != null) break;
    }
    if (collected.length >= maxRows) break;
  }

  collected.sort((a, b) => {
    if (sort === "cheap") {
      const ua = a.unitUsd ?? Number.POSITIVE_INFINITY;
      const ub = b.unitUsd ?? Number.POSITIVE_INFINITY;
      if (ua !== ub) return ua - ub;
    }
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });

  return collected.slice(0, maxRows).map((r) => {
    const priced = normalizeListingPrice({
      quantity: r.quantity,
      priceUsd: r.priceUsd,
      unitUsd: r.unitUsd,
      priceGold: r.priceGold,
      currency: r.currency,
    });
    const qty = priced.quantity;
    const unitUsd = priced.unitUsd;
    const lotUsd = priced.lotUsd;
    const isToken = (r.currency ?? "token") === "token";
    const unitKins =
      kinsUsd != null && unitUsd != null && isToken
        ? usdToKins(unitUsd, kinsUsd)
        : null;
    const totalKins =
      kinsUsd != null && lotUsd != null && isToken
        ? usdToKins(lotUsd, kinsUsd)
        : unitKins != null
          ? d(unitKins).mul(qty).toFixed()
          : null;
    return {
      id: String(r.id),
      listingId: String(r.id),
      itemType: r.itemType,
      name: humanizeItemType(r.itemType),
      quantity: String(qty),
      unitKins: unitKins ?? "0",
      totalKins,
      unitUsd: unitUsd != null ? String(unitUsd) : null,
      usdTotal: lotUsd != null ? String(lotUsd) : null,
      priceGold:
        priced.priceGold != null ? String(priced.priceGold) : null,
      currency: r.currency ?? "token",
      timestamp: r.createdAt ?? new Date().toISOString(),
      sellerName: r.sellerName ?? null,
      sellerId: r.sellerId != null ? String(r.sellerId) : null,
      reserved: r.isReserved,
      reservedUntilMs:
        typeof r.reservedUntilMs === "number" ? r.reservedUntilMs : null,
      itemDurability:
        r.itemDurability != null ? String(r.itemDurability) : null,
    };
  });
}

export async function fetchOfficialItemStats(
  itemType: string,
  kinsUsd?: number,
): Promise<ItemMarketStats> {
  const cacheKey = `official:stats:${itemType}`;
  const cached = getCached<ItemMarketStats>(cacheKey);
  if (cached && !cached.stale && kinsUsd == null) return cached.value;

  const url = new URL(`${BASE}/api/marketplace/stats`);
  url.searchParams.set("currency", "token");
  url.searchParams.set("itemType", itemType);

  const res = await fetchWithTimeout(url.toString(), {
    timeoutMs: 10000,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`official stats failed: ${res.status}`);
  const json: unknown = await res.json();
  const parsed = statsResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error("Unexpected official stats shape");

  const samples: SoldSample[] = (parsed.data.samples ?? []).map((s) => ({
    timestamp: `${s.date}T00:00:00.000Z`,
    unitPriceKins:
      kinsUsd != null
        ? usdToKins(s.avgUnitPrice, kinsUsd) ?? String(s.avgUnitPrice)
        : String(s.avgUnitPrice),
    saleCount: s.sales,
  }));

  const sales30d = (parsed.data.samples ?? []).reduce(
    (a, s) => a + (s.sales ?? 0),
    0,
  );

  const avg30dKins =
    kinsUsd != null && parsed.data.avg30d != null
      ? usdToKins(parsed.data.avg30d, kinsUsd) ?? undefined
      : parsed.data.avg30d != null
        ? String(parsed.data.avg30d)
        : undefined;

  const stats: ItemMarketStats = {
    itemId: itemType,
    currency: "token",
    avg30dKins,
    sales30d,
    samples,
    updatedAt: new Date().toISOString(),
  };

  // Cache only raw conversion-free shape is hard — cache with short TTL always
  setCache(cacheKey, stats, 120);
  return stats;
}

export type WorldMerchantCampaign = {
  mode?: string;
  cycleId?: number;
  phase?: string;
  complete?: boolean;
  goals?: Record<string, number>;
  wood?: number;
  stone?: number;
  coal?: number;
  metal?: number;
  cooked_fish_meat?: number;
  goldTradeEnabled?: boolean;
  goldStock?: number;
  goldStockFull?: number;
  poolRemaining?: number;
  poolFull?: number;
  goldPerPoint?: number;
};

export async function fetchMerchantCampaign(): Promise<WorldMerchantCampaign> {
  const cacheKey = "fanout:merchant-campaign";
  const cached = getCached<WorldMerchantCampaign>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const res = await fetchWithTimeout(
    "https://fanout.kintara.gg/api/world/merchant-campaign",
    { timeoutMs: 8000, headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`merchant-campaign failed: ${res.status}`);
  const json = (await res.json()) as WorldMerchantCampaign & { ok?: boolean };
  setCache(cacheKey, json, 60);
  return json;
}

export async function fetchExpansionTribute(): Promise<Record<string, unknown>> {
  const cacheKey = "fanout:expansion-tribute";
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const res = await fetchWithTimeout(
    "https://fanout.kintara.gg/api/world/expansion-tribute",
    { timeoutMs: 8000, headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`expansion-tribute failed: ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  setCache(cacheKey, json, 60);
  return json;
}

export async function fetchGameServers(): Promise<unknown[]> {
  const cacheKey = "kintara:servers";
  const cached = getCached<unknown[]>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const res = await fetchWithTimeout("https://kintara.com/api/servers", {
    timeoutMs: 8000,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`servers failed: ${res.status}`);
  const json = (await res.json()) as { servers?: unknown[] };
  const servers = json.servers ?? [];
  setCache(cacheKey, servers, 120);
  return servers;
}

export function listingDisplayName(itemType: string): string {
  return humanizeItemType(itemType);
}

/** Endpoints that must never be called by this analytics app. */
export const BLOCKED_WRITE_ENDPOINTS = [
  "POST https://kintara.com/api/marketplace/reserve",
  "POST https://kintara.com/api/marketplace/token-quote",
  "POST https://kintara.com/api/marketplace/token-buy-confirm",
  "POST https://kintara.com/api/marketplace/release-reserve",
  "/auth/solana-json-rpc",
  "/token (purchase flow)",
  "/save-backpack",
] as const;
