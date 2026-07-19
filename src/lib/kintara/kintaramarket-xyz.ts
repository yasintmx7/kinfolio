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

/**
 * Open-book rows from GET /api/listings (global feed, up to ~1000).
 * Works from Vercel; official kintara.com often 429s serverless IPs.
 */
const openListingSchema = z.object({
  id: z.union([z.string(), z.number()]),
  itemType: z.string(),
  sellerName: z.string().optional().nullable(),
  quantity: z.number(),
  currency: z.string().optional().nullable(),
  priceUsd: z.number().nullable().optional(),
  priceGold: z.number().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  reservedBy: z.unknown().nullable().optional(),
  reservedUntilMs: z.number().nullable().optional(),
  firstSeen: z.number().optional().nullable(),
  lastSeen: z.number().optional().nullable(),
});

export type OpenMarketListing = z.infer<typeof openListingSchema>;

/** Activity-shaped row shared with market hub / activity API. */
export type MarketActivityRow = {
  id: string;
  listingId: string;
  itemType: string;
  name: string;
  quantity: string;
  unitKins: string;
  totalKins: string | null;
  unitUsd: string | null;
  usdTotal: string | null;
  priceGold: string | null;
  currency: string;
  timestamp: string;
  sellerName: string | null;
  sellerId: string | null;
  buyerId: string | null;
  buyerName: string | null;
  reserved: boolean;
  reservedUntilMs: number | null;
  itemDurability: string | null;
};

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
  // Short TTL for near-instant Activity solds
  setCache(cacheKey, rows, 2);
  return rows;
}

/**
 * Global open book from kintaramarket.xyz/api/listings (caps ~1000 server-side).
 * Prefer this on Vercel — kintara.com/marketplace/listings rate-limits (429) serverless.
 */
