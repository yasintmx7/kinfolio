"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSolanaAddress,
  officialListingId,
  sanitizePersonName,
} from "@/lib/market/seller-label";

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
};

export type MarketHubData = {
  floors: MarketFloorItem[];
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
 * Live book is ~500 token + ~500 gold. Must not slice under ~1000 or we drop
 * listings and miss locker-name reverse-map (seller ids never seen).
 */
/**
 * Dual feed:
 *  - cheap book = full price ladder + locks on older lots
 *  - new pages = brand-new listings that may sit above cheap scan
 * Client merges by listing id so "New" sort and search always see latest.
 */
const CHEAP_URL =
  "/api/market/activity?limit=1200&pages=10&gold=1&sort=cheap";
const NEW_URL = "/api/market/activity?limit=400&pages=4&gold=1&sort=new";
const SOLD_URL = "/api/market/sold?limit=40";

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
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
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
 * Attach seller username / item meta from known open-book listings.
 * Never overwrite sale qty/price with live listing (partial fills stay accurate).
 */
function enrichSold(
  sold: RecentSale[],
  known: Map<string, RecentSale>,
): RecentSale[] {
  return sold.map((row) => {
    const lid = officialListingId(row.listingId);
    const hit = lid ? known.get(lid) : undefined;
    const wallet =
      (row.sellerWallet && isSolanaAddress(row.sellerWallet)
        ? row.sellerWallet
        : null) ??
      (isSolanaAddress(row.seller) ? String(row.seller) : null) ??
      null;

    if (!hit) {
      return {
        ...row,
        isSold: true,
        listingId: lid ?? undefined,
        sellerName: sanitizePersonName(row.sellerName),
        seller: null,
        sellerWallet: wallet,
      };
    }
    const bookName = sanitizePersonName(hit.sellerName ?? hit.seller);
    return {
      ...row,
      isSold: true,
      listingId: lid ?? undefined,
      sellerName: bookName ?? sanitizePersonName(row.sellerName),
      sellerId: hit.sellerId ?? row.sellerId,
      seller: bookName,
      sellerWallet: wallet ?? hit.sellerWallet ?? null,
      buyerId: hit.buyerId ?? row.buyerId,
      name:
        row.name && row.name !== "Sale"
          ? row.name
          : hit.name || row.name,
      itemType:
        row.itemType && row.itemType !== "unknown"
          ? row.itemType
          : hit.itemType || row.itemType,
    };
  });
}

/**
 * Default poll: 5s for listings (locks / prices).
 * Overlapping fetches are skipped via listingsInFlight.
 * Floors stay slower (≥45s). Sold polls with listings (5s).
 */
export function useMarketHub(pollMs = 5_000) {
  const [data, setData] = useState<MarketHubData>(empty);
  const listingsInFlight = useRef(false);
  const soldInFlight = useRef(false);
  const floorsInFlight = useRef(false);
  /** listingId → listing for seller name enrichment on sold */
  const knownListingsRef = useRef<Map<string, RecentSale>>(new Map());
  /** sellerId → sellerName for locker reverse-lookup */
  const sellerIdNameRef = useRef<Map<string, string>>(new Map());
  const lastListingsFp = useRef("");
  const lastSoldFp = useRef("");

  const reloadListings = useCallback(async (opts?: { silent?: boolean }) => {
    if (listingsInFlight.current) return;
    listingsInFlight.current = true;
    if (!opts?.silent) {
      setData((s) => ({ ...s, refreshing: true }));
    }
    try {
      // Promise.allSettled: one feed failing must not drop the other
      const [cheapSettled, newSettled] = await Promise.allSettled([
        fetchJson(CHEAP_URL, 18000),
        fetchJson(NEW_URL, 12000),
      ]);
      const cheap = actFromSettled(cheapSettled);
      const newest = actFromSettled(newSettled);
      const feedOk = cheap.ok || newest.ok;

      setData((prev) => {
        const cheapRows = cheap.ok
          ? cheap.activity
          : newest.ok
            ? prev.sales
            : [];
        const newRows = newest.ok ? newest.activity : [];
        const nextSalesRaw = feedOk
          ? mergeListingFeeds(
              cheapRows.length ? cheapRows : prev.sales,
              newRows,
            )
          : prev.sales;

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
        }

        const kinsUsd = cheap.kinsUsd ?? newest.kinsUsd ?? prev.kinsUsd;
        const rateSource =
          cheap.rateSource ?? newest.rateSource ?? prev.rateSource;

        if (sameList && opts?.silent) {
          return {
            ...prev,
            sales: nextSales,
            kinsUsd,
            rateSource,
            loading: false,
            refreshing: false,
            error: null,
          };
        }

        const sold = resolveLockerNames(
          enrichSold(prev.sold, knownListingsRef.current),
          sellerIdNameRef.current,
        );

        let lastAt = prev.lastActivityAt;
        for (const r of nextSales) {
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
            ? "Live book = cheap ladder + newest listings (merged)."
            : prev.salesNote,
          activityCount: nextSales.length,
          lastActivityAt: lastAt,
          configured: Boolean(feedOk || prev.configured),
          error:
            !feedOk && prev.sales.length === 0
              ? "Market data unavailable"
              : null,
          loading: false,
          refreshing: false,
        };
      });
    } catch {
      setData((s) => ({
        ...s,
        loading: false,
        refreshing: false,
        error:
          s.sales.length === 0 ? "Network error loading market" : s.error,
      }));
    } finally {
      listingsInFlight.current = false;
    }
  }, []);

  const reloadSold = useCallback(async () => {
    if (soldInFlight.current) return;
    soldInFlight.current = true;
    try {
      const soldRes = (await fetchJson(SOLD_URL, 12000)) as {
        ok?: boolean;
        data?: { sold?: RecentSale[]; note?: string };
      };
      if (!soldRes?.ok || !Array.isArray(soldRes.data?.sold)) return;

      const raw = soldRes.data!.sold!;
      const fp = listFingerprint(raw);
      const sameSales = fp === lastSoldFp.current;
      lastSoldFp.current = fp;

      setData((prev) => {
        // Always re-enrich: open-book may have gained seller usernames
        const sold = resolveLockerNames(
          enrichSold(raw, knownListingsRef.current),
          sellerIdNameRef.current,
        );
        if (sameSales && prev.sold.length === sold.length) {
          let improved = false;
          for (let i = 0; i < sold.length; i++) {
            const a = sold[i];
            const b = prev.sold[i];
            if (
              (a?.sellerName && a.sellerName !== b?.sellerName) ||
              (a?.sellerId && a.sellerId !== b?.sellerId)
            ) {
              improved = true;
              break;
            }
          }
          if (!improved) return prev;
        }
        return {
          ...prev,
          sold,
          lastActivityAt: sold[0]?.timestamp ?? prev.lastActivityAt,
          salesNote: soldRes.data?.note ?? prev.salesNote,
        };
      });
    } catch {
      // keep previous sold
    } finally {
      soldInFlight.current = false;
    }
  }, []);

  const reloadFloors = useCallback(async () => {
    if (floorsInFlight.current) return;
    floorsInFlight.current = true;
    try {
      const floorsRes = (await fetchJson("/api/market/items", 25000)) as {
        ok?: boolean;
        data?: {
          items?: MarketFloorItem[];
          kinsUsd?: string | null;
          rateSource?: string | null;
          note?: string;
        };
        updatedAt?: string;
      };

      setData((prev) => {
        if (!floorsRes?.ok) return prev;
        const floors = floorsRes.data?.items ?? prev.floors;
        return {
          ...prev,
          floors,
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
    const listingsId = setInterval(
      () => void reloadListings({ silent: true }),
      pollMs,
    );
    // Sold: same cadence as listings so Activity stays live
    const soldId = setInterval(() => void reloadSold(), pollMs);
    // Floors: expensive aggregate — keep ≥45s even if listings are 5s
    const floorsId = setInterval(
      () => void reloadFloors(),
      Math.max(pollMs * 9, 45_000),
    );
    return () => {
      clearInterval(listingsId);
      clearInterval(soldId);
      clearInterval(floorsId);
    };
  }, [reload, reloadListings, reloadSold, reloadFloors, pollMs]);

  return {
    ...data,
    reload: () => reload({ floors: true, silent: false }),
  };
}
