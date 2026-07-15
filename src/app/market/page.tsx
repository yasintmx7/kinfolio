"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  Calculator,
  ExternalLink,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { Card, CardTitle, StatValue } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemIcon } from "@/components/items/item-icon";
import { useMarketHub, type MarketFloorItem } from "@/hooks/use-market-hub";
import { useKinsPrice } from "@/hooks/use-kins-price";
import { useToast } from "@/components/feedback/toast";
import { d } from "@/lib/accounting/decimal";
import { formatKins, formatUsd, signedClass } from "@/lib/formatting/money";
import { getWatchlist, toggleWatch } from "@/lib/market/watchlist";
import { cn } from "@/lib/utils";

type Tab = "overview" | "floors" | "sales" | "watch";
type SortKey = "listings" | "floorUsd" | "name" | "qty";

function MarketHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "overview";
  const selectedId = searchParams.get("item") || "";

  const hub = useMarketHub(40000);
  const { price, reload: reloadPrice } = useKinsPrice();
  const { push } = useToast();

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("listings");
  const [watch, setWatch] = useState<string[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailStats, setDetailStats] = useState<{
    avg30dKins?: string;
    medianRecentSalesKins?: string;
    lowestActiveKins?: string;
    sales30d?: number;
    sources?: Record<string, string | null>;
  } | null>(null);

  useEffect(() => {
    setWatch(getWatchlist());
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetailStats(null);
      return;
    }
    setDetailLoading(true);
    fetch(`/api/market/items/${encodeURIComponent(selectedId)}/stats`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setDetailStats(j.data);
        else setDetailStats(null);
      })
      .catch(() => setDetailStats(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const kinsUsd = price?.priceUsd ?? hub.kinsUsd ?? undefined;
  const fee = 0.05;

  const saleMedianByType = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of hub.byItem) {
      if (row.medianUnitKins) m.set(row.itemType, row.medianUnitKins);
    }
    return m;
  }, [hub.byItem]);

  const enriched = useMemo(() => {
    return hub.floors.map((f) => {
      const saleMed = saleMedianByType.get(f.id);
      const floorK = f.lowestKinsPerUnit ? d(f.lowestKinsPerUnit) : null;
      const saleK = saleMed ? d(saleMed) : null;
      let edge: string | null = null;
      if (floorK && saleK && saleK.gt(0)) {
        // positive = floor cheaper than recent median sale (potential under floor vs sales)
        edge = saleK.minus(floorK).div(saleK).mul(100).toFixed(1);
      }
      return { ...f, saleMedianKins: saleMed ?? null, edgePct: edge };
    });
  }, [hub.floors, saleMedianByType]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = enriched;
    if (tab === "watch") {
      list = list.filter((i) => watch.includes(i.id));
    }
    if (query) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(query) ||
          i.id.toLowerCase().includes(query),
      );
    }
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "qty") return (b.totalQty ?? 0) - (a.totalQty ?? 0);
      if (sort === "floorUsd") {
        return d(b.lowestUsdPerUnit ?? "0").cmp(d(a.lowestUsdPerUnit ?? "0"));
      }
      return (b.listings ?? 0) - (a.listings ?? 0);
    });
  }, [enriched, q, sort, tab, watch]);

  const hotSales = hub.sales.slice(0, 12);
  const selectedFloor = enriched.find((i) => i.id === selectedId);
  const selectedSales = hub.sales.filter((s) => s.itemType === selectedId);

  function setTab(next: Tab) {
    const p = new URLSearchParams(searchParams.toString());
    if (next === "overview") p.delete("tab");
    else p.set("tab", next);
    router.push(`/market?${p.toString()}`);
  }

  function openItem(id: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("item", id);
    if (!p.get("tab") || p.get("tab") === "overview") {
      // keep overview or current
    }
    router.push(`/market?${p.toString()}`);
  }

  function closeItem() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("item");
    router.push(`/market?${p.toString()}`);
  }

  function onToggleWatch(id: string) {
    const next = toggleWatch(id);
    setWatch(next);
    push(next.includes(id) ? "Added to watchlist" : "Removed from watchlist", "ok");
  }

  async function refreshAll() {
    await Promise.all([hub.reload(), reloadPrice()]);
    push("Market refreshed", "ok");
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "floors", label: "Floors" },
    { id: "sales", label: "Activity" },
    { id: "watch", label: "Watchlist" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-sky">
            Market hub
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Floors + live sales
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Live floors and newest listings from the official Kintara marketplace.
            Watchlist, edge vs recent listing prices, and item drill-down.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={refreshAll} disabled={hub.loading}>
            <RefreshCw className={cn("h-4 w-4", hub.loading && "animate-spin")} />
            Refresh
          </Button>
          <Link href="/calculator">
            <Button variant="ghost" className="text-muted">
              <Calculator className="h-4 w-4" />
              Calc
            </Button>
          </Link>
        </div>
      </div>

      {/* Ticker strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardTitle>KINS / USD</CardTitle>
          <StatValue>
            {kinsUsd
              ? formatUsd(kinsUsd, { maxDecimals: 8 })
              : hub.loading
                ? "…"
                : "Not available"}
          </StatValue>
          <p className="mt-1 text-[11px] text-muted">
            {hub.rateSource ?? price?.source ?? "—"}
          </p>
        </Card>
        <Card>
          <CardTitle>Tracked items</CardTitle>
          <StatValue>{hub.floors.length || "—"}</StatValue>
          <p className="mt-1 text-[11px] text-muted">From live listings</p>
        </Card>
        <Card>
          <CardTitle>Open listings scanned</CardTitle>
          <StatValue>
            {hub.floors.reduce((a, f) => a + (f.listings ?? 0), 0) || "—"}
          </StatValue>
          <p className="mt-1 text-[11px] text-muted">Official marketplace</p>
        </Card>
        <Card>
          <CardTitle>Recent activity</CardTitle>
          <StatValue>{hub.sales.length || "—"}</StatValue>
          <p className="mt-1 text-[11px] text-muted">Newest listings</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-10 rounded-xl px-3.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-sky text-[#0a121c]"
                : "bg-raised text-muted hover:text-primary",
            )}
          >
            {t.label}
            {t.id === "watch" && watch.length > 0 ? ` (${watch.length})` : ""}
          </button>
        ))}
      </div>

      {/* Overview */}
      {(tab === "overview" || tab === "floors" || tab === "watch") && (
        <>
          {tab === "overview" && (
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <CardTitle>Hottest floors</CardTitle>
                  <button
                    type="button"
                    className="text-xs text-sky"
                    onClick={() => setTab("floors")}
                  >
                    View all
                  </button>
                </div>
                <FloorTable
                  rows={filtered.slice(0, 12)}
                  watch={watch}
                  onOpen={openItem}
                  onWatch={onToggleWatch}
                  compact
                />
              </Card>
              <Card className="lg:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <CardTitle>Newest listings</CardTitle>
                  <button
                    type="button"
                    className="text-xs text-sky"
                    onClick={() => setTab("sales")}
                  >
                    View all
                  </button>
                </div>
                <SalesTape sales={hotSales} onOpen={openItem} />
              </Card>
            </div>
          )}

          {(tab === "floors" || tab === "watch") && (
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-xs"
                  placeholder="Search items…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["listings", "Listings"],
                      ["floorUsd", "Floor $"],
                      ["qty", "Qty"],
                      ["name", "Name"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSort(k)}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs",
                        sort === k
                          ? "bg-sky/15 text-sky-hi"
                          : "bg-surface-2 text-muted",
                      )}
                    >
                      <ArrowUpDown className="h-3 w-3" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {tab === "watch" && !watch.length && (
                <p className="mb-3 text-sm text-muted">
                  Star items on the floors list to build your watchlist.
                </p>
              )}
              <FloorTable
                rows={filtered}
                watch={watch}
                onOpen={openItem}
                onWatch={onToggleWatch}
              />
              <p className="mt-3 text-[11px] text-muted">
                Floor = lowest active listing (USD). Activity med = median unit price
                from recent listings. Edge ≈ floor vs that median.
              </p>
            </Card>
          )}
        </>
      )}

      {tab === "sales" && (
        <Card>
          <CardTitle>Recent listing activity</CardTitle>
          {hub.salesNote && (
            <p className="mt-1 text-xs text-muted">{hub.salesNote}</p>
          )}
          <div className="mt-3">
            <SalesTape sales={hub.sales} onOpen={openItem} full />
          </div>
        </Card>
      )}

      {/* Item detail drawer */}
      {selectedId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={closeItem}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-border p-4">
              <div className="flex items-center gap-3">
                <ItemIcon
                  itemId={selectedId}
                  name={selectedFloor?.name ?? selectedId}
                  size={48}
                />
                <div>
                  <h2 className="text-lg font-semibold">
                    {selectedFloor?.name ?? selectedId}
                  </h2>
                  <p className="font-mono text-xs text-muted">{selectedId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeItem}
                className="rounded-lg p-2 text-muted hover:bg-raised hover:text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Floor USD/u"
                  value={
                    selectedFloor?.lowestUsdPerUnit
                      ? formatUsd(selectedFloor.lowestUsdPerUnit, {
                          maxDecimals: 8,
                        })
                      : "—"
                  }
                />
                <Metric
                  label="Floor KINS/u"
                  value={
                    selectedFloor?.lowestKinsPerUnit
                      ? formatKins(selectedFloor.lowestKinsPerUnit)
                      : "—"
                  }
                />
                <Metric
                  label="Activity med"
                  value={
                    selectedFloor?.saleMedianKins
                      ? `${formatKins(selectedFloor.saleMedianKins)} KINS`
                      : "—"
                  }
                />
                <Metric
                  label="Edge vs activity"
                  value={
                    selectedFloor?.edgePct != null
                      ? `${selectedFloor.edgePct}%`
                      : "—"
                  }
                  className={
                    selectedFloor?.edgePct
                      ? signedClass(selectedFloor.edgePct)
                      : ""
                  }
                />
              </div>

              {detailLoading && (
                <p className="text-sm text-muted">Loading stats…</p>
              )}
              {detailStats && (
                <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    Marketplace stats
                  </p>
                  <ul className="mt-2 space-y-1 font-mono text-xs text-muted">
                    {detailStats.avg30dKins && (
                      <li>30d avg: {formatKins(detailStats.avg30dKins)} KINS/u</li>
                    )}
                    {detailStats.lowestActiveKins && (
                      <li>
                        Lowest listing:{" "}
                        {formatKins(detailStats.lowestActiveKins)} KINS/u
                      </li>
                    )}
                    {detailStats.sales30d != null && (
                      <li>History samples: {detailStats.sales30d}</li>
                    )}
                  </ul>
                  {selectedFloor?.lowestKinsPerUnit && kinsUsd && (
                    <p className="mt-2 text-xs text-muted">
                      Est. net after 5% fee:{" "}
                      {formatUsd(
                        d(selectedFloor.lowestKinsPerUnit)
                          .mul(d(kinsUsd))
                          .mul(1 - fee)
                          .toFixed(),
                        { maxDecimals: 6 },
                      )}{" "}
                      / unit
                    </p>
                  )}
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  Recent listings of this item
                </p>
                {selectedSales.length === 0 && (
                  <p className="text-sm text-muted">
                    No recent activity for this item in the scanned pages.
                  </p>
                )}
                <div className="space-y-1.5">
                  {selectedSales.slice(0, 15).map((s) => (
                    <div
                      key={s.id}
                      className="flex justify-between rounded-lg bg-surface-2 px-2.5 py-2 text-xs"
                    >
                      <span className="text-muted">
                        ×{s.quantity} ·{" "}
                        {new Date(s.timestamp).toLocaleString()}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatKins(s.unitKins)} KINS/u
                        {s.solscanUrl && (
                          <>
                            {" "}
                            <a
                              href={s.solscanUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky"
                            >
                              <ExternalLink className="inline h-3 w-3" />
                            </a>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border p-4">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => onToggleWatch(selectedId)}
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    watch.includes(selectedId) && "fill-sky text-sky",
                  )}
                />
                {watch.includes(selectedId) ? "Watching" : "Watch"}
              </Button>
              <Link
                href={`/calculator`}
                className="flex-1"
              >
                <Button className="w-full" variant="ghost">
                  Calculator
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {hub.error && (
        <p className="text-sm text-loss">{hub.error}</p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-0.5 font-mono text-sm tabular-nums", className)}>
        {value}
      </div>
    </div>
  );
}

function FloorTable({
  rows,
  watch,
  onOpen,
  onWatch,
  compact,
}: {
  rows: (MarketFloorItem & {
    saleMedianKins?: string | null;
    edgePct?: string | null;
  })[];
  watch: string[];
  onOpen: (id: string) => void;
  onWatch: (id: string) => void;
  compact?: boolean;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted">No items to show.</p>;
  }
  return (
    <div className={cn("space-y-1", !compact && "max-h-[32rem] overflow-y-auto")}>
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center gap-2 rounded-xl border border-border/50 bg-surface-2/60 px-2 py-2 hover:border-sky/30"
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            onClick={() => onOpen(row.id)}
          >
            <ItemIcon itemId={row.id} name={row.name} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{row.name}</div>
              <div className="text-[11px] text-muted">
                {row.listings ?? 0} listings
                {row.totalQty != null ? ` · qty ${row.totalQty}` : ""}
              </div>
            </div>
          </button>
          <div className="shrink-0 text-right font-mono text-[11px] tabular-nums">
            <div>
              {row.lowestUsdPerUnit
                ? formatUsd(row.lowestUsdPerUnit, { maxDecimals: 6 })
                : "—"}
              <span className="text-muted"> /u</span>
            </div>
            {row.saleMedianKins && (
              <div className="text-muted">
                act {formatKins(row.saleMedianKins)}
              </div>
            )}
            {row.edgePct != null && (
              <div className={signedClass(row.edgePct)}>edge {row.edgePct}%</div>
            )}
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-muted hover:bg-raised hover:text-sky"
            onClick={() => onWatch(row.id)}
            aria-label="Toggle watch"
          >
            <Star
              className={cn(
                "h-4 w-4",
                watch.includes(row.id) && "fill-sky text-sky",
              )}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

function SalesTape({
  sales,
  onOpen,
  full,
}: {
  sales: {
    id: string;
    name: string;
    itemType: string;
    quantity: string;
    unitKins: string;
    usdTotal: string | null;
    timestamp: string;
    solscanUrl: string | null;
  }[];
  onOpen: (id: string) => void;
  full?: boolean;
}) {
  if (!sales.length) {
    return <p className="text-sm text-muted">Waiting for sales feed…</p>;
  }
  return (
    <div
      className={cn(
        "space-y-1.5",
        full ? "max-h-[36rem] overflow-y-auto" : "max-h-96 overflow-y-auto",
      )}
    >
      {sales.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onOpen(s.itemType)}
          className="flex w-full items-center justify-between gap-2 rounded-xl bg-surface-2/80 px-2.5 py-2 text-left text-sm hover:bg-raised"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ItemIcon itemId={s.itemType} name={s.name} size={28} />
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {s.name}{" "}
                <span className="font-mono text-xs text-muted">×{s.quantity}</span>
              </span>
              <span className="text-[10px] text-muted">
                {new Date(s.timestamp).toLocaleTimeString()}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-right font-mono text-[11px] tabular-nums">
            <span className="block">{formatKins(s.unitKins)} KINS/u</span>
            {s.usdTotal && (
              <span className="text-muted">
                {formatUsd(s.usdTotal, { maxDecimals: 4 })}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense
      fallback={<div className="text-sm text-muted">Loading market…</div>}
    >
      <MarketHubInner />
    </Suspense>
  );
}
