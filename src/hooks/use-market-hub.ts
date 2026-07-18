"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cleanSellerFields,
  officialListingId,
  sanitizePersonName,
} from "@/lib/market/seller-label";
import {
  detectGoneListings,
  mergeSoldFeeds,
  pruneBookDeltaSold,
  removeSoldFromOpenBook,
  scrubSoldSellerFields,
  soldListingIdSet,
  toInstantSold,
} from "@/lib/market/instant-sold";
import { filterSoldStillOpen } from "@/lib/market/sold-filter";

export type MarketFloorItem = {
  id: string;
  name: string;
  portfolioItemId?: string;
  listings?: number;
  totalQty?: number;
  lowestUsdPerUnit?: string | null;
  lowestKinsPerUnit?: string | null;
  lowestGoldPerUnit?: string | null;
  kinsListings?: number;
  goldListings?: number;
};

/** All-items board totals (kintaramarket-style). */
export type MarketBoardStats = {
  itemCount: number;
  itemsWithListings: number;
  totalListings: number;
  totalQty: number;
  tokenListings: number;
  goldListings: number;
};

export type RecentSale = {
  id: string;
  listingId?: string;
  name: string;
  itemType: string;
  quantity: string;
  unitKins: string;
  totalKins?: string | null;
  unitUsd?: string | null;
  usdTotal: string | null;
  priceGold?: string | null;
  currency?: string;
  timestamp: string;
  solscanUrl: string | null;
  portfolioItemId?: string | null;
  seller?: string | null;
  sellerName?: string | null;
  sellerId?: string | null;
  buyerId?: string | null;
  buyerName?: string | null;
  buyerWallet?: string | null;
  sellerWallet?: string | null;
  reserved?: boolean;
  reservedUntilMs?: number | null;
  itemDurability?: string | null;
  isSold?: boolean;
  /** True when indexer has tx but not item/qty yet (~0–2 min lag common) */
  itemPending?: boolean;
  /** Instant path: left official open book between polls */
  fromBookDelta?: boolean;
};

export type MarketHubData = {
  floors: MarketFloorItem[];
  /** Aggregate totals for All-items board */
  boardStats: MarketBoardStats | null;
  /** Live open listings (big list) */
  sales: RecentSale[];
  /** Real completed sales (activity card) */
  sold: RecentSale[];
  byItem: {
    itemType: string;
    name: string;
    saleCount: number;
    medianUnitKins: string | null;
    avgUnitKins: string | null;
    lastSaleAt: string | null;
    lastUnitKins: string | null;
  }[];
  kinsUsd: string | null;
  goldFloorUsd: string | null;
  rateSource: string | null;
  goneCount: number | null;
  floorsUpdatedAt?: string;
  salesNote?: string | null;
  floorsNote?: string | null;
  activityCount?: number;
  lastActivityAt?: string | null;
  configured: boolean;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
};

const empty: MarketHubData = {
  floors: [],
  boardStats: null,
  sales: [],
  sold: [],
  byItem: [],
  kinsUsd: null,
  goldFloorUsd: null,
  rateSource: null,
  goneCount: null,
  configured: false,
  error: null,
  loading: true,
  refreshing: false,
};

/**
 * Progressive feeds:
 *  - PULSE_NEW  = brand-new listings every ~1.5s (instant "just listed")
 *  - PULSE_SOLD = recent sales every ~1.5s (instant Activity)
 *  - CHEAP_FAST = full cheap book every few pulses (price ladder + delists)
 *  - CHEAP_DEEP = rare deep expand
 */
const CHEAP_FAST_URL =
  "/api/market/activity?limit=1000&pages=6&gold=1&sort=cheap";
const CHEAP_DEEP_URL =
  "/api/market/activity?limit=2500&pages=12&gold=1&sort=cheap";
const NEW_URL = "/api/market/activity?limit=250&pages=3&gold=1&sort=new&km=1";
const PULSE_NEW_URL =
  "/api/market/activity?limit=150&pages=1&gold=1&sort=new&km=1";
// kintaramarket /api/sales supports up to ~500 (hours of history)
const SOLD_URL = "/api/market/sold?limit=300";
const PULSE_SOLD_URL = "/api/market/sold?limit=100";

function bestSellerName(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  return sanitizePersonName(a) ?? sanitizePersonName(b);
}

