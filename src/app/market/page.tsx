"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { useKinsPrice } from "@/hooks/use-kins-price";
import { d } from "@/lib/accounting/decimal";
import { formatKins, formatUsd } from "@/lib/formatting/money";

type MarketState = {
  configured: boolean;
  message?: string;
  items: { id: string; name: string }[];
};

export default function MarketPage() {
  const { priceMap, itemMap, settings, summary } = usePortfolioContext();
  const { price } = useKinsPrice();
  const [market, setMarket] = useState<MarketState | null>(null);
  const fee = d(settings?.defaultSellFeePercent ?? "5").div(100);
  const kinsUsd = price?.priceUsd;

  useEffect(() => {
    fetch("/api/market/items")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setMarket({
            configured: Boolean(j.data.configured),
            message: j.data.message,
            items: j.data.items ?? [],
          });
        } else {
          setMarket({ configured: false, items: [], message: j.error?.message });
        }
      })
      .catch(() =>
        setMarket({
          configured: false,
          items: [],
          message: "Could not reach market API",
        }),
      );
  }, []);

  const manualRows = summary.positions.map((pos) => {
    const unit = priceMap.get(pos.itemId);
    const name = itemMap.get(pos.itemId)?.name ?? pos.itemId;
    const netUnit = unit ? d(unit).mul(d(1).minus(fee)) : null;
    const netUsd =
      netUnit && kinsUsd ? netUnit.mul(d(kinsUsd)).toFixed() : null;
    return { id: pos.itemId, name, unit, netUnit: netUnit?.toFixed(), netUsd };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Market</h1>
        <p className="mt-1 text-sm text-muted">
          Reference prices only — not guaranteed sale prices.
        </p>
      </div>

      <Card>
        <CardTitle>Marketplace adapter status</CardTitle>
        <p className="mt-2 text-sm text-muted">
          {market == null
            ? "Checking configuration…"
            : market.configured
              ? `Configured · ${market.items.length} catalog item(s) from API`
              : market.message ??
                "Not configured. Map public read-only endpoints in docs/KINTARA_F12_API_MAPPING.md and set env vars."}
        </p>
        <p className="mt-2 text-xs text-muted">
          Quote/buy/reserve flows are intentionally not integrated.
        </p>
      </Card>

      <Card>
        <CardTitle>Manual reference prices (your holdings)</CardTitle>
        <div className="mt-3 space-y-2">
          {!manualRows.length && (
            <p className="text-sm text-muted">
              No holdings yet. Set prices from Inventory after adding items.
            </p>
          )}
          {manualRows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
            >
              <span>{row.name}</span>
              <span className="font-mono text-xs tabular-nums text-muted">
                {row.unit
                  ? `${formatKins(row.unit)} KINS/u · net ~${formatKins(row.netUnit!)} · ${
                      row.netUsd ? formatUsd(row.netUsd) : "Not available"
                    } USD`
                  : "No manual price"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {market?.configured && market.items.length > 0 && (
        <Card>
          <CardTitle>API catalog sample</CardTitle>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm text-muted">
            {market.items.slice(0, 50).map((i) => (
              <li key={i.id}>
                {i.name} <span className="font-mono text-xs">({i.id})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
