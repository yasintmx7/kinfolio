"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { useToast } from "@/components/feedback/toast";
import { formatKins, formatUsd } from "@/lib/formatting/money";
import { isValidTxHash } from "@/lib/solana/validation";

export default function HistoryPage() {
  const { transactions, itemMap, removeTransaction, ready } = usePortfolioContext();
  const { push } = useToast();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    return transactions
      .slice()
      .sort(
        (a, b) =>
          new Date(b.transactionAt).getTime() - new Date(a.transactionAt).getTime(),
      )
      .filter((t) => {
        if (type !== "all" && t.type !== type) return false;
        if (!q.trim()) return true;
        const name = itemMap.get(t.itemId)?.name ?? t.itemId;
        const hay = `${name} ${t.type} ${t.note ?? ""} ${t.txHash ?? ""} ${t.rawAlert ?? ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      });
  }, [transactions, type, q, itemMap]);

  function exportCsv() {
    const header = [
      "id",
      "type",
      "item",
      "quantity",
      "kins",
      "usd",
      "transactionAt",
      "txHash",
      "note",
    ];
    const lines = [header.join(",")];
    for (const t of rows) {
      const item = itemMap.get(t.itemId)?.name ?? t.itemId;
      lines.push(
        [
          t.id,
          t.type,
          JSON.stringify(item),
          t.quantity,
          t.kinsAmount,
          t.usdAmountAtTransaction,
          t.transactionAt,
          t.txHash ?? "",
          JSON.stringify(t.note ?? ""),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kintara-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    push("CSV exported", "ok");
  }

  if (!ready) return <div className="text-muted">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">History</h1>
          <p className="mt-1 text-sm text-muted">
            Edit/delete recalculates the full ledger
          </p>
        </div>
        <Button variant="secondary" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {[
            "buy",
            "sell",
            "mined",
            "gathered",
            "crafted",
            "drop",
            "reward",
            "gift",
            "opening_balance",
            "adjustment",
          ].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        {rows.map((t) => {
          const name = itemMap.get(t.itemId)?.name ?? t.itemId;
          const open = expanded === t.id;
          return (
            <Card key={t.id} className="p-3">
              <button
                type="button"
                className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
                onClick={() => setExpanded(open ? null : t.id)}
              >
                <div>
                  <div className="font-medium">
                    <span className="capitalize text-gold">{t.type}</span> · {name}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {new Date(t.transactionAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-right font-mono text-sm tabular-nums">
                  <div>qty {t.quantity}</div>
                  <div className="text-xs text-muted">
                    {formatKins(t.kinsAmount)} KINS · {formatUsd(t.usdAmountAtTransaction)}
                  </div>
                </div>
              </button>

              {open && (
                <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                  {t.txHash && isValidTxHash(t.txHash) && (
                    <a
                      className="text-info underline"
                      href={`https://solscan.io/tx/${t.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on Solscan
                    </a>
                  )}
                  {t.rawAlert && (
                    <pre className="max-h-40 overflow-auto rounded-lg bg-surface-2 p-2 text-xs text-muted whitespace-pre-wrap">
                      {t.rawAlert}
                    </pre>
                  )}
                  {t.note && <p className="text-muted">Note: {t.note}</p>}
                  <p className="text-xs text-muted">Fingerprint: {t.fingerprint}</p>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      if (
                        confirm(
                          "Delete this transaction? The full ledger will recalculate.",
                        )
                      ) {
                        await removeTransaction(t.id);
                        push("Transaction deleted", "ok");
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
        {!rows.length && (
          <Card>
            <p className="text-sm text-muted">No transactions match.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
