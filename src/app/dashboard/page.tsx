"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card, CardTitle, StatValue } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { useKinsPrice } from "@/hooks/use-kins-price";
import { d } from "@/lib/accounting/decimal";
import { estimateUnrealized, protectedCost } from "@/lib/accounting/engine";
import {
  formatKins,
  formatPercent,
  formatUsd,
  signedClass,
} from "@/lib/formatting/money";

export default function DashboardPage() {
  const { ready, summary, settings, itemMap, priceMap, loadDemo, transactions } =
    usePortfolioContext();
  const { price, loading: priceLoading, stale, source, error: priceError } =
    useKinsPrice();

  const fee = settings?.defaultSellFeePercent ?? "5";
  const mode = settings?.feeTargetMode ?? "simple_add";
  const kinsUsd = price?.priceUsd ?? settings?.manualKinsUsd ?? "";

  const protectedUsd = useMemo(() => {
    return protectedCost(d(summary.totalUsdCostBasis), d(fee), mode).toFixed();
  }, [summary.totalUsdCostBasis, fee, mode]);

  const unrealized = useMemo(() => {
    if (!kinsUsd) return null;
    let netUsd = d(0);
    let netKins = d(0);
    let costUsd = d(0);
    let costKins = d(0);
    let unpriced = 0;

    for (const pos of summary.positions) {
      const ref = priceMap.get(pos.itemId);
      costUsd = costUsd.plus(d(pos.usdCostBasis));
      costKins = costKins.plus(d(pos.kinsCostBasis));
      if (!ref) {
        unpriced++;
        continue;
      }
      const est = estimateUnrealized({
        quantity: pos.quantity,
        remainingUsdCostBasis: pos.usdCostBasis,
        remainingKinsCostBasis: pos.kinsCostBasis,
        itemReferencePriceKins: ref,
        currentKinsUsd: kinsUsd,
        sellingFeePercent: fee,
      });
      netUsd = netUsd.plus(d(est.netCurrentUsd));
      netKins = netKins.plus(d(est.netCurrentKins));
    }

    return {
      netUsd: netUsd.toFixed(),
      netKins: netKins.toFixed(),
      unrealizedUsd: netUsd.minus(costUsd).toFixed(),
      unrealizedKins: netKins.minus(costKins).toFixed(),
      unpriced,
    };
  }, [summary.positions, priceMap, kinsUsd, fee]);

  const bestItem = useMemo(() => {
    if (!summary.realizedSales.length) return null;
    const byItem = new Map<string, ReturnType<typeof d>>();
    for (const s of summary.realizedSales) {
      byItem.set(
        s.itemId,
        (byItem.get(s.itemId) ?? d(0)).plus(d(s.realizedUsdProfit)),
      );
    }
    let bestId = "";
    let best = d(0);
    for (const [id, v] of byItem) {
      if (!bestId || v.gt(best)) {
        bestId = id;
        best = v;
      }
    }
    return bestId
      ? { id: bestId, name: itemMap.get(bestId)?.name ?? bestId, profit: best.toFixed() }
      : null;
  }, [summary.realizedSales, itemMap]);

  const largest = useMemo(() => {
    if (!summary.positions.length) return null;
    const sorted = [...summary.positions].sort((a, b) =>
      d(b.usdCostBasis).cmp(d(a.usdCostBasis)),
    );
    const p = sorted[0];
    return {
      name: itemMap.get(p.itemId)?.name ?? p.itemId,
      qty: p.quantity,
      cost: p.usdCostBasis,
    };
  }, [summary.positions, itemMap]);

  if (!ready) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    );
  }

  const showOnboarding =
    transactions.length === 0 && !settings?.onboardingComplete;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            Local portfolio · weighted-average cost · KINS + USD
          </p>
        </div>
        <Link href="/add">
          <Button>Add entry</Button>
        </Link>
      </div>

      {showOnboarding && (
        <Card className="border-gold/30 bg-gradient-to-br from-raised to-surface">
          <h2 className="text-lg font-semibold text-gold">Welcome to Kintara Portfolio</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Paste buy/sell alerts, pick the item and quantity, and get correct KINS and
            USD accounting even when the KINS price changes. All data stays in your
            browser.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/add">
              <Button>Paste first alert</Button>
            </Link>
            <Button variant="secondary" onClick={() => loadDemo()}>
              Load demo portfolio
            </Button>
            <Link href="/settings">
              <Button variant="ghost">Import JSON backup</Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardTitle>Current KINS price</CardTitle>
          <StatValue>
            {priceLoading && !price
              ? "…"
              : price
                ? formatUsd(price.priceUsd, { maxDecimals: 8 })
                : formatUsd(null)}
          </StatValue>
          <p className="mt-1 text-xs text-muted">
            {priceError
              ? priceError
              : `${source ?? "—"}${stale ? " · stale" : ""}${
                  price?.change24h != null
                    ? ` · 24h ${formatPercent(price.change24h)}`
                    : ""
                }`}
          </p>
        </Card>

        <Card>
          <CardTitle>Actual inventory cost (USD)</CardTitle>
          <StatValue>{formatUsd(summary.totalUsdCostBasis)}</StatValue>
          <p className="mt-1 text-xs text-muted">
            {formatKins(summary.totalKinsCostBasis)} KINS cost basis
          </p>
        </Card>

        <Card>
          <CardTitle>Protected cost target</CardTitle>
          <StatValue>{formatUsd(protectedUsd)}</StatValue>
          <p className="mt-1 text-xs text-muted">
            Fee mode: {mode.replaceAll("_", " ")} ({fee}%)
          </p>
        </Card>

        <Card>
          <CardTitle>Est. net current value</CardTitle>
          <StatValue>
            {unrealized ? formatUsd(unrealized.netUsd) : "Not available"}
          </StatValue>
          <p className="mt-1 text-xs text-muted">
            After {fee}% fee · manual ref prices
            {unrealized && unrealized.unpriced > 0
              ? ` · ${unrealized.unpriced} unpriced`
              : ""}
          </p>
        </Card>

        <Card>
          <CardTitle>Realized USD profit</CardTitle>
          <StatValue className={signedClass(summary.totalRealizedUsdProfit)}>
            {formatUsd(summary.totalRealizedUsdProfit)}
          </StatValue>
          <p className="mt-1 text-xs text-muted">
            From historical alert USD values
          </p>
        </Card>

        <Card>
          <CardTitle>Realized KINS profit</CardTitle>
          <StatValue className={signedClass(summary.totalRealizedKinsProfit)}>
            {formatKins(summary.totalRealizedKinsProfit)} KINS
          </StatValue>
        </Card>

        <Card>
          <CardTitle>Unrealized USD (est.)</CardTitle>
          <StatValue
            className={
              unrealized ? signedClass(unrealized.unrealizedUsd) : "text-muted"
            }
          >
            {unrealized ? formatUsd(unrealized.unrealizedUsd) : "Not available"}
          </StatValue>
        </Card>

        <Card>
          <CardTitle>Unrealized KINS (est.)</CardTitle>
          <StatValue
            className={
              unrealized ? signedClass(unrealized.unrealizedKins) : "text-muted"
            }
          >
            {unrealized
              ? `${formatKins(unrealized.unrealizedKins)} KINS`
              : "Not available"}
          </StatValue>
        </Card>

        <Card>
          <CardTitle>Earned / mined qty</CardTitle>
          <StatValue>{formatKins(summary.totalEarnedQuantity)}</StatValue>
          <p className="mt-1 text-xs text-muted">
            Purchased qty: {formatKins(summary.totalPurchasedQuantity)}
          </p>
        </Card>

        <Card>
          <CardTitle>Net sales received</CardTitle>
          <StatValue>{formatUsd(summary.totalNetSalesUsd)}</StatValue>
          <p className="mt-1 text-xs text-muted">
            {formatKins(summary.totalNetSalesKins)} KINS
          </p>
        </Card>

        <Card>
          <CardTitle>Best-performing item</CardTitle>
          <StatValue className="text-lg">
            {bestItem ? bestItem.name : "—"}
          </StatValue>
          {bestItem && (
            <p className={`mt-1 text-xs ${signedClass(bestItem.profit)}`}>
              {formatUsd(bestItem.profit)} realized
            </p>
          )}
        </Card>

        <Card>
          <CardTitle>Largest holding</CardTitle>
          <StatValue className="text-lg">
            {largest ? largest.name : "—"}
          </StatValue>
          {largest && (
            <p className="mt-1 text-xs text-muted">
              qty {largest.qty} · cost {formatUsd(largest.cost)}
            </p>
          )}
        </Card>
      </div>

      {unrealized && unrealized.unpriced > 0 && (
        <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold-hi">
          {unrealized.unpriced} holding(s) lack a manual reference price. Set prices
          in Inventory for estimated net liquidation value.
        </div>
      )}

      <Card>
        <CardTitle>Recent realized sales</CardTitle>
        <div className="mt-3 space-y-2">
          {summary.realizedSales.slice(-5).reverse().map((s) => (
            <div
              key={s.transactionId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
            >
              <span>{itemMap.get(s.itemId)?.name ?? s.itemId}</span>
              <span className={`font-mono tabular-nums ${signedClass(s.realizedUsdProfit)}`}>
                {formatUsd(s.realizedUsdProfit)} · {formatPercent(s.usdROI)}
              </span>
            </div>
          ))}
          {!summary.realizedSales.length && (
            <p className="text-sm text-muted">No sales yet. Add a buy, then a sell.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
