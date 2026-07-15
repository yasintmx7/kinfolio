"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card, CardTitle, StatValue } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { d } from "@/lib/accounting/decimal";
import { isEarnedType } from "@/lib/accounting/engine";
import { formatKins, formatUsd } from "@/lib/formatting/money";

export default function MiningPage() {
  const { transactions, itemMap, summary, ready } = usePortfolioContext();

  const sessions = useMemo(() => {
    return transactions
      .filter((t) => isEarnedType(t.type))
      .slice()
      .sort(
        (a, b) =>
          new Date(b.transactionAt).getTime() - new Date(a.transactionAt).getTime(),
      );
  }, [transactions]);

  const stats = useMemo(() => {
    let totalQty = d(0);
    let totalMinutes = d(0);
    let expenseUsd = d(0);
    const byItem = new Map<string, ReturnType<typeof d>>();

    for (const s of sessions) {
      totalQty = totalQty.plus(d(s.quantity));
      if (s.durationMinutes) totalMinutes = totalMinutes.plus(d(s.durationMinutes));
      expenseUsd = expenseUsd.plus(d(s.usdAmountAtTransaction || "0"));
      byItem.set(s.itemId, (byItem.get(s.itemId) ?? d(0)).plus(d(s.quantity)));
    }

    const hours = totalMinutes.div(60);
    return {
      totalQty: totalQty.toFixed(),
      hours: hours.toFixed(2),
      qtyPerHour: hours.gt(0) ? totalQty.div(hours).toFixed(2) : "Not available",
      expenseUsd: expenseUsd.toFixed(),
      byItem,
    };
  }, [sessions]);

  // Realized profit attributable to earned inventory is mixed under WAC;
  // show earned inventory remaining + session totals.
  const earnedRemaining = summary.totalEarnedQuantity;

  if (!ready) return <div className="text-muted">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mining & Earned</h1>
          <p className="mt-1 text-sm text-muted">
            Zero purchase cost by default · optional production expenses
          </p>
        </div>
        <Link href="/add">
          <Button>Add session</Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardTitle>Total earned qty</CardTitle>
          <StatValue>{formatKins(stats.totalQty)}</StatValue>
        </Card>
        <Card>
          <CardTitle>Earned still held</CardTitle>
          <StatValue>{formatKins(earnedRemaining)}</StatValue>
        </Card>
        <Card>
          <CardTitle>Session hours</CardTitle>
          <StatValue>{stats.hours}</StatValue>
        </Card>
        <Card>
          <CardTitle>Qty / hour</CardTitle>
          <StatValue className="text-lg">{stats.qtyPerHour}</StatValue>
        </Card>
      </div>

      <Card>
        <CardTitle>By item</CardTitle>
        <div className="mt-3 space-y-2">
          {[...stats.byItem.entries()].map(([id, qty]) => (
            <div
              key={id}
              className="flex justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"
            >
              <span>{itemMap.get(id)?.name ?? id}</span>
              <span className="font-mono tabular-nums">{qty.toFixed()}</span>
            </div>
          ))}
          {!stats.byItem.size && (
            <p className="text-sm text-muted">No mining/earned sessions yet.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>Session history</CardTitle>
        <div className="mt-3 space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">
                  {itemMap.get(s.itemId)?.name ?? s.itemId} · {s.type}
                </span>
                <span className="font-mono tabular-nums">+{s.quantity}</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {new Date(s.transactionAt).toLocaleString()}
                {s.location ? ` · ${s.location}` : ""}
                {s.tool ? ` · ${s.tool}` : ""}
                {s.durationMinutes ? ` · ${s.durationMinutes}m` : ""}
                {d(s.usdAmountAtTransaction || "0").gt(0)
                  ? ` · expense ${formatUsd(s.usdAmountAtTransaction)}`
                  : " · zero purchase cost"}
              </div>
              {s.note && <p className="mt-1 text-xs text-muted">{s.note}</p>}
            </div>
          ))}
        </div>
      </Card>

      <p className="text-xs text-muted">
        Wiki gathering rates are estimates only and never overwrite your actual sessions.
        Unspecified production expense is treated as zero in the ledger — not a claim of
        zero real-world opportunity cost.
      </p>
    </div>
  );
}
