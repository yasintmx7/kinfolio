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

/** Shared cheap book — item detail + seller inventory filter from this once. */
export type MarketBookSnapshot = {
  listings: OfficialListing[];
  size: number;
  /** Both currencies hit end-of-book (short page) within page budget. */
  complete: boolean;
  tokenComplete: boolean;
  goldComplete: boolean;
  pagesScannedToken: number;
  pagesScannedGold: number;
  updatedAt: string;
};

/** Flattened listing DTO for item/seller APIs (USD-first). */
export type OfficialListingDto = {
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

const BOOK_CACHE_KEY = "official:market-book:cheap:v2";
const BOOK_TTL_SECONDS = 28;

function sortListingsOpenFirst(a: OfficialListing, b: OfficialListing): number {
  const la = a.isReserved ? 1 : 0;
  const lb = b.isReserved ? 1 : 0;
  if (la !== lb) return la - lb;
  const ua = a.unitUsd ?? Number.POSITIVE_INFINITY;
  const ub = b.unitUsd ?? Number.POSITIVE_INFINITY;
  if (ua !== ub) return ua - ub;
  return (a.priceGold ?? 0) - (b.priceGold ?? 0);
}

/**
 * Scan official cheap book once (token + gold), cache ~28s.
 * Official API ignores itemType/seller filters — all detail views reuse this.
 */
export async function fetchOfficialMarketBook(options?: {
  pages?: number;
  force?: boolean;
}): Promise<MarketBookSnapshot> {
  const pages = Math.min(Math.max(options?.pages ?? 10, 1), 15);
  if (!options?.force) {
    const cached = getCached<MarketBookSnapshot>(BOOK_CACHE_KEY);
    if (cached && !cached.stale) return cached.value;
  }

  const collected: OfficialListing[] = [];
  const seen = new Set<string>();
  const pageSize = 100;
  const PARALLEL = 4;
  let pagesScannedToken = 0;
  let pagesScannedGold = 0;
  let tokenComplete = false;
  let goldComplete = false;

  for (const currency of ["token", "gold"] as const) {
    let endOffset: number | null = null;
    let pagesOk = 0;
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
              currency,
              category: "all",
              limit: pageSize,
              offset: p * pageSize,
              cacheTtlSeconds: 20,
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
        pagesOk = Math.max(pagesOk, p + 1);
        for (const row of batch) {
          const id = String(row.id);
          if (seen.has(id)) continue;
          seen.add(id);
          collected.push(row);
        }
        if (batch.length < pageSize) {
          endOffset = p * pageSize + batch.length;
          if (currency === "token") tokenComplete = true;
          else goldComplete = true;
          break;
        }
      }
      if (endOffset != null) break;
    }
    if (currency === "token") pagesScannedToken = pagesOk;
    else pagesScannedGold = pagesOk;
  }

  const snap: MarketBookSnapshot = {
    listings: collected,
    size: collected.length,
    complete: tokenComplete && goldComplete,
    tokenComplete,
    goldComplete,
    pagesScannedToken,
    pagesScannedGold,
    updatedAt: new Date().toISOString(),
  };
  setCache(BOOK_CACHE_KEY, snap, BOOK_TTL_SECONDS);
  return snap;
}

export function filterBookByItemType(
  book: OfficialListing[],
  marketType: string,
): OfficialListing[] {
  const want = marketType.toLowerCase();
  return book
    .filter((r) => r.itemType.toLowerCase() === want)
    .sort(sortListingsOpenFirst);
}

export function filterBookBySeller(
  book: OfficialListing[],
  opts: { sellerId?: string | null; sellerName?: string | null },
): OfficialListing[] {
  const id = (opts.sellerId ?? "").trim();
  const name = (opts.sellerName ?? "").trim().toLowerCase();
  return book
    .filter((r) => {
      if (id && r.sellerId != null && String(r.sellerId) === id) return true;
      if (name) {
        const n = (r.sellerName ?? "").trim().toLowerCase();
        if (n && n === name) return true;
      }
      // wallet-ish id matching name field is rare on official listings
      if (id && !/^\d+$/.test(id) && (r.sellerName ?? "").trim() === id) {
        return true;
      }
      return false;
    })
    .sort(sortListingsOpenFirst);
}

export function toOfficialListingDto(l: OfficialListing): OfficialListingDto {
  const priced = normalizeListingPrice({
    quantity: l.quantity,
    priceUsd: l.priceUsd,
    unitUsd: l.unitUsd,
    priceGold: l.priceGold,
    currency: l.currency,
  });
  return {
    id: String(l.id),
    itemType: l.itemType,
    name: humanizeItemType(l.itemType),
    quantity: String(priced.quantity),
    unitUsd: priced.unitUsd != null ? String(priced.unitUsd) : null,
    usdTotal: priced.lotUsd != null ? String(priced.lotUsd) : null,
    priceGold: priced.priceGold != null ? String(priced.priceGold) : null,
    currency: l.currency ?? "token",
    sellerName: l.sellerName ?? null,
    sellerId: l.sellerId != null ? String(l.sellerId) : null,
    reserved: l.isReserved,
    reservedUntilMs:
      typeof l.reservedUntilMs === "number" ? l.reservedUntilMs : null,
    buyerId: reservedById(l.reservedBy),
    timestamp: l.createdAt ?? null,
  };
}

/** Honest coverage note for empty / partial book results. */
export function bookCoverageNote(
  book: MarketBookSnapshot,
  matchCount: number,
  kind: "item" | "seller",
): string {
  if (matchCount > 0) {
    if (book.complete) {
      return `From live book (${book.size} listings scanned).`;
    }
    return `From scanned cheap book (~${book.size} listings). Higher-priced lots may be missing.`;
  }
  if (book.complete) {
    return kind === "item"
      ? "No open listings in the live book right now."
      : "No open listings for this seller in the live book.";
  }
  return kind === "item"
    ? "Not in the scanned cheap book — higher-priced lots may still list."
    : "Not in the scanned cheap book — this seller may still list higher-priced lots.";
}

/**
 * Item listings from shared cached book (official itemType filter is ignored).
 */
export async function fetchOfficialListingsForItem(
  itemType: string,
  options?: {
    pages?: number;
    limit?: number;
    kinsUsd?: number;
    includeReserved?: boolean;
    includeGold?: boolean;
  },
): Promise<MarketplaceListing[]> {
  const book = await fetchOfficialMarketBook({
    pages: options?.pages ?? 10,
  });
  let rows = filterBookByItemType(book.listings, itemType);
  if (!options?.includeReserved) {
    rows = rows.filter((r) => !r.isReserved);
  }
  if (options?.includeGold === false) {
    rows = rows.filter((r) => (r.currency ?? "token") === "token");
  }

  const kinsUsd = options?.kinsUsd;
  return rows
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
        // Prefer USD strings when no kins conversion (UI uses as unit/lot USD)
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

/** Official reservedBy is usually a number; sometimes an object with id. */
export function reservedById(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if (o.id != null) return String(o.id);
    if (o.userId != null) return String(o.userId);
    if (o.name != null) return String(o.name);
  }
  return null;
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
  /** Buyer user id when reserved (official API has no buyer username) */
  buyerId: string | null;
  buyerName: string | null;
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
  const pages = Math.min(Math.max(options?.pages ?? 10, 1), 20);
  // Room for ~500 token + ~500 gold (+ headroom)
  const maxRows = Math.min(
    Math.max(options?.limit ?? pages * pageSize * 2, 1),
    2500,
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
      buyerId: reservedById(r.reservedBy),
      // Public API never returns buyer username — only numeric id on reserve
      buyerName: null,
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
