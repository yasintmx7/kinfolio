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
};

export type MarketHubData = {
  floors: MarketFloorItem[];
  sales: RecentSale[];
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

/** Default poll: 10 seconds for live feed */
export function useMarketHub(pollMs = 10_000) {
  const [data, setData] = useState<MarketHubData>(empty);
  const inFlight = useRef(false);

  const reload = useCallback(async (opts?: { silent?: boolean; floors?: boolean }) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!opts?.silent) {
      setData((s) => ({ ...s, refreshing: true }));
    }
    try {
      const loadFloors = opts?.floors !== false;
      const [floorsRes, activityRes] = await Promise.all([
        loadFloors
          ? fetch("/api/market/items", { cache: "no-store" }).then((r) =>
              r.json(),
            )
          : Promise.resolve(null),
        fetch("/api/market/activity?limit=600&pages=10&gold=1", {
          cache: "no-store",
        }).then((r) => r.json()),
      ]);

      const sales: RecentSale[] = activityRes.ok
        ? (activityRes.data.activity ?? [])
        : [];

      setData((prev) => {
      const floors: MarketFloorItem[] =
        floorsRes?.ok
          ? (floorsRes.data.items ?? [])
          : prev.floors;

      const byType = new Map<string, { vals: number[]; lastAt: string | null }>();
      for (const s of sales) {
        const n = Number(s.unitKins);
        if (!Number.isFinite(n) || n <= 0) continue;
        const cur = byType.get(s.itemType) ?? { vals: [], lastAt: null };
        cur.vals.push(n);
        if (
          !cur.lastAt ||
          Date.parse(s.timestamp) > Date.parse(cur.lastAt)
        ) {
          cur.lastAt = s.timestamp;
        }
        byType.set(s.itemType, cur);
      }
      const byItem = [...byType.entries()].map(([itemType, { vals, lastAt }]) => {
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

      return {
        floors,
        sales,
        byItem,
        kinsUsd: floorsRes?.ok
          ? (floorsRes.data.kinsUsd ?? activityRes.data?.kinsUsd ?? prev.kinsUsd)
          : (activityRes.data?.kinsUsd ?? prev.kinsUsd),
        goldFloorUsd: null,
        rateSource: floorsRes?.ok
          ? (floorsRes.data.rateSource ??
            activityRes.data?.rateSource ??
            prev.rateSource)
          : (activityRes.data?.rateSource ?? prev.rateSource),
        goneCount: null,
        floorsUpdatedAt: floorsRes?.updatedAt ?? prev.floorsUpdatedAt,
        salesNote: activityRes.ok ? activityRes.data.note : prev.salesNote,
        floorsNote: floorsRes?.ok ? floorsRes.data.note : prev.floorsNote,
        activityCount: activityRes.ok
          ? (activityRes.data.count ?? sales.length)
          : sales.length,
        lastActivityAt: sales[0]?.timestamp ?? prev.lastActivityAt,
        configured: Boolean(
          (floorsRes?.ok && floorsRes.data.configured !== false) ||
            activityRes.ok ||
            prev.configured,
        ),
        error:
          !activityRes.ok && !floorsRes?.ok && prev.floors.length === 0
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
        error: "Network error loading market",
      }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    // Full load once (floors + activity)
    reload({ floors: true });
    // Live feed every pollMs (activity); floors less often
    const activityId = setInterval(
      () => reload({ silent: true, floors: false }),
      pollMs,
    );
    const floorsId = setInterval(
      () => reload({ silent: true, floors: true }),
      Math.max(pollMs * 3, 30_000),
    );
    return () => {
      clearInterval(activityId);
      clearInterval(floorsId);
    };
  }, [reload, pollMs]);

  return { ...data, reload: () => reload({ floors: true }) };
}
