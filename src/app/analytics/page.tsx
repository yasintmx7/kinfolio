"use client";

import { useMemo, useState } from "react";
import { Card, CardTitle, StatValue } from "@/components/ui/card";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { d } from "@/lib/accounting/decimal";
import { protectedCost } from "@/lib/accounting/engine";
import {
  formatKins,
  formatPercent,
  formatUsd,
  signedClass,
} from "@/lib/formatting/money";

export default function AnalyticsPage() {
  const { summary, itemMap, settings, transactions, ready } = usePortfolioContext();
  const [range, setRange] = useState<"all" | "7d" | "30d" | "90d">("all");

  const fee = settings?.defaultSellFeePercent ?? "5";
  const mode = settings?.feeTargetMode ?? "simple_add";

  const filteredSales = useMemo(() => {
    if (range === "all") return summary.realizedSales;
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    // Wall-clock cutoff for range chips (recomputed when range/sales change)
    const cutoff = globalThis.Date.now() - days * 86400000;
    return summary.realizedSales.filter(
      (s) => new Date(s.transactionAt).getTime() >= cutoff,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional live cutoff
  }, [summary.realizedSales, range]);

  const realizedUsd = filteredSales.reduce(
    (a, s) => a.plus(d(s.realizedUsdProfit)),
    d(0),
  );
  const realizedKins = filteredSales.reduce(
    (a, s) => a.plus(d(s.realizedKinsProfit)),
    d(0),
  );
  const costSold = filteredSales.reduce(
    (a, s) => a.plus(d(s.usdCostBasisSold)),
    d(0),
  );
  const actualRoi = costSold.gt(0)
    ? realizedUsd.div(costSold).mul(100).toFixed(2)
    : "0";

  const protectedBasis = protectedCost(costSold, d(fee), mode);
  const protectedProfit = filteredSales
    .reduce((a, s) => a.plus(d(s.netUsdReceived)), d(0))
    .minus(protectedBasis);
  const protectedRoi = protectedBasis.gt(0)
    ? protectedProfit.div(protectedBasis).mul(100).toFixed(2)
    : "0";

  const byItem = useMemo(() => {
    const m = new Map<string, ReturnType<typeof d>>();
    for (const s of filteredSales) {
      m.set(s.itemId, (m.get(s.itemId) ?? d(0)).plus(d(s.realizedUsdProfit)));
    }
    return [...m.entries()].sort((a, b) => b[1].cmp(a[1]));
  }, [filteredSales]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) {
      m.set(t.type, (m.get(t.type) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  if (!ready) return <div className="text-muted">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Profit analytics</h1>
          <p className="mt-1 text-sm text-muted">
            Realized from historical alert USD · protected targets separate
          </p>
        </div>
        <div className="flex gap-2">
          {(["all", "7d", "30d", "90d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`min-h-10 rounded-lg px-3 text-xs ${
                range === r ? "bg-sky text-[#0a121c]" : "bg-raised text-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardTitle>Realized USD P/L</CardTitle>
          <StatValue className={signedClass(realizedUsd)}>
            {formatUsd(realizedUsd.toFixed())}
          </StatValue>
        </Card>
        <Card>
          <CardTitle>Realized KINS P/L</CardTitle>
          <StatValue className={signedClass(realizedKins)}>
            {formatKins(realizedKins.toFixed())}
          </StatValue>
        </Card>
        <Card>
          <CardTitle>Actual ROI</CardTitle>
          <StatValue className={signedClass(actualRoi)}>
            {formatPercent(actualRoi)}
          </StatValue>
        </Card>
        <Card>
          <CardTitle>Protected ROI ({mode})</CardTitle>
          <StatValue className={signedClass(protectedRoi)}>
            {formatPercent(protectedRoi)}
          </StatValue>
          <p className="mt-1 text-xs text-muted">
            Uses {fee}% fee target — not mixed into actual investment
          </p>
        </Card>
        <Card>
          <CardTitle>Open USD cost basis</CardTitle>
          <StatValue>{formatUsd(summary.totalUsdCostBasis)}</StatValue>
        </Card>
        <Card>
          <CardTitle>Net sales received</CardTitle>
          <StatValue>
            {formatUsd(
              filteredSales
                .reduce((a, s) => a.plus(d(s.netUsdReceived)), d(0))
                .toFixed(),
            )}
          </StatValue>
        </Card>
      </div>

      <Card>
        <CardTitle>Profit by item</CardTitle>
        <div className="mt-3 space-y-2">
          {byItem.map(([id, profit]) => (
            <div
              key={id}
              className="flex justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"
            >
              <span>{itemMap.get(id)?.name ?? id}</span>
              <span className={`font-mono tabular-nums ${signedClass(profit)}`}>
                {formatUsd(profit.toFixed())}
              </span>
            </div>
          ))}
          {!byItem.length && (
            <p className="text-sm text-muted">No realized sales in range.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>Activity by source type</CardTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {byType.map(([type, count]) => (
            <span
              key={type}
              className="rounded-full bg-raised px-3 py-1 text-xs text-muted"
            >
              {type}: {count}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
