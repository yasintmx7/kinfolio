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
  kinsTotal?: string;
  timestamp: string;
  solscanUrl: string | null;
  portfolioItemId?: string | null;
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
      const [floorsRes, salesRes, goneRes] = await Promise.all([
        fetch("/api/market/items", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/market/recent-sales?limit=80", { cache: "no-store" }).then(
          (r) => r.json(),
        ),
        fetch("/api/market/gone", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ]);

      const floors: MarketFloorItem[] = floorsRes.ok
        ? (floorsRes.data.items ?? [])
        : [];
      const sales: RecentSale[] = salesRes.ok
        ? (salesRes.data.sales ?? []).map(
            (s: RecentSale & { unitUsd?: string | null }) => ({
              ...s,
              unitUsd: s.unitUsd ?? null,
            }),
          )
        : [];
      const byItem = salesRes.ok ? (salesRes.data.byItem ?? []) : [];

      setData({
        floors,
        sales,
        byItem,
        kinsUsd: floorsRes.ok
          ? (floorsRes.data.kinsUsd ?? null)
          : null,
        goldFloorUsd: floorsRes.ok
          ? (floorsRes.data.goldFloorUsd ?? null)
          : null,
        rateSource: floorsRes.ok
          ? (floorsRes.data.rateSource ?? null)
          : null,
        goneCount:
          goneRes?.ok && typeof goneRes.data?.count === "number"
            ? goneRes.data.count
            : null,
        floorsUpdatedAt: floorsRes.updatedAt,
        salesNote: salesRes.ok ? salesRes.data.note : null,
        floorsNote: floorsRes.ok ? floorsRes.data.note : null,
        configured: Boolean(floorsRes.ok && floorsRes.data.configured),
        error:
          !floorsRes.ok && !salesRes.ok
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
