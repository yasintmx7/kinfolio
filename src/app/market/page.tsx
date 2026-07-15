"use client";

import { memo, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, RefreshCw, Star, X } from "lucide-react";
import { ItemIcon } from "@/components/items/item-icon";
import { SellerAvatar } from "@/components/sellers/seller-avatar";
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
import {
  formatUsdMarket,
  listingPriceLabels,
  normalizeListingPrice,
} from "@/lib/market/listing-price";
import { getWatchlist, toggleWatch } from "@/lib/market/watchlist";
import { cn } from "@/lib/utils";

/** market = both lists at once (default) */
type Tab = "market" | "floors" | "watch";
type CurrencyFilter = "all" | "token" | "gold";
type SortFilter = "cheap" | "new" | "qty";
type CategoryFilter =
  | "all"
  | "resource"
  | "tool"
  | "food"
  | "potion"
  | "cosmetic"
  | "mount"
  | "pet"
  | "key"
  | "other";

type SellerFocus = {
  sellerId: string | null;
  sellerName: string | null;
};

const CATEGORY_CHIPS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "resource", label: "Resources" },
  { id: "tool", label: "Tools" },
  { id: "food", label: "Food" },
  { id: "potion", label: "Potions" },
  { id: "cosmetic", label: "Cosmetics" },
  { id: "mount", label: "Mounts" },
  { id: "pet", label: "Pets" },
  { id: "key", label: "Keys" },
  { id: "other", label: "Other" },
];

const RESOURCES = new Set([
  "wood",
  "stone",
  "coal",
  "metal",
  "gold",
  "brute_horn",
  "molten_rock",
]);

const FOOD = new Set([
  "fish",
  "raw_chicken",
  "cooked_chicken",
  "cooked_fish_meat",
]);

function itemCategory(itemType: string): CategoryFilter {
  const t = itemType.toLowerCase();
  if (t.startsWith("cosmetic_")) return "cosmetic";
  if (t.startsWith("mount_") || t.endsWith("_mount")) return "mount";
  if (t.startsWith("pet_") || t.endsWith("_pet")) return "pet";
  if (
    t.startsWith("tool_") ||
    t.includes("pickaxe") ||
    t.includes("axe") ||
    t.includes("sword") ||
    t.includes("hammer") ||
    t.includes("fishing_rod")
  )
    return "tool";
  if (t.startsWith("potion_") || t.includes("potion")) return "potion";
  if (t.includes("key")) return "key";
  if (FOOD.has(t) || t.includes("cooked") || t.includes("food")) return "food";
  if (
    RESOURCES.has(t) ||
    t.includes("wood") ||
    t.includes("stone") ||
    t.includes("coal") ||
    t.includes("metal") ||
    t.includes("ore")
  )
    return "resource";
  return "other";
}

function qtySortKey(r: RecentSale): number {
  const n = Number(r.quantity);
  return Number.isFinite(n) ? n : 0;
}

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

/** Locker display: username when known, else #id */
function lockerLabel(r: RecentSale): string | null {
  const name = r.buyerName?.trim();
  if (name && !name.startsWith("#")) {
    return r.buyerId ? `${name} · #${r.buyerId}` : name;
  }
  if (r.buyerId != null && String(r.buyerId).trim()) return `#${r.buyerId}`;
  if (name) return name;
  return null;
}

function lockLabel(r: RecentSale): string {
  const buyer = lockerLabel(r);
  if (r.reservedUntilMs != null && r.reservedUntilMs > Date.now()) {
    try {
      const until = new Date(r.reservedUntilMs).toLocaleTimeString();
      return buyer
        ? `Locked by ${buyer} · until ${until}`
        : `Locked · until ${until}`;
    } catch {
      return buyer ? `Locked by ${buyer}` : "Locked";
    }
  }
  return buyer ? `Reserved by ${buyer}` : "Reserved";
}

