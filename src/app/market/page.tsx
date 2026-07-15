"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Star, X } from "lucide-react";
import { ItemIcon } from "@/components/items/item-icon";
import { useMarketHub, type MarketFloorItem, type RecentSale } from "@/hooks/use-market-hub";
import { useKinsPrice } from "@/hooks/use-kins-price";
import { useToast } from "@/components/feedback/toast";
import { d } from "@/lib/accounting/decimal";
import { formatKins, formatUsd } from "@/lib/formatting/money";
import { getWatchlist, toggleWatch } from "@/lib/market/watchlist";
import { cn } from "@/lib/utils";

type Tab = "sales" | "floors" | "watch";

function MarketHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: Tab =
    rawTab === "floors" || rawTab === "watch" || rawTab === "sales"
      ? rawTab
      : "sales";
  const selectedId = searchParams.get("item") || "";

  const hub = useMarketHub(10_000);
  const { price, reload: reloadPrice } = useKinsPrice(10_000);
  const { push } = useToast();

  const [q, setQ] = useState("");
  const [watch, setWatch] = useState<string[]>([]);

  useEffect(() => {
    setWatch(getWatchlist());
  }, []);

  // Redirect old overview tab to live feed
  useEffect(() => {
    if (!rawTab || rawTab === "overview") {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", "sales");
      router.replace(`/market?${p.toString()}`);
    }
  }, [rawTab, router, searchParams]);

  const kinsUsd = price?.priceUsd ?? hub.kinsUsd ?? undefined;

  const filteredLive = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return hub.sales;
    return hub.sales.filter((s) => {
      const seller = (s.sellerName ?? s.seller ?? "").toLowerCase();
      return (
        s.name.toLowerCase().includes(query) ||
        s.itemType.toLowerCase().includes(query) ||
        seller.includes(query) ||
        String(s.sellerId ?? "").includes(query) ||
        String(s.listingId ?? s.id).includes(query)
      );
    });
  }, [hub.sales, q]);

  const filteredFloors = useMemo(() => {
    let list = hub.floors;
    if (tab === "watch") list = list.filter((i) => watch.includes(i.id));
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(query) ||
          i.id.toLowerCase().includes(query),
      );
    }
    return [...list].sort((a, b) => (b.listings ?? 0) - (a.listings ?? 0));
  }, [hub.floors, q, tab, watch]);

  const selected = hub.sales.filter((s) => s.itemType === selectedId);
  const selectedFloor = hub.floors.find((f) => f.id === selectedId);

  function setTab(next: Tab) {
    const p = new URLSearchParams();
    p.set("tab", next);
    router.push(`/market?${p.toString()}`);
  }

  function openItem(id: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("item", id);
    if (!p.get("tab")) p.set("tab", tab);
    router.push(`/market?${p.toString()}`);
  }

  function closeItem() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("item");
    router.push(`/market?${p.toString()}`);
  }

  function onWatch(id: string) {
    const next = toggleWatch(id);
    setWatch(next);
    push(next.includes(id) ? "Watching" : "Removed", "ok");
  }

  return (
    <div className="space-y-6">
      {/* Simple top bar */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-primary">
            {tab === "sales" && "Live market"}
            {tab === "floors" && "Floors"}
            {tab === "watch" && "Watchlist"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tab === "sales" &&
              `${hub.sales.length} listings · seller, KINS & $ · every 10s`}
            {tab === "floors" && `${hub.floors.length} items · lowest price each`}
            {tab === "watch" &&
              (watch.length
                ? `${watch.length} watched items`
                : "Star items to watch them")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-border/60 bg-surface/80 px-4 py-2.5 text-right">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
              1 KINS
            </div>
            <div className="font-mono text-base font-semibold tabular-nums text-sky-hi">
              {kinsUsd
                ? formatUsd(kinsUsd, { maxDecimals: 6 })
                : hub.loading
                  ? "…"
                  : "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void hub.reload();
              void reloadPrice();
            }}
            disabled={hub.refreshing}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-border/60 bg-surface px-3.5 text-sm text-muted hover:text-primary disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-4 w-4", hub.refreshing && "animate-spin")}
            />
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                hub.refreshing ? "bg-sky" : "bg-forest",
              )}
            />
            Live
          </button>
        </div>
      </div>

      {/* Clean segment control */}
      <div className="inline-flex rounded-2xl border border-border/50 bg-surface/60 p-1">
        {(
          [
            ["sales", "Live"],
            ["floors", "Floors"],
            ["watch", "Watch"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "min-h-9 rounded-xl px-4 text-sm font-medium transition-colors",
              tab === id
                ? "bg-sky text-[#0a121c] shadow-sm"
                : "text-muted hover:text-primary",
            )}
          >
            {label}
            {id === "watch" && watch.length > 0 ? ` ${watch.length}` : ""}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={
          tab === "sales"
            ? "Search item, seller, listing id…"
            : "Search items…"
        }
        className="min-h-12 w-full rounded-2xl border border-border/50 bg-surface/70 px-4 text-sm text-primary outline-none placeholder:text-muted/60 focus:border-sky/40 focus:ring-2 focus:ring-sky/20"
      />

      {/* Main content */}
      {tab === "sales" && (
        <LiveList rows={filteredLive} onOpen={openItem} onWatch={onWatch} watch={watch} />
      )}

      {(tab === "floors" || tab === "watch") && (
        <FloorList
          rows={filteredFloors}
          watch={watch}
          onOpen={openItem}
          onWatch={onWatch}
          empty={
            tab === "watch"
              ? "No watched items yet. Open Live or Floors and tap ★."
              : "No floors loaded yet."
          }
        />
      )}

      {/* Simple detail sheet */}
      {selectedId && (
        <DetailSheet
          itemId={selectedId}
          name={selectedFloor?.name ?? selectedId}
          floor={selectedFloor}
          rows={selected}
          watching={watch.includes(selectedId)}
          kinsUsd={kinsUsd}
          onClose={closeItem}
          onWatch={() => onWatch(selectedId)}
        />
      )}

      {hub.error && (
        <p className="text-center text-sm text-loss">{hub.error}</p>
      )}
    </div>
  );
}

