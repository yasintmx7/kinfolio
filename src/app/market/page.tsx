"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { useKinsPrice } from "@/hooks/use-kins-price";
import { useToast } from "@/components/feedback/toast";
import { d } from "@/lib/accounting/decimal";
import { formatKins, formatUsd } from "@/lib/formatting/money";

type MarketItem = {
  id: string;
  name: string;
  portfolioItemId?: string;
  listings?: number;
  totalQty?: number;
  lowestUsdPerUnit?: string | null;
  lowestKinsPerUnit?: string | null;
  lowestGoldPerUnit?: string | null;
  kinsListings?: number;
  goldListings?: number;
};

type MarketState = {
  configured: boolean;
  message?: string;
  note?: string;
  provider?: string;
  kinsUsd?: string | null;
  goldFloorUsd?: string | null;
  rateSource?: string | null;
  items: MarketItem[];
  source?: string;
  updatedAt?: string;
};

export default function MarketPage() {
  const { priceMap, itemMap, settings, summary, setManualPrice } =
    usePortfolioContext();
  const { price } = useKinsPrice();
  const { push } = useToast();
  const [market, setMarket] = useState<MarketState | null>(null);
  const [sales, setSales] = useState<
    {
      id: string;
      name: string;
      itemType: string;
      quantity: string;
      unitKins: string;
      usdTotal: string | null;
      timestamp: string;
      solscanUrl: string | null;
    }[]
  >([]);
  const [salesNote, setSalesNote] = useState<string | null>(null);
  const [goneCount, setGoneCount] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [applying, setApplying] = useState(false);
  const fee = d(settings?.defaultSellFeePercent ?? "5").div(100);
  const kinsUsd = price?.priceUsd ?? market?.kinsUsd ?? undefined;

  useEffect(() => {
    fetch("/api/market/items")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setMarket({
            configured: Boolean(j.data.configured),
            message: j.data.message,
            note: j.data.note,
            provider: j.data.provider,
            kinsUsd: j.data.kinsUsd,
            goldFloorUsd: j.data.goldFloorUsd,
            rateSource: j.data.rateSource,
            items: j.data.items ?? [],
            source: j.source,
            updatedAt: j.updatedAt,
          });
        } else {
          setMarket({
            configured: false,
            items: [],
            message: j.error?.message,
          });
        }
      })
      .catch(() =>
        setMarket({
          configured: false,
          items: [],
          message: "Could not reach market API",
        }),
      );

    fetch("/api/market/recent-sales?limit=30")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setSales(j.data.sales ?? []);
          setSalesNote(j.data.note ?? null);
        }
      })
      .catch(() => {
        /* optional feed */
      });

    fetch("/api/market/gone")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && typeof j.data.count === "number") {
          setGoneCount(j.data.count);
        }
      })
      .catch(() => {
        /* optional */
      });
  }, []);

  const filtered = useMemo(() => {
    const items = market?.items ?? [];
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(query) ||
        i.id.toLowerCase().includes(query),
    );
  }, [market?.items, q]);

  const holdingRows = summary.positions.map((pos) => {
    const unit = priceMap.get(pos.itemId);
    const name = itemMap.get(pos.itemId)?.name ?? pos.itemId;
    const marketHit = market?.items.find(
      (m) => m.portfolioItemId === pos.itemId || m.id === pos.itemId.replace(/-/g, "_"),
    );
    const netUnit = unit ? d(unit).mul(d(1).minus(fee)) : null;
    const netUsd =
      netUnit && kinsUsd ? netUnit.mul(d(kinsUsd)).toFixed() : null;
    return {
      id: pos.itemId,
      name,
      unit,
      netUnit: netUnit?.toFixed(),
      netUsd,
      marketUsd: marketHit?.lowestUsdPerUnit,
      marketKins: marketHit?.lowestKinsPerUnit,
    };
  });

  async function applyFloorsToHoldings() {
    if (!market?.items?.length) return;
    setApplying(true);
    let n = 0;
    try {
      for (const pos of summary.positions) {
        const hit = market.items.find(
          (m) =>
            m.portfolioItemId === pos.itemId ||
            m.id === pos.itemId.replace(/-/g, "_"),
        );
        if (hit?.lowestKinsPerUnit) {
          await setManualPrice(pos.itemId, hit.lowestKinsPerUnit);
          n++;
        }
      }
      push(
        n
          ? `Applied lowest listing floors to ${n} holding(s).`
          : "No matching market floors for your holdings.",
        n ? "ok" : "info",
      );
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Market</h1>
        <p className="mt-1 text-sm text-muted">
          Floors:{" "}
          <a
            href="https://kintaramarket.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-info underline"
          >
            kintaramarket.xyz
          </a>
          {" · "}
          Recent sales:{" "}
          <a
            href="https://www.kintrade.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-info underline"
          >
            kintrade.xyz
          </a>
          . Estimates only — not guaranteed future prices.
        </p>
      </div>

      <Card>
        <CardTitle>Data source</CardTitle>
        <p className="mt-2 text-sm text-muted">
          {market == null
            ? "Loading…"
            : market.configured
              ? `${market.provider ?? "marketplace"} · ${market.items.length} items · ${
                  market.source ?? "api"
                }${market.updatedAt ? ` · ${new Date(market.updatedAt).toLocaleTimeString()}` : ""}`
              : market.message ?? "Not configured"}
        </p>
        {market?.note && (
          <p className="mt-2 text-xs text-muted">{market.note}</p>
        )}
        {kinsUsd && (
          <p className="mt-1 text-xs text-muted">
            KINS/USD for conversion: {formatUsd(kinsUsd, { maxDecimals: 8 })}
            {market?.rateSource ? ` · ${market.rateSource}` : ""}
          </p>
        )}
        {market?.goldFloorUsd && (
          <p className="mt-1 text-xs text-muted">
            Gold floor: {formatUsd(market.goldFloorUsd, { maxDecimals: 6 })} / gold
          </p>
        )}
        {goneCount != null && (
          <p className="mt-1 text-xs text-muted">
            Stale listing filter: {goneCount.toLocaleString()} gone IDs from{" "}
            <a
              href="https://www.kintrade.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-info underline"
            >
              kintrade.xyz/api/gone
            </a>
          </p>
        )}
      </Card>

      {summary.positions.length > 0 && market?.configured && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Your holdings</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Apply live lowest floors as inventory reference prices (KINS/unit).
            </p>
          </div>
          <Button onClick={applyFloorsToHoldings} disabled={applying}>
            {applying ? "Applying…" : "Apply floors to holdings"}
          </Button>
        </Card>
      )}

      <Card>
        <CardTitle>Holdings vs market</CardTitle>
        <div className="mt-3 space-y-2">
          {!holdingRows.length && (
            <p className="text-sm text-muted">
              No holdings yet.{" "}
              <Link href="/add" className="text-info underline">
                Add a trade
              </Link>
            </p>
          )}
          {holdingRows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
            >
              <span>{row.name}</span>
              <span className="font-mono text-xs tabular-nums text-muted">
                floor{" "}
                {row.marketUsd
                  ? formatUsd(row.marketUsd, { maxDecimals: 8 })
                  : "—"}
                {row.marketKins ? ` · ${formatKins(row.marketKins)} KINS` : ""}
                {row.unit
                  ? ` · ref ${formatKins(row.unit)} KINS`
                  : " · no ref price"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Recent completed sales</CardTitle>
        {salesNote && (
          <p className="mt-1 text-xs text-muted">{salesNote}</p>
        )}
        <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
          {!sales.length && (
            <p className="text-sm text-muted">Loading sales feed…</p>
          )}
          {sales.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">
                  {s.name}{" "}
                  <span className="font-mono text-xs text-muted">
                    ×{s.quantity}
                  </span>
                </div>
                <div className="text-[11px] text-muted">
                  {new Date(s.timestamp).toLocaleString()}
                  {s.solscanUrl && (
                    <>
                      {" · "}
                      <a
                        href={s.solscanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info underline"
                      >
                        Solscan
                      </a>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right font-mono text-xs tabular-nums">
                <div>{formatKins(s.unitKins)} KINS/u</div>
                {s.usdTotal && (
                  <div className="text-muted">
                    {formatUsd(s.usdTotal, { maxDecimals: 6 })} total
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {market?.configured && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>All market items</CardTitle>
            <Input
              className="max-w-xs"
              placeholder="Search items…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto">
            {filtered.slice(0, 100).map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-[11px] text-muted">
                    {i.id}
                    {i.listings != null ? ` · ${i.listings} listings` : ""}
                    {i.totalQty != null ? ` · qty ${i.totalQty}` : ""}
                  </div>
                </div>
                <div className="text-right font-mono text-xs tabular-nums">
                  <div>
                    {i.lowestUsdPerUnit
                      ? formatUsd(i.lowestUsdPerUnit, { maxDecimals: 8 })
                      : "Not available"}
                    <span className="text-muted"> /u</span>
                  </div>
                  {i.lowestKinsPerUnit && (
                    <div className="text-muted">
                      ~{formatKins(i.lowestKinsPerUnit)} KINS/u
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!filtered.length && (
              <p className="text-sm text-muted">No items match.</p>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Showing up to 100 results. Active listings are not guaranteed sales.
          </p>
        </Card>
      )}
    </div>
  );
}
