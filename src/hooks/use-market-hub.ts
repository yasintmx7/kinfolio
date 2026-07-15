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
  reserved?: boolean;
  reservedUntilMs?: number | null;
  itemDurability?: string | null;
  /** true when row is a detected sale (listing left the live book) */
  isSold?: boolean;
};

export type MarketHubData = {
  floors: MarketFloorItem[];
  /** Live open listings (big list) */
  sales: RecentSale[];
  /** Detected sold / gone listings (activity card) */
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

/** Full-ish open book (token+gold), pages until empty up to 12×100 */
const ACTIVITY_URL = "/api/market/activity?limit=1200&pages=12&gold=1";
const MAX_SOLD = 40;

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
 * Detect sold items: listing IDs that were in the previous poll but are
 * gone now (official API has no sold-history feed).
 *
 * Guards against false positives from partial/failed refreshes — those used
 * to wipe half the book and flood Activity with fake "sold" rows.
 */
function detectSold(
  prev: Map<string, RecentSale>,
  next: RecentSale[],
  prevSold: RecentSale[],
): RecentSale[] {
  if (prev.size === 0) return prevSold;
  // Thin / failed snapshot — do not treat missing IDs as sold
  if (next.length === 0) return prevSold;
  if (next.length < Math.max(40, Math.floor(prev.size * 0.7))) {
    return prevSold;
  }
  const nextIds = new Set(next.map((r) => String(r.id)));
  const disappeared = prev.size - [...nextIds].filter((id) => prev.has(id)).length;
  // Mass vanish (API glitch / pagination hole) — ignore
  if (disappeared > Math.max(25, Math.floor(prev.size * 0.25))) {
    return prevSold;
  }
  const now = new Date().toISOString();
  const newlySold: RecentSale[] = [];
  for (const [id, row] of prev) {
    if (nextIds.has(id)) continue;
    newlySold.push({
      ...row,
      isSold: true,
      timestamp: now,
    });
  }
  if (!newlySold.length) return prevSold;
  const seen = new Set<string>();
  const merged: RecentSale[] = [];
  for (const row of [...newlySold, ...prevSold]) {
    const key = String(row.listingId ?? row.id);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
    if (merged.length >= MAX_SOLD) break;
  }
  return merged;
}

/** Default poll: 12s */
export function useMarketHub(pollMs = 12_000) {
  const [data, setData] = useState<MarketHubData>(empty);
  const activityInFlight = useRef(false);
  const floorsInFlight = useRef(false);
  /** Previous open-book snapshot for sold detection */
  const prevListingsRef = useRef<Map<string, RecentSale>>(new Map());

  const reloadActivity = useCallback(async (opts?: { silent?: boolean }) => {
    if (activityInFlight.current) return;
    activityInFlight.current = true;
    if (!opts?.silent) {
      setData((s) => ({ ...s, refreshing: true }));
    }
    try {
      const activityRes = (await fetchJson(ACTIVITY_URL, 22000)) as {
        ok?: boolean;
        data?: {
          activity?: RecentSale[];
          count?: number;
          kinsUsd?: string | null;
          rateSource?: string | null;
          note?: string;
        };
      };

      setData((prev) => {
        const nextSales =
          activityRes?.ok && Array.isArray(activityRes.data?.activity)
            ? activityRes.data!.activity!
            : prev.sales;

        const sold =
          activityRes?.ok && Array.isArray(activityRes.data?.activity)
            ? detectSold(prevListingsRef.current, nextSales, prev.sold)
            : prev.sold;

        // Update snapshot only on successful fetch
        if (activityRes?.ok && Array.isArray(activityRes.data?.activity)) {
          const map = new Map<string, RecentSale>();
          for (const row of nextSales) {
            map.set(String(row.id), row);
          }
          prevListingsRef.current = map;
        }

        return {
          ...prev,
          sales: nextSales,
          sold,
          byItem: buildByItem(nextSales, prev.floors),
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
          lastActivityAt:
            sold[0]?.timestamp ??
            nextSales[0]?.timestamp ??
            prev.lastActivityAt,
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
      activityInFlight.current = false;
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
      await reloadActivity({ silent: opts?.silent });
      if (opts?.floors !== false) {
        void reloadFloors();
      }
    },
    [reloadActivity, reloadFloors],
  );

  useEffect(() => {
    void reload({ floors: true });
    const activityId = setInterval(
      () => void reloadActivity({ silent: true }),
      pollMs,
    );
    const floorsId = setInterval(
      () => void reloadFloors(),
      Math.max(pollMs * 4, 45_000),
    );
    return () => {
      clearInterval(activityId);
      clearInterval(floorsId);
    };
  }, [reload, reloadActivity, reloadFloors, pollMs]);

  return {
    ...data,
    reload: () => reload({ floors: true, silent: false }),
  };
}