function LiveList({
  rows,
  onOpen,
  onWatch,
  watch,
}: {
  rows: RecentSale[];
  onOpen: (id: string) => void;
  onWatch: (id: string) => void;
  watch: string[];
}) {
  if (!rows.length) {
    return (
      <div className="rounded-3xl border border-border/40 bg-surface/50 px-6 py-16 text-center text-sm text-muted">
        Waiting for listings…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border/40 bg-surface/40">
      {/* Desktop header */}
      <div className="hidden grid-cols-[1.4fr_0.7fr_0.55fr_0.7fr_0.7fr_auto] gap-3 border-b border-border/40 px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted md:grid">
        <span>Item · seller</span>
        <span>Listing</span>
        <span className="text-right">Qty</span>
        <span className="text-right">KINS / unit</span>
        <span className="text-right">$ / unit</span>
        <span className="w-9" />
      </div>

      <div className="max-h-[calc(100dvh-16rem)] divide-y divide-border/30 overflow-y-auto">
        {rows.map((r) => {
          const seller = r.sellerName ?? r.seller ?? "—";
          return (
            <div
              key={r.id}
              className="grid grid-cols-1 gap-2 px-4 py-3.5 transition-colors hover:bg-sky/[0.04] md:grid-cols-[1.4fr_0.7fr_0.55fr_0.7fr_0.7fr_auto] md:items-center md:gap-3"
            >
              <button
                type="button"
                onClick={() => onOpen(r.itemType)}
                className="flex min-w-0 items-center gap-3 text-left"
              >
                <ItemIcon itemId={r.itemType} name={r.name} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold tracking-tight">
                    {r.name}
                  </div>
                  <div className="truncate text-[12px] text-muted">
                    <span className="text-primary/90">{seller}</span>
                    {r.sellerId ? (
                      <span className="font-mono text-muted"> · #{r.sellerId}</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted md:hidden">
                    #{r.listingId ?? r.id} · {new Date(r.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onOpen(r.itemType)}
                className="hidden text-left font-mono text-[12px] text-muted md:block"
              >
                <div>#{r.listingId ?? r.id}</div>
                <div className="text-[11px]">
                  {new Date(r.timestamp).toLocaleTimeString()}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onOpen(r.itemType)}
                className="hidden text-right font-mono text-sm tabular-nums md:block"
              >
                {r.quantity}
              </button>

              {/* Prices — most visible */}
              <button
                type="button"
                onClick={() => onOpen(r.itemType)}
                className="flex items-center justify-between gap-4 md:block md:text-right"
              >
                <div className="md:hidden text-[12px] text-muted">Price</div>
                <div>
                  <div className="font-mono text-[15px] font-semibold tabular-nums tracking-tight">
                    {formatKins(r.unitKins)}{" "}
                    <span className="text-[11px] font-medium text-muted">KINS</span>
                  </div>
                  <div className="font-mono text-[13px] tabular-nums text-sky-hi">
                    {r.unitUsd
                      ? formatUsd(r.unitUsd, { maxDecimals: 6 })
                      : "—"}
                    <span className="text-muted"> /u</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted md:hidden">
                    ×{r.quantity}
                    {r.usdTotal
                      ? ` · lot ${formatUsd(r.usdTotal, { maxDecimals: 3 })}`
                      : ""}
                    {r.totalKins ? ` · ${formatKins(r.totalKins)} KINS` : ""}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onOpen(r.itemType)}
                className="hidden text-right md:block"
              >
                <div className="font-mono text-[13px] tabular-nums text-sky-hi">
                  {r.unitUsd
                    ? formatUsd(r.unitUsd, { maxDecimals: 6 })
                    : "—"}
                </div>
                <div className="font-mono text-[11px] text-muted">
                  lot{" "}
                  {r.usdTotal
                    ? formatUsd(r.usdTotal, { maxDecimals: 3 })
                    : "—"}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onWatch(r.itemType)}
                className="absolute right-3 top-3 rounded-xl p-2 text-muted hover:bg-raised hover:text-sky md:static md:justify-self-end"
                aria-label="Watch"
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    watch.includes(r.itemType) && "fill-sky text-sky",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FloorList({
  rows,
  watch,
  onOpen,
  onWatch,
  empty,
}: {
  rows: MarketFloorItem[];
  watch: string[];
  onOpen: (id: string) => void;
  onWatch: (id: string) => void;
  empty: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-3xl border border-border/40 bg-surface/50 px-6 py-16 text-center text-sm text-muted">
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border/40 bg-surface/40">
      <div className="hidden grid-cols-[1fr_auto_auto] gap-4 border-b border-border/40 px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted md:grid">
        <span>Item</span>
        <span className="text-right">Lowest price</span>
        <span className="w-9" />
      </div>
      <div className="max-h-[calc(100dvh-16rem)] divide-y divide-border/30 overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-sky/[0.04]"
          >
            <button
              type="button"
              onClick={() => onOpen(row.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <ItemIcon itemId={row.id} name={row.name} size={40} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">
                  {row.name}
                </div>
                <div className="text-[12px] text-muted">
                  {row.listings ?? 0} open
                  {row.totalQty != null ? ` · ${row.totalQty} qty` : ""}
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onOpen(row.id)}
              className="shrink-0 text-right"
            >
              <div className="font-mono text-[15px] font-semibold tabular-nums">
                {row.lowestKinsPerUnit
                  ? formatKins(row.lowestKinsPerUnit)
                  : "—"}{" "}
                <span className="text-[11px] font-medium text-muted">KINS</span>
              </div>
              <div className="font-mono text-[13px] tabular-nums text-sky-hi">
                {row.lowestUsdPerUnit
                  ? formatUsd(row.lowestUsdPerUnit, { maxDecimals: 6 })
                  : "—"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => onWatch(row.id)}
              className="rounded-xl p-2 text-muted hover:bg-raised hover:text-sky"
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
    </div>
  );
}

function DetailSheet({
  itemId,
  name,
  floor,
  rows,
  watching,
  kinsUsd,
  onClose,
  onWatch,
}: {
  itemId: string;
  name: string;
  floor?: MarketFloorItem;
  rows: RecentSale[];
  watching: boolean;
  kinsUsd?: string;
  onClose: () => void;
  onWatch: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-surface shadow-2xl sm:mr-4 sm:max-h-[90dvh] sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-border/50 p-5">
          <ItemIcon itemId={itemId} name={name} size={48} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">{name}</h2>
            <p className="font-mono text-xs text-muted">{itemId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted hover:bg-raised"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-border/50 p-5">
          <div className="rounded-2xl bg-surface-2/80 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Floor KINS
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {floor?.lowestKinsPerUnit
                ? formatKins(floor.lowestKinsPerUnit)
                : "—"}
            </div>
          </div>
          <div className="rounded-2xl bg-surface-2/80 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Floor $
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-sky-hi">
              {floor?.lowestUsdPerUnit
                ? formatUsd(floor.lowestUsdPerUnit, { maxDecimals: 6 })
                : "—"}
            </div>
          </div>
          {kinsUsd && (
            <p className="col-span-2 text-[11px] text-muted">
              1 KINS = {formatUsd(kinsUsd, { maxDecimals: 6 })}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted">
            Open listings · {rows.length}
          </p>
          <div className="space-y-2">
            {rows.length === 0 && (
              <p className="text-sm text-muted">None in current feed.</p>
            )}
            {rows.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-border/40 bg-surface-2/50 px-3.5 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {s.sellerName ?? s.seller ?? "—"}
                    </div>
                    <div className="font-mono text-[11px] text-muted">
                      seller #{s.sellerId ?? "—"} · list #{s.listingId ?? s.id}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold tabular-nums">
                      {formatKins(s.unitKins)}{" "}
                      <span className="text-[10px] text-muted">KINS</span>
                    </div>
                    <div className="font-mono text-[13px] tabular-nums text-sky-hi">
                      {s.unitUsd
                        ? formatUsd(s.unitUsd, { maxDecimals: 6 })
                        : "—"}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted">
                  <span>
                    ×{s.quantity}
                    {s.totalKins ? ` · ${formatKins(s.totalKins)} KINS lot` : ""}
                    {s.usdTotal
                      ? ` · ${formatUsd(s.usdTotal, { maxDecimals: 3 })}`
                      : ""}
                  </span>
                  <span>{new Date(s.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border/50 p-4">
          <button
            type="button"
            onClick={onWatch}
            className={cn(
              "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold",
              watching
                ? "bg-sky/15 text-sky-hi"
                : "bg-sky text-[#0a121c]",
            )}
          >
            <Star className={cn("h-4 w-4", watching && "fill-sky")} />
            {watching ? "Watching" : "Watch item"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-muted">Loading…</div>
      }
    >
      <MarketHubInner />
    </Suspense>
  );
}