function shortWallet(w: string | null | undefined): string | null {
  if (!w || w.length < 10) return w || null;
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

/** Best buyer label: name → #id → short wallet */
function buyerLabel(r: RecentSale): string | null {
  const locker = lockerLabel(r);
  if (locker) return locker;
  return shortWallet(r.buyerWallet);
}

function sellerDisplay(r: RecentSale): string {
  const name = (r.sellerName ?? r.seller ?? "").trim();
  if (name && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(name)) return name;
  // Raw solana address as seller
  if (r.sellerWallet) return shortWallet(r.sellerWallet) || "Seller";
  if (name) return shortWallet(name) || name;
  if (r.sellerId != null) return `#${r.sellerId}`;
  return "Unknown";
}

/** Single path for row prices — never re-derive ad-hoc in UI. */
function priceOf(r: RecentSale) {
  return listingPriceLabels({
    quantity: r.quantity,
    usdTotal: r.usdTotal,
    unitUsd: r.unitUsd,
    priceGold: r.priceGold,
    currency: r.currency,
  });
}

function unitSortKey(r: RecentSale): number {
  const p = normalizeListingPrice({
    quantity: r.quantity,
    usdTotal: r.usdTotal,
    unitUsd: r.unitUsd,
    priceGold: r.priceGold,
    currency: r.currency,
  });
  return p.unitUsd ?? Number.POSITIVE_INFINITY;
}

function MarketHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab = parseTab(rawTab);

  const hub = useMarketHub(18_000);
  const { price, reload: reloadPrice } = useKinsPrice(10_000);
  const { push } = useToast();

  const [q, setQ] = useState("");
  const [watch, setWatch] = useState<string[]>([]);
  const [itemFocus, setItemFocus] = useState<string | null>(null);
  const [sellerFocus, setSellerFocus] = useState<SellerFocus | null>(null);
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  const [sortFilter, setSortFilter] = useState<SortFilter>("cheap");
  const [hideLocked, setHideLocked] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

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

    if (currencyFilter === "token") {
      list = list.filter((s) => (s.currency ?? "token") === "token");
    } else if (currencyFilter === "gold") {
      list = list.filter((s) => (s.currency ?? "token") === "gold");
    }

    if (hideLocked) {
      list = list.filter((s) => !isLocked(s));
    }

    if (categoryFilter !== "all") {
      list = list.filter((s) => itemCategory(s.itemType) === categoryFilter);
    }

    const query = q.trim().toLowerCase();
    if (query) list = list.filter((s) => searchMatch(s, query));

    list.sort((a, b) => {
      // Open listings first unless user is looking at locks
      if (!hideLocked) {
        const la = isLocked(a) ? 1 : 0;
        const lb = isLocked(b) ? 1 : 0;
        if (la !== lb) return la - lb;
      }
      if (sortFilter === "new") {
        return Date.parse(b.timestamp) - Date.parse(a.timestamp);
      }
      if (sortFilter === "qty") {
        const dQty = qtySortKey(b) - qtySortKey(a);
        if (dQty !== 0) return dQty;
        return unitSortKey(a) - unitSortKey(b);
      }
      // cheap — unit price (gold listings use gold amount as proxy if no USD)
      const ua = unitSortKey(a);
      const ub = unitSortKey(b);
      if (Number.isFinite(ua) && Number.isFinite(ub) && ua !== ub) {
        return ua - ub;
      }
      // gold-only: sort by priceGold / qty
      if ((a.currency ?? "token") === "gold" || (b.currency ?? "token") === "gold") {
        const ga =
          Number(a.priceGold) / Math.max(Number(a.quantity) || 1, 1);
        const gb =
          Number(b.priceGold) / Math.max(Number(b.quantity) || 1, 1);
        if (Number.isFinite(ga) && Number.isFinite(gb) && ga !== gb) {
          return ga - gb;
        }
      }
      return Date.parse(b.timestamp) - Date.parse(a.timestamp);
    });
    return list;
  }, [hub.sales, q, currencyFilter, sortFilter, hideLocked, categoryFilter]);

  const filterCounts = useMemo(() => {
    const base = hub.sales;
    return {
      token: base.filter((s) => (s.currency ?? "token") === "token").length,
      gold: base.filter((s) => (s.currency ?? "token") === "gold").length,
      locked: base.filter(isLocked).length,
    };
  }, [hub.sales]);

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

  const matchSeller = (s: RecentSale) => {
    if (!sellerFocus) return false;
    const id = (sellerFocus.sellerId ?? "").trim();
    const name = (sellerFocus.sellerName ?? "").trim().toLowerCase();
    const wallet = (s.sellerWallet ?? "").trim();
    const sellerField = (s.seller ?? "").trim();

    if (id && s.sellerId != null && String(s.sellerId) === id) return true;
    // Sold rows often only have wallet
    if (id && wallet && wallet === id) return true;
    if (id && sellerField && sellerField === id) return true;
    if (name) {
      const n = (s.sellerName ?? s.seller ?? "").trim().toLowerCase();
      if (n && n === name) return true;
      if (wallet && shortWallet(wallet)?.toLowerCase() === name) return true;
    }
    if (id && !/^\d+$/.test(id)) {
      const n = (s.sellerName ?? s.seller ?? "").trim().toLowerCase();
      if (n === id.toLowerCase()) return true;
      if (wallet && wallet === id) return true;
    }
    return false;
  };

  const sellerListings = useMemo(() => {
    if (!sellerFocus) return [];
    // Open listings + this seller's recent sold (for profile activity)
    const open = hub.sales.filter(matchSeller);
    const sold = (hub.sold ?? []).filter(matchSeller);
    const seen = new Set(open.map((r) => String(r.id)));
    const extra = sold.filter((r) => !seen.has(String(r.id)));
    return [...open, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.sales, hub.sold, sellerFocus]);

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
    const wallet = (row.sellerWallet ?? "").trim() || null;
    const name = (row.sellerName ?? "").trim() || null;
    // Prefer numeric game id; else wallet for sold-feed matching
    const id =
      row.sellerId != null && String(row.sellerId).trim() !== ""
        ? String(row.sellerId)
        : wallet;
    // Display name: username, else short wallet
    const display =
      name ||
      (wallet ? shortWallet(wallet) : null) ||
      (row.seller && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.seller)
        ? row.seller.trim()
        : shortWallet(row.seller));
    if (!display && !id) return;
    setItemFocus(null);
    setSellerFocus({
      sellerId: id,
      sellerName: display || id,
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
    <div className="space-y-4">
      {/* Hero header — first paint for / → market */}
      <section className="card-hero rounded-3xl px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-hi/90">
              Kintara · read-only
            </p>
            <h1 className="mt-1 text-[1.7rem] font-semibold tracking-tight text-primary sm:text-[1.85rem]">
              {tab === "market" && "Market"}
              {tab === "floors" && "Floors"}
              {tab === "watch" && "Watchlist"}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              {tab === "market" &&
                "Live book · listings + recent sold · $ pricing"}
              {tab === "floors" && "Lowest open unit price per item"}
              {tab === "watch" &&
                (watch.length
                  ? `${watch.length} watched items`
                  : "Star items from listings to watch floors")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="rounded-2xl border border-border/45 bg-app/40 px-3.5 py-2 text-right backdrop-blur-sm">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
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
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-sky/30 bg-sky/14 px-3.5 text-sm font-semibold text-sky-hi shadow-[0_0_20px_color-mix(in_srgb,var(--sky)_12%,transparent)] transition-colors hover:bg-sky/22 disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-4 w-4", hub.refreshing && "animate-spin")}
              />
              <span
                className={cn(
                  hub.refreshing ? "live-dot-busy" : "live-dot",
                )}
              />
              Live
            </button>
          </div>
        </div>

        {tab === "market" && (
          <div className="relative z-[1] mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <HeroStat label="Listings" value={String(hub.sales.length)} />
            <HeroStat label="Open" value={String(openCount)} tone="sky" />
            <HeroStat
              label="Locked"
              value={String(lockedCount)}
              tone="amber"
            />
            <HeroStat
              label="Recent sold"
              value={String((hub.sold ?? []).length)}
              tone="forest"
            />
          </div>
        )}
      </section>

      <div className="seg-shell">
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
              "seg-item",
              tab === id && "seg-item-active",
            )}
          >
            {label}
            {id === "watch" && watch.length > 0 ? (
              <span className="ml-1 tabular-nums opacity-80">
                {watch.length}
              </span>
            ) : null}
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
        className="field"
      />

      {tab === "market" && (
        <div className="space-y-3">
          {/* Filters — currency · sort · locked · category */}
          <div className="card-quiet flex flex-col gap-2.5 rounded-2xl p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/80">
                Currency
              </span>
              {(
                [
                  ["all", `All ${hub.sales.length}`],
                  ["token", `Token ${filterCounts.token}`],
                  ["gold", `Gold ${filterCounts.gold}`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCurrencyFilter(id)}
                  className={cn(
                    "chip",
                    currencyFilter === id && "chip-active",
                  )}
                >
                  {label}
                </button>
              ))}
              <span className="mx-1 hidden h-4 w-px bg-border/50 sm:inline" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/80">
                Sort
              </span>
              {(
                [
                  ["cheap", "Cheapest"],
                  ["new", "Newest"],
                  ["qty", "Qty"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSortFilter(id)}
                  className={cn(
                    "chip",
                    sortFilter === id && "chip-active",
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setHideLocked((v) => !v)}
                className={cn(
                  "chip ml-auto inline-flex items-center gap-1.5",
                  hideLocked && "chip-soft-active",
                )}
              >
                <Lock className="h-3 w-3" />
                {hideLocked
                  ? `Hide locked (${filterCounts.locked})`
                  : `Show locked (${filterCounts.locked})`}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/80">
                Type
              </span>
              {CATEGORY_CHIPS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategoryFilter(id)}
                  className={cn(
                    "chip min-h-7 rounded-lg px-2.5 text-[11px]",
                    categoryFilter === id
                      ? "chip-forest-active"
                      : "bg-transparent",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
          {/* BIG listings — full open book */}
          <section className="card-quiet min-w-0 flex-1 overflow-hidden rounded-3xl">
            <header className="panel-head">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-hi shadow-[0_0_8px_var(--sky-hi)]" />
                <h2 className="text-[15px] font-semibold tracking-tight">
                  Listings
                </h2>
              </div>
              <p className="truncate text-[11px] text-muted">
                {listingRows.length} shown
                {currencyFilter !== "all" ? ` · ${currencyFilter}` : ""}
                {` · ${sortFilter === "cheap" ? "cheapest" : sortFilter === "new" ? "newest" : "qty"}`}
                {hideLocked ? " · open only" : ""}
                {categoryFilter !== "all" ? ` · ${categoryFilter}` : ""}
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
            <section className="card-quiet overflow-hidden rounded-3xl">
              <header className="panel-head flex-col !items-stretch gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-forest-hi shadow-[0_0_8px_var(--forest-hi)]" />
                    <h2 className="text-[14px] font-semibold tracking-tight">
                      Activity
                    </h2>
                  </div>
                  <span className="rounded-full bg-forest/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forest-hi">
                    Sold
                  </span>
                </div>
                <p className="text-[11px] text-muted">
                  {soldRows.length
                    ? `${soldRows.length} completed sales`
                    : "Loading completed sales…"}
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
              : "Loading item detail…"
          }
          itemId={itemFocus}
          rows={selected}
          soldRows={(hub.sold ?? []).filter((s) => s.itemType === itemFocus)}
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
              ? `Seller #${sellerFocus.sellerId} · ${sellerListings.length} in feed`
              : `${sellerListings.length} listings · open + recent sold`
          }
          rows={sellerListings}
          watching={false}
          onClose={closeSheet}
          onOpenItem={openItem}
          mode="seller"
          showLock
          sellerId={sellerFocus.sellerId}
          sellerName={sellerFocus.sellerName ?? sellerDisplayName}
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
      <div className="empty-state text-[12px] leading-relaxed">
        No completed sales loaded yet.
        <br />
        Activity shows real sales (not cancels or delists).
      </div>
    );
  }

  return (
    <div className="max-h-[min(42dvh,22rem)] divide-y divide-border/20 overflow-y-auto lg:max-h-[calc(100dvh-14rem)]">
      {rows.map((r) => {
        const seller = sellerDisplay(r);
        const buyer = buyerLabel(r);
        return (
          <div
            key={`${r.id}-${r.timestamp}`}
            className="list-row-cv row-hover flex items-start gap-2.5 px-3 py-2.5"
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
              <button
                type="button"
                onClick={() => onOpenSeller(r)}
                className="mt-0.5 flex max-w-full items-center gap-1.5 text-left text-[12px] font-medium text-sky-hi underline decoration-sky/40 underline-offset-2 hover:bg-sky/10"
              >
                <SellerAvatar
                  sellerId={r.sellerId ?? r.sellerWallet}
                  sellerName={r.sellerName ?? r.seller}
                  size={18}
                />
                <span className="truncate font-mono text-[11px]">{seller}</span>
              </button>
              <div className="mt-0.5 text-[10px] text-muted">
                sold · {new Date(r.timestamp).toLocaleTimeString()}
                {buyer ? (
                  <span className="text-sky-hi">
                    {" · buyer "}
                    <span className="font-mono">{buyer}</span>
                  </span>
                ) : null}
                {r.solscanUrl ? (
                  <>
                    {" · "}
                    <a
                      href={r.solscanUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-hi underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      tx
                    </a>
                  </>
                ) : null}
              </div>
            </div>
            <PriceBlock row={r} compact />
          </div>
        );
      })}
    </div>
  );
}

function PriceBlock({
  row,
  locked,
  compact,
}: {
  row: RecentSale;
  locked?: boolean;
  compact?: boolean;
}) {
  const { lotLabel, per1kLabel, goldLabel } = priceOf(row);
  const isGold = (row.currency ?? "token") === "gold";

  return (
    <div
      className={cn(
        "shrink-0 whitespace-nowrap text-right",
        "min-w-[5.25rem] sm:min-w-[5.75rem]",
      )}
    >
      <div
        className={cn(
          "font-mono font-bold tabular-nums leading-tight",
          isGold ? "text-gold-hi" : "text-sky-hi",
          compact ? "text-[15px] sm:text-[16px]" : "text-[17px]",
          locked && "opacity-60",
        )}
      >
        {lotLabel}
      </div>
      {per1kLabel ? (
        <div
          className={cn(
            "font-mono tabular-nums leading-tight text-muted",
            compact ? "text-[11px]" : "text-[12px]",
          )}
        >
          {per1kLabel}
          <span className="text-[10px]">/1k</span>
        </div>
      ) : goldLabel ? (
        <div className="font-mono text-[11px] tabular-nums text-gold/90">
          {goldLabel}
        </div>
      ) : null}
    </div>
  );
}

const ListingRow = memo(function ListingRow({
  r,
  mode,
  onOpenItem,
  onOpenSeller,
  onWatch,
  watching,
  compact,
}: {
  r: RecentSale;
  mode: "listings" | "activity";
  onOpenItem: (id: string) => void;
  onOpenSeller: (row: RecentSale) => void;
  onWatch: (id: string) => void;
  watching: boolean;
  compact: boolean;
}) {
  const seller = (r.sellerName ?? r.seller ?? "").trim() || "Unknown";
  const qtyLabel = formatQtyCompact(r.quantity);
  const locked = isLocked(r);
  const canOpenSeller = Boolean(
    (r.sellerName ?? r.seller ?? "").trim() ||
      r.sellerId != null ||
      r.sellerWallet,
  );
  const iconSize = compact ? 40 : 48;

  return (
    <div
      className={cn(
        "list-row-cv grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2.5 sm:gap-3 sm:px-3.5 sm:py-3",
        locked && mode === "listings" ? "row-locked" : "row-hover",
      )}
    >
      <button
        type="button"
        onClick={() => onOpenItem(r.itemType)}
        className="relative shrink-0 rounded-2xl ring-offset-2 ring-offset-app transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky"
        aria-label={`Open ${r.name}`}
      >
        <ItemIcon itemId={r.itemType} name={r.name} size={iconSize} clear />
        {mode === "listings" && locked && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-ink shadow-md shadow-amber-500/30">
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
          <span className="font-mono tabular-nums text-sky-hi">{qtyLabel}</span>{" "}
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
            "mt-0.5 flex min-h-7 max-w-full items-center gap-1.5 rounded-lg text-left text-[11px] sm:text-[12px]",
            canOpenSeller
              ? "text-sky-hi underline decoration-sky/40 underline-offset-2 hover:bg-sky/10"
              : "cursor-default text-muted",
          )}
          aria-label={`View all listings by ${seller}`}
        >
          {canOpenSeller && (
            <SellerAvatar
              sellerId={r.sellerId ?? r.sellerWallet}
              sellerName={r.sellerName ?? r.seller}
              size={16}
            />
          )}
          <span className="truncate font-medium">{seller}</span>
          {r.sellerId != null && (
            <span className="shrink-0 font-mono text-muted">#{r.sellerId}</span>
          )}
          <span className="shrink-0 text-muted/70">
            · {new Date(r.timestamp).toLocaleTimeString()}
          </span>
        </button>
        {/* Locker line — who reserved this listing */}
        {mode === "listings" && locked && lockerLabel(r) && (
          <div className="mt-0.5 truncate text-[11px] font-medium text-amber-200">
            <Lock className="mr-1 inline h-3 w-3" />
            Locked by{" "}
            <span className="text-sky-hi">{lockerLabel(r)}</span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <button
          type="button"
          onClick={() => onOpenItem(r.itemType)}
          className="text-right"
        >
          <PriceBlock
            row={r}
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
          className={cn(
            "rounded-xl p-1.5 text-muted transition-colors hover:bg-raised hover:text-sky-hi",
            watching && "bg-sky/10 text-sky-hi",
          )}
          aria-label="Watch"
        >
          <Star
            className={cn(
              "h-3.5 w-3.5",
              watching && "fill-sky-hi text-sky-hi",
            )}
          />
        </button>
      </div>
    </div>
  );
});

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
  tall?: boolean;
}) {
  if (!rows.length) {
    return (
      <div className="empty-state">
        {mode === "listings" ? "No listings match filters…" : "Waiting for activity…"}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "divide-y divide-border/20 overflow-y-auto",
        tall
          ? "max-h-[min(78dvh,52rem)] lg:max-h-[calc(100dvh-13rem)]"
          : compact
            ? "max-h-[min(70dvh,36rem)] lg:max-h-[calc(100dvh-16rem)]"
            : "max-h-[calc(100dvh-15rem)]",
      )}
    >
      {rows.map((r) => (
        <ListingRow
          key={r.id}
          r={r}
          mode={mode}
          onOpenItem={onOpenItem}
          onOpenSeller={onOpenSeller}
          onWatch={onWatch}
          watching={watch.includes(r.itemType)}
          compact={compact}
        />
      ))}
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
    return <div className="card-quiet empty-state rounded-3xl">{empty}</div>;
  }

  return (
    <div className="card-quiet overflow-hidden rounded-3xl">
      <div className="max-h-[calc(100dvh-15rem)] divide-y divide-border/20 overflow-y-auto">
        {rows.map((row) => {
          const qtyLabel =
            row.totalQty != null ? formatQtyCompact(row.totalQty) : null;
          return (
            <div
              key={row.id}
              className="row-hover grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3.5"
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

type BookListingDto = {
  id: string;
  itemType?: string;
  name?: string;
  quantity: string;
  unitUsd: string | null;
  usdTotal: string | null;
  priceGold: string | null;
  currency: string;
  sellerName: string | null;
  sellerId: string | null;
  reserved: boolean;
  reservedUntilMs: number | null;
  buyerId: string | null;
  timestamp: string | null;
};

type ItemStatsSample = {
  date: string;
  unitUsd: string | null;
  sales: number | null;
};

type ItemStatsPayload = {
  itemId: string;
  marketType: string;
  name: string;
  floorUsd: string | null;
  floorPer1kUsd: string | null;
  medianUsd: string | null;
  avg30dUsd: string | null;
  sales30d: number | null;
  openCount: number;
  lockedCount: number;
  samples: ItemStatsSample[];
  listings: BookListingDto[];
  bookSize?: number;
  bookComplete?: boolean;
  coverageNote?: string | null;
};

type SellerScanPayload = {
  sellerId: string | null;
  sellerName: string | null;
  openCount: number;
  lockedCount: number;
  listings: BookListingDto[];
  bookSize?: number;
  bookComplete?: boolean;
  coverageNote?: string | null;
};

/** Stats payload must match the focused item (prevents flash of previous item). */
function statsMatchesItem(
  stats: ItemStatsPayload | null,
  itemId: string | undefined,
): stats is ItemStatsPayload {
  if (!stats || !itemId) return false;
  const id = itemId.toLowerCase();
  const dashed = id.replace(/_/g, "-");
  const underscored = id.replace(/-/g, "_");
  const candidates = [
    stats.itemId.toLowerCase(),
    stats.marketType.toLowerCase(),
    stats.marketType.toLowerCase().replace(/_/g, "-"),
  ];
  return (
    candidates.includes(id) ||
    candidates.includes(dashed) ||
    candidates.includes(underscored)
  );
}

function bookListingToSale(
  l: BookListingDto,
  fallbacks: {
    itemType: string;
    name: string;
    sellerName?: string | null;
    sellerId?: string | null;
    lockerName?: string | null;
  },
): RecentSale {
  return {
    id: l.id,
    listingId: l.id,
    name: l.name ?? fallbacks.name,
    itemType: l.itemType ?? fallbacks.itemType,
    quantity: l.quantity,
    unitKins: "0",
    unitUsd: l.unitUsd,
    usdTotal: l.usdTotal,
    priceGold: l.priceGold,
    currency: l.currency ?? "token",
    timestamp: l.timestamp ?? new Date().toISOString(),
    solscanUrl: null,
    sellerName: l.sellerName ?? fallbacks.sellerName ?? null,
    seller: l.sellerName ?? fallbacks.sellerName ?? null,
    sellerId: l.sellerId ?? fallbacks.sellerId ?? null,
    buyerId: l.buyerId,
    buyerName: fallbacks.lockerName ?? null,
    reserved: l.reserved,
    reservedUntilMs: l.reservedUntilMs,
    isSold: false,
  };
}

function CoverageNote({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-border/40 bg-surface-2/50 px-3 py-2 text-[12px] leading-snug text-muted">
      {text}
    </p>
  );
}

function SheetListingRow({
  s,
  title,
  mode,
  showLock,
  onOpenSeller,
  onOpenItem,
}: {
  s: RecentSale;
  title: string;
  mode: "item" | "seller";
  showLock?: boolean;
  onOpenSeller?: (row: RecentSale) => void;
  onOpenItem?: (id: string) => void;
}) {
  const locked = showLock && isLocked(s);
  const sold = Boolean(s.isSold);
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3",
        sold
          ? "bg-forest/10"
          : locked
            ? "bg-amber-500/10"
            : "bg-surface-2/60",
      )}
    >
      <div className="min-w-0 flex-1">
        {mode === "seller" ? (
          <button
            type="button"
            onClick={() => onOpenItem?.(s.itemType)}
            className="flex items-center gap-2 text-left text-[15px] font-semibold hover:text-sky-hi"
          >
            <ItemIcon itemId={s.itemType} name={s.name} size={36} clear />
            <span>
              <span className="font-mono tabular-nums text-sky-hi">
                {formatQtyCompact(s.quantity)}
              </span>{" "}
              {s.name}
            </span>
          </button>
        ) : (
          <div className="text-[15px] font-semibold">
            <span className="font-mono tabular-nums text-sky-hi">
              {formatQtyCompact(s.quantity)}
            </span>{" "}
            {title}
          </div>
        )}
        {sold && (
          <div className="mt-0.5 text-[11px] font-semibold text-forest-hi">
            Sold
            {buyerLabel(s) ? (
              <span className="font-medium text-sky-hi">
                {" · buyer "}
                {buyerLabel(s)}
              </span>
            ) : null}
          </div>
        )}
        {locked && !sold && (
          <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-200">
            <Lock className="h-3 w-3" />
            {lockLabel(s)}
          </div>
        )}
        <div className="mt-0.5 truncate text-[12px] text-muted">
          {mode === "item" && !sold ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenSeller?.(s);
              }}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg font-medium text-sky-hi underline decoration-sky/40 underline-offset-2 hover:bg-sky/10"
            >
              <SellerAvatar
                sellerId={s.sellerId}
                sellerName={s.sellerName ?? s.seller}
                size={20}
              />
              {s.sellerName ?? s.seller ?? "—"}
              {s.sellerId != null ? ` · #${s.sellerId}` : ""}
            </button>
          ) : (
            <span>
              {mode === "item" && (s.sellerName || s.seller) ? (
                <>
                  {s.sellerName ?? s.seller}
                  {s.sellerId != null ? ` · #${s.sellerId}` : ""}
                  {" · "}
                </>
              ) : null}
              {new Date(s.timestamp).toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <PriceBlock row={s} locked={locked && !sold} />
    </div>
  );
}

function DetailSheet({
  title,
  subtitle,
  itemId,
  rows,
  soldRows,
  watching,
  onClose,
  onWatch,
  onOpenSeller,
  onOpenItem,
  mode,
  showLock,
  sellerId,
  sellerName,
}: {
  title: string;
  subtitle: string;
  itemId?: string;
  rows: RecentSale[];
  soldRows?: RecentSale[];
  watching: boolean;
  onClose: () => void;
  onWatch?: () => void;
  onOpenSeller?: (row: RecentSale) => void;
  onOpenItem?: (id: string) => void;
  mode: "item" | "seller";
  showLock?: boolean;
  sellerId?: string | null;
  sellerName?: string | null;
}) {
  const [stats, setStats] = useState<ItemStatsPayload | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [sellerScan, setSellerScan] = useState<SellerScanPayload | null>(null);
  const [sellerScanLoading, setSellerScanLoading] = useState(false);
  const [sellerScanError, setSellerScanError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "item" || !itemId) {
      setStats(null);
      setStatsError(null);
      setStatsLoading(false);
      return;
    }
    let cancelled = false;
    // Drop previous item immediately so we never flash wrong floor/listings
    setStats(null);
    setStatsLoading(true);
    setStatsError(null);
    fetch(`/api/market/items/${encodeURIComponent(itemId)}/stats`)
      .then(async (res) => {
        const body = (await res.json()) as {
          ok?: boolean;
          data?: ItemStatsPayload;
          error?: { message?: string };
        };
        if (!res.ok || !body.ok || !body.data) {
          throw new Error(body.error?.message ?? "Failed to load stats");
        }
        return body.data;
      })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setStats(null);
          setStatsError(e instanceof Error ? e.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, itemId]);

  // Deeper seller inventory from shared book (reuses item-detail cache)
  useEffect(() => {
    if (mode !== "seller") {
      setSellerScan(null);
      setSellerScanError(null);
      setSellerScanLoading(false);
      return;
    }
    const id = (sellerId ?? "").trim();
    const name = (sellerName ?? "").trim();
    if (!id && !name) return;

    let cancelled = false;
    setSellerScan(null);
    setSellerScanLoading(true);
    setSellerScanError(null);
    const qs = new URLSearchParams();
    if (id) qs.set("sellerId", id);
    if (name) qs.set("sellerName", name);
    fetch(`/api/market/sellers/listings?${qs.toString()}`)
      .then(async (res) => {
        const body = (await res.json()) as {
          ok?: boolean;
          data?: SellerScanPayload;
          error?: { message?: string };
        };
        if (!res.ok || !body.ok || !body.data) {
          throw new Error(body.error?.message ?? "Failed to load seller");
        }
        return body.data;
      })
      .then((data) => {
        if (!cancelled) setSellerScan(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSellerScan(null);
          setSellerScanError(
            e instanceof Error ? e.message : "Failed to load",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSellerScanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, sellerId, sellerName]);

  const liveStats = statsMatchesItem(stats, itemId) ? stats : null;
  const displayName = liveStats?.name ?? title;

  // sellerId → name for locker reverse-map (hub already resolves when possible)
  const lockerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.sellerId != null && r.sellerName && !r.sellerName.startsWith("#")) {
        map.set(String(r.sellerId), r.sellerName);
      }
      if (
        r.buyerId != null &&
        r.buyerName &&
        !r.buyerName.startsWith("#")
      ) {
        map.set(String(r.buyerId), r.buyerName);
      }
    }
    return map;
  }, [rows]);

  // Prefer official item listings; merge hub rows for any ids the scan missed
  const openListings = useMemo(() => {
    const hubOpen = rows.filter((r) => !r.isSold);
    if (mode !== "item") return hubOpen;

    if (liveStats?.listings?.length) {
      const fromStats = liveStats.listings.map((l) => {
        const locker =
          l.buyerId != null ? lockerNameById.get(String(l.buyerId)) : null;
        return bookListingToSale(l, {
          itemType: itemId ?? liveStats.itemId,
          name: displayName,
          lockerName: locker,
        });
      });
      const seen = new Set(fromStats.map((r) => String(r.id)));
      for (const r of hubOpen) {
        if (!seen.has(String(r.id))) {
          seen.add(String(r.id));
          fromStats.push(r);
        }
      }
      return fromStats;
    }
    return hubOpen;
  }, [mode, liveStats, rows, itemId, displayName, lockerNameById]);

  /** Seller: book scan + hub open/sold merged */
  const sellerInventory = useMemo(() => {
    if (mode !== "seller") return rows;
    const hubOpen = rows.filter((r) => !r.isSold);
    const hubSold = rows.filter((r) => r.isSold);
    if (!sellerScan?.listings?.length) {
      return rows;
    }
    const fromScan = sellerScan.listings.map((l) =>
      bookListingToSale(l, {
        itemType: l.itemType ?? "unknown",
        name: l.name ?? l.itemType ?? "Item",
        sellerName: sellerName ?? title,
        sellerId: sellerId ?? null,
      }),
    );
    const seen = new Set(fromScan.map((r) => String(r.id)));
    for (const r of hubOpen) {
      if (!seen.has(String(r.id))) {
        seen.add(String(r.id));
        fromScan.push(r);
      }
    }
    // Append sold (not in open book) after open
    const soldExtra = hubSold.filter((r) => !seen.has(String(r.id)));
    return [...fromScan, ...soldExtra];
  }, [mode, rows, sellerScan, sellerName, sellerId, title]);

  const recentSold = useMemo(() => {
    if (mode !== "item") return rows.filter((r) => r.isSold);
    const fromHub = soldRows ?? [];
    return [...fromHub].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
    );
  }, [mode, rows, soldRows]);

  const sellerOpenRows = sellerInventory.filter((r) => !r.isSold);
  const sellerSoldRows = sellerInventory.filter((r) => r.isSold);

  const openCount =
    mode === "item" && liveStats
      ? Math.max(
          liveStats.openCount,
          openListings.filter((r) => !isLocked(r)).length,
        )
      : mode === "seller" && sellerScan
        ? Math.max(
            sellerScan.openCount,
            sellerOpenRows.filter((r) => !isLocked(r)).length,
          )
        : mode === "seller"
          ? sellerOpenRows.filter((r) => !isLocked(r)).length
          : openListings.filter((r) => !isLocked(r)).length;
  const lockedCount =
    mode === "item" && liveStats
      ? Math.max(
          liveStats.lockedCount,
          openListings.filter(isLocked).length,
        )
      : mode === "seller" && sellerScan
        ? Math.max(
            sellerScan.lockedCount,
            sellerOpenRows.filter(isLocked).length,
          )
        : mode === "seller"
          ? sellerOpenRows.filter(isLocked).length
          : openListings.filter(isLocked).length;
  const soldCount =
    mode === "seller" ? sellerSoldRows.length : recentSold.length;

  const liveSubtitle =
    mode === "item" && liveStats?.floorUsd
      ? `Floor ${formatUsdShort(liveStats.floorUsd)}/u · ${formatUsdPer1k(liveStats.floorUsd)}/1k`
      : mode === "seller" && sellerScan
        ? `${sellerOpenRows.length} open in book` +
          (sellerSoldRows.length
            ? ` · ${sellerSoldRows.length} recent sold`
            : "")
        : subtitle;

  const itemEmptyNote = useMemo(() => {
    if (mode !== "item" || statsLoading) return null;
    if (openListings.length > 0) {
      if (liveStats?.coverageNote && liveStats.bookComplete === false) {
        return liveStats.coverageNote;
      }
      return null;
    }
    if (liveStats?.coverageNote) return liveStats.coverageNote;
    if (statsError) return null;
    return "No open listings for this item.";
  }, [mode, statsLoading, openListings.length, liveStats, statsError]);

  const sellerEmptyNote = useMemo(() => {
    if (mode !== "seller" || sellerScanLoading) return null;
    if (sellerOpenRows.length > 0) {
      if (sellerScan?.coverageNote && sellerScan.bookComplete === false) {
        return sellerScan.coverageNote;
      }
      return null;
    }
    if (sellerScan?.coverageNote) return sellerScan.coverageNote;
    if (sellerScanError) return null;
    if (rows.length === 0) {
      return "None in current feed. Open may appear after a deeper book scan.";
    }
    return null;
  }, [
    mode,
    sellerScanLoading,
    sellerOpenRows.length,
    sellerScan,
    sellerScanError,
    rows.length,
  ]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="card-quiet relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border-border/60 shadow-2xl sm:mr-4 sm:max-h-[90dvh] sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-border/35 bg-surface-2/30 p-5">
          {mode === "item" && itemId ? (
            <ItemIcon itemId={itemId} name={displayName} size={64} clear />
          ) : (
            <SellerAvatar
              sellerId={sellerId}
              sellerName={sellerName ?? title}
              size={72}
              profile
            />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{displayName}</h2>
            <p className="text-sm text-muted">{liveSubtitle}</p>
            {mode === "seller" && (
              <p className="mt-1 text-[11px] text-muted">
                <span className="text-sky-hi">{openCount} open</span>
                {soldCount > 0 ? (
                  <>
                    {" · "}
                    <span className="text-forest-hi">{soldCount} sold</span>
                  </>
                ) : null}
              </p>
            )}
            {mode === "item" && (
              <p className="mt-1 text-[11px] text-muted">
                <span className="text-sky-hi">{openCount} open</span>
                {lockedCount > 0 ? (
                  <>
                    {" · "}
                    <span className="text-amber-200">{lockedCount} locked</span>
                  </>
                ) : null}
                {soldCount > 0 ? (
                  <>
                    {" · "}
                    <span className="text-forest-hi">{soldCount} recent sold</span>
                  </>
                ) : null}
              </p>
            )}
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
          {mode === "item" && (
            <div className="mb-4 space-y-3">
              {statsLoading && !liveStats && (
                <p className="text-sm text-muted">Loading floor & 30d stats…</p>
              )}
              {statsError && !liveStats && (
                <p className="text-sm text-loss">{statsError}</p>
              )}
              {liveStats && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <StatChip
                      label="Floor"
                      value={
                        liveStats.floorUsd
                          ? formatUsdShort(liveStats.floorUsd)
                          : "—"
                      }
                      hint={
                        liveStats.floorUsd
                          ? `${formatUsdPer1k(liveStats.floorUsd)}/1k`
                          : undefined
                      }
                    />
                    <StatChip
                      label="Median"
                      value={
                        liveStats.medianUsd
                          ? formatUsdShort(liveStats.medianUsd)
                          : "—"
                      }
                      hint={
                        liveStats.medianUsd
                          ? `${formatUsdPer1k(liveStats.medianUsd)}/1k`
                          : undefined
                      }
                    />
                    <StatChip
                      label="30d avg"
                      value={
                        liveStats.avg30dUsd
                          ? formatUsdShort(liveStats.avg30dUsd)
                          : "—"
                      }
                      hint={
                        liveStats.avg30dUsd
                          ? `${formatUsdPer1k(liveStats.avg30dUsd)}/1k`
                          : undefined
                      }
                    />
                    <StatChip
                      label="30d sales"
                      value={
                        liveStats.sales30d != null
                          ? String(liveStats.sales30d)
                          : "—"
                      }
                    />
                  </div>
                  {liveStats.samples.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                        Recent samples
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {liveStats.samples.slice(0, 8).map((s, i) => (
                          <span
                            key={`${s.date}-${i}`}
                            className="rounded-lg bg-surface-2/80 px-2 py-1 font-mono text-[11px] tabular-nums text-muted"
                          >
                            {s.date.slice(5)}{" "}
                            <span className="text-sky-hi">
                              {s.unitUsd
                                ? formatUsdShort(s.unitUsd)
                                : "—"}
                            </span>
                            {s.sales != null ? (
                              <span className="text-muted"> ·×{s.sales}</span>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {mode === "seller" ? (
            <>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                Seller inventory · {sellerOpenRows.length} open
                {sellerSoldRows.length > 0
                  ? ` · ${sellerSoldRows.length} sold`
                  : ""}
                {sellerScanLoading ? " · scanning book…" : ""}
              </p>
              {sellerScanError && !sellerScan && (
                <p className="mb-2 text-sm text-loss">{sellerScanError}</p>
              )}
              {sellerEmptyNote && (
                <div className="mb-2">
                  <CoverageNote text={sellerEmptyNote} />
                </div>
              )}
              <div className="space-y-2">
                {sellerInventory.length === 0 && !sellerScanLoading && (
                  <p className="text-sm text-muted">
                    No listings found for this seller.
                  </p>
                )}
                {sellerInventory.map((s) => (
                  <SheetListingRow
                    key={`${s.id}-${s.isSold ? "sold" : "open"}`}
                    s={s}
                    title={title}
                    mode="seller"
                    showLock={showLock}
                    onOpenSeller={onOpenSeller}
                    onOpenItem={onOpenItem}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                Open listings · {openListings.length}
                {statsLoading && liveStats ? " · refreshing…" : ""}
              </p>
              {itemEmptyNote && (
                <div className="mb-2">
                  <CoverageNote text={itemEmptyNote} />
                </div>
              )}
              <div className="space-y-2">
                {openListings.length === 0 && statsLoading && (
                  <p className="text-sm text-muted">Loading listings…</p>
                )}
                {openListings.map((s) => (
                  <SheetListingRow
                    key={`${s.id}-open`}
                    s={s}
                    title={displayName}
                    mode="item"
                    showLock={showLock}
                    onOpenSeller={onOpenSeller}
                    onOpenItem={onOpenItem}
                  />
                ))}
              </div>

              {recentSold.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                    Recent sold · {recentSold.length}
                  </p>
                  <div className="space-y-2">
                    {recentSold.map((s) => (
                      <SheetListingRow
                        key={`${s.id}-sold`}
                        s={{ ...s, isSold: true }}
                        title={displayName}
                        mode="item"
                        showLock={false}
                        onOpenSeller={onOpenSeller}
                        onOpenItem={onOpenItem}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {mode === "item" && onWatch && (
          <div className="border-t border-border/40 p-4">
            <button
              type="button"
              onClick={onWatch}
              className={cn(
                "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold",
                watching ? "bg-sky/15 text-sky-hi" : "bg-sky text-ink",
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

function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "sky" | "forest" | "amber";
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-app/45 px-3 py-2.5 shadow-[inset_0_1px_0_color-mix(in_srgb,#fff_4%,transparent)] backdrop-blur-sm">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted/90">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[1.2rem] font-bold tabular-nums tracking-tight",
          tone === "forest" && "text-forest-hi",
          tone === "amber" && "text-amber-200",
          tone === "sky" && "text-sky-hi",
          !tone && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatChip({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-2/70 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[15px] font-bold tabular-nums text-sky-hi">
        {value}
      </p>
      {hint ? (
        <p className="font-mono text-[10px] tabular-nums text-muted">{hint}</p>
      ) : null}
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
