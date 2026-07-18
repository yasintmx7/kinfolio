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

type QueueRow = {
  chunk: AlertChunk;
  itemId: string;
  quantity: string;
  selected: boolean;
};

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
  }) {
    const fingerprint = buildFingerprint({
      rawAlert: params.rawAlert,
      direction: params.type,
      itemId: params.itemId,
      quantity: params.quantity,
      kinsAmount: params.kins,
      usdAmount: params.usd,
      txHash: params.txHash,
    });

    const result = await addTransaction({
      type: params.type,
      itemId: params.itemId,
      quantity: params.quantity,
      transactionAt: new Date().toISOString(),
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
          Paste an alert → pick item & quantity → save. Multiple alerts open a review list.
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
            <CardTitle>Transaction alert</CardTitle>
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
          <div className="mt-3">
            <Textarea
              placeholder={`Paste Kintara alert here…\n\nSent: 7.15 KINS (~$0.0571) To: …`}
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
              onClick={() => applyPaste(SAMPLE_BUY)}
            >
              Try sample buy
            </button>
            <button
              type="button"
              className="text-xs text-info underline"
              onClick={() => applyPaste(SAMPLE_SELL)}
            >
              Try sample sell
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
