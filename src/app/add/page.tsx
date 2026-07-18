"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ItemPicker } from "@/components/forms/item-picker";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { useToast } from "@/components/feedback/toast";
import { parseKintaraAlert, parsedAlertToPlain } from "@/lib/parser/kintara-alert";
import { splitAlertPaste, type AlertChunk } from "@/lib/parser/split-alerts";
import {
  looksLikeMarketplaceHistory,
  parseMarketplaceHistory,
  type MarketplaceHistoryLine,
} from "@/lib/parser/marketplace-history";
import { buildFingerprint } from "@/lib/parser/fingerprint";
import { previewSell } from "@/lib/accounting/engine";
import { d } from "@/lib/accounting/decimal";
import {
  formatKins,
  formatUsd,
  formatPercent,
  signedClass,
} from "@/lib/formatting/money";
import type { TransactionType } from "@/lib/accounting/types";
import {
  getLastItemId,
  getRecentItemIds,
  rememberItem,
} from "@/lib/recent-items";

type Tab = "buy" | "sell" | "earned";

const EARNED_TYPES: TransactionType[] = [
  "mined",
  "gathered",
  "crafted",
  "drop",
  "reward",
  "gift",
];

const SAMPLE_BUY = `Kintara Game · SOL | ✏️
Sent: 7.15 KINS (~$0.0571) To: GqTA..qMNG
Sent: 0.3763 KINS (~$0.003008) To: 4zW4..uQVt
Tx hash`;

const SAMPLE_SELL = `Kintara Game · SOL | ✏️
Received: 9.31 KINS (~$0.0764) From: AVeH..J4Ce
Tx hash`;

const SAMPLE_MARKETPLACE = `You sold 500 Cooked Fish Meat for $0.69 USD (42.54 $KINS).
MarketplaceJul 5 09:29 AM
You sold 5 Gold for $4.47 USD (275 $KINS).
MarketplaceJul 5 09:34 AM
You bought 638 Stone for $0.02 USD (1.45 $KINS).
MarketplaceJul 5 09:34 AM
You bought 1,000 Wood for $0.02 USD (1.24 $KINS).
MarketplaceJul 5 10:58 AM
You bought 2,600 Wood for $0.02 USD (1.23 $KINS).
MarketplaceJul 6 09:17 AM`;

type QueueRow = {
  chunk: AlertChunk;
  itemId: string;
  quantity: string;
  selected: boolean;
};

type MarketQueueRow = {
  line: MarketplaceHistoryLine;
  itemId: string;
  quantity: string;
  selected: boolean;
};

function formatWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AddEntryPage() {
  const { items, settings, transactions, addTransaction, summary } =
    usePortfolioContext();
  const { push } = useToast();

  const [tab, setTab] = useState<Tab>("buy");
  const [alertText, setAlertText] = useState("");
  const [itemId, setItemId] = useState("stone");
  const [quantity, setQuantity] = useState("");
  const [kinsAmount, setKinsAmount] = useState("");
  const [usdAmount, setUsdAmount] = useState("");
  const [manual, setManual] = useState(false);
  const [sellIsNet, setSellIsNet] = useState(
    settings?.sellAlertsAreNetByDefault ?? true,
  );
  const [earnedType, setEarnedType] = useState<TransactionType>("mined");
  const [source, setSource] = useState("");
  const [location, setLocation] = useState("");
  const [tool, setTool] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [pendingDup, setPendingDup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [marketQueue, setMarketQueue] = useState<MarketQueueRow[] | null>(null);
  const [marketWarnings, setMarketWarnings] = useState<string[]>([]);
  /** When true, missing stock before a sell is seeded as $0-cost gift (partial history). */
  const [seedMissingStock, setSeedMissingStock] = useState(true);

  const favorites = settings?.favoriteItemIds ?? [];

  useEffect(() => {
    // Hydrate last/recent from local storage after catalog is ready
    const last = getLastItemId();
    const recent = getRecentItemIds();
    // Defer setState so we don't cascade render inside the effect body
    const t = window.setTimeout(() => {
      if (last && items.some((i) => i.id === last)) setItemId(last);
      setRecentIds(recent);
    }, 0);
    return () => window.clearTimeout(t);
  }, [items]);

  const parsed = useMemo(() => {
    if (!alertText.trim()) return null;
    return parseKintaraAlert(alertText);
  }, [alertText]);

  const plain = parsed ? parsedAlertToPlain(parsed) : null;

  useEffect(() => {
    if (!parsed || manual) return;
    const t = window.setTimeout(() => {
      if (parsed.direction === "buy") {
        setTab("buy");
        setKinsAmount(parsed.totalSentKins.toFixed());
        setUsdAmount(parsed.totalSentUsd.toFixed());
      } else if (parsed.direction === "sell") {
        setTab("sell");
        setKinsAmount(parsed.totalReceivedKins.toFixed());
        setUsdAmount(parsed.totalReceivedUsd.toFixed());
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [parsed, manual]);

  const effectiveKins =
    manual || tab === "earned"
      ? kinsAmount
      : tab === "buy"
        ? plain?.totalSentKins ?? kinsAmount
        : plain?.totalReceivedKins ?? kinsAmount;

  const effectiveUsd =
    manual || tab === "earned"
      ? usdAmount
      : tab === "buy"
        ? plain?.totalSentUsd ?? usdAmount
        : plain?.totalReceivedUsd ?? usdAmount;

  const available = useMemo(() => {
    const pos = summary.positions.find((p) => p.itemId === itemId);
    return pos?.quantity ?? "0";
  }, [summary.positions, itemId]);

  const sellPreview = useMemo(() => {
    if (tab !== "sell" || !quantity || !effectiveUsd || !effectiveKins) return null;
    return previewSell(
      transactions,
      itemId,
      quantity,
      effectiveUsd,
      effectiveKins,
    );
  }, [tab, quantity, effectiveUsd, effectiveKins, transactions, itemId]);

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        push("Clipboard is empty.", "info");
        return;
      }
      applyPaste(text);
      push("Pasted from clipboard.", "ok");
    } catch {
      push("Clipboard blocked — paste manually into the box.", "err");
    }
  }

  function applyPaste(text: string) {
    // In-game marketplace history — names/qty/USD/KINS are in the paste; no manual pick
    if (looksLikeMarketplaceHistory(text)) {
      const parsed = parseMarketplaceHistory(text, items);
      if (parsed.matched && parsed.lines.length > 0) {
        setQueue(null);
        setMarketWarnings(parsed.warnings);
        const rows: MarketQueueRow[] = parsed.lines.map((line) => ({
          line,
          // Prefer catalog match from name; only fall back for unknown names
          itemId: line.itemId ?? "",
          quantity: line.quantity,
          selected: Boolean(line.itemId),
        }));
        setMarketQueue(rows);
        setAlertText(text);
        // All names resolved → import immediately (parse → calculate → add)
        const allKnown = rows.every((r) => r.itemId && r.line.itemId);
        if (allKnown) {
          void importMarketRows(rows, { auto: true });
        }
        return;
      }
    }

    setMarketQueue(null);
    setMarketWarnings([]);

    const chunks = splitAlertPaste(text);
    const usable = chunks.filter((c) => c.parsed.direction !== "unknown");

    if (usable.length > 1) {
      setQueue(
        usable.map((chunk) => ({
          chunk,
          itemId: getLastItemId() || itemId || "stone",
          quantity: "",
          selected: true,
        })),
      );
      setAlertText(text);
      return;
    }

    setQueue(null);
    setAlertText(text);
    const one = usable[0]?.parsed ?? parseKintaraAlert(text);
    if (one.direction === "buy") {
      setTab("buy");
      setKinsAmount(one.totalSentKins.toFixed());
      setUsdAmount(one.totalSentUsd.toFixed());
    } else if (one.direction === "sell") {
      setTab("sell");
      setKinsAmount(one.totalReceivedKins.toFixed());
      setUsdAmount(one.totalReceivedUsd.toFixed());
    }
  }

  async function saveOne(params: {
    type: TransactionType;
    itemId: string;
    quantity: string;
    kins: string;
    usd: string;
    rawAlert?: string;
    txHash?: string;
    sellAmountIsNet?: boolean;
    forceDup?: boolean;
    source?: string;
    location?: string;
    tool?: string;
    durationMinutes?: string;
    note?: string;
    transactionAt?: string;
  }) {
    const transactionAt = params.transactionAt ?? new Date().toISOString();
    const fingerprint = buildFingerprint({
      rawAlert: params.rawAlert,
      direction: params.type,
      itemId: params.itemId,
      quantity: params.quantity,
      kinsAmount: params.kins,
      usdAmount: params.usd,
      txHash: params.txHash,
      transactionAt,
    });

    const result = await addTransaction({
      type: params.type,
      itemId: params.itemId,
      quantity: params.quantity,
      transactionAt,
      kinsAmount: params.kins,
      usdAmountAtTransaction: params.usd,
      impliedKinsUsd: d(params.kins).gt(0)
        ? d(params.usd).div(d(params.kins)).toFixed()
        : undefined,
      sellAmountIsNet: params.sellAmountIsNet,
      sellFeePercent: settings?.defaultSellFeePercent,
      rawAlert: params.rawAlert,
      txHash: params.txHash,
      fingerprint: params.forceDup
        ? `${fingerprint}:override:${Date.now()}`
        : fingerprint,
      source: params.source,
      location: params.location,
      tool: params.tool,
      durationMinutes: params.durationMinutes,
      note: params.note,
    });

    return result;
  }

  async function onSave() {
    setSaving(true);
    try {
      const qty = d(quantity);
      if (qty.lte(0)) {
        push("Enter a positive quantity.", "err");
        return;
      }
      if (!itemId) {
        push("Select an item.", "err");
        return;
      }

      const type: TransactionType =
        tab === "buy" ? "buy" : tab === "sell" ? "sell" : earnedType;

      const kins = tab === "earned" ? kinsAmount || "0" : effectiveKins || "0";
      const usd = tab === "earned" ? usdAmount || "0" : effectiveUsd || "0";

      if (tab !== "earned" && !manual && parsed?.direction === "unknown") {
        push("Could not parse alert. Enable manual mode or fix the paste.", "err");
        return;
      }

      if (tab === "sell" && d(quantity).gt(d(available))) {
        push(`Only ${available} available. Use Sell all or lower quantity.`, "err");
        return;
      }

      const result = await saveOne({
        type,
        itemId,
        quantity,
        kins,
        usd,
        rawAlert: alertText || undefined,
        txHash: parsed?.txHash,
        sellAmountIsNet: tab === "sell" ? sellIsNet : undefined,
        forceDup: forceDuplicate,
        source: source || undefined,
        location: location || undefined,
        tool: tool || undefined,
        durationMinutes: duration || undefined,
        note: note || undefined,
      });

      if (!result.ok) {
        if ("duplicate" in result && result.duplicate) {
          setPendingDup(true);
          push("Possible duplicate — check box to save anyway.", "info");
          return;
        }
        if ("error" in result && result.error) {
          push(result.error, "err");
          return;
        }
        push("Could not save entry.", "err");
        return;
      }

      rememberItem(itemId);
      setRecentIds(getRecentItemIds());
      push("Entry saved.", "ok");
      setAlertText("");
      setQuantity("");
      setKinsAmount("");
      setUsdAmount("");
      setNote("");
      setSource("");
      setLocation("");
      setTool("");
      setDuration("");
      setForceDuplicate(false);
      setPendingDup(false);
      setQueue(null);
    } finally {
      setSaving(false);
    }
  }

  async function saveQueue() {
    if (!queue) return;
    setSaving(true);
    let saved = 0;
    let failed = 0;
    try {
      for (const row of queue) {
        if (!row.selected) continue;
        if (!row.quantity || d(row.quantity).lte(0)) {
          failed++;
          continue;
        }
        const p = row.chunk.parsed;
        const type: TransactionType =
          p.direction === "sell" ? "sell" : "buy";
        if (p.direction === "mixed" || p.direction === "unknown") {
          failed++;
          continue;
        }
        const kins =
          type === "buy" ? p.totalSentKins.toFixed() : p.totalReceivedKins.toFixed();
        const usd =
          type === "buy" ? p.totalSentUsd.toFixed() : p.totalReceivedUsd.toFixed();

        const result = await saveOne({
          type,
          itemId: row.itemId,
          quantity: row.quantity,
          kins,
          usd,
          rawAlert: row.chunk.rawText,
          txHash: p.txHash,
          sellAmountIsNet: type === "sell" ? sellIsNet : undefined,
        });
        if (result.ok) {
          saved++;
          rememberItem(row.itemId);
        } else {
          failed++;
        }
      }
      setRecentIds(getRecentItemIds());
      if (saved) push(`Saved ${saved} entr${saved === 1 ? "y" : "ies"}.`, "ok");
      if (failed) push(`${failed} skipped (qty, parse, or duplicate).`, "info");
      if (saved && !failed) {
        setQueue(null);
        setAlertText("");
      }
    } finally {
      setSaving(false);
    }
  }

  async function importMarketRows(
    rows: MarketQueueRow[],
    opts?: { auto?: boolean },
  ) {
    setSaving(true);
    let saved = 0;
    let seeded = 0;
    let failed = 0;
    const failNotes: string[] = [];
    const localQty = new Map<string, string>();
    for (const pos of summary.positions) {
      localQty.set(pos.itemId, pos.quantity);
    }

    try {
      // Oldest-first so buys land before later sells (WAC)
      for (const row of rows) {
        if (!row.selected) continue;
        const resolvedId = row.itemId || row.line.itemId || "";
        if (!resolvedId) {
          failed++;
          failNotes.push(`Unknown item: ${row.line.itemName}`);
          continue;
        }
        if (!row.quantity || d(row.quantity).lte(0)) {
          failed++;
          continue;
        }
        const type: TransactionType =
          row.line.direction === "sell" ? "sell" : "buy";

        if (type === "sell" && seedMissingStock) {
          const have = d(localQty.get(resolvedId) ?? "0");
          const need = d(row.quantity);
          if (need.gt(have)) {
            const shortfall = need.minus(have);
            const seedAt = new Date(
              Date.parse(row.line.transactionAt) - 1,
            ).toISOString();
            const seed = await saveOne({
              type: "gift",
              itemId: resolvedId,
              quantity: shortfall.toFixed(),
              kins: "0",
              usd: "0",
              transactionAt: seedAt,
              note: "Auto-seed for marketplace import (unknown prior cost)",
              forceDup: true,
            });
            if (seed.ok) {
              seeded++;
              localQty.set(resolvedId, have.plus(shortfall).toFixed());
            }
          }
        }

        const result = await saveOne({
          type,
          itemId: resolvedId,
          quantity: row.quantity,
          kins: row.line.kins,
          usd: row.line.usd,
          rawAlert: row.line.raw,
          sellAmountIsNet: type === "sell" ? true : undefined,
          transactionAt: row.line.transactionAt,
          note: "Marketplace history import",
        });
        if (result.ok) {
          saved++;
          rememberItem(resolvedId);
          const cur = d(localQty.get(resolvedId) ?? "0");
          localQty.set(
            resolvedId,
            type === "buy"
              ? cur.plus(d(row.quantity)).toFixed()
              : cur.minus(d(row.quantity)).toFixed(),
          );
        } else {
          failed++;
          if ("error" in result && result.error) {
            failNotes.push(result.error);
          } else if ("duplicate" in result && result.duplicate) {
            failNotes.push(`Duplicate: ${row.line.itemName} ×${row.quantity}`);
          }
        }
      }
      setRecentIds(getRecentItemIds());
      if (saved) {
        push(
          `${opts?.auto ? "Auto-imported" : "Imported"} ${saved} trade${
            saved === 1 ? "" : "s"
          }${seeded ? ` (+${seeded} $0 seed${seeded === 1 ? "" : "s"})` : ""}. Portfolio P/L updated.`,
          "ok",
        );
      }
      if (failed) {
        const detail = failNotes.slice(0, 2).join(" · ");
        push(
          `${failed} skipped${detail ? ` — ${detail}` : ""}.`,
          "info",
        );
      }
      if (saved && !failed) {
        setMarketQueue(null);
        setMarketWarnings([]);
        setAlertText("");
      } else if (saved && failed) {
        // Keep only unresolved / failed rows for fix-up
        setMarketQueue((prev) =>
          prev
            ? prev.filter((r) => !r.itemId || !r.line.itemId || !r.selected)
            : null,
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveMarketQueue() {
    if (!marketQueue) return;
    await importMarketRows(marketQueue);
  }

  // Marketplace history — compact preview (names/qty/$ already parsed)
  if (marketQueue && marketQueue.length > 0) {
    const ready = marketQueue.filter((r) => r.itemId || r.line.itemId);
    const unknown = marketQueue.filter((r) => !r.itemId && !r.line.itemId);
    const buyN = ready.filter((r) => r.line.direction === "buy").length;
    const sellN = ready.filter((r) => r.line.direction === "sell").length;
    const totalUsdIn = ready
      .filter((r) => r.line.direction === "buy")
      .reduce((s, r) => s.plus(d(r.line.usd)), d(0));
    const totalUsdOut = ready
      .filter((r) => r.line.direction === "sell")
      .reduce((s, r) => s.plus(d(r.line.usd)), d(0));
    const net = totalUsdOut.minus(totalUsdIn);

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {saving ? "Importing…" : "Marketplace import"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Parsed from paste — item name, qty, USD &amp; KINS. No manual pick
            when the catalog matches.
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            {ready.length} ready · {buyN} buys · {sellN} sells · in{" "}
            {formatUsd(totalUsdIn.toFixed())} · out{" "}
            {formatUsd(totalUsdOut.toFixed())} · cash Δ{" "}
            <span className={signedClass(net.toFixed())}>
              {formatUsd(net.toFixed())}
            </span>
          </p>
        </div>

        {saving && (
          <Card className="border-sky/30 bg-sky/10">
            <p className="text-sm text-sky-hi">
              Saving trades &amp; recalculating average cost / P/L…
            </p>
          </Card>
        )}

        {unknown.length > 0 && (
          <Card className="border-amber/40 bg-amber/10 space-y-3">
            <p className="text-sm text-amber">
              {unknown.length} name{unknown.length === 1 ? "" : "s"} not in
              catalog — pick once, then import.
            </p>
            {unknown.map((row) => {
              const idx = marketQueue.indexOf(row);
              return (
                <div key={`unk-${row.line.raw}-${idx}`} className="space-y-2">
                  <p className="text-sm font-medium">
                    {row.line.direction === "sell" ? "Sold" : "Bought"}{" "}
                    {row.line.itemName} ×{row.quantity} ·{" "}
                    {formatUsd(row.line.usd)}
                  </p>
                  <ItemPicker
                    items={items}
                    value={row.itemId || "stone"}
                    onChange={(id) => {
                      const next = [...marketQueue];
                      next[idx] = {
                        ...row,
                        itemId: id,
                        selected: true,
                        line: { ...row.line, itemId: id, warnings: [] },
                      };
                      setMarketQueue(next);
                    }}
                    favoriteIds={favorites}
                    recentIds={recentIds}
                  />
                </div>
              );
            })}
          </Card>
        )}

        <Card className="overflow-hidden p-0">
          <div className="border-b border-border/40 px-3 py-2">
            <p className="text-xs font-medium text-muted">
              Parsed trades (from marketplace text)
            </p>
          </div>
          <div className="max-h-[min(50dvh,28rem)] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase text-muted">
                <tr>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">USD</th>
                  <th className="px-2 py-2 text-right">KINS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {marketQueue.map((row, idx) => {
                  const known = Boolean(row.itemId || row.line.itemId);
                  return (
                    <tr
                      key={`${row.line.raw}-${idx}`}
                      className={known ? "" : "bg-amber/5"}
                    >
                      <td className="px-2 py-1.5">
                        <span
                          className={
                            row.line.direction === "sell"
                              ? "text-profit"
                              : "text-sky"
                          }
                        >
                          {row.line.direction === "sell" ? "Sell" : "Buy"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="font-medium">{row.line.itemName}</span>
                        {!known && (
                          <span className="ml-1 text-[10px] text-amber">
                            pick↑
                          </span>
                        )}
                        <div className="font-mono text-[10px] text-muted">
                          {formatWhen(row.line.transactionAt)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {row.quantity}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {formatUsd(row.line.usd)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted">
                        {formatKins(row.line.kins)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="mt-1"
              checked={seedMissingStock}
              onChange={(e) => setSeedMissingStock(e.target.checked)}
            />
            <span>
              <strong className="text-primary">Incomplete history OK</strong> —
              seed missing sell stock at $0 cost so P/L still records.
            </span>
          </label>
        </Card>

        <div className="sticky bottom-24 z-20 flex flex-col gap-2 md:bottom-4">
          <Button
            className="w-full shadow-lg"
            onClick={saveMarketQueue}
            disabled={saving || ready.length === 0}
          >
            {saving
              ? "Importing & calculating…"
              : `Import ${ready.length} trade${ready.length === 1 ? "" : "s"} → portfolio`}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={saving}
            onClick={() => {
              setMarketQueue(null);
              setMarketWarnings([]);
              setAlertText("");
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Multi-alert review UI
  if (queue && queue.length > 1) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Review alerts</h1>
          <p className="mt-1 text-sm text-muted">
            Found {queue.length} alerts. Pick item & quantity for each, then save.
          </p>
        </div>

        {queue.map((row, idx) => {
          const p = row.chunk.parsed;
          const plainRow = parsedAlertToPlain(p);
          return (
            <Card key={row.chunk.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>
                    #{idx + 1} ·{" "}
                    <span className="capitalize text-sky">{p.direction}</span>
                  </CardTitle>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {p.direction === "buy" || p.direction === "mixed"
                      ? `${plainRow.totalSentKins} KINS / ${formatUsd(plainRow.totalSentUsd)}`
                      : `${plainRow.totalReceivedKins} KINS / ${formatUsd(plainRow.totalReceivedUsd)}`}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) => {
                      const next = [...queue];
                      next[idx] = { ...row, selected: e.target.checked };
                      setQueue(next);
                    }}
                  />
                  Include
                </label>
              </div>
              <ItemPicker
                items={items}
                value={row.itemId}
                onChange={(id) => {
                  const next = [...queue];
                  next[idx] = { ...row, itemId: id };
                  setQueue(next);
                }}
                favoriteIds={favorites}
                recentIds={recentIds}
              />
              <div>
                <Label>Quantity</Label>
                <Input
                  inputMode="decimal"
                  value={row.quantity}
                  onChange={(e) => {
                    const next = [...queue];
                    next[idx] = { ...row, quantity: e.target.value };
                    setQueue(next);
                  }}
                  placeholder="How many items?"
                />
              </div>
              <pre className="max-h-24 overflow-auto rounded-lg bg-surface-2 p-2 text-[11px] text-muted whitespace-pre-wrap">
                {row.chunk.rawText}
              </pre>
            </Card>
          );
        })}

        <div className="sticky bottom-24 z-20 flex flex-col gap-2 md:bottom-4">
          <Button className="w-full shadow-lg" onClick={saveQueue} disabled={saving}>
            {saving ? "Saving…" : "Save selected"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setQueue(null);
              setAlertText("");
            }}
          >
            Cancel multi-import
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Add entry</h1>
        <p className="mt-1 text-sm text-muted">
          Paste marketplace history (“You bought/sold …”) — names, qty, USD &amp;
          KINS parse automatically and import. No item pick when catalog
          matches. P/L on{" "}
          <a href="/dashboard" className="text-info underline">
            My portfolio
          </a>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["buy", "Buy"],
            ["sell", "Sell"],
            ["earned", "Mined / Earned"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-lg px-4 text-sm font-medium ${
              tab === id
                ? "bg-sky text-[#0a121c]"
                : "bg-raised text-muted hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "earned" && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Paste trades</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={pasteClipboard}>
                <ClipboardPaste className="h-4 w-4" />
                Paste clipboard
              </Button>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={manual}
                  onChange={(e) => setManual(e.target.checked)}
                />
                Manual
              </label>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Marketplace paste auto-fills item · qty · USD · KINS and imports
            when names match the catalog. Also supports wallet alerts (
            <span className="font-mono">Sent:</span> /{" "}
            <span className="font-mono">Received:</span>).
          </p>
          <div className="mt-3">
            <Textarea
              placeholder={`Paste marketplace history or wallet alert…\n\nYou bought 500 Wood for $0.01 USD (0.58 $KINS).\nMarketplaceJul 5 07:24 AM`}
              value={alertText}
              onChange={(e) => setAlertText(e.target.value)}
              onBlur={() => {
                if (alertText.trim()) applyPaste(alertText);
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs text-info underline"
              onClick={() => applyPaste(SAMPLE_MARKETPLACE)}
            >
              Try marketplace sample
            </button>
            <button
              type="button"
              className="text-xs text-info underline"
              onClick={() => applyPaste(SAMPLE_BUY)}
            >
              Wallet buy sample
            </button>
            <button
              type="button"
              className="text-xs text-info underline"
              onClick={() => applyPaste(SAMPLE_SELL)}
            >
              Wallet sell sample
            </button>
          </div>
          {plain && plain.direction !== "unknown" && (
            <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-sm">
              <div className="font-medium text-sky">Detected</div>
              <ul className="mt-2 space-y-1 font-mono text-xs text-muted">
                <li className="capitalize">Type: {plain.direction}</li>
                <li>
                  Sent: {plain.totalSentKins} KINS / {formatUsd(plain.totalSentUsd)}
                </li>
                <li>
                  Received: {plain.totalReceivedKins} KINS /{" "}
                  {formatUsd(plain.totalReceivedUsd)}
                </li>
              </ul>
              {parsed?.warnings.map((w) => (
                <p key={w} className="mt-1 text-xs text-sky-hi">
                  {w}
                </p>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <ItemPicker
          items={items}
          value={itemId}
          onChange={setItemId}
          favoriteIds={favorites}
          recentIds={recentIds}
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <Label htmlFor="qty" className="mb-0">
              Quantity
            </Label>
            {tab === "sell" && d(available).gt(0) && (
              <button
                type="button"
                className="text-xs font-medium text-sky"
                onClick={() => setQuantity(available)}
              >
                Sell all ({available})
              </button>
            )}
          </div>
          <Input
            id="qty"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 10"
          />
          {tab === "sell" && (
            <p className="mt-1 text-xs text-muted">Available: {available}</p>
          )}
        </div>

        {(manual || tab === "earned" || !alertText) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="kins">
                {tab === "sell"
                  ? "Net KINS received"
                  : tab === "buy"
                    ? "KINS spent"
                    : "Optional KINS expense"}
              </Label>
              <Input
                id="kins"
                inputMode="decimal"
                value={kinsAmount}
                onChange={(e) => setKinsAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="usd">
                {tab === "sell"
                  ? "Net USD received"
                  : tab === "buy"
                    ? "USD spent"
                    : "Optional USD expense"}
              </Label>
              <Input
                id="usd"
                inputMode="decimal"
                value={usdAmount}
                onChange={(e) => setUsdAmount(e.target.value)}
              />
            </div>
          </div>
        )}

        {!manual && tab !== "earned" && alertText && (
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="text-muted">Using alert totals: </span>
            <span className="font-mono tabular-nums">
              {effectiveKins} KINS · {formatUsd(effectiveUsd || "0")}
            </span>
          </div>
        )}

        {tab === "sell" && (
          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="mt-1"
              checked={sellIsNet}
              onChange={(e) => setSellIsNet(e.target.checked)}
            />
            <span>
              Received is <strong className="text-primary">already after fee</strong>{" "}
              (recommended). We won&apos;t subtract another 5%.
            </span>
          </label>
        )}

        {tab === "sell" && sellPreview && !("error" in sellPreview) && (
          <div className="rounded-lg border border-border bg-raised p-3 text-sm">
            <div className="font-medium text-sky">You&apos;ll keep ~</div>
            <p className={`mt-1 font-mono text-lg tabular-nums ${signedClass(sellPreview.realizedUsdProfit)}`}>
              {formatUsd(sellPreview.realizedUsdProfit)}{" "}
              <span className="text-sm text-muted">
                ({formatPercent(sellPreview.usdROI)})
              </span>
            </p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-muted">
              <li>Cost of units sold: {formatUsd(sellPreview.usdCostBasisSold)}</li>
              <li>
                KINS profit: {formatKins(sellPreview.realizedKinsProfit)}
              </li>
            </ul>
          </div>
        )}
        {tab === "sell" && sellPreview && "error" in sellPreview && (
          <div className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
            {sellPreview.error}
            {d(available).gt(0) && (
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setQuantity(available)}
              >
                Use max ({available})
              </button>
            )}
          </div>
        )}

        {tab === "earned" && (
          <>
            <div>
              <Label htmlFor="etype">How did you get it?</Label>
              <Select
                id="etype"
                value={earnedType}
                onChange={(e) => setEarnedType(e.target.value as TransactionType)}
              >
                {EARNED_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted">
                Cost defaults to zero. Add optional expenses above if you want.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="source">Source</Label>
                <Input id="source" value={source} onChange={(e) => setSource(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="loc">Location</Label>
                <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tool">Tool</Label>
                <Input id="tool" value={tool} onChange={(e) => setTool(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="dur">Session minutes</Label>
                <Input
                  id="dur"
                  inputMode="numeric"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        <div>
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Card>

      {pendingDup && (
        <label className="flex items-center gap-2 rounded-lg border border-sky/40 bg-sky/10 px-3 py-2 text-sm text-sky-hi">
          <input
            type="checkbox"
            checked={forceDuplicate}
            onChange={(e) => setForceDuplicate(e.target.checked)}
          />
          Save anyway (looks like a duplicate)
        </label>
      )}

      <div className="sticky bottom-24 z-20 md:bottom-4">
        <Button className="w-full shadow-lg" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save entry"}
        </Button>
      </div>
    </div>
  );
}
