"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

/** ~500 live listings → 6×100 is enough; fewer pages = snappier polls */
const LISTINGS_URL = "/api/market/activity?limit=700&pages=7&gold=1";
const SOLD_URL = "/api/market/sold?limit=30";

function listFingerprint(rows: { id: string; timestamp?: string }[]): string {
  if (!rows.length) return "0";
  const a = rows[0];
  const b = rows[rows.length - 1];
  const m = rows[Math.floor(rows.length / 2)];
  return `${rows.length}:${a?.id}:${m?.id}:${b?.id}:${a?.timestamp ?? ""}:${b?.timestamp ?? ""}`;
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

/**
 * Official API only gives reservedBy as a numeric user id (no username).
 * If that user also has open listings as a seller, we can reverse-map id → name.
 */
function resolveLockerNames(rows: RecentSale[]): RecentSale[] {
  const idToName = new Map<string, string>();
  for (const r of rows) {
    if (r.sellerId != null && r.sellerName?.trim()) {
      idToName.set(String(r.sellerId), r.sellerName.trim());
    }
  }
  if (idToName.size === 0) return rows;

  let changed = false;
  const out = rows.map((r) => {
    if (!r.buyerId) return r;
    // already have a real name (not just #id style)
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
    const lid = row.listingId != null ? String(row.listingId) : "";
    const hit = lid ? known.get(lid) : undefined;
    if (!hit) {
      return {
        ...row,
        isSold: true,
        // Keep wallet on seller field for matching
        seller: row.sellerName ?? row.seller ?? row.sellerWallet ?? null,
      };
    }
    return {
      ...row,
      isSold: true,
      // Prefer display name from live book; keep wallets
      sellerName: hit.sellerName ?? row.sellerName,
      sellerId: hit.sellerId ?? row.sellerId,
      seller: hit.sellerName ?? hit.seller ?? row.seller ?? row.sellerWallet,
      sellerWallet: row.sellerWallet,
      buyerId: hit.buyerId ?? row.buyerId,
      // Fill missing item label only — never invent qty/price
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

/** Default poll: 18s — less UI thrash while still live-feeling */
export function useMarketHub(pollMs = 18_000) {
  const [data, setData] = useState<MarketHubData>(empty);
  const listingsInFlight = useRef(false);
  const soldInFlight = useRef(false);
  const floorsInFlight = useRef(false);
  /** listingId → listing for seller name enrichment on sold */
  const knownListingsRef = useRef<Map<string, RecentSale>>(new Map());
  const lastListingsFp = useRef("");
  const lastSoldFp = useRef("");

  const reloadListings = useCallback(async (opts?: { silent?: boolean }) => {
    if (listingsInFlight.current) return;
    listingsInFlight.current = true;
    if (!opts?.silent) {
      setData((s) => ({ ...s, refreshing: true }));
    }
    try {
      const activityRes = (await fetchJson(LISTINGS_URL, 18000)) as {
        ok?: boolean;
        data?: {
          activity?: RecentSale[];
          kinsUsd?: string | null;
          rateSource?: string | null;
          note?: string;
        };
      };

      setData((prev) => {
        const nextSalesRaw =
          activityRes?.ok && Array.isArray(activityRes.data?.activity)
            ? activityRes.data!.activity!
            : prev.sales;
        // Fill locker username when reservedBy id matches a known seller
        const nextSales = resolveLockerNames(nextSalesRaw);

        const fp = listFingerprint(nextSales);
        const sameList =
          activityRes?.ok &&
          fp === lastListingsFp.current &&
          prev.sales.length > 0;

        if (activityRes?.ok && Array.isArray(activityRes.data?.activity)) {
          lastListingsFp.current = fp;
          // Only rebuild known map when book changed
          if (!sameList) {
            const map = new Map(knownListingsRef.current);
            for (const row of nextSales) {
              map.set(String(row.id), row);
              if (row.listingId) map.set(String(row.listingId), row);
            }
            if (map.size > 3000) {
              const entries = [...map.entries()].slice(-2000);
              knownListingsRef.current = new Map(entries);
            } else {
              knownListingsRef.current = map;
            }
          }
        }

        // Skip heavy re-render when poll returned same open book
        if (sameList && opts?.silent) {
          return {
            ...prev,
            kinsUsd: activityRes.data?.kinsUsd ?? prev.kinsUsd,
            rateSource: activityRes.data?.rateSource ?? prev.rateSource,
            loading: false,
            refreshing: false,
            error: null,
          };
        }

        const sold = sameList
          ? prev.sold
          : enrichSold(prev.sold, knownListingsRef.current);

        return {
          ...prev,
          sales: nextSales,
          sold,
          byItem: sameList
            ? prev.byItem
            : buildByItem(nextSales, prev.floors),
          kinsUsd: activityRes?.ok
            ? (activityRes.data?.kinsUsd ?? prev.kinsUsd)
            : prev.kinsUsd,
          rateSource: activityRes?.ok
            ? (activityRes.data?.rateSource ?? prev.rateSource)
            : prev.rateSource,
          salesNote: activityRes?.ok
            ? (activityRes.data?.note ?? prev.salesNote)
            : prev.salesNote,
          activityCount: nextSales.length,
          lastActivityAt: nextSales[0]?.timestamp ?? prev.lastActivityAt,
          configured: Boolean(activityRes?.ok || prev.configured),
          error:
            !activityRes?.ok && prev.sales.length === 0
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
      if (fp === lastSoldFp.current) return;
      lastSoldFp.current = fp;

      setData((prev) => {
        const sold = enrichSold(raw, knownListingsRef.current);
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
    // Sold changes slower — half the poll rate
    const soldId = setInterval(() => void reloadSold(), pollMs * 1.5);
    const floorsId = setInterval(
      () => void reloadFloors(),
      Math.max(pollMs * 4, 60_000),
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
