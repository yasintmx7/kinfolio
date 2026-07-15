"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, RefreshCw, Star, X } from "lucide-react";
import { ItemIcon } from "@/components/items/item-icon";
import {
  useMarketHub,
  type MarketFloorItem,
  type RecentSale,
} from "@/hooks/use-market-hub";
import { useKinsPrice } from "@/hooks/use-kins-price";
import { useToast } from "@/components/feedback/toast";
import {
  formatQtyCompact,
  formatUsdPer1k,
  formatUsdShort,
} from "@/lib/formatting/money";
import { getWatchlist, toggleWatch } from "@/lib/market/watchlist";
import { cn } from "@/lib/utils";

/** market = both lists at once (default) */
type Tab = "market" | "floors" | "watch";

type SellerFocus = {
  sellerId: string | null;
  sellerName: string | null;
};

function parseTab(raw: string | null): Tab {
  if (raw === "floors") return "floors";
  if (raw === "watch") return "watch";
  // listings / activity / sales / empty → dual market view
  return "market";
}

function isLocked(r: RecentSale): boolean {
  if (r.reserved) return true;
  if (r.reservedUntilMs != null && r.reservedUntilMs > Date.now()) return true;
  return false;
}

function lockLabel(r: RecentSale): string {
  if (r.reservedUntilMs != null && r.reservedUntilMs > Date.now()) {
    try {
      return `Locked · until ${new Date(r.reservedUntilMs).toLocaleTimeString()}`;
    } catch {
      return "Locked";
    }
  }
  return "Reserved";
}

/** Lot total USD for display. */
function lotTotal(r: RecentSale): string | null {
  const total = Number(r.usdTotal);
  if (Number.isFinite(total) && total > 0) return String(total);
  const unit = Number(r.unitUsd);
  const qty = Number(r.quantity);
  if (Number.isFinite(unit) && unit > 0 && Number.isFinite(qty) && qty > 0) {
    return String(unit * qty);
  }
  return null;
}

function unitPrice(r: RecentSale): string | null {
  const unit = Number(r.unitUsd);
  if (Number.isFinite(unit) && unit > 0) return String(unit);
  const total = Number(r.usdTotal);
  const qty = Number(r.quantity);
  if (Number.isFinite(total) && total > 0 && Number.isFinite(qty) && qty > 0) {
    return String(total / qty);
  }
  return null;
}

function goldTotal(r: RecentSale): string | null {
  const g = Number(r.priceGold);
  if (Number.isFinite(g) && g > 0) return String(g);
  return null;
}

function MarketHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab = parseTab(rawTab);

  const hub = useMarketHub(10_000);
  const { price, reload: reloadPrice } = useKinsPrice(10_000);
  const { push } = useToast();

  const [q, setQ] = useState("");
  const [watch, setWatch] = useState<string[]>([]);
  const [itemFocus, setItemFocus] = useState<string | null>(null);
  const [sellerFocus, setSellerFocus] = useState<SellerFocus | null>(null);

  useEffect(() => {
    setWatch(getWatchlist());
  }, []);

  // Normalize legacy tabs → market (dual view)
  useEffect(() => {
    if (
      !rawTab ||
      rawTab === "overview" ||
      rawTab === "sales" ||
      rawTab === "listings" ||
      rawTab === "activity"
    ) {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", "market");
      router.replace(`/market?${p.toString()}`);
    }
  }, [rawTab, router, searchParams]);

  useEffect(() => {
    const item = searchParams.get("item");
    const seller = searchParams.get("seller");
    const sellerName = searchParams.get("sellerName");
    if (item) {
      setItemFocus(item);
      setSellerFocus(null);
    } else if (seller || sellerName) {
      setSellerFocus({ sellerId: seller, sellerName: sellerName });
      setItemFocus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kinsUsd = price?.priceUsd ?? hub.kinsUsd ?? undefined;

  const searchMatch = (s: RecentSale, query: string) => {
    const seller = (s.sellerName ?? s.seller ?? "").toLowerCase();
    return (
      s.name.toLowerCase().includes(query) ||
      s.itemType.toLowerCase().includes(query) ||
      seller.includes(query) ||
      String(s.sellerId ?? "").includes(query) ||
      String(s.listingId ?? s.id).includes(query) ||
      (query === "lock" && isLocked(s)) ||
      (query === "locked" && isLocked(s)) ||
      (query === "reserved" && isLocked(s))
    );
  };

  const listingRows = useMemo(() => {
    let list = [...hub.sales];
    const query = q.trim().toLowerCase();
    if (query) list = list.filter((s) => searchMatch(s, query));
    list.sort((a, b) => {
      const la = isLocked(a) ? 1 : 0;
      const lb = isLocked(b) ? 1 : 0;
      if (la !== lb) return la - lb;
      const ua = Number(unitPrice(a));
      const ub = Number(unitPrice(b));
      const aOk = Number.isFinite(ua) ? ua : Number.POSITIVE_INFINITY;
      const bOk = Number.isFinite(ub) ? ub : Number.POSITIVE_INFINITY;
      if (aOk !== bOk) return aOk - bOk;
      return Date.parse(b.timestamp) - Date.parse(a.timestamp);
    });
    return list;
  }, [hub.sales, q]);

  /** Sold-only activity (small card) */
  const soldRows = useMemo(() => {
    let list = [...(hub.sold ?? [])];
    const query = q.trim().toLowerCase();
    if (query) list = list.filter((s) => searchMatch(s, query));
    list.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return list;
  }, [hub.sold, q]);

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

  const lockedCount = useMemo(
    () => hub.sales.filter(isLocked).length,
    [hub.sales],
  );
  const openCount = hub.sales.length - lockedCount;

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
    if (hit?.sellerName ?? hit?.seller)
      return hit.sellerName ?? hit.seller ?? "Seller";
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
    setSellerFocus({ sellerId: id, sellerName: name || null });
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight">
            {tab === "market" && "Market"}
            {tab === "floors" && "Floors"}
            {tab === "watch" && "Watchlist"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tab === "market" &&
              `${hub.sales.length} listings · ${openCount} open · ${(hub.sold ?? []).length} sold · 12s`}
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

      <div className="inline-flex flex-wrap rounded-2xl border border-border/40 bg-surface/50 p-1">
        {(
          [
            ["market", "Market"],
            ["floors", "Floors"],
            ["watch", "Watch"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "min-h-9 rounded-xl px-3.5 text-sm font-medium sm:px-4",
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
          tab === "market"
            ? "Search item, seller, reserved…"
            : "Search items…"
        }
        className="min-h-11 w-full rounded-2xl border border-border/40 bg-surface/60 px-4 text-sm outline-none placeholder:text-muted/50 focus:border-sky/40 focus:ring-2 focus:ring-sky/15"
      />

      {tab === "market" && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
          {/* BIG listings — full open book */}
          <section className="min-w-0 flex-1 overflow-hidden rounded-3xl border border-border/40 bg-surface/35">
            <header className="flex shrink-0 items-baseline justify-between gap-2 border-b border-border/30 px-4 py-3">
              <h2 className="text-[16px] font-semibold tracking-tight">
                Listings
              </h2>
              <p className="truncate text-[11px] text-muted">
                {listingRows.length} · all · lock · cheapest first
              </p>
            </header>
            <ListingList
              rows={listingRows}
              mode="listings"
              onOpenItem={openItem}
              onOpenSeller={openSeller}
              onWatch={onWatch}
              watch={watch}
              compact={false}
              tall
            />
          </section>

          {/* SMALL activity — sold only + seller username */}
          <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[20rem]">
            <section className="overflow-hidden rounded-3xl border border-border/40 bg-surface/50 shadow-sm">
              <header className="border-b border-border/30 px-3.5 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[14px] font-semibold tracking-tight">
                    Activity
                  </h2>
                  <span className="rounded-full bg-forest/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forest">
                    Sold
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {soldRows.length
                    ? `${soldRows.length} recent · seller shown`
                    : "Watching for sales… (needs 2+ live polls)"}
                </p>
              </header>
              <SoldActivityCard
                rows={soldRows}
                onOpenItem={openItem}
                onOpenSeller={openSeller}
              />
            </section>
          </aside>
        </div>
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
          showLock
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
          showLock
        />
      )}

      {hub.error && (
        <p className="text-center text-sm text-loss">{hub.error}</p>
      )}
    </div>
  );
}

/** Compact sold-only activity feed with seller username. */
function SoldActivityCard({
  rows,
  onOpenItem,
  onOpenSeller,
}: {
  rows: RecentSale[];
  onOpenItem: (id: string) => void;
  onOpenSeller: (row: RecentSale) => void;
}) {
  if (!rows.length) {
    return (
      <div className="px-4 py-10 text-center text-[12px] leading-relaxed text-muted">
        No confirmed sales yet.
        <br />
        After ~12s, listings that leave the live book show here with seller name.
      </div>
    );
  }

  return (
    <div className="max-h-[min(42dvh,22rem)] divide-y divide-border/25 overflow-y-auto lg:max-h-[calc(100dvh-14rem)]">
      {rows.map((r) => {
        const seller = (r.sellerName ?? r.seller ?? "").trim() || "Unknown";
        const lot$ = lotTotal(r);
        const unit$ = unitPrice(r);
        const gold$ = goldTotal(r);
        return (
          <div
            key={`${r.id}-${r.timestamp}`}
            className="flex items-start gap-2.5 px-3 py-2.5"
          >
            <button
              type="button"
              onClick={() => onOpenItem(r.itemType)}
              className="shrink-0"
              aria-label={r.name}
            >
              <ItemIcon itemId={r.itemType} name={r.name} size={40} clear />
            </button>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onOpenItem(r.itemType)}
                className="block w-full truncate text-left text-[13px] font-semibold hover:text-sky-hi"
              >
                <span className="font-mono tabular-nums text-sky-hi">
                  {formatQtyCompact(r.quantity)}
                </span>{" "}
                {r.name}
              </button>
              {/* Seller username — always visible on sold cards */}
              <button
                type="button"
                onClick={() => onOpenSeller(r)}
                className="mt-0.5 block max-w-full truncate text-left text-[12px] font-medium text-sky-hi underline decoration-sky/40 underline-offset-2 hover:bg-sky/10"
              >
                {seller}
                {r.sellerId != null ? (
                  <span className="font-mono text-muted"> #{r.sellerId}</span>
                ) : null}
              </button>
              <div className="mt-0.5 text-[10px] text-muted">
                sold · {new Date(r.timestamp).toLocaleTimeString()}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-[13px] font-bold tabular-nums text-sky-hi">
                {lot$
                  ? formatUsdShort(lot$)
                  : unit$
                    ? formatUsdShort(unit$)
                    : gold$
                      ? `${formatQtyCompact(gold$)}g`
                      : "—"}
              </div>
              {unit$ && (
                <div className="font-mono text-[10px] tabular-nums text-muted">
                  {formatUsdPer1k(unit$)}/1k
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PriceBlock({
  lot$,
  unit$,
  gold$,
  locked,
  compact,
}: {
  lot$: string | null;
  unit$: string | null;
  gold$?: string | null;
  locked?: boolean;
  compact?: boolean;
}) {
  // Prefer USD total; fall back to unit total; then gold
  let totalLabel: string;
  if (lot$) totalLabel = formatUsdShort(lot$);
  else if (unit$) totalLabel = formatUsdShort(unit$);
  else if (gold$) totalLabel = `${formatQtyCompact(gold$)}g`;
  else totalLabel = "—";

  const avgLabel = unit$ ? formatUsdPer1k(unit$) : null;

  return (
    <div
      className={cn(
        "shrink-0 whitespace-nowrap text-right",
        "min-w-[5.25rem] sm:min-w-[5.75rem]",
      )}
    >
      <div
        className={cn(
          "font-mono font-bold tabular-nums leading-tight text-sky-hi",
          compact ? "text-[15px] sm:text-[16px]" : "text-[17px]",
          locked && "opacity-60",
        )}
      >
        {totalLabel}
      </div>
      {avgLabel ? (
        <div
          className={cn(
            "font-mono tabular-nums leading-tight text-muted",
            compact ? "text-[11px]" : "text-[12px]",
          )}
        >
          {avgLabel}
          <span className="text-[10px]">/1k</span>
        </div>
      ) : gold$ && lot$ ? (
        <div className="font-mono text-[11px] tabular-nums text-muted">
          {formatQtyCompact(gold$)}g
        </div>
      ) : null}
    </div>
  );
}

function ListingList({
  rows,
  mode,
  onOpenItem,
  onOpenSeller,
  onWatch,
  watch,
  compact = false,
  tall = false,
}: {
  rows: RecentSale[];
  mode: "listings" | "activity";
  onOpenItem: (id: string) => void;
  onOpenSeller: (row: RecentSale) => void;
  onWatch: (id: string) => void;
  watch: string[];
  compact?: boolean;
  /** Full-height main listings panel */
  tall?: boolean;
}) {
  if (!rows.length) {
    return (
      <div className="px-6 py-14 text-center text-sm text-muted">
        {mode === "listings" ? "No listings…" : "Waiting for activity…"}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "divide-y divide-border/25 overflow-y-auto",
        tall
          ? "max-h-[min(78dvh,52rem)] lg:max-h-[calc(100dvh-13rem)]"
          : compact
            ? "max-h-[min(70dvh,36rem)] lg:max-h-[calc(100dvh-16rem)]"
            : "max-h-[calc(100dvh-15rem)]",
      )}
    >
      {rows.map((r) => {
        const seller = (r.sellerName ?? r.seller ?? "").trim() || "Unknown";
        const unit$ = unitPrice(r);
        const lot$ = lotTotal(r);
        const gold$ = goldTotal(r);
        const qtyLabel = formatQtyCompact(r.quantity);
        const locked = isLocked(r);
        const canOpenSeller = Boolean(
          (r.sellerName ?? r.seller ?? "").trim() || r.sellerId != null,
        );
        const iconSize = compact ? 44 : 52;

        return (
          <div
            key={r.id}
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2.5 sm:gap-3 sm:px-3 sm:py-3",
              locked && mode === "listings" && "bg-amber-500/[0.06]",
            )}
          >
            <button
              type="button"
              onClick={() => onOpenItem(r.itemType)}
              className="relative shrink-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky"
              aria-label={`Open ${r.name}`}
            >
              <ItemIcon
                itemId={r.itemType}
                name={r.name}
                size={iconSize}
                clear
              />
              {mode === "listings" && locked && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[#0a121c] shadow">
                  <Lock className="h-3 w-3" strokeWidth={2.5} />
                </span>
              )}
            </button>

            <div className="min-w-0 overflow-hidden">
              <button
                type="button"
                onClick={() => onOpenItem(r.itemType)}
                className="block w-full min-w-0 truncate text-left text-[14px] font-semibold tracking-tight hover:text-sky-hi sm:text-[15px]"
              >
                <span className="font-mono tabular-nums text-sky-hi">
                  {qtyLabel}
                </span>{" "}
                {r.name}
              </button>

              {mode === "listings" && locked && (
                <div className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                  <Lock className="h-2.5 w-2.5" />
                  {lockLabel(r)}
                </div>
              )}

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
                  "mt-0.5 flex min-h-7 max-w-full items-center gap-1 rounded-lg text-left text-[11px] sm:text-[12px]",
                  canOpenSeller
                    ? "text-sky-hi underline decoration-sky/40 underline-offset-2 hover:bg-sky/10"
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

            {/* Fixed price column — never shrinks away */}
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <button
                type="button"
                onClick={() => onOpenItem(r.itemType)}
                className="text-right"
              >
                <PriceBlock
                  lot$={lot$}
                  unit$={unit$}
                  gold$={gold$}
                  locked={locked && mode === "listings"}
                  compact={compact}
                />
                {mode === "listings" && locked && (
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-amber-300/90">
                    Locked
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => onWatch(r.itemType)}
                className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-sky"
                aria-label="Watch"
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5",
                    watch.includes(r.itemType) && "fill-sky text-sky",
                  )}
                />
              </button>
            </div>
          </div>
        );
      })}
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
              className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3.5 hover:bg-sky/[0.04]"
            >
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="shrink-0"
              >
                <ItemIcon itemId={row.id} name={row.name} size={52} clear />
              </button>
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="min-w-0 text-left"
              >
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
              </button>
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="min-w-[5rem] shrink-0 text-right"
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
  showLock,
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
  showLock?: boolean;
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
            {rows.map((s) => {
              const locked = showLock && isLocked(s);
              const lot$ = lotTotal(s);
              const unit$ = unitPrice(s);
              const gold$ = goldTotal(s);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3",
                    locked ? "bg-amber-500/10" : "bg-surface-2/60",
                  )}
                >
                  <div className="min-w-0 flex-1">
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
                    {locked && (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-200">
                        <Lock className="h-3 w-3" />
                        {lockLabel(s)}
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
                  <PriceBlock
                    lot$={lot$}
                    unit$={unit$}
                    gold$={gold$}
                    locked={locked}
                  />
                </div>
              );
            })}
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
