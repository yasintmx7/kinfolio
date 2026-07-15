"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardTitle, StatValue } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useKinsPrice } from "@/hooks/use-kins-price";
import { d } from "@/lib/accounting/decimal";
import { protectedCost } from "@/lib/accounting/engine";
import { formatKins, formatPercent, formatUsd, signedClass } from "@/lib/formatting/money";
import type { FeeTargetMode } from "@/lib/accounting/types";

/**
 * Standalone market calculator — no portfolio required.
 * Break-even, fee targets, buy→sell profit preview, KINS↔USD.
 */
export default function CalculatorPage() {
  const { price, source, loading } = useKinsPrice();
  const [kinsUsdManual, setKinsUsdManual] = useState("");
  const [fee, setFee] = useState("5");
  const [mode, setMode] = useState<FeeTargetMode>("exact_gross_up");

  const [buyKins, setBuyKins] = useState("");
  const [buyUsd, setBuyUsd] = useState("");
  const [qty, setQty] = useState("1");
  const [sellKins, setSellKins] = useState("");
  const [sellUsd, setSellUsd] = useState("");
  const [sellIsNet, setSellIsNet] = useState(true);

  const [convertKins, setConvertKins] = useState("");
  const [convertUsd, setConvertUsd] = useState("");

  const kinsUsd = price?.priceUsd || kinsUsdManual || "";

  const breakEven = useMemo(() => {
    const cost = d(buyUsd || "0");
    if (cost.lte(0)) return null;
    const feePct = d(fee || "0");
    const simple = protectedCost(cost, feePct, "simple_add");
    const exact = protectedCost(cost, feePct, "exact_gross_up");
    const chosen = protectedCost(cost, feePct, mode);
    const perUnit = d(qty || "1").gt(0) ? chosen.div(d(qty || "1")) : chosen;
    return {
      simple: simple.toFixed(),
      exact: exact.toFixed(),
      chosen: chosen.toFixed(),
      perUnit: perUnit.toFixed(),
    };
  }, [buyUsd, fee, mode, qty]);

  const tradePreview = useMemo(() => {
    const costUsd = d(buyUsd || "0");
    const costKins = d(buyKins || "0");
    let recvUsd = d(sellUsd || "0");
    let recvKins = d(sellKins || "0");
    if (!sellIsNet) {
      const f = d(1).minus(d(fee || "0").div(100));
      recvUsd = recvUsd.mul(f);
      recvKins = recvKins.mul(f);
    }
    if (costUsd.lte(0) && costKins.lte(0)) return null;
    if (recvUsd.lte(0) && recvKins.lte(0)) return null;
    const profitUsd = recvUsd.minus(costUsd);
    const profitKins = recvKins.minus(costKins);
    const roiUsd = costUsd.gt(0) ? profitUsd.div(costUsd).mul(100) : d(0);
    return {
      profitUsd: profitUsd.toFixed(),
      profitKins: profitKins.toFixed(),
      roiUsd: roiUsd.toFixed(2),
      recvUsd: recvUsd.toFixed(),
      recvKins: recvKins.toFixed(),
    };
  }, [buyUsd, buyKins, sellUsd, sellKins, sellIsNet, fee]);

  function onConvertKins(v: string) {
    setConvertKins(v);
    if (!kinsUsd || !v) {
      setConvertUsd("");
      return;
    }
    setConvertUsd(d(v).mul(d(kinsUsd)).toFixed(8));
  }

  function onConvertUsd(v: string) {
    setConvertUsd(v);
    if (!kinsUsd || !v || d(kinsUsd).lte(0)) {
      setConvertKins("");
      return;
    }
    setConvertKins(d(v).div(d(kinsUsd)).toFixed(8));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-sky">
          Calculator
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Profit &amp; break-even
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Quick math without saving a trade. For full tracking,{" "}
          <Link href="/add" className="text-sky underline underline-offset-2">
            log a trade
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardTitle>KINS price</CardTitle>
        <StatValue>
          {loading && !kinsUsd
            ? "…"
            : kinsUsd
              ? formatUsd(kinsUsd, { maxDecimals: 8 })
              : "Not available"}
        </StatValue>
        <p className="mt-1 text-xs text-muted">
          {source ? `Source: ${source}` : "Paste manual rate if offline"}
        </p>
        <div className="mt-3">
          <Label htmlFor="manualRate">Manual KINS/USD (optional)</Label>
          <Input
            id="manualRate"
            inputMode="decimal"
            placeholder="e.g. 0.0077"
            value={kinsUsdManual}
            onChange={(e) => setKinsUsdManual(e.target.value)}
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <CardTitle>KINS ↔ USD</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ck">KINS</Label>
            <Input
              id="ck"
              inputMode="decimal"
              value={convertKins}
              onChange={(e) => onConvertKins(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="cu">USD</Label>
            <Input
              id="cu"
              inputMode="decimal"
              value={convertUsd}
              onChange={(e) => onConvertUsd(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <CardTitle>Buy cost</CardTitle>
          <div className="flex gap-2">
            <div className="w-24">
              <Label htmlFor="fee">Fee %</Label>
              <Input
                id="fee"
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </div>
            <div className="w-40">
              <Label htmlFor="mode">Break-even mode</Label>
              <Select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as FeeTargetMode)}
              >
                <option value="exact_gross_up">Exact (÷ 0.95)</option>
                <option value="simple_add">Simple (× 1.05)</option>
                <option value="off">Off</option>
              </Select>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="qty">Qty</Label>
            <Input
              id="qty"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="bk">KINS spent</Label>
            <Input
              id="bk"
              inputMode="decimal"
              value={buyKins}
              onChange={(e) => setBuyKins(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="bu">USD spent</Label>
            <Input
              id="bu"
              inputMode="decimal"
              value={buyUsd}
              onChange={(e) => setBuyUsd(e.target.value)}
            />
          </div>
        </div>
        {breakEven && (
          <div className="grid gap-2 rounded-xl bg-surface-2/80 p-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">
                Safer break-even (gross)
              </p>
              <p className="font-mono text-lg tabular-nums text-sky-hi">
                {formatUsd(breakEven.chosen)}
              </p>
              <p className="text-xs text-muted">
                {formatUsd(breakEven.perUnit)} / unit · mode {mode.replaceAll("_", " ")}
              </p>
            </div>
            <div className="text-xs text-muted space-y-1">
              <p>Simple ×1.05: {formatUsd(breakEven.simple)}</p>
              <p>Exact ÷0.95: {formatUsd(breakEven.exact)}</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <CardTitle>Sell proceeds</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="sk">KINS received</Label>
            <Input
              id="sk"
              inputMode="decimal"
              value={sellKins}
              onChange={(e) => setSellKins(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="su">USD received</Label>
            <Input
              id="su"
              inputMode="decimal"
              value={sellUsd}
              onChange={(e) => setSellUsd(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-muted">
          <input
            type="checkbox"
            className="mt-1"
            checked={sellIsNet}
            onChange={(e) => setSellIsNet(e.target.checked)}
          />
          Amount is already net after fee (Kintara alerts default)
        </label>

        {tradePreview && (
          <div className="rounded-xl border border-sky/20 bg-sky/5 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">
              You keep
            </p>
            <p
              className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${signedClass(tradePreview.profitUsd)}`}
            >
              {formatUsd(tradePreview.profitUsd)}
            </p>
            <p className={`text-sm font-mono ${signedClass(tradePreview.profitKins)}`}>
              {formatKins(tradePreview.profitKins)} KINS · ROI{" "}
              {formatPercent(tradePreview.roiUsd)}
            </p>
            <p className="mt-2 text-xs text-muted">
              Net used: {formatUsd(tradePreview.recvUsd)} /{" "}
              {formatKins(tradePreview.recvKins)} KINS
            </p>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href="/add">
          <Button>Log this as a trade</Button>
        </Link>
        <Link href="/market">
          <Button variant="secondary">Open market tracker</Button>
        </Link>
      </div>
    </div>
  );
}
