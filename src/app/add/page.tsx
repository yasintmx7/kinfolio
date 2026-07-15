"use client";

import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { useToast } from "@/components/feedback/toast";
import { parseKintaraAlert, parsedAlertToPlain } from "@/lib/parser/kintara-alert";
import { buildFingerprint } from "@/lib/parser/fingerprint";
import { previewSell } from "@/lib/accounting/engine";
import { d } from "@/lib/accounting/decimal";
import { formatKins, formatUsd, formatPercent, signedClass } from "@/lib/formatting/money";
import type { TransactionType } from "@/lib/accounting/types";

type Tab = "buy" | "sell" | "earned";

const EARNED_TYPES: TransactionType[] = [
  "mined",
  "gathered",
  "crafted",
  "drop",
  "reward",
  "gift",
];

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

  const favorites = settings?.favoriteItemIds ?? [];
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const af = favorites.includes(a.id) ? 0 : 1;
      const bf = favorites.includes(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
  }, [items, favorites]);

  const parsed = useMemo(() => {
    if (!alertText.trim()) return null;
    return parseKintaraAlert(alertText);
  }, [alertText]);

  const plain = parsed ? parsedAlertToPlain(parsed) : null;

  // Auto-fill from parser when not manual
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

  function applyParsedToFields() {
    if (!parsed) return;
    if (parsed.direction === "buy") {
      setTab("buy");
      setKinsAmount(parsed.totalSentKins.toFixed());
      setUsdAmount(parsed.totalSentUsd.toFixed());
    } else if (parsed.direction === "sell") {
      setTab("sell");
      setKinsAmount(parsed.totalReceivedKins.toFixed());
      setUsdAmount(parsed.totalReceivedUsd.toFixed());
    }
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

      const kins =
        tab === "earned"
          ? kinsAmount || "0"
          : effectiveKins || "0";
      const usd =
        tab === "earned"
          ? usdAmount || "0"
          : effectiveUsd || "0";

      if (tab !== "earned" && !manual && parsed?.direction === "unknown") {
        push("Could not parse alert. Enable manual mode or fix the paste.", "err");
        return;
      }

      const fingerprint = buildFingerprint({
        rawAlert: alertText,
        direction: type,
        itemId,
        quantity,
        kinsAmount: kins,
        usdAmount: usd,
        txHash: parsed?.txHash,
      });

      const result = await addTransaction({
        type,
        itemId,
        quantity,
        transactionAt: new Date().toISOString(),
        kinsAmount: kins,
        usdAmountAtTransaction: usd,
        impliedKinsUsd:
          d(kins).gt(0) ? d(usd).div(d(kins)).toFixed() : undefined,
        sellAmountIsNet: tab === "sell" ? sellIsNet : undefined,
        sellFeePercent: settings?.defaultSellFeePercent,
        rawAlert: alertText || undefined,
        txHash: parsed?.txHash,
        fingerprint: forceDuplicate ? `${fingerprint}:override:${Date.now()}` : fingerprint,
        source: source || undefined,
        location: location || undefined,
        tool: tool || undefined,
        durationMinutes: duration || undefined,
        note: note || undefined,
      });

      if (!result.ok) {
        if ("duplicate" in result && result.duplicate) {
          setPendingDup(true);
          push("Possible duplicate detected. Confirm to save anyway.", "info");
          return;
        }
        if ("error" in result && result.error) {
          push(result.error, "err");
          return;
        }
        push("Could not save entry.", "err");
        return;
      }

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
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Add entry</h1>
        <p className="mt-1 text-sm text-muted">
          Paste a Kintara alert, choose item & quantity, review, then save.
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
                ? "bg-gold text-[#1a1205]"
                : "bg-raised text-muted hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "earned" && (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Transaction alert</CardTitle>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={manual}
                onChange={(e) => setManual(e.target.checked)}
              />
              Manual mode
            </label>
          </div>
          <div className="mt-3">
            <Textarea
              placeholder={`Kintara Game · SOL | ✏️\nSent: 7.15 KINS (~$0.0571) To: GqTA..qMNG\n...`}
              value={alertText}
              onChange={(e) => setAlertText(e.target.value)}
              onBlur={applyParsedToFields}
            />
          </div>
          {plain && (
            <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-sm">
              <div className="font-medium text-gold">Parsed preview</div>
              <ul className="mt-2 space-y-1 font-mono text-xs text-muted">
                <li>Direction: {plain.direction}</li>
                <li>
                  Sent: {plain.totalSentKins} KINS / {formatUsd(plain.totalSentUsd)}
                </li>
                <li>
                  Received: {plain.totalReceivedKins} KINS /{" "}
                  {formatUsd(plain.totalReceivedUsd)}
                </li>
                {plain.txHash && <li>Tx: {plain.txHash.slice(0, 16)}…</li>}
              </ul>
              {parsed?.warnings.map((w) => (
                <p key={w} className="mt-1 text-xs text-gold-hi">
                  {w}
                </p>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <div>
          <Label htmlFor="item">Item</Label>
          <Select
            id="item"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            {sortedItems.map((item) => (
              <option key={item.id} value={item.id}>
                {favorites.includes(item.id) ? "★ " : ""}
                {item.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="qty">Quantity</Label>
          <Input
            id="qty"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 10"
          />
          {tab === "sell" && (
            <p className="mt-1 text-xs text-muted">
              Available: {available}
            </p>
          )}
        </div>

        {(manual || tab === "earned" || !alertText) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="kins">
                {tab === "sell" ? "Net KINS received" : tab === "buy" ? "KINS spent" : "Optional KINS expense"}
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
                {tab === "sell" ? "Net USD received" : tab === "buy" ? "USD spent" : "Optional USD expense"}
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
            <span className="text-muted">Using parsed totals: </span>
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
              Received is <strong className="text-primary">net after fee</strong> (default).
              Do not deduct another 5% when enabled.
            </span>
          </label>
        )}

        {tab === "sell" && sellPreview && !("error" in sellPreview) && (
          <div className="rounded-lg border border-border bg-raised p-3 text-sm">
            <div className="font-medium text-gold">Profit preview</div>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              <li>Cost basis sold: {formatUsd(sellPreview.usdCostBasisSold)}</li>
              <li className={signedClass(sellPreview.realizedUsdProfit)}>
                Realized USD: {formatUsd(sellPreview.realizedUsdProfit)} (
                {formatPercent(sellPreview.usdROI)})
              </li>
              <li className={signedClass(sellPreview.realizedKinsProfit)}>
                Realized KINS: {formatKins(sellPreview.realizedKinsProfit)}
              </li>
            </ul>
          </div>
        )}
        {tab === "sell" && sellPreview && "error" in sellPreview && (
          <p className="text-sm text-loss">{sellPreview.error}</p>
        )}

        {tab === "earned" && (
          <>
            <div>
              <Label htmlFor="etype">Source type</Label>
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
                Purchase cost defaults to zero (zero purchase cost). Optional expenses above.
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
          <Label htmlFor="note">Note</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Card>

      {pendingDup && (
        <label className="flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold-hi">
          <input
            type="checkbox"
            checked={forceDuplicate}
            onChange={(e) => setForceDuplicate(e.target.checked)}
          />
          Save anyway (override duplicate warning)
        </label>
      )}

      <div className="sticky bottom-24 z-20 md:bottom-4">
        <Button
          className="w-full shadow-lg"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save entry"}
        </Button>
      </div>
    </div>
  );
}
