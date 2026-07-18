"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card, CardTitle, StatValue } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalcDrawer } from "@/components/feedback/calc-drawer";
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
  const {
    ready,
    summary,
    settings,
    itemMap,
    priceMap,
    loadDemo,
    transactions,
    patchSettings,
  } = usePortfolioContext();
  const { price, loading: priceLoading, stale, source, error: priceError, reload } =
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

  const nextSteps = useMemo(() => {
    const steps: { text: string; href?: string; action?: string }[] = [];
    if (transactions.length === 0) {
      steps.push({
        text: "Paste marketplace history or a wallet alert",
        href: "/add",
      });
    }
    if (unrealized && unrealized.unpriced > 0) {
      steps.push({
        text: `Set prices for ${unrealized.unpriced} holding(s) for better estimates`,
        href: "/inventory",
      });
    }
    if (stale || priceError) {
      steps.push({ text: "Refresh KINS price", action: "reload-price" });
    }
    if (transactions.length > 0) {
      steps.push({ text: "Export a backup so you don’t lose data", href: "/settings" });
    }
    return steps.slice(0, 3);
  }, [transactions.length, unrealized, stale, priceError]);

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
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-sky">
            Portfolio
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Your holdings
          </h1>
          <p className="mt-1 text-sm text-muted">
            Local profit ledger · market tracker is on{" "}
            <Link href="/market" className="text-sky underline underline-offset-2">
              Market
            </Link>
          </p>
          <div className="mt-1">
            <CalcDrawer />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/calculator">
            <Button variant="secondary">Calculator</Button>
          </Link>
          <Link href="/add">
            <Button>Import trades</Button>
          </Link>
        </div>
      </div>

      {showOnboarding && (
        <Card className="border-sky/25 bg-gradient-to-br from-sky/10 via-surface to-surface">
          <h2 className="text-lg font-semibold text-sky-hi">
            Welcome to Kinfolio
          </h2>
          <p className="mt-1 text-sm text-muted">
            Market tracker first · paste marketplace history to track real P/L
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>Check live floors on Market</li>
            <li>
              Paste “You bought/sold …” marketplace history under Import trades
            </li>
            <li>See paper profit/loss here (optional demo below)</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/add">
              <Button>Import trades</Button>
            </Link>
            <Link href="/market">
              <Button variant="secondary">Open market</Button>
            </Link>
            <Button
              variant="ghost"
              onClick={async () => {
                await loadDemo();
                await patchSettings({ onboardingComplete: true });
              }}
            >
              Load demo portfolio
            </Button>
          </div>
        </Card>
      )}

      {nextSteps.length > 0 && !showOnboarding && (
        <Card className="border-border/80">
          <CardTitle>What to do next</CardTitle>
          <ul className="mt-2 space-y-2">
            {nextSteps.map((s) => (
              <li key={s.text}>
                {s.href ? (
                  <Link href={s.href} className="text-sm text-info underline">
                    {s.text}
                  </Link>
                ) : s.action === "reload-price" ? (
                  <button
                    type="button"
                    className="text-sm text-info underline"
                    onClick={() => reload()}
                  >
                    {s.text}
                  </button>
                ) : (
                  <span className="text-sm text-muted">{s.text}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardTitle>KINS price now</CardTitle>
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
              : `${source ?? "—"}${stale ? " · may be outdated" : ""}${
                  price?.change24h != null
                    ? ` · 24h ${formatPercent(price.change24h)}`
                    : ""
                }`}
          </p>
        </Card>

        <Card>
          <CardTitle>What you spent</CardTitle>
          <StatValue>{formatUsd(summary.totalUsdCostBasis)}</StatValue>
          <p className="mt-1 text-xs text-muted">
            Still invested in inventory · {formatKins(summary.totalKinsCostBasis)} KINS
          </p>
        </Card>

        <Card>
          <CardTitle>Safer break-even target</CardTitle>
          <StatValue>{formatUsd(protectedUsd)}</StatValue>
          <p className="mt-1 text-xs text-muted">
            Includes ~{fee}% fee buffer ({mode.replaceAll("_", " ")})
          </p>
        </Card>

        <Card>
          <CardTitle>What it might be worth now</CardTitle>
          <StatValue>
            {unrealized ? formatUsd(unrealized.netUsd) : "Not available"}
          </StatValue>
          <p className="mt-1 text-xs text-muted">
            After {fee}% fee · estimate only
            {unrealized && unrealized.unpriced > 0
              ? ` · ${unrealized.unpriced} need prices`
              : ""}
          </p>
        </Card>

        <Card>
          <CardTitle>Profit after sales</CardTitle>
          <StatValue className={signedClass(summary.totalRealizedUsdProfit)}>
            {formatUsd(summary.totalRealizedUsdProfit)}
          </StatValue>
          <p className="mt-1 text-xs text-muted">Locked in from completed sells</p>
        </Card>

        <Card>
          <CardTitle>Profit after sales (KINS)</CardTitle>
          <StatValue className={signedClass(summary.totalRealizedKinsProfit)}>
            {formatKins(summary.totalRealizedKinsProfit)} KINS
          </StatValue>
        </Card>

        <Card>
          <CardTitle>Paper profit / loss (USD)</CardTitle>
          <StatValue
            className={
              unrealized ? signedClass(unrealized.unrealizedUsd) : "text-muted"
            }
          >
            {unrealized ? formatUsd(unrealized.unrealizedUsd) : "Not available"}
          </StatValue>
          <p className="mt-1 text-xs text-muted">If you sold inventory at your prices</p>
        </Card>

        <Card>
          <CardTitle>Paper profit / loss (KINS)</CardTitle>
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
          <CardTitle>Mined & earned items</CardTitle>
          <StatValue>{formatKins(summary.totalEarnedQuantity)}</StatValue>
          <p className="mt-1 text-xs text-muted">
            Bought: {formatKins(summary.totalPurchasedQuantity)}
          </p>
        </Card>

        <Card>
          <CardTitle>Cash from sales</CardTitle>
          <StatValue>{formatUsd(summary.totalNetSalesUsd)}</StatValue>
          <p className="mt-1 text-xs text-muted">
            {formatKins(summary.totalNetSalesKins)} KINS received
          </p>
        </Card>

        <Card>
          <CardTitle>Best seller</CardTitle>
          <StatValue className="text-lg">
            {bestItem ? bestItem.name : "—"}
          </StatValue>
          {bestItem && (
            <p className={`mt-1 text-xs ${signedClass(bestItem.profit)}`}>
              {formatUsd(bestItem.profit)} profit
            </p>
          )}
        </Card>

        <Card>
          <CardTitle>Biggest holding</CardTitle>
          <StatValue className="text-lg">
            {largest ? largest.name : "—"}
          </StatValue>
          {largest && (
            <p className="mt-1 text-xs text-muted">
              qty {largest.qty} · spent {formatUsd(largest.cost)}
            </p>
          )}
        </Card>
      </div>

      {unrealized && unrealized.unpriced > 0 && (
        <div className="rounded-lg border border-sky/30 bg-sky/10 px-3 py-2 text-sm text-sky-hi">
          {unrealized.unpriced} item(s) need a price for estimates.{" "}
          <Link href="/inventory" className="underline">
            Set prices in Inventory
          </Link>
        </div>
      )}

      <Card>
        <CardTitle>Recent sales</CardTitle>
        <div className="mt-3 space-y-2">
          {summary.realizedSales
            .slice(-5)
            .reverse()
            .map((s) => (
              <div
                key={s.transactionId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
              >
                <span>{itemMap.get(s.itemId)?.name ?? s.itemId}</span>
                <span
                  className={`font-mono tabular-nums ${signedClass(s.realizedUsdProfit)}`}
                >
                  {formatUsd(s.realizedUsdProfit)} · {formatPercent(s.usdROI)}
                </span>
              </div>
            ))}
          {!summary.realizedSales.length && (
            <p className="text-sm text-muted">
              No sales yet.{" "}
              <Link href="/add" className="text-info underline">
                Add a buy, then a sell
              </Link>
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
