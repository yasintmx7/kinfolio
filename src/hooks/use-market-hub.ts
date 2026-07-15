"use client";

import { useCallback, useEffect, useState } from "react";

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
  name: string;
  itemType: string;
  quantity: string;
  unitKins: string;
  unitUsd?: string | null;
  usdTotal: string | null;
  timestamp: string;
  solscanUrl: string | null;
  portfolioItemId?: string | null;
  seller?: string;
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
  configured: boolean;
  error: string | null;
  loading: boolean;
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
};

export function useMarketHub(pollMs = 45000) {
  const [data, setData] = useState<MarketHubData>(empty);

  const reload = useCallback(async () => {
    try {
      const [floorsRes, activityRes] = await Promise.all([
        fetch("/api/market/items", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/market/activity?limit=60", { cache: "no-store" }).then((r) =>
          r.json(),
        ),
      ]);

      const floors: MarketFloorItem[] = floorsRes.ok
        ? (floorsRes.data.items ?? [])
        : [];
      const sales: RecentSale[] = activityRes.ok
        ? (activityRes.data.activity ?? [])
        : [];

      // Derive simple per-item medians from activity tape (unit prices)
      const byType = new Map<string, number[]>();
      for (const s of sales) {
        const n = Number(s.unitKins);
        if (!Number.isFinite(n) || n <= 0) continue;
        const list = byType.get(s.itemType) ?? [];
        list.push(n);
        byType.set(s.itemType, list);
      }
      const byItem = [...byType.entries()].map(([itemType, vals]) => {
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
          lastSaleAt: null as string | null,
          lastUnitKins: String(sorted[sorted.length - 1] ?? median),
        };
      });

      setData({
        floors,
        sales,
        byItem,
        kinsUsd: floorsRes.ok ? (floorsRes.data.kinsUsd ?? null) : null,
        goldFloorUsd: null,
        rateSource: floorsRes.ok ? (floorsRes.data.rateSource ?? null) : null,
        goneCount: null,
        floorsUpdatedAt: floorsRes.updatedAt,
        salesNote: activityRes.ok ? activityRes.data.note : null,
        floorsNote: floorsRes.ok ? floorsRes.data.note : null,
        configured: Boolean(floorsRes.ok && floorsRes.data.configured !== false),
        error:
          !floorsRes.ok && !activityRes.ok
            ? "Market data unavailable"
            : null,
        loading: false,
      });
    } catch {
      setData((s) => ({
        ...s,
        loading: false,
        error: "Network error loading market",
      }));
    }
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, pollMs);
    return () => clearInterval(id);
  }, [reload, pollMs]);

  return { ...data, reload };
}