function mergeListingFeeds(
  cheap: RecentSale[],
  newest: RecentSale[],
): RecentSale[] {
  const map = new Map<string, RecentSale>();
  for (const row of cheap) {
    map.set(String(row.id), row);
  }
  for (const row of newest) {
    const id = String(row.id);
    const prev = map.get(id);
    if (!prev) {
      map.set(id, row);
      continue;
    }
    // Prefer newer lock/price fields; never drop a lock if either side has it
    const prevTs = Date.parse(prev.timestamp) || 0;
    const nextTs = Date.parse(row.timestamp) || 0;
    const base = nextTs >= prevTs ? { ...prev, ...row } : { ...row, ...prev };
    const name = bestSellerName(row.sellerName, prev.sellerName);
    const reserved = Boolean(prev.reserved || row.reserved);
    const reservedUntilMs =
      Math.max(prev.reservedUntilMs ?? 0, row.reservedUntilMs ?? 0) || null;
    map.set(id, {
      ...base,
      reserved,
      reservedUntilMs:
        reservedUntilMs && reservedUntilMs > 0 ? reservedUntilMs : null,
      buyerId: row.buyerId ?? prev.buyerId ?? null,
      sellerName: name,
      seller: name,
      sellerId: row.sellerId ?? prev.sellerId,
    });
  }
  return [...map.values()];
}

function actFromSettled(
  settled: PromiseSettledResult<unknown>,
): {
  ok: boolean;
  activity: RecentSale[];
  kinsUsd: string | null;
  rateSource: string | null;
} {
  if (settled.status !== "fulfilled") {
    return { ok: false, activity: [], kinsUsd: null, rateSource: null };
  }
  const body = settled.value as {
    ok?: boolean;
    data?: {
      activity?: RecentSale[];
      kinsUsd?: string | null;
      rateSource?: string | null;
    };
  };
  if (!body?.ok || !Array.isArray(body.data?.activity)) {
    return { ok: false, activity: [], kinsUsd: null, rateSource: null };
  }
  return {
    ok: true,
    activity: body.data!.activity!,
    kinsUsd: body.data?.kinsUsd ?? null,
    rateSource: body.data?.rateSource ?? null,
  };
}

/**
 * Fingerprint must change when locks/prices change, not only first/last ids.
 * (Previously silent polls skipped UI when only reservedBy updated.)
 */
function listFingerprint(
  rows: {
    id: string;
    timestamp?: string;
    reserved?: boolean;
    buyerId?: string | null;
    usdTotal?: string | null;
    unitUsd?: string | null;
  }[],
): string {
  if (!rows.length) return "0";
  const a = rows[0];
  const b = rows[rows.length - 1];
  const m = rows[Math.floor(rows.length / 2)];
  let reservedN = 0;
  let reservedSig = "";
  // Sample up to 12 reserved rows for lock-state changes
  for (const r of rows) {
    if (r.reserved || r.buyerId) {
      reservedN++;
      if (reservedSig.length < 120) {
        reservedSig += `${r.id}:${r.buyerId ?? ""}:`;
      }
    }
  }
  return [
    rows.length,
    a?.id,
    m?.id,
    b?.id,
    a?.timestamp ?? "",
    b?.timestamp ?? "",
    a?.usdTotal ?? "",
    m?.usdTotal ?? "",
    b?.usdTotal ?? "",
    `r${reservedN}`,
    reservedSig,
  ].join(":");
}

