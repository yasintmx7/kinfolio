"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Star, X } from "lucide-react";
import { ItemIcon } from "@/components/items/item-icon";
import {
  useMarketHub,
  type MarketFloorItem,
  type RecentSale,
} from "@/hooks/use-market-hub";
import { useKinsPrice } from "@/hooks/use-kins-price";
import { useToast } from "@/components/feedback/toast";
import { formatQtyCompact, formatUsdShort } from "@/lib/formatting/money";
import { getWatchlist, toggleWatch } from "@/lib/market/watchlist";
import { cn } from "@/lib/utils";

type Tab = "sales" | "floors" | "watch";

type SellerFocus = {
  sellerId: string | null;
  sellerName: string | null;
};

function MarketHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: Tab =
    rawTab === "floors" || rawTab === "watch" || rawTab === "sales"
      ? rawTab
      : "sales";

  const hub = useMarketHub(10_000);
  const { price, reload: reloadPrice } = useKinsPrice(10_000);
  const { push } = useToast();

  const [q, setQ] = useState("");
  const [watch, setWatch] = useState<string[]>([]);
  /** Item sheet — local state so clicks always work */
  const [itemFocus, setItemFocus] = useState<string | null>(null);
  /** Seller sheet — local state (not URL) so click never races navigation */
  const [sellerFocus, setSellerFocus] = useState<SellerFocus | null>(null);

  useEffect(() => {
    setWatch(getWatchlist());
  }, []);

  useEffect(() => {
    if (!rawTab || rawTab === "overview") {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", "sales");
      router.replace(`/market?${p.toString()}`);
    }
  }, [rawTab, router, searchParams]);

  // Deep-link support: ?item= / ?seller= still open sheets once
  useEffect(() => {
    const item = searchParams.get("item");
    const seller = searchParams.get("seller");
    const sellerName = searchParams.get("sellerName");
    if (item) {
      setItemFocus(item);
      setSellerFocus(null);
    } else if (seller || sellerName) {
      setSellerFocus({
        sellerId: seller,
        sellerName: sellerName,
      });
      setItemFocus(null);
    }
    // only on first meaningful query — avoid fighting local open/close
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const selected = useMemo(
    () =>
      itemFocus ? hub.sales.filter((s) => s.itemType === itemFocus) : [],
    [hub.sales, itemFocus],
  );
  const selectedFloor = itemFocus
    ? hub.floors.find((f) => f.id === itemFocus)
    : undefined;

  const sellerListings = useMemo(() => {
    if (!sellerFocus) return [];
    const id = sellerFocus.sellerId?.trim() || "";
    const name = (sellerFocus.sellerName ?? "").trim().toLowerCase();
    return hub.sales.filter((s) => {
      if (id && s.sellerId != null && String(s.sellerId) === id) return true;
      if (name) {
        const n = (s.sellerName ?? s.seller ?? "").trim().toLowerCase();
        if (n && n === name) return true;
      }
      // seller id used as name fallback
      if (id && !/^\d+$/.test(id)) {
        const n = (s.sellerName ?? s.seller ?? "").trim().toLowerCase();
        if (n === id.toLowerCase()) return true;
      }
      return false;
    });
  }, [hub.sales, sellerFocus]);

  const sellerDisplayName = useMemo(() => {
    if (!sellerFocus) return "Seller";
    if (sellerFocus.sellerName) return sellerFocus.sellerName;
    const hit = sellerListings[0];
    if (hit?.sellerName ?? hit?.seller) return hit.sellerName ?? hit.seller ?? "Seller";
    if (sellerFocus.sellerId) return `#${sellerFocus.sellerId}`;
    return "Seller";
  }, [sellerFocus, sellerListings]);

  function setTab(next: Tab) {
    setItemFocus(null);
    setSellerFocus(null);
    router.push(`/market?tab=${next}`);
  }

  function openItem(id: string) {
    setSellerFocus(null);
    setItemFocus(id);
  }

  function openSeller(row: RecentSale) {
    const name = (row.sellerName ?? row.seller ?? "").trim();
    const id =
      row.sellerId != null && String(row.sellerId).trim() !== ""
        ? String(row.sellerId)
        : null;
    if (!name && !id) return;
    setItemFocus(null);
    setSellerFocus({
      sellerId: id,
      sellerName: name || null,
    });
  }

  function closeSheet() {
    setItemFocus(null);
    setSellerFocus(null);
  }

  function onWatch(id: string) {
    const next = toggleWatch(id);
    setWatch(next);
    push(next.includes(id) ? "Watching" : "Removed", "ok");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight">
            {tab === "sales" && "Sales activity"}
            {tab === "floors" && "Floors"}
            {tab === "watch" && "Watchlist"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tab === "sales" &&
              `${hub.sales.length} live listings · newest first · 10s`}
            {tab === "floors" && `${hub.floors.length} items · lowest $ each`}
            {tab === "watch" &&
              (watch.length
                ? `${watch.length} watched`
                : "Star items to watch")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-border/50 bg-surface/70 px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              1 KINS
            </div>
            <div className="font-mono text-base font-semibold tabular-nums text-sky-hi">
              {kinsUsd ? formatUsdShort(kinsUsd) : hub.loading ? "…" : "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void hub.reload();
              void reloadPrice();
            }}
            disabled={hub.refreshing}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-border/50 bg-surface px-3.5 text-sm text-muted hover:text-primary disabled:opacity-50"
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

      <div className="inline-flex rounded-2xl border border-border/40 bg-surface/50 p-1">
        {(
          [
            ["sales", "Activity"],
            ["floors", "Floors"],
            ["watch", "Watch"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "min-h-9 rounded-xl px-4 text-sm font-medium",
              tab === id
                ? "bg-sky text-[#0a121c]"
                : "text-muted hover:text-primary",
            )}
          >
            {label}
            {id === "watch" && watch.length > 0 ? ` ${watch.length}` : ""}
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={
          tab === "sales" ? "Search item or seller…" : "Search items…"
        }
        className="min-h-12 w-full rounded-2xl border border-border/40 bg-surface/60 px-4 text-sm outline-none placeholder:text-muted/50 focus:border-sky/40 focus:ring-2 focus:ring-sky/15"
      />

      {tab === "sales" && (
        <LiveList
          rows={filteredLive}
          onOpenItem={openItem}
          onOpenSeller={openSeller}
          onWatch={onWatch}
          watch={watch}
        />
      )}

      {(tab === "floors" || tab === "watch") && (
        <FloorList
          rows={filteredFloors}
          watch={watch}
          onOpen={openItem}
          onWatch={onWatch}
          empty={
            tab === "watch"
              ? "No watched items yet."
              : "No floors loaded yet."
          }
        />
      )}

      {itemFocus && (
        <DetailSheet
          title={selectedFloor?.name ?? selected[0]?.name ?? itemFocus}
          subtitle={
            selectedFloor?.lowestUsdPerUnit
              ? `Floor ${formatUsdShort(selectedFloor.lowestUsdPerUnit)}/u`
              : "Item listings in feed"
          }
          itemId={itemFocus}
          rows={selected}
          watching={watch.includes(itemFocus)}
          onClose={closeSheet}
          onWatch={() => onWatch(itemFocus)}
          onOpenSeller={openSeller}
          mode="item"
        />
      )}

      {sellerFocus && !itemFocus && (
        <DetailSheet
          title={sellerDisplayName}
          subtitle={
            sellerFocus.sellerId && /^\d+$/.test(sellerFocus.sellerId)
              ? `Seller #${sellerFocus.sellerId} · ${sellerListings.length} listings`
              : `${sellerListings.length} listings in feed`
          }
          rows={sellerListings}
          watching={false}
          onClose={closeSheet}
          onOpenItem={openItem}
          mode="seller"
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
  onOpenItem,
  onOpenSeller,
  onWatch,
  watch,
}: {
  rows: RecentSale[];
  onOpenItem: (id: string) => void;
  onOpenSeller: (row: RecentSale) => void;
  onWatch: (id: string) => void;
  watch: string[];
}) {
  if (!rows.length) {
    return (
      <div className="rounded-3xl border border-border/40 bg-surface/40 px-6 py-16 text-center text-sm text-muted">
        Waiting for listings…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border/40 bg-surface/35">
      <div className="max-h-[calc(100dvh-15rem)] divide-y divide-border/25 overflow-y-auto">
        {rows.map((r) => {
          const seller = (r.sellerName ?? r.seller ?? "").trim() || "Unknown";
          const unit$ = r.unitUsd ?? null;
          const lot$ = r.usdTotal ?? null;
          const qtyLabel = formatQtyCompact(r.quantity);
          const canOpenSeller = Boolean(
            (r.sellerName ?? r.seller ?? "").trim() || r.sellerId != null,
          );

          return (
            <div
              key={r.id}
              className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5"
            >
              <button
                type="button"
                onClick={() => onOpenItem(r.itemType)}
                className="shrink-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky"
                aria-label={`Open ${r.name}`}
              >
                <ItemIcon itemId={r.itemType} name={r.name} size={52} clear />
              </button>

              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onOpenItem(r.itemType)}
                  className="block w-full truncate text-left text-[16px] font-semibold tracking-tight hover:text-sky-hi"
                >
                  <span className="font-mono tabular-nums text-sky-hi">
                    {qtyLabel}
                  </span>{" "}
                  {r.name}
                </button>

                {/* Large touch target for seller — separate from item */}
                <button
                  type="button"
                  disabled={!canOpenSeller}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenSeller(r);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={cn(
                    "mt-0.5 flex min-h-8 max-w-full items-center gap-1 rounded-lg px-0 py-0.5 text-left text-[12px]",
                    canOpenSeller
                      ? "text-sky-hi underline decoration-sky/40 underline-offset-2 hover:bg-sky/10 hover:decoration-sky active:bg-sky/15"
                      : "cursor-default text-muted",
                  )}
                  aria-label={`View all listings by ${seller}`}
                >
                  <span className="truncate font-medium">{seller}</span>
                  {r.sellerId != null && (
                    <span className="shrink-0 font-mono text-muted">
                      #{r.sellerId}
                    </span>
                  )}
                  <span className="shrink-0 text-muted/70">
                    · {new Date(r.timestamp).toLocaleTimeString()}
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => onOpenItem(r.itemType)}
                className="shrink-0 text-right"
              >
                <div className="font-mono text-[17px] font-semibold tabular-nums text-sky-hi">
                  {unit$ ? formatUsdShort(unit$) : "—"}
                  <span className="text-[11px] font-medium text-muted">
                    /u
                  </span>
                </div>
                {lot$ && (
                  <div className="font-mono text-[12px] tabular-nums text-muted">
                    lot {formatUsdShort(lot$)}
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => onWatch(r.itemType)}
                className="rounded-xl p-2 text-muted hover:bg-raised hover:text-sky"
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
      <div className="rounded-3xl border border-border/40 bg-surface/40 px-6 py-16 text-center text-sm text-muted">
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border/40 bg-surface/35">
      <div className="max-h-[calc(100dvh-15rem)] divide-y divide-border/25 overflow-y-auto">
        {rows.map((row) => {
          const qtyLabel =
            row.totalQty != null ? formatQtyCompact(row.totalQty) : null;
          return (
            <div
              key={row.id}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-sky/[0.04]"
            >
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <ItemIcon itemId={row.id} name={row.name} size={52} clear />
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-semibold">
                    {qtyLabel ? (
                      <>
                        <span className="font-mono tabular-nums text-sky-hi">
                          {qtyLabel}
                        </span>{" "}
                      </>
                    ) : null}
                    {row.name}
                  </div>
                  <div className="text-[12px] text-muted">
                    {row.listings ?? 0} listings
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="shrink-0 text-right"
              >
                <div className="font-mono text-[17px] font-semibold tabular-nums text-sky-hi">
                  {row.lowestUsdPerUnit
                    ? formatUsdShort(row.lowestUsdPerUnit)
                    : "—"}
                  <span className="text-[11px] font-medium text-muted">
                    /u
                  </span>
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
          );
        })}
      </div>
    </div>
  );
}

function DetailSheet({
  title,
  subtitle,
  itemId,
  rows,
  watching,
  onClose,
  onWatch,
  onOpenSeller,
  onOpenItem,
  mode,
}: {
  title: string;
  subtitle: string;
  itemId?: string;
  rows: RecentSale[];
  watching: boolean;
  onClose: () => void;
  onWatch?: () => void;
  onOpenSeller?: (row: RecentSale) => void;
  onOpenItem?: (id: string) => void;
  mode: "item" | "seller";
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-surface shadow-2xl sm:mr-4 sm:max-h-[90dvh] sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-border/40 p-5">
          {mode === "item" && itemId ? (
            <ItemIcon itemId={itemId} name={title} size={64} clear />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-border/50 bg-surface-2 text-lg font-semibold text-sky-hi">
              {(title || "?")
                .replace(/[^a-zA-Z0-9 ]/g, "")
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? "")
                .join("")
                .slice(0, 2) || "?"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted hover:bg-raised"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
            {mode === "seller" ? "Seller listings" : "Listings"} · {rows.length}
          </p>
          <div className="space-y-2">
            {rows.length === 0 && (
              <p className="text-sm text-muted">None in current feed.</p>
            )}
            {rows.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2/60 px-3.5 py-3"
              >
                <div className="min-w-0">
                  {mode === "seller" ? (
                    <button
                      type="button"
                      onClick={() => onOpenItem?.(s.itemType)}
                      className="text-left text-[15px] font-semibold hover:text-sky-hi"
                    >
                      <span className="font-mono tabular-nums text-sky-hi">
                        {formatQtyCompact(s.quantity)}
                      </span>{" "}
                      {s.name}
                    </button>
                  ) : (
                    <div className="text-[15px] font-semibold">
                      <span className="font-mono tabular-nums text-sky-hi">
                        {formatQtyCompact(s.quantity)}
                      </span>{" "}
                      {title}
                    </div>
                  )}
                  <div className="mt-0.5 truncate text-[12px] text-muted">
                    {mode === "item" ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenSeller?.(s);
                        }}
                        className="min-h-8 rounded-lg font-medium text-sky-hi underline decoration-sky/40 underline-offset-2 hover:bg-sky/10"
                      >
                        {s.sellerName ?? s.seller ?? "—"}
                        {s.sellerId != null ? ` · #${s.sellerId}` : ""}
                      </button>
                    ) : (
                      <span>{new Date(s.timestamp).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[16px] font-semibold tabular-nums text-sky-hi">
                    {s.unitUsd ? formatUsdShort(s.unitUsd) : "—"}
                    <span className="text-[11px] text-muted">/u</span>
                  </div>
                  {s.usdTotal && (
                    <div className="font-mono text-[12px] text-muted">
                      lot {formatUsdShort(s.usdTotal)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {mode === "item" && onWatch && (
          <div className="border-t border-border/40 p-4">
            <button
              type="button"
              onClick={onWatch}
              className={cn(
                "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold",
                watching ? "bg-sky/15 text-sky-hi" : "bg-sky text-[#0a121c]",
              )}
            >
              <Star className={cn("h-4 w-4", watching && "fill-sky")} />
              {watching ? "Watching" : "Watch item"}
            </button>
          </div>
        )}
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