export async function fetchOpenListings(options?: {
  limit?: number;
}): Promise<OpenMarketListing[]> {
  const limit = Math.min(Math.max(options?.limit ?? 1000, 1), 3000);
  const cacheKey = `kmxyz:open-listings:v1:${limit}`;
  const cached = getCached<OpenMarketListing[]>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const url = new URL(`${BASE}/api/listings`);
  url.searchParams.set("limit", String(limit));
  const res = await fetchWithTimeout(url.toString(), {
    timeoutMs: 14000,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`kintaramarket listings failed: ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("Unexpected open listings shape");

  const rows: OpenMarketListing[] = [];
  for (const row of json) {
    const one = openListingSchema.safeParse(row);
    if (!one.success) continue;
    if (!one.data.itemType || !(one.data.quantity > 0)) continue;
    rows.push(one.data);
  }
  // Short TTL so new listings / delists show within ~2s of a client poll
  setCache(cacheKey, rows, 2);
  return rows;
}

/** Case-insensitive partial match for seller / item search. */
export function openListingMatchesQuery(
  row: OpenMarketListing,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qId = q.replace(/^#/, "");
  const seller = (row.sellerName ?? "").trim().toLowerCase();
  const item = row.itemType.toLowerCase();
  const itemSpaced = item.replace(/_/g, " ");
  const itemDashed = item.replace(/_/g, "-");
  const id = String(row.id);
  return (
    seller.includes(q) ||
    seller === qId ||
    item.includes(q) ||
    itemSpaced.includes(q) ||
    itemDashed.includes(q) ||
    id.includes(qId) ||
    (q === "lock" && row.reservedBy != null) ||
    (q === "locked" && row.reservedBy != null) ||
    (q === "reserved" && row.reservedBy != null)
  );
}

/**
 * Search open listings by seller name / item (full KM dump, not just cheap hub).
 * Prefer exact seller matches first, then partial.
 */
export async function searchOpenListings(
  query: string,
  options?: { limit?: number; kinsUsd?: number },
): Promise<MarketActivityRow[]> {
  const q = query.trim();
  if (!q) return [];
  const cap = Math.min(Math.max(options?.limit ?? 200, 1), 500);
  const rows = await fetchOpenListings({ limit: 3000 });
  const qLower = q.toLowerCase();
  const qId = qLower.replace(/^#/, "");

  const matched = rows.filter((r) => openListingMatchesQuery(r, q));
  // Rank: exact seller > seller starts-with > seller includes > item match
  matched.sort((a, b) => {
    const sa = (a.sellerName ?? "").toLowerCase();
    const sb = (b.sellerName ?? "").toLowerCase();
    const score = (s: string) => {
      if (s === qLower || s === qId) return 0;
      if (s.startsWith(qLower)) return 1;
      if (s.includes(qLower)) return 2;
      return 3;
    };
    const d = score(sa) - score(sb);
    if (d !== 0) return d;
    const ua =
      a.unitPrice ??
      (a.priceUsd != null && a.quantity > 0 ? a.priceUsd / a.quantity : Infinity);
    const ub =
      b.unitPrice ??
      (b.priceUsd != null && b.quantity > 0 ? b.priceUsd / b.quantity : Infinity);
    return (ua ?? Infinity) - (ub ?? Infinity);
  });

  return openListingsToActivity(matched.slice(0, cap), {
    kinsUsd: options?.kinsUsd,
    sort: "cheap",
    limit: cap,
  });
}

/**
 * Filter open book by seller name for a focused profile.
 * Exact match preferred; one-way prefix only when query is short (typeahead).
 * Never use reverse includes (would pull "Alex" into "Alexander").
 */
export async function fetchListingsForSellerName(
  sellerName: string,
  options?: { kinsUsd?: number; partial?: boolean },
): Promise<MarketActivityRow[]> {
  const name = sellerName.trim().toLowerCase();
  if (!name || name.startsWith("#")) return [];
  const rows = await fetchOpenListings({ limit: 3000 });
  const partial = Boolean(options?.partial);
  const hit = rows.filter((r) => {
    const s = (r.sellerName ?? "").trim().toLowerCase();
    if (!s) return false;
    if (s === name) return true;
    // Typeahead only: listing name starts with / contains query — not reverse
    if (partial && name.length >= 2 && s.includes(name)) return true;
    return false;
  });
  return openListingsToActivity(hit, {
    kinsUsd: options?.kinsUsd,
    sort: "cheap",
    limit: 500,
  });
}

function reservedBuyerId(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if (o.id != null) return String(o.id);
    if (o.userId != null) return String(o.userId);
  }
  return null;
}

function rowIsLocked(r: {
  reserved?: boolean;
  reservedUntilMs?: number | null;
  buyerId?: string | null;
}): boolean {
  if (r.reserved) return true;
  if (r.buyerId != null && String(r.buyerId).trim() !== "") return true;
  if (
    typeof r.reservedUntilMs === "number" &&
    r.reservedUntilMs > Date.now()
  ) {
    return true;
  }
  return false;
}

function unitPriceKey(r: { unitUsd?: string | null }): number {
  const n = r.unitUsd != null ? Number(r.unitUsd) : NaN;
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function isGoldCurrency(r: { currency?: string | null }): boolean {
  return (r.currency ?? "token") === "gold";
}

function sortOpenPool(
  rows: MarketActivityRow[],
  sort: "cheap" | "new",
): MarketActivityRow[] {
  if (sort === "new") {
    return [...rows].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
    );
  }
  // Gold lots often have null unitUsd — sort by gold price, not Infinity
  return [...rows].sort((a, b) => {
    if (isGoldCurrency(a) && isGoldCurrency(b)) {
      const ga = a.priceGold != null ? Number(a.priceGold) : Number.POSITIVE_INFINITY;
      const gb = b.priceGold != null ? Number(b.priceGold) : Number.POSITIVE_INFINITY;
      if (ga !== gb) return ga - gb;
      return Date.parse(b.timestamp) - Date.parse(a.timestamp);
    }
    if (isGoldCurrency(a) !== isGoldCurrency(b)) {
      // Prefer token when comparing mixed (token has $ unit)
      return isGoldCurrency(a) ? 1 : -1;
    }
    const ua = unitPriceKey(a);
    const ub = unitPriceKey(b);
    if (ua !== ub) return ua - ub;
    return Date.parse(b.timestamp) - Date.parse(a.timestamp);
  });
}

/**
 * Cap rows without dropping reserved/locked or all-gold lots.
 * Old path sorted open-first / $ only then sliced → locks + gold vanished.
 */
export function selectActivityRows(
  rows: MarketActivityRow[],
  max: number,
  sort: "cheap" | "new" = "cheap",
): MarketActivityRow[] {
  const limit = Math.min(Math.max(max, 1), 4000);
  if (rows.length <= limit) {
    return sortActivityRows(rows, sort);
  }

  const locked = rows.filter(rowIsLocked);
  const open = rows.filter((r) => !rowIsLocked(r));
  const openToken = open.filter((r) => !isGoldCurrency(r));
  const openGold = open.filter(isGoldCurrency);

  const locksSorted = sortOpenPool(locked, sort);
  const tokenSorted = sortOpenPool(openToken, sort);
  const goldSorted = sortOpenPool(openGold, sort);

  // Always keep locks; reserve ~20% of remaining for gold currency lots
  const lockKeep = locksSorted.slice(0, limit);
  const rest = Math.max(0, limit - lockKeep.length);
  const goldBudget = Math.min(
    goldSorted.length,
    Math.max(rest > 0 && goldSorted.length > 0 ? 30 : 0, Math.floor(rest * 0.22)),
  );
  const goldKeep = goldSorted.slice(0, goldBudget);
  const tokenKeep = tokenSorted.slice(0, Math.max(0, rest - goldKeep.length));
  // If token under-fills, give space back to gold
  const leftover = rest - tokenKeep.length - goldKeep.length;
  const goldExtra =
    leftover > 0 ? goldSorted.slice(goldKeep.length, goldKeep.length + leftover) : [];

  return sortActivityRows(
    [...tokenKeep, ...goldKeep, ...goldExtra, ...lockKeep],
    sort,
  );
}

export function sortActivityRows(
  rows: MarketActivityRow[],
  sort: "cheap" | "new" = "cheap",
): MarketActivityRow[] {
  return [...rows].sort((a, b) => {
    if (sort === "new") {
      return Date.parse(b.timestamp) - Date.parse(a.timestamp);
    }
    // cheap: open first (locks still present), then unit $
    const la = rowIsLocked(a) ? 1 : 0;
    const lb = rowIsLocked(b) ? 1 : 0;
    if (la !== lb) return la - lb;
    const ua = unitPriceKey(a);
    const ub = unitPriceKey(b);
    if (ua !== ub) return ua - ub;
    return Date.parse(b.timestamp) - Date.parse(a.timestamp);
  });
}

/** Map kintaramarket open listings → market hub activity rows. */
export function openListingsToActivity(
  rows: OpenMarketListing[],
  options?: { kinsUsd?: number; sort?: "cheap" | "new"; limit?: number },
): MarketActivityRow[] {
  const kinsUsd = options?.kinsUsd;
  const sort = options?.sort ?? "cheap";
  const max = Math.min(Math.max(options?.limit ?? 1000, 1), 3000);

  const mapped: MarketActivityRow[] = rows.map((r) => {
    const currency = r.currency ?? "token";
    const isGold = currency === "gold";
    // Never treat KM unitPrice as USD for pure gold-pay lots (priceUsd null)
    const priced = normalizeListingPrice({
      quantity: r.quantity,
      priceUsd: r.priceUsd,
      unitUsd: isGold && r.priceUsd == null ? null : r.unitPrice,
      priceGold: r.priceGold,
      currency,
    });
    const qty = priced.quantity;
    const unitUsd = priced.unitUsd;
    const lotUsd = priced.lotUsd;
    const isToken = !isGold;
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
    const tsMs = r.lastSeen ?? r.firstSeen ?? 0;
    const buyerId = reservedBuyerId(r.reservedBy);
    const reserved =
      r.reservedBy != null ||
      buyerId != null ||
      (typeof r.reservedUntilMs === "number" && r.reservedUntilMs > Date.now());

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
      priceGold: priced.priceGold != null ? String(priced.priceGold) : null,
      currency: r.currency ?? "token",
      timestamp: new Date(tsMs).toISOString(),
      sellerName: sanitizePersonName(r.sellerName),
      sellerId: null,
      buyerId,
      buyerName: null,
      reserved,
      reservedUntilMs:
        typeof r.reservedUntilMs === "number" ? r.reservedUntilMs : null,
      itemDurability: null,
    };
  });

  return selectActivityRows(mapped, max, sort);
}

export async function fetchMarketActivityFeed(options?: {
  limit?: number;
  kinsUsd?: number;
  sort?: "cheap" | "new";
}): Promise<MarketActivityRow[]> {
  const limit = Math.min(Math.max(options?.limit ?? 1000, 1), 3000);
  const raw = await fetchOpenListings({ limit });
  return openListingsToActivity(raw, {
    kinsUsd: options?.kinsUsd,
    sort: options?.sort,
    limit,
  });
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
    const currency = r.currency ?? "token";
    const isGold = currency === "gold";
    // unitPrice is USD-per-unit on token lots; do not use as USD for gold-pay
    const priced = normalizeListingPrice({
      quantity: qty,
      priceUsd: r.priceUsd,
      unitUsd: isGold && r.priceUsd == null ? null : r.unitPrice,
      // usdTotal intentionally omitted: priceUsd (lot total) already takes priority
      // and passing the same value twice creates a misleading call contract (Bug #8).
      priceGold: r.priceGold,
      currency,
    });
    const reserved =
      r.reservedBy != null ||
      (typeof r.reservedUntilMs === "number" && r.reservedUntilMs > Date.now());
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
        kinsUsd && unitUsd != null
          ? usdToKins(unitUsd, kinsUsd)
          // Bug #9 fix: when no kinsUsd rate is available, do NOT store the USD value
          // in a KINS-named field — that would be ~100-10,000x off for all consumers.
          // Return "0" so callers know the price is unavailable rather than wrong.
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