async function fetchJson(url: string, timeoutMs = 20000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    // Followed redirect to Vercel/login HTML, or gateway timeout page
    const ctype = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    if (!ctype.includes("application/json")) {
      throw new Error(
        `Expected JSON from ${url} (got ${ctype || "unknown"}). If the site is behind Vercel login protection, disable it for Production or API routes will stay empty.`,
      );
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildByItem(
  sales: RecentSale[],
  floors: MarketFloorItem[],
): MarketHubData["byItem"] {
  const byType = new Map<string, { vals: number[]; lastAt: string | null }>();
  for (const s of sales) {
    const n = Number(s.unitUsd ?? s.unitKins);
    if (!Number.isFinite(n) || n <= 0) continue;
    const cur = byType.get(s.itemType) ?? { vals: [], lastAt: null };
    cur.vals.push(n);
    if (!cur.lastAt || Date.parse(s.timestamp) > Date.parse(cur.lastAt)) {
      cur.lastAt = s.timestamp;
    }
    byType.set(s.itemType, cur);
  }
  return [...byType.entries()].map(([itemType, { vals, lastAt }]) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const floor = floors.find((f) => f.id === itemType);
    return {
      itemType,
      name: floor?.name ?? itemType,
      saleCount: vals.length,
      medianUnitKins: String(median),
      avgUnitKins: String(avg),
      lastSaleAt: lastAt,
      lastUnitKins: String(sorted[sorted.length - 1] ?? median),
    };
  });
}

/** sellerId → sellerName from open-book rows (wallets never stored) */
function buildSellerIdNameMap(
  rows: RecentSale[],
  into?: Map<string, string>,
): Map<string, string> {
  const idToName = into ?? new Map<string, string>();
  for (const r of rows) {
    const name = sanitizePersonName(r.sellerName ?? r.seller);
    if (r.sellerId != null && name) {
      idToName.set(String(r.sellerId), name);
    }
  }
  return idToName;
}

/**
 * Official API only gives reservedBy as a numeric user id (no username).
 * Reverse-map against known sellers (open book) → buyerName when possible.
 */
function resolveLockerNames(
  rows: RecentSale[],
  sellerIdToName?: Map<string, string>,
): RecentSale[] {
  const idToName =
    sellerIdToName && sellerIdToName.size > 0
      ? sellerIdToName
      : buildSellerIdNameMap(rows);
  if (idToName.size === 0) return rows;

  let changed = false;
  const out = rows.map((r) => {
    if (!r.buyerId) return r;
    if (r.buyerName && !r.buyerName.startsWith("#")) return r;
    const name = idToName.get(String(r.buyerId));
    if (!name) return r;
    changed = true;
    return { ...r, buyerName: name };
  });
  return changed ? out : rows;
}

/**
 * Attach seller username / item meta from known (past or present) listings.
 * Never overwrite sale qty/price with live listing (partial fills stay accurate).
 * Never copy reserved/locker state onto a sold row (open locks ≠ buyer of sale).
 */
function enrichSold(
  sold: RecentSale[],
  known: Map<string, RecentSale>,
  /** Live open book — used to drop false "sold while still listed" rows */
  openListings: RecentSale[] = [],
): RecentSale[] {
  const candidates = filterSoldStillOpen(sold, openListings);
  return candidates.map((row) => {
    const lid = officialListingId(row.listingId);
    const hit = lid ? known.get(lid) : undefined;

    if (!hit) {
      return scrubSoldSellerFields({
        ...row,
        isSold: true,
        listingId: lid ?? undefined,
        reserved: false,
        reservedUntilMs: null,
      }) as RecentSale;
    }
    // Prefer sale-native item meta; only fill gaps from known listing snapshot
    const itemName =
      row.name && row.name !== "Sale" ? row.name : hit.name || row.name;
    const itemType =
      row.itemType && row.itemType !== "unknown"
        ? row.itemType
        : hit.itemType || row.itemType;
    const people = cleanSellerFields({
      sellerName: hit.sellerName ?? row.sellerName,
      seller: hit.seller ?? row.seller,
      sellerId: hit.sellerId ?? row.sellerId,
      sellerWallet: row.sellerWallet ?? hit.sellerWallet,
    });
    return scrubSoldSellerFields({
      ...row,
      isSold: true,
      listingId: lid ?? undefined,
      sellerName: people.sellerName,
      sellerId: people.sellerId,
      seller: people.seller,
      sellerWallet: people.sellerWallet,
      // Do NOT pull open-book reservedBy as the sale buyer
      name: itemName,
      itemType,
      reserved: false,
      reservedUntilMs: null,
    }) as RecentSale;
  });
}

/**
 * Default poll ~1.5s pulse (new listings + sold).
 * Full cheap book every 3rd tick. Instant sold = book delta + sold-feed delist.
 */
export function useMarketHub(pollMs = 1_500) {
  const [data, setData] = useState<MarketHubData>(empty);
  const listingsInFlight = useRef(false);
  const soldInFlight = useRef(false);
  const floorsInFlight = useRef(false);
  const pulseTick = useRef(0);
  /** listingId → listing for seller name enrichment on sold */
  const knownListingsRef = useRef<Map<string, RecentSale>>(new Map());
  /** sellerId → sellerName for locker reverse-lookup */
  const sellerIdNameRef = useRef<Map<string, string>>(new Map());
  /** Previous open-book snapshot for instant sold detection */
  const lastOpenSnapshotRef = useRef<RecentSale[]>([]);
  /** Instant solds from official book disappearances (listingId → row) */
  const bookDeltaSoldRef = useRef<Map<string, RecentSale>>(new Map());
  /** Last chain sold payload (merged with book-delta on each update) */
  const chainSoldRef = useRef<RecentSale[]>([]);
  const lastListingsFp = useRef("");
  const lastSoldFp = useRef("");

  const buildMergedSold = useCallback(
    (openBook: RecentSale[], chainRaw?: RecentSale[]) => {
      if (chainRaw) {
        chainSoldRef.current = chainRaw;
      }
      // Drop book-delta rows that reappeared on the open book
      const openIds = new Set(openBook.map((r) => String(r.id)));
      for (const [lid, row] of bookDeltaSoldRef.current) {
        if (openIds.has(lid) || (row.listingId && openIds.has(String(row.listingId)))) {
          bookDeltaSoldRef.current.delete(lid);
        }
      }
      const bookRows = pruneBookDeltaSold(
        [...bookDeltaSoldRef.current.values()],
        45 * 60 * 1000,
      );
      bookDeltaSoldRef.current = new Map(
        bookRows
          .map((r) => {
            const lid = officialListingId(r.listingId ?? r.id);
            return lid ? ([lid, r] as const) : null;
          })
          .filter((x): x is readonly [string, RecentSale] => x != null),
      );

      const chainEnriched = resolveLockerNames(
        enrichSold(chainSoldRef.current, knownListingsRef.current, openBook),
        sellerIdNameRef.current,
      );
      // Longer Activity history: kintaramarket sales + book-delta solds
      const merged = mergeSoldFeeds(bookRows, chainEnriched, 350);
      return resolveLockerNames(merged, sellerIdNameRef.current);
    },
    [],
  );

  const applyListingsFeed = useCallback(
    (
      cheap: ReturnType<typeof actFromSettled>,
      newest: ReturnType<typeof actFromSettled>,
      opts?: { silent?: boolean },
    ) => {
      const feedOk = cheap.ok || newest.ok;

      setData((prev) => {
        const cheapRows = cheap.ok
          ? cheap.activity
          : newest.ok
            ? prev.sales
            : [];
        const newRows = newest.ok ? newest.activity : [];
        let nextSalesRaw = feedOk
          ? mergeListingFeeds(
              cheapRows.length ? cheapRows : prev.sales,
              newRows,
            )
          : prev.sales;

        // Instant delist: drop anything already in sold / book-delta
        nextSalesRaw = removeSoldFromOpenBook(nextSalesRaw, [
          ...prev.sold,
          ...bookDeltaSoldRef.current.values(),
        ]);

        if (feedOk) {
          buildSellerIdNameMap(nextSalesRaw, sellerIdNameRef.current);
        }

        const nextSales = resolveLockerNames(
          nextSalesRaw,
          sellerIdNameRef.current,
        );

        const fp = listFingerprint(nextSales);
        const sameList =
          feedOk && fp === lastListingsFp.current && prev.sales.length > 0;

        if (feedOk) {
          lastListingsFp.current = fp;
          // Instant sold: listing left official open book since last healthy poll
          if (!sameList && lastOpenSnapshotRef.current.length > 0) {
            const gone = detectGoneListings(
              lastOpenSnapshotRef.current,
              nextSales,
            );
            const now = Date.now();
            for (const row of gone) {
              const lid = officialListingId(row.listingId ?? row.id);
              if (!lid) continue;
              const snap = knownListingsRef.current.get(lid) ?? row;
              bookDeltaSoldRef.current.set(
                lid,
                toInstantSold(snap, now) as RecentSale,
              );
            }
          }

          if (!sameList) {
            const map = new Map(knownListingsRef.current);
            for (const row of nextSales) {
              map.set(String(row.id), row);
              if (row.listingId) map.set(String(row.listingId), row);
            }
            if (map.size > 4000) {
              const entries = [...map.entries()].slice(-3000);
              knownListingsRef.current = new Map(entries);
            } else {
              knownListingsRef.current = map;
            }
          }

          lastOpenSnapshotRef.current = nextSales;
        }

        const kinsUsd = cheap.kinsUsd ?? newest.kinsUsd ?? prev.kinsUsd;
        const rateSource =
          cheap.rateSource ?? newest.rateSource ?? prev.rateSource;

        const sold = feedOk ? buildMergedSold(nextSales) : prev.sold;

        if (sameList && opts?.silent) {
          return {
            ...prev,
            sales: nextSales,
            sold,
            kinsUsd,
            rateSource,
            loading: false,
            refreshing: false,
            error: feedOk ? null : prev.error,
          };
        }

        let lastAt = prev.lastActivityAt;
        for (const r of nextSales) {
          if (!lastAt || Date.parse(r.timestamp) > Date.parse(lastAt)) {
            lastAt = r.timestamp;
          }
        }
        for (const r of sold) {
          if (!lastAt || Date.parse(r.timestamp) > Date.parse(lastAt)) {
            lastAt = r.timestamp;
          }
        }

        return {
          ...prev,
          sales: nextSales,
          sold,
          byItem: buildByItem(nextSales, prev.floors),
          kinsUsd,
          rateSource,
          salesNote: feedOk
            ? "Sold: instant from official book + chain tx when ready."
            : prev.salesNote,
          activityCount: nextSales.length,
          lastActivityAt: lastAt,
          configured: Boolean(feedOk || prev.configured),
          error:
            !feedOk && prev.sales.length === 0
              ? "Market data unavailable — check connection or Vercel login protection on API routes."
              : feedOk
                ? null
                : prev.error,
          loading: false,
          refreshing: false,
        };
      });

      return feedOk;
    },
    [buildMergedSold],
  );

  const deepInFlight = useRef(false);

  const reloadListings = useCallback(
    async (opts?: { silent?: boolean; deep?: boolean; pulse?: boolean }) => {
      if (listingsInFlight.current) return;
      listingsInFlight.current = true;
      if (!opts?.silent) {
        setData((s) => ({ ...s, refreshing: true }));
      }
      let newest: ReturnType<typeof actFromSettled> = {
        ok: false,
        activity: [],
        kinsUsd: null,
        rateSource: null,
      };
      let feedOk = false;
      const pulseOnly = Boolean(opts?.pulse && opts?.silent);
      try {
        if (pulseOnly) {
          // Instant path: only newest listings (merge into existing book)
          const newSettled = await Promise.allSettled([
            fetchJson(PULSE_NEW_URL, 8000),
          ]);
          newest = actFromSettled(newSettled[0]);
          const keepCheap: ReturnType<typeof actFromSettled> = {
            ok: false,
            activity: [],
            kinsUsd: newest.kinsUsd,
            rateSource: newest.rateSource,
          };
          feedOk = applyListingsFeed(keepCheap, newest, opts);
        } else {
          // Full pass — cheap book + newest
          const [cheapSettled, newSettled] = await Promise.allSettled([
            fetchJson(CHEAP_FAST_URL, 16000),
            fetchJson(NEW_URL, 10000),
          ]);
          const cheap = actFromSettled(cheapSettled);
          newest = actFromSettled(newSettled);
          feedOk = applyListingsFeed(cheap, newest, opts);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Network error loading market";
        setData((s) => ({
          ...s,
          loading: false,
          refreshing: false,
          error: s.sales.length === 0 ? msg : s.error,
        }));
      } finally {
        listingsInFlight.current = false;
      }

      // Deep expand only on initial / manual reload
      const wantDeep =
        opts?.deep === true ||
        (opts?.deep !== false && !opts?.silent && !opts?.pulse && feedOk);
      if (!wantDeep || deepInFlight.current) return;
      deepInFlight.current = true;
      try {
        const deepSettled = await Promise.allSettled([
          fetchJson(CHEAP_DEEP_URL, 40000),
        ]);
        const deep = actFromSettled(deepSettled[0]);
        if (deep.ok) {
          applyListingsFeed(deep, newest.ok ? newest : deep, {
            silent: true,
          });
        }
      } catch {
        // keep fast feed
      } finally {
        deepInFlight.current = false;
      }
    },
    [applyListingsFeed],
  );

  const reloadSold = useCallback(
    async (opts?: { pulse?: boolean }) => {
      if (soldInFlight.current) return;
      soldInFlight.current = true;
      try {
        const url = opts?.pulse ? PULSE_SOLD_URL : SOLD_URL;
        const soldRes = (await fetchJson(url, 10000)) as {
          ok?: boolean;
          data?: { sold?: RecentSale[]; note?: string };
        };
        if (!soldRes?.ok || !Array.isArray(soldRes.data?.sold)) return;

        const raw = soldRes.data!.sold!;
        const fp = listFingerprint(raw);
        const sameSales = fp === lastSoldFp.current;
        lastSoldFp.current = fp;

        // Instant sold: any open/known listing that appears in sold feed
        const soldIds = soldListingIdSet(raw);
        const now = Date.now();
        for (const lid of soldIds) {
          if (bookDeltaSoldRef.current.has(lid)) continue;
          const snap =
            knownListingsRef.current.get(lid) ??
            lastOpenSnapshotRef.current.find(
              (r) =>
                officialListingId(r.listingId ?? r.id) === lid ||
                String(r.id) === lid,
            );
          if (snap) {
            bookDeltaSoldRef.current.set(
              lid,
              toInstantSold(snap, now) as RecentSale,
            );
          }
        }

        setData((prev) => {
          // Drop sold ids from open book immediately
          const prunedOpen = removeSoldFromOpenBook(prev.sales, [
            ...raw,
            ...bookDeltaSoldRef.current.values(),
          ]);
          if (prunedOpen.length !== prev.sales.length) {
            lastOpenSnapshotRef.current = prunedOpen;
          }

          const sold = buildMergedSold(prunedOpen, raw);
          if (
            sameSales &&
            prev.sold.length === sold.length &&
            prunedOpen.length === prev.sales.length
          ) {
            let improved = false;
            for (let i = 0; i < sold.length; i++) {
              const a = sold[i];
              const b = prev.sold[i];
              if (
                a?.id !== b?.id ||
                a?.solscanUrl !== b?.solscanUrl ||
                (a?.sellerName && a.sellerName !== b?.sellerName) ||
                (a?.sellerId && a.sellerId !== b?.sellerId) ||
                a?.listingId !== b?.listingId ||
                a?.name !== b?.name
              ) {
                improved = true;
                break;
              }
            }
            if (!improved) return prev;
          }
          return {
            ...prev,
            sales: prunedOpen,
            sold,
            byItem: buildByItem(prunedOpen, prev.floors),
            activityCount: prunedOpen.length,
            lastActivityAt: sold[0]?.timestamp ?? prev.lastActivityAt,
            salesNote:
              soldRes.data?.note ??
              "Sold: instant book drop + sales feed (≤2s).",
          };
        });
      } catch {
        // keep previous sold
      } finally {
        soldInFlight.current = false;
      }
    },
    [buildMergedSold],
  );

  const reloadFloors = useCallback(async () => {
    if (floorsInFlight.current) return;
    floorsInFlight.current = true;
    try {
      const floorsRes = (await fetchJson("/api/market/items", 25000)) as {
        ok?: boolean;
        data?: {
          items?: MarketFloorItem[];
          stats?: MarketBoardStats;
          kinsUsd?: string | null;
          rateSource?: string | null;
          note?: string;
          provider?: string;
        };
        updatedAt?: string;
      };

      setData((prev) => {
        if (!floorsRes?.ok) return prev;
        const floors = floorsRes.data?.items ?? prev.floors;
        const boardStats = floorsRes.data?.stats ?? prev.boardStats;
        return {
          ...prev,
          floors,
          boardStats,
          byItem: buildByItem(prev.sales, floors),
          kinsUsd: floorsRes.data?.kinsUsd ?? prev.kinsUsd,
          rateSource: floorsRes.data?.rateSource ?? prev.rateSource,
          floorsNote: floorsRes.data?.note ?? prev.floorsNote,
          floorsUpdatedAt: floorsRes.updatedAt ?? prev.floorsUpdatedAt,
          configured: true,
        };
      });
    } catch {
      // floors optional
    } finally {
      floorsInFlight.current = false;
    }
  }, []);

  const reload = useCallback(
    async (opts?: { silent?: boolean; floors?: boolean }) => {
      await Promise.all([
        reloadListings({ silent: opts?.silent }),
        reloadSold(),
      ]);
      if (opts?.floors !== false) {
        void reloadFloors();
      }
    },
    [reloadListings, reloadSold, reloadFloors],
  );

  useEffect(() => {
    void reload({ floors: true });

    // Pulse loop: every tick = newest listings + sold; every 3rd = full cheap book
    const pulseId = setInterval(() => {
      pulseTick.current += 1;
      const fullBook = pulseTick.current % 3 === 0;
      void reloadListings({
        silent: true,
        pulse: !fullBook,
        deep: false,
      });
      void reloadSold({ pulse: !fullBook });
    }, pollMs);

    // Floors: expensive aggregate — keep ≥45s
    const floorsId = setInterval(
      () => void reloadFloors(),
      Math.max(pollMs * 20, 45_000),
    );
    return () => {
      clearInterval(pulseId);
      clearInterval(floorsId);
    };
  }, [reload, reloadListings, reloadSold, reloadFloors, pollMs]);

  return {
    ...data,
    reload: () => reload({ floors: true, silent: false }),
  };
}
