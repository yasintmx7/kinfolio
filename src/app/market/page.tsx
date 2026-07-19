"use client";

import {
  memo,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Lock,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { ItemIcon } from "@/components/items/item-icon";
import { SellerAvatar } from "@/components/sellers/seller-avatar";
import { Card, CardTitle } from "@/components/ui/card";
import {
  useMarketHub,
  type MarketBoardStats,
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
  formatUsdPer1kMarket,
  getListingRateDisplay,
  normalizeListingPrice,
} from "@/lib/market/listing-price";
import {
  formatSellerLabel,
  isSolanaAddress,
  sanitizePersonName,
  shortWallet as shortWalletShared,
} from "@/lib/market/seller-label";
import { listingDedupeKey } from "@/lib/market/sold-filter";
import {
  costVsFloor,
  formatDeltaPct,
  type CostVsFloor,
} from "@/lib/market/cost-vs-floor";
import {
  getWatchlist,
  isInWatchlist,
  toggleWatch,
} from "@/lib/market/watchlist";
import {
  getWatchedSellers,
  isSellerWatched,
  toggleSellerWatch,
  type WatchedSeller,
} from "@/lib/market/seller-watch";
import { getMarketPrefs, setMarketPrefs } from "@/lib/market/market-prefs";
import { STATIC_CATALOG } from "@/data/static-catalog";
import {
  humanizeItemType,
  portfolioIdToMarketType,
} from "@/lib/kintara/item-type-map";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { d } from "@/lib/accounting/decimal";
import { cn } from "@/lib/utils";

/** market = live book; floors = all-items browse (kintaramarket-style) */
type Tab = "market" | "floors" | "watch";
type CurrencyFilter = "all" | "token" | "gold";
type SortFilter = "cheap" | "new" | "qty";
/** All-items board sort */
type BrowseSort = "listings" | "floor" | "name";
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
  if (r.buyerId != null && String(r.buyerId).trim() !== "") return true;
  if (r.reservedUntilMs != null && r.reservedUntilMs > Date.now()) return true;
  return false;
}

/** Match market type (wood) ↔ portfolio id (cooked-fish-meat) for deep links. */
function itemIdsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const na = a.replace(/-/g, "_").toLowerCase();
  const nb = b.replace(/-/g, "_").toLowerCase();
  return na === nb;
}

/** Locker display: username when known, else #id (never full wallet) */
function lockerLabel(r: RecentSale): string | null {
  const name = sanitizePersonName(r.buyerName);
  if (name) {
    return r.buyerId ? `${name} · #${r.buyerId}` : name;
  }
  if (r.buyerId != null && String(r.buyerId).trim()) return `#${r.buyerId}`;
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

function isWalletAddress(s: string | null | undefined): boolean {
  return isSolanaAddress(s);
}

function shortWallet(w: string | null | undefined): string | null {
  return shortWalletShared(w);
}

/**
 * Who bought: username · #gameId · short wallet (never full address).
 * Sources: last locker on listing, then chain buyer wallet.
 */
function buyerLabel(r: RecentSale): string | null {
  const name = sanitizePersonName(r.buyerName);
  const id =
    r.buyerId != null && String(r.buyerId).trim() !== ""
      ? String(r.buyerId).trim()
      : null;
  const wallet =
    shortWallet(r.buyerWallet) ??
    (isSolanaAddress(r.buyerName) ? shortWallet(r.buyerName) : null);

  if (name && id) return `${name} · #${id}`;
  if (name) return name;
  if (id) return `#${id}`;
  return wallet;
}

/** Structured buyer bits for richer sold UI */
function buyerParts(r: RecentSale): {
  name: string | null;
  id: string | null;
  wallet: string | null;
  label: string | null;
} {
  const name = sanitizePersonName(r.buyerName);
  const id =
    r.buyerId != null && String(r.buyerId).trim() !== ""
      ? String(r.buyerId).trim()
      : null;
  const wallet =
    shortWallet(r.buyerWallet) ??
    (isSolanaAddress(r.buyerName) ? shortWallet(r.buyerName) : null);
  return { name, id, wallet, label: buyerLabel(r) };
}

function sellerDisplay(r: RecentSale): string {
  return formatSellerLabel({
    sellerName: r.sellerName,
    seller: r.seller,
    sellerId: r.sellerId,
    sellerWallet: r.sellerWallet,
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
  // Gold without USD: sort after token by gold unit (lot/qty)
  if (p.unitUsd != null) return p.unitUsd;
  if (p.priceGold != null && p.quantity > 0) {
    return 1e12 + p.priceGold / p.quantity;
  }
  return Number.POSITIVE_INFINITY;
}

/** Cheapest → expensive; open (unlocked) first, then locked. */
function sortListingsCheapFirst(rows: RecentSale[]): RecentSale[] {
  return [...rows].sort((a, b) => {
    const la = isLocked(a) ? 1 : 0;
    const lb = isLocked(b) ? 1 : 0;
    if (la !== lb) return la - lb;
    const ua = unitSortKey(a);
    const ub = unitSortKey(b);
    if (ua !== ub) return ua - ub;
    // Same unit price: larger stacks first (better for bulk buyers)
    return qtySortKey(b) - qtySortKey(a);
  });
}

type ItemDepthStats = {
  openUnlocked: number;
  openLocked: number;
  totalQty: number;
  unlockedQty: number;
  lockedQty: number;
  totalLotUsd: number | null;
  floorUnit: number | null;
  floorPer1k: number | null;
  highUnit: number | null;
  highPer1k: number | null;
  medianUnit: number | null;
  medianPer1k: number | null;
  avgUnit: number | null;
  avgPer1k: number | null;
  cheapest3AvgPer1k: number | null;
  spreadPct: number | null;
};

function computeItemDepth(rows: RecentSale[]): ItemDepthStats {
  let totalQty = 0;
  let unlockedQty = 0;
  let lockedQty = 0;
  let openUnlocked = 0;
  let openLocked = 0;
  let lotSum = 0;
  let hasLot = false;
  const units: number[] = [];

  for (const r of rows) {
    const p = normalizeListingPrice({
      quantity: r.quantity,
      usdTotal: r.usdTotal,
      unitUsd: r.unitUsd,
      priceGold: r.priceGold,
      currency: r.currency,
    });
    const qty = p.quantity > 0 ? p.quantity : 0;
    totalQty += qty;
    if (isLocked(r)) {
      openLocked++;
      lockedQty += qty;
    } else {
      openUnlocked++;
      unlockedQty += qty;
    }
    if (p.lotUsd != null) {
      lotSum += p.lotUsd;
      hasLot = true;
    }
    if (p.unitUsd != null && p.unitUsd > 0) units.push(p.unitUsd);
  }

  units.sort((a, b) => a - b);
  const floorUnit = units[0] ?? null;
  const highUnit = units.length ? units[units.length - 1]! : null;
  let medianUnit: number | null = null;
  if (units.length) {
    const mid = Math.floor(units.length / 2);
    medianUnit =
      units.length % 2 === 1
        ? units[mid]!
        : (units[mid - 1]! + units[mid]!) / 2;
  }
  const avgUnit =
    units.length > 0
      ? units.reduce((a, b) => a + b, 0) / units.length
      : null;
  const top3 = units.slice(0, 3);
  const cheapest3Avg =
    top3.length > 0
      ? top3.reduce((a, b) => a + b, 0) / top3.length
      : null;
  const spreadPct =
    floorUnit != null && highUnit != null && floorUnit > 0
      ? ((highUnit - floorUnit) / floorUnit) * 100
      : null;

  return {
    openUnlocked,
    openLocked,
    totalQty,
    unlockedQty,
    lockedQty,
    totalLotUsd: hasLot ? lotSum : null,
    floorUnit,
    floorPer1k: floorUnit != null ? floorUnit * 1000 : null,
    highUnit,
    highPer1k: highUnit != null ? highUnit * 1000 : null,
    medianUnit,
    medianPer1k: medianUnit != null ? medianUnit * 1000 : null,
    avgUnit,
    avgPer1k: avgUnit != null ? avgUnit * 1000 : null,
    cheapest3AvgPer1k: cheapest3Avg != null ? cheapest3Avg * 1000 : null,
    spreadPct,
  };
}

function MarketHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab = parseTab(rawTab);

  // 3s poll → sold on Activity typically within ~3–9s of leaving official book
  // 1.5s pulse (new listings + sold); full book every ~4.5s
  const hub = useMarketHub(1_500);
  const { price, reload: reloadPrice } = useKinsPrice(15_000);
  const { push } = useToast();
  const { summary: portfolioSummary, ready: portfolioReady } =
    usePortfolioContext();

  const [q, setQ] = useState("");
  /** Sold / Activity panel search (independent of main market search when set) */
  const [soldQ, setSoldQ] = useState("");
  const [soldSearchOpen, setSoldSearchOpen] = useState(false);
  const soldSearchRef = useRef<HTMLInputElement>(null);
  const [watch, setWatch] = useState<string[]>([]);
  const [itemFocus, setItemFocus] = useState<string | null>(null);
  const [sellerFocus, setSellerFocus] = useState<SellerFocus | null>(null);
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  /** Default cheap → expensive (unit $/u). "New" / "Qty" still one click. */
  const [sortFilter, setSortFilter] = useState<SortFilter>("cheap");
  /** false = show locked/reserved rows on the listings page (default) */
  const [hideLocked, setHideLocked] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [browseSort, setBrowseSort] = useState<BrowseSort>("listings");
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Extra listings from full-book username/item search (KM open book). */
  const [searchHits, setSearchHits] = useState<RecentSale[]>([]);
  const [searchSellers, setSearchSellers] = useState<
    { sellerName: string; count: number }[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [watchedSellers, setWatchedSellersState] = useState<WatchedSeller[]>(
    [],
  );
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    setWatch(getWatchlist());
    setWatchedSellersState(getWatchedSellers());
    const prefs = getMarketPrefs();
    if (prefs.currencyFilter) setCurrencyFilter(prefs.currencyFilter);
    if (prefs.sortFilter) setSortFilter(prefs.sortFilter);
    if (typeof prefs.hideLocked === "boolean") setHideLocked(prefs.hideLocked);
    if (prefs.categoryFilter) {
      setCategoryFilter(prefs.categoryFilter as CategoryFilter);
    }
    if (prefs.browseSort) setBrowseSort(prefs.browseSort);
    setPrefsReady(true);
  }, []);

  // Persist filters after hydrate
  useEffect(() => {
    if (!prefsReady) return;
    setMarketPrefs({
      currencyFilter,
      sortFilter,
      hideLocked,
      categoryFilter,
      browseSort,
    });
  }, [
    prefsReady,
    currencyFilter,
    sortFilter,
    hideLocked,
    categoryFilter,
    browseSort,
  ]);

  // Full open-book search when typing a query (hub only has ~cheap subset)
  useEffect(() => {
    const query = q.trim();
    if (tab !== "market" || query.length < 2) {
      setSearchHits([]);
      setSearchSellers([]);
      setSearchNote(null);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/market/search?q=${encodeURIComponent(query)}&limit=200`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (res) => {
          const body = (await res.json()) as {
            ok?: boolean;
            data?: {
              listings?: RecentSale[];
              sellers?: { sellerName: string; count: number }[];
              note?: string;
              count?: number;
            };
          };
          if (!res.ok || !body.ok) {
            throw new Error("search failed");
          }
          return body.data;
        })
        .then((data) => {
          if (cancelled) return;
          setSearchHits(data?.listings ?? []);
          setSearchSellers(data?.sellers ?? []);
          setSearchNote(data?.note ?? null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setSearchHits([]);
          setSearchSellers([]);
          setSearchNote(null);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(t);
    };
  }, [q, tab]);

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

  // Shareable deep links: ?item=gold · ?seller= · ?sellerName= · ?q=
  useEffect(() => {
    const item = searchParams.get("item");
    const seller = searchParams.get("seller");
    const sellerName = searchParams.get("sellerName");
    const qParam = searchParams.get("q");
    if (qParam != null && qParam !== "") setQ(qParam);
    if (item) {
      setItemFocus(item);
      setSellerFocus(null);
    } else if (seller || sellerName) {
      setSellerFocus({ sellerId: seller, sellerName: sellerName });
      setItemFocus(null);
    } else {
      setItemFocus(null);
      setSellerFocus(null);
    }
  }, [searchParams]);

  /** Portfolio avg USD/unit keyed by market type + portfolio id */
  const costByKey = useMemo(() => {
    const m = new Map<string, { avgUsd: number; qty: string }>();
    if (!portfolioReady) return m;
    for (const pos of portfolioSummary.positions) {
      if (d(pos.quantity).lte(0)) continue;
      const avg = Number(pos.averageUsdPerItem);
      if (!Number.isFinite(avg) || avg <= 0) continue;
      const entry = { avgUsd: avg, qty: pos.quantity };
      m.set(pos.itemId, entry);
      const mt = portfolioIdToMarketType(pos.itemId, STATIC_CATALOG);
      m.set(mt, entry);
      m.set(mt.replace(/_/g, "-"), entry);
      m.set(pos.itemId.replace(/-/g, "_"), entry);
    }
    return m;
  }, [portfolioReady, portfolioSummary.positions]);

  function replaceMarketQuery(
    patch: Record<string, string | null | undefined>,
  ) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/market?${p.toString()}`, { scroll: false });
  }

  const kinsUsd = price?.priceUsd ?? hub.kinsUsd ?? undefined;

  const searchMatch = (s: RecentSale, query: string) => {
    const qn = query.trim().toLowerCase();
    if (!qn) return true;
    const idQ = qn.replace(/^#/, "");
    const sellerName = (s.sellerName ?? "").toLowerCase();
    const sellerField = (s.seller ?? "").toLowerCase();
    const sellerLabel = sellerDisplay(s).toLowerCase();
    const wallet = (s.sellerWallet ?? "").toLowerCase();
    const buyerName = (s.buyerName ?? "").toLowerCase();
    const buyerWallet = (s.buyerWallet ?? "").toLowerCase();
    const short =
      wallet.length > 8
        ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}`.toLowerCase()
        : "";
    const buyerShort =
      buyerWallet.length > 8
        ? `${buyerWallet.slice(0, 4)}…${buyerWallet.slice(-4)}`.toLowerCase()
        : "";
    return (
      s.name.toLowerCase().includes(qn) ||
      s.itemType.toLowerCase().includes(qn) ||
      s.itemType.replace(/_/g, " ").includes(qn) ||
      s.itemType.replace(/_/g, "-").includes(qn) ||
      sellerName.includes(qn) ||
      sellerField.includes(qn) ||
      sellerLabel.includes(qn) ||
      // Username search: strip # from #12345
      String(s.sellerId ?? "").includes(idQ) ||
      wallet.includes(qn) ||
      short.includes(qn) ||
      // Sold: who bought
      buyerName.includes(qn) ||
      String(s.buyerId ?? "").includes(idQ) ||
      buyerWallet.includes(qn) ||
      buyerShort.includes(qn) ||
      String(s.listingId ?? s.id).includes(qn) ||
      (qn === "lock" && isLocked(s)) ||
      (qn === "locked" && isLocked(s)) ||
      (qn === "reserved" && isLocked(s))
    );
  };

  const listingRows = useMemo(() => {
    // Merge live hub book + full-book search hits (seller/item may be outside cheap feed)
    const byId = new Map<string, RecentSale>();
    for (const row of hub.sales) {
      byId.set(String(row.id), row);
    }
    if (q.trim().length >= 2) {
      for (const row of searchHits) {
        const id = String(row.id);
        const prev = byId.get(id);
        if (!prev) {
          byId.set(id, row);
          continue;
        }
        // Prefer row with seller name / lock detail
        byId.set(id, {
          ...prev,
          ...row,
          sellerName: row.sellerName ?? prev.sellerName,
          seller: row.seller ?? prev.seller,
          sellerId: row.sellerId ?? prev.sellerId,
          reserved: Boolean(prev.reserved || row.reserved),
          reservedUntilMs:
            Math.max(prev.reservedUntilMs ?? 0, row.reservedUntilMs ?? 0) ||
            null,
          buyerId: row.buyerId ?? prev.buyerId,
        });
      }
    }
    let list = [...byId.values()];

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
      // Do NOT pin locks above newest — that hid "latest" under reserved rows.
      // Locks stay visible with amber styling when hideLocked is off.
      if (sortFilter === "new") {
        return Date.parse(b.timestamp) - Date.parse(a.timestamp);
      }
      if (sortFilter === "qty") {
        const dQty = qtySortKey(b) - qtySortKey(a);
        if (dQty !== 0) return dQty;
        return unitSortKey(a) - unitSortKey(b);
      }
      // cheap — open first (locks last), then unit price
      if (!hideLocked) {
        const la = isLocked(a) ? 1 : 0;
        const lb = isLocked(b) ? 1 : 0;
        if (la !== lb) return la - lb;
      }
      const ua = unitSortKey(a);
      const ub = unitSortKey(b);
      if (Number.isFinite(ua) && Number.isFinite(ub) && ua !== ub) {
        return ua - ub;
      }
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
  }, [
    hub.sales,
    searchHits,
    q,
    currencyFilter,
    sortFilter,
    hideLocked,
    categoryFilter,
  ]);

  const filterCounts = useMemo(() => {
    const base = hub.sales;
    return {
      token: base.filter((s) => (s.currency ?? "token") === "token").length,
      gold: base.filter((s) => (s.currency ?? "token") === "gold").length,
      locked: base.filter(isLocked).length,
    };
  }, [hub.sales]);

  /** Sold-only activity (small card) — soldQ overrides main q when typed */
  const soldRows = useMemo(() => {
    let list = [...(hub.sold ?? [])];
    const query = (soldQ.trim() || q.trim()).toLowerCase();
    if (query) list = list.filter((s) => searchMatch(s, query));
    list.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return list;
  }, [hub.sold, q, soldQ]);

  /**
   * All-items board — same data as kintaramarket.xyz /api/market
   * (listings, totalQty, floor, token/gold split). Click → full price list.
   */
  const browseItems = useMemo(() => {
    type BrowseRow = MarketFloorItem & {
      category?: string;
      hasLiveFloor: boolean;
    };

    let list: BrowseRow[] = hub.floors.map((f) => ({
      ...f,
      category: itemCategory(f.id),
      hasLiveFloor: (f.listings ?? 0) > 0 || f.lowestUsdPerUnit != null,
      // Prefer wiki catalog name when we have a portfolio match
      name: (() => {
        const pid = f.portfolioItemId;
        if (pid) {
          const cat = STATIC_CATALOG.find((c) => c.id === pid);
          if (cat?.name) return cat.name;
        }
        return f.name || humanizeItemType(f.id);
      })(),
    }));

    if (tab === "watch") {
      // Match market type ↔ portfolio id (cooked_fish_meat / cooked-fish-meat)
      const matched = list.filter((i) =>
        isInWatchlist(watch, i.id, [i.portfolioItemId]),
      );
      // Keep starred ids even when floors feed is partial
      const stubs: BrowseRow[] = [];
      for (const w of watch) {
        if (matched.some((i) => isInWatchlist([w], i.id, [i.portfolioItemId]))) {
          continue;
        }
        stubs.push({
          id: w,
          name: humanizeItemType(w),
          portfolioItemId: undefined,
          listings: 0,
          hasLiveFloor: false,
          category: itemCategory(w),
        });
      }
      list = [...matched, ...stubs];
    }
    if (categoryFilter !== "all" && (tab === "floors" || tab === "watch")) {
      list = list.filter((i) => {
        const cat = i.category ?? itemCategory(i.id);
        return cat === categoryFilter;
      });
    }
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(query) ||
          i.id.toLowerCase().includes(query) ||
          (i.portfolioItemId?.toLowerCase().includes(query) ?? false),
      );
    }
    return list.sort((a, b) => {
      if (browseSort === "name") {
        return a.name.localeCompare(b.name);
      }
      if (browseSort === "floor") {
        const pa =
          a.lowestUsdPerUnit != null ? Number(a.lowestUsdPerUnit) : Infinity;
        const pb =
          b.lowestUsdPerUnit != null ? Number(b.lowestUsdPerUnit) : Infinity;
        if (pa !== pb) return pa - pb;
        return (b.listings ?? 0) - (a.listings ?? 0);
      }
      // listings (default) — kintaramarket style
      const la = a.listings ?? 0;
      const lb = b.listings ?? 0;
      if (la !== lb) return lb - la;
      const pa =
        a.lowestUsdPerUnit != null ? Number(a.lowestUsdPerUnit) : Infinity;
      const pb =
        b.lowestUsdPerUnit != null ? Number(b.lowestUsdPerUnit) : Infinity;
      if (pa !== pb && Number.isFinite(pa) && Number.isFinite(pb)) return pa - pb;
      return a.name.localeCompare(b.name);
    });
  }, [hub.floors, q, tab, watch, categoryFilter, browseSort]);

  const lockedCount = useMemo(
    () => hub.sales.filter(isLocked).length,
    [hub.sales],
  );
  const openCount = hub.sales.length - lockedCount;

  const selected = useMemo(
    () =>
      itemFocus
        ? hub.sales.filter(
            (s) =>
              itemIdsMatch(s.itemType, itemFocus) ||
              (s.portfolioItemId != null &&
                itemIdsMatch(s.portfolioItemId, itemFocus)),
          )
        : [],
    [hub.sales, itemFocus],
  );
  const selectedFloor = itemFocus
    ? hub.floors.find(
        (f) =>
          itemIdsMatch(f.id, itemFocus) ||
          (f.portfolioItemId != null &&
            itemIdsMatch(f.portfolioItemId, itemFocus)),
      )
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
    if (name && !name.startsWith("#")) {
      const n = (s.sellerName ?? s.seller ?? "").trim().toLowerCase();
      // Exact name for focused seller sheet (not reverse substring)
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
    // Open listings + this seller's recent sold (for profile activity).
    // Dedupe by listing id so a false/early sale never appears twice
    // (open + "Sold") for the same marketplace lot.
    const open = hub.sales.filter(matchSeller).map((r) => ({
      ...r,
      isSold: false as const,
    }));
    const sold = (hub.sold ?? []).filter(matchSeller);
    const seen = new Set<string>();
    for (const r of open) {
      seen.add(listingDedupeKey(r));
      seen.add(`id:${String(r.id)}`);
      if (r.listingId) seen.add(`id:${String(r.listingId)}`);
    }
    const extra = sold.filter((r) => {
      const keys = [
        listingDedupeKey(r),
        `id:${String(r.id)}`,
        r.listingId ? `id:${String(r.listingId)}` : "",
      ].filter(Boolean);
      return !keys.some((k) => seen.has(k));
    });
    return [...open, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.sales, hub.sold, sellerFocus]);

  const sellerDisplayName = useMemo(() => {
    if (!sellerFocus) return "Seller";
    // Never trust raw hit.seller / sellerName (may be a wallet)
    const hit = sellerListings[0];
    return formatSellerLabel({
      sellerName:
        sanitizePersonName(sellerFocus.sellerName) ??
        sanitizePersonName(hit?.sellerName) ??
        null,
      seller: sanitizePersonName(hit?.seller) ?? null,
      sellerId: sellerFocus.sellerId ?? hit?.sellerId,
      sellerWallet: hit?.sellerWallet ?? null,
    });
  }, [sellerFocus, sellerListings]);

  function setTab(next: Tab) {
    setItemFocus(null);
    setSellerFocus(null);
    replaceMarketQuery({
      tab: next,
      item: null,
      seller: null,
      sellerName: null,
    });
  }

  function openItem(id: string) {
    setSellerFocus(null);
    setItemFocus(id);
    // Shareable deep link — keep current tab when possible
    replaceMarketQuery({
      tab: tab || "floors",
      item: id,
      seller: null,
      sellerName: null,
    });
  }

  function openSeller(row: RecentSale) {
    const wallet =
      (row.sellerWallet ?? "").trim() ||
      (isSolanaAddress(row.seller) ? String(row.seller).trim() : null) ||
      (isSolanaAddress(row.sellerName) ? String(row.sellerName).trim() : null) ||
      null;
    const name = sanitizePersonName(row.sellerName ?? row.seller);
    // Prefer numeric game id; else wallet for sold-feed matching only
    const id =
      row.sellerId != null && String(row.sellerId).trim() !== ""
        ? String(row.sellerId)
        : wallet;
    const display = formatSellerLabel({
      sellerName: name,
      sellerId: row.sellerId,
      sellerWallet: wallet,
    });
    if (display === "Seller" && !id) return;
    setItemFocus(null);
    // Real name only for sellerName query — never #id or wallet (breaks KM name lookup)
    setSellerFocus({
      sellerId: id,
      sellerName: name,
    });
    replaceMarketQuery({
      tab: tab || "market",
      item: null,
      seller: id,
      sellerName: name,
    });
  }

  function openSellerByName(name: string, sellerId?: string | null) {
    const n = sanitizePersonName(name) ?? name.trim();
    if (!n) return;
    setItemFocus(null);
    setSellerFocus({ sellerId: sellerId ?? null, sellerName: n });
    replaceMarketQuery({
      tab: "market",
      item: null,
      seller: sellerId ?? null,
      sellerName: n,
    });
  }

  function closeSheet() {
    setItemFocus(null);
    setSellerFocus(null);
    replaceMarketQuery({
      item: null,
      seller: null,
      sellerName: null,
    });
  }

  function onWatch(id: string, portfolioItemId?: string | null) {
    if (!id?.trim()) return;
    const next = toggleWatch(id, [portfolioItemId]);
    setWatch(next);
    push(
      isInWatchlist(next, id, [portfolioItemId]) ? "Watching" : "Removed",
      "ok",
    );
  }

  function onWatchSeller(name: string, sellerId?: string | null) {
    const n = sanitizePersonName(name) ?? name.trim();
    if (!n || n === "Seller") return;
    const next = toggleSellerWatch(n, sellerId);
    setWatchedSellersState(next);
    const on = next.some((s) => s.name.toLowerCase() === n.toLowerCase());
    push(on ? `Watching ${n}` : `Unwatched ${n}`, "ok");
  }

  /** Live open lots from watched sellers (Watch tab). */
  const watchedSellerListings = useMemo(() => {
    if (tab !== "watch" || watchedSellers.length === 0) return [];
    const names = new Set(
      watchedSellers.map((s) => s.name.trim().toLowerCase()).filter(Boolean),
    );
    const ids = new Set(
      watchedSellers
        .map((s) => (s.sellerId != null ? String(s.sellerId) : ""))
        .filter((x) => /^\d+$/.test(x)),
    );
    return hub.sales
      .filter((s) => {
        const n = sanitizePersonName(s.sellerName ?? s.seller)?.toLowerCase();
        if (n && names.has(n)) return true;
        if (s.sellerId != null && ids.has(String(s.sellerId))) return true;
        return false;
      })
      .slice(0, 60);
  }, [tab, watchedSellers, hub.sales]);

  const advancedActive = categoryFilter !== "all" || sortFilter === "qty";

  const pageTitle =
    tab === "market"
      ? "Market"
      : tab === "floors"
        ? "All items"
        : "Watchlist";

  return (
    <div className="space-y-3">
      <p className="px-0.5 text-[11px] leading-relaxed text-muted/80">
        Live book is a partial open market (~1–1.2k lots, not every listing).
        Sold history covers recent hours. Username search also scans the full
        kintaramarket open dump.
      </p>

      {/* Compact pro toolbar */}
      <header className="card-quiet flex flex-wrap items-center gap-2.5 rounded-2xl px-3 py-2.5 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              hub.refreshing ? "live-dot-busy" : "live-dot",
            )}
          />
          <h1 className="truncate text-[1.15rem] font-semibold tracking-tight sm:text-[1.25rem]">
            {pageTitle}
          </h1>
        </div>

        {/* Desktop tabs (mobile uses bottom nav) */}
        <div className="seg-shell hidden md:inline-flex">
          {(
            [
              ["market", "Market"],
              ["floors", "All items"],
              ["watch", "Watch"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn("seg-item", tab === id && "seg-item-active")}
            >
              {label}
              {id === "floors" && browseItems.length > 0 ? (
                <span className="ml-1 tabular-nums opacity-80">
                  {browseItems.filter((i) => (i.listings ?? 0) > 0).length}
                </span>
              ) : null}
              {id === "watch" &&
              (watch.length > 0 || watchedSellers.length > 0) ? (
                <span className="ml-1 tabular-nums opacity-80">
                  {watch.length + watchedSellers.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="rounded-xl border border-border/40 bg-app/40 px-2.5 py-1.5 text-right">
            <div className="text-[9px] font-medium uppercase tracking-wider text-muted">
              KINS
            </div>
            <div className="font-mono text-[13px] font-semibold tabular-nums text-sky-hi sm:text-sm">
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
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border/50 bg-surface-2/80 px-2.5 text-[13px] font-medium text-muted transition-colors hover:border-sky/30 hover:text-sky-hi disabled:opacity-50"
            aria-label="Refresh market"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", hub.refreshing && "animate-spin")}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {/* Sticky search + primary filters — search always full width */}
      <div className="sticky top-[3.25rem] z-20 space-y-2 rounded-2xl border border-border/35 bg-app/90 p-2.5 backdrop-blur-xl md:top-2">
        {/* Row 1: search bar never shrinks when results/filters appear */}
        <div className="flex w-full min-w-0 items-stretch gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                tab === "market"
                  ? "Search item, seller, reserved…"
                  : tab === "floors"
                    ? "Search all items…"
                    : "Search watchlist…"
              }
              className="field min-h-11 w-full min-w-0 pl-10 pr-10 text-[15px]"
              aria-label="Search market"
            />
            {q.trim() ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-primary"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Row 2: search status + seller chips (below bar, never beside it) */}
        {tab === "market" && q.trim().length >= 2 && (
          <div className="w-full min-w-0 space-y-2 px-0.5">
            <p className="text-[11px] text-muted">
              {searchLoading
                ? "Searching full open book for seller/item…"
                : searchNote
                  ? searchNote
                  : listingRows.length
                    ? `${listingRows.length} match${listingRows.length === 1 ? "" : "es"} (live book + full search)`
                    : "No matches in live book or open listings"}
            </p>
            {searchSellers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {searchSellers.slice(0, 12).map((s) => (
                  <div
                    key={s.sellerName}
                    className="inline-flex items-center gap-1 rounded-xl border border-border/50 bg-surface-2/80 pl-2 pr-1 py-1"
                  >
                    <button
                      type="button"
                      className="text-xs font-medium text-sky-hi hover:underline"
                      onClick={() => openSellerByName(s.sellerName)}
                    >
                      {s.sellerName}
                      <span className="ml-1 font-mono text-[10px] text-muted">
                        ×{s.count}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-1.5 py-0.5 text-[10px] text-muted hover:bg-sky/15 hover:text-sky-hi"
                      onClick={() => onWatchSeller(s.sellerName)}
                    >
                      ★
                    </button>
                    <a
                      href={`/sellers/${encodeURIComponent(s.sellerName)}`}
                      className="rounded-lg px-1.5 py-0.5 text-[10px] text-muted hover:bg-sky/15 hover:text-sky-hi"
                    >
                      Profile
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Row 3: filter chips — own row so they never squeeze the search field */}
        {(tab === "floors" || tab === "watch") && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
            {(
              [
                ["listings", "Listings"],
                ["floor", "Cheapest"],
                ["name", "A–Z"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBrowseSort(id)}
                className={cn(
                  "chip min-h-9",
                  browseSort === id && "chip-active",
                )}
              >
                {label}
              </button>
            ))}
            <span className="mx-0.5 hidden h-4 w-px bg-border/50 sm:inline" />
            {CATEGORY_CHIPS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategoryFilter(id)}
                className={cn(
                  "chip min-h-9",
                  categoryFilter === id && "chip-active",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {tab === "market" && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
            {(
              [
                ["all", "All"],
                ["token", "Token"],
                ["gold", "Gold"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCurrencyFilter(id)}
                className={cn(
                  "chip min-h-9",
                  currencyFilter === id && "chip-active",
                )}
              >
                {label}
              </button>
            ))}
            <span className="mx-0.5 hidden h-4 w-px bg-border/50 sm:inline" />
            {(
              [
                ["cheap", "Cheap"],
                ["new", "New"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSortFilter(id)}
                className={cn(
                  "chip min-h-9",
                  sortFilter === id && "chip-active",
                )}
              >
                {label}
              </button>
            ))}
            {/* Locked are live in the feed — this only toggles visibility */}
            <button
              type="button"
              onClick={() => setHideLocked((v) => !v)}
              className={cn(
                "chip min-h-9 inline-flex items-center gap-1.5",
                !hideLocked
                  ? "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40"
                  : "text-muted",
              )}
              title={
                hideLocked
                  ? "Show reserved/locked listings (live in feed)"
                  : "Hide reserved/locked listings"
              }
            >
              <Lock className="h-3.5 w-3.5" />
              Locked
              <span className="font-mono tabular-nums text-[11px]">
                {filterCounts.locked}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={cn(
                "chip min-h-9 inline-flex items-center gap-1.5",
                (filtersOpen || advancedActive) && "chip-soft-active",
              )}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {advancedActive ? (
                <span className="font-mono text-[10px] text-sky-hi">•</span>
              ) : null}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  filtersOpen && "rotate-180",
                )}
              />
            </button>
          </div>
        )}

        {tab === "market" && filtersOpen && (
          <div className="flex flex-col gap-2 border-t border-border/30 pt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSortFilter("qty")}
                className={cn(
                  "chip min-h-8",
                  sortFilter === "qty" && "chip-active",
                )}
              >
                Qty
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
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
        )}
      </div>

      {tab === "market" && (
        <section className="card-quiet overflow-hidden rounded-2xl lg:rounded-3xl">
          <div className="flex min-h-0 flex-col lg:flex-row">
            {/* Listings — primary pane */}
            <div className="min-w-0 flex-1 border-b border-border/30 lg:border-b-0 lg:border-r">
              <header className="panel-head !py-2.5">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2 className="text-[14px] font-semibold tracking-tight">
                    Listings
                  </h2>
                  <p className="truncate font-mono text-[11px] tabular-nums text-muted">
                    <span className="text-sky-hi">{openCount}</span> open
                    <span className="text-muted/50"> · </span>
                    <button
                      type="button"
                      onClick={() => setHideLocked(false)}
                      className={cn(
                        "tabular-nums",
                        hideLocked
                          ? "text-amber-200/90 underline decoration-amber-400/40 underline-offset-2 hover:text-amber-100"
                          : "text-amber-200",
                      )}
                      title="Show locked listings"
                    >
                      {lockedCount} locked
                    </button>
                    <span className="text-muted/50"> · </span>
                    {listingRows.length} shown
                    {currencyFilter !== "all" ? ` · ${currencyFilter}` : ""}
                    {hideLocked ? " · open only" : " · incl. locked"}
                    {categoryFilter !== "all" ? ` · ${categoryFilter}` : ""}
                  </p>
                </div>
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
            </div>

            {/* Activity — sold pane */}
            <div className="flex w-full shrink-0 flex-col lg:w-[20.5rem] xl:w-[22rem]">
              <header className="panel-head !flex-col !items-stretch !gap-2 !py-2.5">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h2 className="text-[14px] font-semibold tracking-tight">
                      Activity
                    </h2>
                    <span className="rounded-md bg-forest/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forest-hi">
                      Sold
                    </span>
                    <p className="font-mono text-[11px] tabular-nums text-muted">
                      {soldRows.length
                        ? `${soldRows.length} sales`
                        : "loading…"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSoldSearchOpen((v) => {
                        const next = !v;
                        if (next) {
                          queueMicrotask(() => soldSearchRef.current?.focus());
                        } else {
                          setSoldQ("");
                        }
                        return next;
                      });
                    }}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors",
                      soldSearchOpen || soldQ.trim()
                        ? "bg-sky/15 text-sky-hi"
                        : "text-muted hover:bg-raised hover:text-sky-hi",
                    )}
                    aria-label="Search sold activity"
                    aria-expanded={soldSearchOpen}
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline lg:inline">Search</span>
                  </button>
                </div>
                {soldSearchOpen && (
                  <div className="relative w-full min-w-0">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                      aria-hidden
                    />
                    <input
                      ref={soldSearchRef}
                      value={soldQ}
                      onChange={(e) => setSoldQ(e.target.value)}
                      placeholder="Search sold: item, seller, buyer…"
                      className="field min-h-9 w-full min-w-0 pl-8 pr-8 text-[13px]"
                      aria-label="Search sold sales"
                    />
                    {soldQ.trim() ? (
                      <button
                        type="button"
                        onClick={() => setSoldQ("")}
                        className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-primary"
                        aria-label="Clear sold search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                )}
              </header>
              <SoldActivityCard
                rows={soldRows}
                onOpenItem={openItem}
                onOpenSeller={openSeller}
              />
            </div>
          </div>
        </section>
      )}

      {tab === "watch" && watchedSellers.length > 0 && (
        <Card className="space-y-2">
          <CardTitle>Watched sellers</CardTitle>
          <ul className="flex flex-wrap gap-2">
            {watchedSellers.map((s) => (
              <li key={s.name} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg bg-raised px-2.5 py-1.5 text-xs font-medium text-sky-hi hover:bg-sky/15"
                  onClick={() => openSellerByName(s.name, s.sellerId)}
                >
                  {s.name}
                </button>
                <a
                  href={`/sellers/${encodeURIComponent(s.name)}`}
                  className="rounded-lg px-1.5 py-1 text-[10px] text-muted hover:text-sky-hi"
                >
                  Profile
                </a>
                <button
                  type="button"
                  className="rounded-lg px-1.5 py-1 text-[10px] text-muted hover:text-loss"
                  onClick={() => onWatchSeller(s.name, s.sellerId)}
                  aria-label={`Unwatch ${s.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {watchedSellerListings.length > 0 ? (
            <div className="border-t border-border/30 pt-2">
              <p className="mb-1 px-0.5 text-[11px] text-muted">
                Their open lots in the live book ({watchedSellerListings.length}
                )
              </p>
              <ListingList
                rows={watchedSellerListings}
                mode="listings"
                onOpenItem={openItem}
                onOpenSeller={openSeller}
                onWatch={onWatch}
                watch={watch}
                compact
              />
            </div>
          ) : (
            <p className="text-[11px] text-muted">
              No open lots from these sellers in the partial live book right
              now — open a profile for the full scan.
            </p>
          )}
        </Card>
      )}

      {(tab === "floors" || tab === "watch") && (
        <ItemBrowseBoard
          rows={browseItems}
          boardStats={hub.boardStats}
          floorsNote={hub.floorsNote}
          watch={watch}
          costByKey={costByKey}
          loading={hub.loading && hub.floors.length === 0 && tab === "floors"}
          onOpen={openItem}
          onWatch={onWatch}
          empty={
            tab === "watch"
              ? watchedSellers.length
                ? "No watched items yet. Star items from Market, or open a watched seller."
                : "No watched items yet. Star an item from Market or All items."
              : "No items match. Try clearing search or category."
          }
        />
      )}

      {/* Quick jump from live market → all-items board */}
      {tab === "market" && (
        <button
          type="button"
          onClick={() => setTab("floors")}
          className="card-quiet flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors hover:border-sky/35 hover:bg-sky/5"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-hi">
              Browse
            </p>
            <p className="mt-0.5 text-[15px] font-semibold">
              All items · floors &amp; price lists
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              Like kintaramarket — pick an item, see every listing cheap → expensive
            </p>
          </div>
          <span className="shrink-0 rounded-xl bg-sky/15 px-3 py-2 text-[12px] font-semibold text-sky-hi">
            Open
          </span>
        </button>
      )}

      {itemFocus && (
        <DetailSheet
          title={selectedFloor?.name ?? selected[0]?.name ?? itemFocus}
          subtitle={
            selectedFloor?.lowestUsdPerUnit
              ? (() => {
                  const r = floorRateLabel(selectedFloor.lowestUsdPerUnit);
                  return `Floor ${r.main}${r.suffix}`;
                })()
              : "Loading item detail…"
          }
          itemId={itemFocus}
          rows={selected}
          soldRows={(hub.sold ?? []).filter(
            (s) =>
              !isItemPending(s) &&
              (itemIdsMatch(s.itemType, itemFocus) ||
                (s.portfolioItemId != null &&
                  itemIdsMatch(s.portfolioItemId, itemFocus))),
          )}
          watching={isInWatchlist(watch, itemFocus, [
            selectedFloor?.portfolioItemId,
            selected[0]?.portfolioItemId,
          ])}
          onClose={closeSheet}
          onWatch={() =>
            onWatch(
              itemFocus,
              selectedFloor?.portfolioItemId ?? selected[0]?.portfolioItemId,
            )
          }
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
          watching={
            !!sellerFocus.sellerName &&
            (isSellerWatched(sellerFocus.sellerName) ||
              watchedSellers.some(
                (s) =>
                  s.name.toLowerCase() ===
                  sellerFocus.sellerName!.toLowerCase(),
              ))
          }
          onClose={closeSheet}
          onWatch={
            sellerFocus.sellerName
              ? () =>
                  onWatchSeller(sellerFocus.sellerName!, sellerFocus.sellerId)
              : undefined
          }
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

/** Relative age for Activity (explains lag vs wall clock). */
function formatSoldAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function isItemPending(r: RecentSale): boolean {
  if (r.itemPending) return true;
  if (r.itemType === "unknown" || !r.itemType) return true;
  if (r.quantity === "?" || r.quantity === "") return true;
  return false;
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
    <div className="max-h-[min(52dvh,32rem)] divide-y divide-border/20 overflow-y-auto lg:max-h-[calc(100dvh-12rem)]">
      {rows.map((r) => {
        const seller = sellerDisplay(r);
        const buyer = buyerParts(r);
        const pending = isItemPending(r);
        const age = formatSoldAge(r.timestamp);
        const canOpenItem = !pending && r.itemType && r.itemType !== "unknown";
        return (
          <div
            key={`${r.id}-${r.timestamp}`}
            className="list-row-cv row-hover flex items-start gap-2.5 px-3 py-2.5"
          >
            {canOpenItem ? (
              <button
                type="button"
                onClick={() => onOpenItem(r.itemType)}
                className="shrink-0"
                aria-label={r.name}
              >
                <ItemIcon itemId={r.itemType} name={r.name} size={40} clear />
              </button>
            ) : (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[10px] font-semibold uppercase tracking-wide text-muted"
                title="Item name still indexing"
              >
                …
              </div>
            )}
            <div className="min-w-0 flex-1">
              {canOpenItem ? (
                <button
                  type="button"
                  onClick={() => onOpenItem(r.itemType)}
                  className="block w-full truncate text-left text-[13px] font-semibold hover:text-sky-hi"
                >
                  <span className="font-mono tabular-nums text-sky-hi">
                    {qtyLabelFull(r.quantity)}
                  </span>{" "}
                  {r.name}
                </button>
              ) : (
                <div className="truncate text-left text-[13px] font-semibold">
                  <span className="text-primary">Sale</span>
                  <span className="ml-1.5 text-[11px] font-medium text-muted">
                    item updating…
                  </span>
                </div>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => onOpenSeller(r)}
                  className="inline-flex max-w-full items-center gap-1 font-medium text-sky-hi underline decoration-sky/40 underline-offset-2 hover:bg-sky/10"
                >
                  <SellerAvatar
                    sellerId={r.sellerId ?? r.sellerWallet}
                    sellerName={seller}
                    size={16}
                  />
                  <span className="truncate">
                    sold by {seller}
                    {r.sellerId && !seller.startsWith("#")
                      ? ` · #${r.sellerId}`
                      : ""}
                  </span>
                </button>
                {buyer.label ? (
                  <span
                    className="inline-flex max-w-full items-center gap-1 text-forest-hi"
                    title={
                      buyer.id
                        ? `Buyer id #${buyer.id}`
                        : buyer.wallet
                          ? `Buyer wallet ${r.buyerWallet ?? ""}`
                          : undefined
                    }
                  >
                    <SellerAvatar
                      sellerId={buyer.id ?? r.buyerWallet}
                      sellerName={buyer.name ?? buyer.label}
                      size={16}
                    />
                    <span className="truncate font-medium">
                      bought by{" "}
                      <span className="font-mono tabular-nums">
                        {buyer.label}
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="text-muted/80">buyer unknown</span>
                )}
              </div>
              <div className="mt-0.5 text-[10px] text-muted">
                {new Date(r.timestamp).toLocaleTimeString()}
                {age ? (
                  <span className="text-sky-hi/90"> · {age}</span>
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
                ) : r.fromBookDelta ? (
                  <span className="text-muted/80"> · confirming tx…</span>
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

/**
 * Price column — always via getListingRateDisplay (lot÷qty, never fake /1k).
 * qty 2 · $1.10 → $0.55/1 · total $1.10
 */
function PriceBlock({
  row,
  locked,
  compact,
}: {
  row: RecentSale;
  locked?: boolean;
  compact?: boolean;
}) {
  const d = getListingRateDisplay({
    quantity: row.quantity,
    usdTotal: row.usdTotal,
    unitUsd: row.unitUsd,
    priceGold: row.priceGold,
    currency: row.currency,
  });
  const mainCls = cn(
    "font-mono font-bold tabular-nums leading-tight",
    d.isGold ? "text-gold-hi" : "text-sky-hi",
    compact ? "text-[15px] sm:text-[16px]" : "text-[17px]",
    locked && "opacity-60",
  );
  const subCls = cn(
    "font-mono tabular-nums leading-tight text-muted",
    compact ? "text-[11px]" : "text-[12px]",
  );

  return (
    <div
      className={cn(
        "shrink-0 whitespace-nowrap text-right",
        "min-w-[5.5rem] sm:min-w-[6.25rem]",
      )}
    >
      <div className={mainCls}>
        {d.rateLabel}
        {d.rateSuffix ? (
          <span className="text-[10px] font-medium text-muted">
            {d.rateSuffix}
          </span>
        ) : null}
      </div>
      {d.totalLine ? <div className={subCls}>{d.totalLine}</div> : null}
      {d.goldLine && d.rateSuffix !== "" ? (
        <div className="font-mono text-[10px] tabular-nums text-gold/90">
          {d.goldLine}
        </div>
      ) : null}
    </div>
  );
}

/** Readable qty: 100 stays 100; 5000 → 5k; big stacks keep compact. */
function qtyLabelFull(quantity: string): string {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return formatQtyCompact(quantity);
  if (n >= 1000) return formatQtyCompact(n);
  if (Number.isInteger(n)) return String(n);
  return formatQtyCompact(n);
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
  onWatch: (id: string, portfolioItemId?: string | null) => void;
  watching: boolean;
  compact: boolean;
}) {
  const seller = sellerDisplay(r);
  const qtyLabel = qtyLabelFull(r.quantity);
  const locked = isLocked(r);
  const canOpenSeller = Boolean(
    (r.sellerName && !isWalletAddress(r.sellerName)) ||
      r.sellerId != null ||
      r.sellerWallet ||
      isWalletAddress(r.seller) ||
      (r.seller && r.seller.trim()),
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
              sellerName={seller}
              size={16}
            />
          )}
          <span className="truncate font-medium">{seller}</span>
          {r.sellerId != null && !seller.startsWith("#") && (
            <span className="shrink-0 font-mono text-muted">#{r.sellerId}</span>
          )}
          <span className="shrink-0 font-mono tabular-nums text-muted/80">
            · qty {qtyLabel}
          </span>
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
          onClick={() => onWatch(r.itemType, r.portfolioItemId)}
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
  onWatch: (id: string, portfolioItemId?: string | null) => void;
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
          watching={isInWatchlist(watch, r.itemType, [r.portfolioItemId])}
          compact={compact}
        />
      ))}
    </div>
  );
}

/** Floor unit → display string ($/1 or $/1k) matching list price rules. */
function floorRateLabel(unitUsd: string | null | undefined): {
  main: string;
  suffix: string;
} {
  if (unitUsd == null || unitUsd === "") return { main: "—", suffix: "" };
  const d = getListingRateDisplay({
    quantity: 1000,
    unitUsd,
    usdTotal: Number(unitUsd) * 1000,
    currency: "token",
  });
  // High unit prices (gold item, etc.) force /1 even with qty 1000
  if (Number(unitUsd) >= 0.01) {
    return { main: formatUsdMarket(unitUsd), suffix: "/1" };
  }
  return {
    main: d.rateLabel,
    suffix: d.rateSuffix || "/1k",
  };
}

/**
 * kintaramarket-style board: every market item as a card + board totals.
 * Click → DetailSheet with complete cheap→expensive price list.
 */
function ItemBrowseBoard({
  rows,
  boardStats,
  floorsNote,
  watch,
  costByKey,
  loading,
  onOpen,
  onWatch,
  empty,
}: {
  rows: (MarketFloorItem & { category?: string; hasLiveFloor?: boolean })[];
  boardStats?: MarketBoardStats | null;
  floorsNote?: string | null;
  watch: string[];
  costByKey: Map<string, { avgUsd: number; qty: string }>;
  loading?: boolean;
  onOpen: (id: string) => void;
  onWatch: (id: string, portfolioItemId?: string | null) => void;
  empty: string;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="card-quiet h-16 animate-pulse rounded-2xl bg-surface-2/50"
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="card-quiet h-40 animate-pulse rounded-2xl bg-surface-2/50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return <div className="card-quiet empty-state rounded-3xl">{empty}</div>;
  }

  const stats = boardStats;
  const shownListings = rows.reduce((a, r) => a + (r.listings ?? 0), 0);
  const shownQty = rows.reduce((a, r) => a + (Number(r.totalQty) || 0), 0);

  return (
    <div className="space-y-3">
      {/* Board totals — same idea as kintaramarket header stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="card-quiet rounded-2xl px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Items
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-sky-hi">
            {stats?.itemCount ?? rows.length}
          </p>
          <p className="text-[10px] text-muted">
            {stats?.itemsWithListings ?? rows.filter((r) => (r.listings ?? 0) > 0).length}{" "}
            with listings
          </p>
        </div>
        <div className="card-quiet rounded-2xl px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Listings
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-sky-hi">
            {(stats?.totalListings ?? shownListings).toLocaleString()}
          </p>
          <p className="text-[10px] text-muted">
            <span className="text-sky-hi">
              {(stats?.tokenListings ?? 0).toLocaleString()}
            </span>{" "}
            token ·{" "}
            <span className="text-gold-hi">
              {(stats?.goldListings ?? 0).toLocaleString()}
            </span>{" "}
            gold
          </p>
        </div>
        <div className="card-quiet rounded-2xl px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Total qty
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-sky-hi">
            {formatQtyCompact(stats?.totalQty ?? shownQty)}
          </p>
          <p className="text-[10px] text-muted">across open book</p>
        </div>
        <div className="card-quiet rounded-2xl px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Showing
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-sky-hi">
            {rows.length}
          </p>
          <p className="text-[10px] text-muted">
            {shownListings.toLocaleString()} lots in filter
          </p>
        </div>
      </div>

      {floorsNote ? (
        <p className="px-0.5 text-[11px] leading-relaxed text-muted">
          {floorsNote}
        </p>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-2 px-0.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-hi">
            All items
          </p>
          <p className="mt-0.5 text-[13px] text-muted">
            Click any card for the full price list (cheap → expensive)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {rows.map((row) => {
          const rate = floorRateLabel(row.lowestUsdPerUnit);
          const listings = row.listings ?? 0;
          const watching = isInWatchlist(watch, row.id, [row.portfolioItemId]);
          const kins = row.kinsListings ?? 0;
          const gold = row.goldListings ?? 0;
          const held =
            costByKey.get(row.id) ??
            (row.portfolioItemId
              ? costByKey.get(row.portfolioItemId)
              : undefined);
          const vs: CostVsFloor | null = held
            ? costVsFloor(held.avgUsd, row.lowestUsdPerUnit)
            : null;
          return (
            <div
              key={row.id}
              className="card-quiet group relative flex flex-col rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:border-sky/40 hover:shadow-[0_12px_28px_color-mix(in_srgb,#000_28%,transparent)]"
            >
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="flex flex-1 flex-col items-center gap-2 text-center"
              >
                <ItemIcon
                  itemId={row.portfolioItemId ?? row.id}
                  name={row.name}
                  size={72}
                  clear
                />
                <div className="w-full min-w-0">
                  <div className="line-clamp-2 text-[13px] font-semibold leading-snug">
                    {row.name}
                  </div>
                  <div className="mt-1 font-mono text-[15px] font-bold tabular-nums text-sky-hi">
                    {rate.main}
                    {rate.suffix ? (
                      <span className="text-[10px] font-medium text-muted">
                        {rate.suffix}
                      </span>
                    ) : null}
                  </div>
                  {vs ? (
                    <div
                      className={cn(
                        "mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        vs.status === "profit" &&
                          "bg-forest/15 text-forest-hi",
                        vs.status === "loss" && "bg-loss/15 text-loss",
                        vs.status === "flat" && "bg-raised text-muted",
                      )}
                      title={`Your avg cost ${formatUsdMarket(vs.avgCostUsd)}/1 · floor ${formatUsdMarket(vs.floorUsd)}/1`}
                    >
                      vs cost {formatDeltaPct(vs.deltaPct)}
                    </div>
                  ) : null}
                  <div className="mt-0.5 text-[11px] text-muted">
                    {listings > 0 ? (
                      <>
                        <span className="font-mono tabular-nums text-primary/90">
                          {listings}
                        </span>{" "}
                        list
                        {row.totalQty != null && Number(row.totalQty) > 0 ? (
                          <>
                            {" · "}
                            <span className="font-mono tabular-nums">
                              {formatQtyCompact(row.totalQty)}
                            </span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      "No open listings"
                    )}
                  </div>
                  {(kins > 0 || gold > 0) && (
                    <div className="mt-0.5 text-[10px] text-muted/80">
                      {kins > 0 ? (
                        <span className="text-sky-hi/90">{kins} token</span>
                      ) : null}
                      {kins > 0 && gold > 0 ? " · " : null}
                      {gold > 0 ? (
                        <span className="text-gold-hi/90">{gold} gold</span>
                      ) : null}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-sky-hi/80 opacity-0 transition-opacity group-hover:opacity-100">
                    View full list →
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onWatch(row.id, row.portfolioItemId)}
                className={cn(
                  "absolute right-2 top-2 rounded-lg p-1.5 text-muted hover:bg-raised hover:text-sky-hi",
                  watching && "bg-sky/10 text-sky-hi",
                )}
                aria-label="Watch"
              >
                <Star
                  className={cn("h-3.5 w-3.5", watching && "fill-sky-hi")}
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
  rank,
  depth,
}: {
  s: RecentSale;
  title: string;
  mode: "item" | "seller";
  showLock?: boolean;
  onOpenSeller?: (row: RecentSale) => void;
  onOpenItem?: (id: string) => void;
  /** 1-based rank in cheap→expensive ladder (item depth view) */
  rank?: number;
  /** Richer qty / $/1k / lot columns for item book */
  depth?: boolean;
}) {
  const locked = showLock && isLocked(s);
  const sold = Boolean(s.isSold);
  const qtyFull =
    Number.isFinite(Number(s.quantity)) && Number(s.quantity) >= 1000
      ? Number(s.quantity).toLocaleString()
      : formatQtyCompact(s.quantity);

  if (depth && mode === "item" && !sold) {
    return (
      <div
        className={cn(
          "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl px-2.5 py-2.5 sm:px-3",
          locked ? "bg-amber-500/10" : "bg-surface-2/60",
        )}
      >
        <div className="text-center font-mono text-[11px] tabular-nums text-muted">
          {rank != null ? `#${rank}` : "·"}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-[15px] font-bold tabular-nums text-sky-hi">
              {qtyFull}
            </span>
            <span className="text-[11px] text-muted">qty</span>
            {locked && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                <Lock className="h-2.5 w-2.5" />
                locked
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenSeller?.(s);
            }}
            className="mt-0.5 flex max-w-full items-center gap-1.5 truncate text-left text-[12px] font-medium text-sky-hi underline decoration-sky/40 underline-offset-2 hover:bg-sky/10"
          >
            <SellerAvatar
              sellerId={s.sellerId}
              sellerName={sellerDisplay(s)}
              size={18}
            />
            <span className="truncate">{sellerDisplay(s)}</span>
            {s.sellerId != null && !sellerDisplay(s).startsWith("#") ? (
              <span className="shrink-0 font-mono text-[10px] text-muted">
                #{s.sellerId}
              </span>
            ) : null}
          </button>
          {locked && (
            <div className="mt-0.5 truncate text-[10px] text-amber-200/90">
              {lockLabel(s)}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {(() => {
            const d = getListingRateDisplay({
              quantity: s.quantity,
              usdTotal: s.usdTotal,
              unitUsd: s.unitUsd,
              priceGold: s.priceGold,
              currency: s.currency,
            });
            return (
              <>
                <div
                  className={cn(
                    "font-mono text-[15px] font-bold tabular-nums leading-tight",
                    d.isGold ? "text-gold-hi" : "text-sky-hi",
                    locked && "opacity-70",
                  )}
                >
                  {d.rateLabel}
                  {d.rateSuffix ? (
                    <span className="text-[10px] font-medium text-muted">
                      {d.rateSuffix}
                    </span>
                  ) : null}
                </div>
                {d.totalLine ? (
                  <div className="font-mono text-[11px] tabular-nums text-muted">
                    {d.totalLine}
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>
      </div>
    );
  }

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
                {" · bought by "}
                {buyerLabel(s)}
              </span>
            ) : (
              <span className="font-medium text-muted"> · buyer unknown</span>
            )}
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
                sellerName={sellerDisplay(s)}
                size={20}
              />
              {sellerDisplay(s)}
              {s.sellerId != null && !sellerDisplay(s).startsWith("#")
                ? ` · #${s.sellerId}`
                : ""}
            </button>
          ) : (
            <span>
              {mode === "item" && sellerDisplay(s) !== "Unknown" ? (
                <>
                  {sellerDisplay(s)}
                  {s.sellerId != null && !sellerDisplay(s).startsWith("#")
                    ? ` · #${s.sellerId}`
                    : ""}
                  {" · "}
                </>
              ) : null}
              {new Date(s.timestamp).toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <PriceBlock row={s} locked={locked && !sold} />
      </div>
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

  // Prefer official item listings; merge hub rows for any ids the scan missed.
  // Always cheap → expensive for item depth (open first, then locked).
  const openListings = useMemo(() => {
    const hubOpen = rows.filter((r) => !r.isSold);
    if (mode !== "item") return hubOpen;

    let merged: RecentSale[];
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
      merged = fromStats;
    } else {
      merged = hubOpen;
    }
    return sortListingsCheapFirst(merged);
  }, [mode, liveStats, rows, itemId, displayName, lockerNameById]);

  const itemDepth = useMemo(
    () => (mode === "item" ? computeItemDepth(openListings) : null),
    [mode, openListings],
  );

  /** Seller: book scan + hub open/sold merged */
  const sellerInventory = useMemo(() => {
    if (mode !== "seller") return rows;
    const hubOpen = rows.filter((r) => !r.isSold);
    const hubSold = rows.filter((r) => r.isSold);
    if (!sellerScan?.listings?.length) {
      // Still suppress sold rows whose listing id is still open in this sheet
      const openKeys = new Set(hubOpen.map((r) => listingDedupeKey(r)));
      const soldExtra = hubSold.filter(
        (r) => !openKeys.has(listingDedupeKey(r)),
      );
      return [...hubOpen, ...soldExtra];
    }
    const fromScan = sellerScan.listings.map((l) =>
      bookListingToSale(l, {
        itemType: l.itemType ?? "unknown",
        name: l.name ?? l.itemType ?? "Item",
        sellerName: sellerName ?? title,
        sellerId: sellerId ?? null,
      }),
    );
    const seen = new Set(fromScan.map((r) => listingDedupeKey(r)));
    for (const r of hubOpen) {
      const key = listingDedupeKey(r);
      if (!seen.has(key)) {
        seen.add(key);
        fromScan.push(r);
      }
    }
    // Append sold only when that listing is not still open
    const soldExtra = hubSold.filter((r) => !seen.has(listingDedupeKey(r)));
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
    mode === "item" && (itemDepth?.floorUnit != null || liveStats?.floorUsd)
      ? (() => {
          // Same rule as list rows: high unit → $/1, dust bulk → $/1k
          const floorU =
            itemDepth?.floorUnit != null
              ? itemDepth.floorUnit
              : liveStats?.floorUsd != null
                ? Number(liveStats.floorUsd)
                : null;
          let floorRate = "—";
          if (floorU != null && Number.isFinite(floorU) && floorU > 0) {
            if (floorU >= 0.01) {
              floorRate = `${formatUsdMarket(floorU)}/1`;
            } else {
              floorRate = `${formatUsdMarket(floorU * 1000)}/1k`;
            }
          }
          const qty =
            itemDepth && itemDepth.totalQty > 0
              ? formatQtyCompact(itemDepth.totalQty)
              : null;
          return [
            `Floor ${floorRate}`,
            qty ? `${qty} on book` : null,
          ]
            .filter(Boolean)
            .join(" · ");
        })()
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
      <div
        className={cn(
          "card-quiet relative z-10 flex max-h-[88dvh] w-full flex-col rounded-t-3xl border-border/60 shadow-2xl sm:mr-4 sm:max-h-[92dvh] sm:rounded-3xl",
          mode === "item" ? "max-w-lg sm:max-w-xl" : "max-w-md",
        )}
      >
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
                {itemDepth && itemDepth.totalQty > 0 ? (
                  <>
                    {" · "}
                    <span className="font-mono tabular-nums text-primary/90">
                      {formatQtyCompact(itemDepth.totalQty)} qty
                    </span>
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
              {statsLoading && !liveStats && openListings.length === 0 && (
                <p className="text-sm text-muted">Loading floor & book depth…</p>
              )}
              {statsError && !liveStats && (
                <p className="text-sm text-loss">{statsError}</p>
              )}
              {(liveStats || itemDepth) && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(() => {
                      // Adaptive floor rate (fixes gold resource $550/1k bug)
                      const fu =
                        itemDepth?.floorUnit ??
                        (liveStats?.floorUsd != null
                          ? Number(liveStats.floorUsd)
                          : null);
                      const use1 =
                        fu != null && Number.isFinite(fu) && fu >= 0.01;
                      const floorVal =
                        fu == null || !Number.isFinite(fu)
                          ? "—"
                          : use1
                            ? formatUsdMarket(fu)
                            : formatUsdMarket(fu * 1000);
                      const med =
                        itemDepth?.medianUnit ??
                        (liveStats?.medianUsd != null
                          ? Number(liveStats.medianUsd)
                          : null);
                      const medUse1 =
                        med != null && Number.isFinite(med) && med >= 0.01;
                      const medVal =
                        med == null || !Number.isFinite(med)
                          ? "—"
                          : medUse1
                            ? formatUsdMarket(med)
                            : formatUsdMarket(med * 1000);
                      const hi = itemDepth?.highUnit ?? null;
                      const hiUse1 =
                        hi != null && Number.isFinite(hi) && hi >= 0.01;
                      const hiVal =
                        hi == null || !Number.isFinite(hi)
                          ? "—"
                          : hiUse1
                            ? formatUsdMarket(hi)
                            : formatUsdMarket(hi * 1000);
                      return (
                        <>
                    <StatChip
                      label={use1 ? "Floor $/1" : "Floor $/1k"}
                      value={floorVal}
                      hint={
                        fu != null && Number.isFinite(fu)
                          ? use1
                            ? undefined
                            : `${formatUsdMarket(fu)}/1`
                          : undefined
                      }
                    />
                    <StatChip
                      label={medUse1 ? "Median $/1" : "Median $/1k"}
                      value={medVal}
                      hint={
                        med != null && Number.isFinite(med) && !medUse1
                          ? `${formatUsdMarket(med)}/1`
                          : undefined
                      }
                    />
                    <StatChip
                      label={hiUse1 ? "High $/1" : "High $/1k"}
                      value={hiVal}
                      hint={
                        itemDepth?.spreadPct != null
                          ? `spread +${itemDepth.spreadPct.toFixed(0)}%`
                          : undefined
                      }
                    />
                        </>
                      );
                    })()}
                    <StatChip
                      label="Qty on book"
                      value={
                        itemDepth && itemDepth.totalQty > 0
                          ? formatQtyCompact(itemDepth.totalQty)
                          : "—"
                      }
                      hint={
                        itemDepth
                          ? `${formatQtyCompact(itemDepth.unlockedQty)} open` +
                            (itemDepth.lockedQty > 0
                              ? ` · ${formatQtyCompact(itemDepth.lockedQty)} lock`
                              : "")
                          : undefined
                      }
                    />
                    <StatChip
                      label="Book value"
                      value={
                        itemDepth?.totalLotUsd != null
                          ? formatUsdMarket(itemDepth.totalLotUsd)
                          : "—"
                      }
                      hint={
                        itemDepth
                          ? `${itemDepth.openUnlocked + itemDepth.openLocked} lots`
                          : undefined
                      }
                    />
                    <StatChip
                      label={
                        liveStats?.avg30dUsd != null &&
                        Number(liveStats.avg30dUsd) >= 0.01
                          ? "30d avg $/1"
                          : "30d avg $/1k"
                      }
                      value={
                        liveStats?.avg30dUsd
                          ? Number(liveStats.avg30dUsd) >= 0.01
                            ? formatUsdMarket(liveStats.avg30dUsd)
                            : formatUsdPer1k(liveStats.avg30dUsd)
                          : "—"
                      }
                      hint={
                        liveStats?.sales30d != null
                          ? `${liveStats.sales30d} sales`
                          : undefined
                      }
                    />
                  </div>
                  {itemDepth?.avgUnit != null && (
                    <p className="text-[11px] text-muted">
                      Book avg{" "}
                      <span className="font-mono font-semibold tabular-nums text-sky-hi">
                        {itemDepth.avgUnit >= 0.01
                          ? `${formatUsdMarket(itemDepth.avgUnit)}/1`
                          : `${formatUsdMarket(itemDepth.avgUnit * 1000)}/1k`}
                      </span>
                      {itemDepth.cheapest3AvgPer1k != null &&
                      itemDepth.floorUnit != null ? (
                        <>
                          {" · "}
                          cheapest 3{" "}
                          <span className="font-mono tabular-nums text-primary/90">
                            {itemDepth.floorUnit >= 0.01
                              ? `${formatUsdMarket(itemDepth.cheapest3AvgPer1k / 1000)}/1`
                              : `${formatUsdMarket(itemDepth.cheapest3AvgPer1k)}/1k`}
                          </span>
                        </>
                      ) : null}
                    </p>
                  )}
                  {liveStats && liveStats.samples.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                        Recent sale samples
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {liveStats.samples.slice(0, 8).map((s, i) => {
                          const u =
                            s.unitUsd != null ? Number(s.unitUsd) : NaN;
                          const sampleRate =
                            !Number.isFinite(u) || u <= 0
                              ? "—"
                              : u >= 0.01
                                ? `${formatUsdMarket(u)}/1`
                                : `${formatUsdPer1kMarket(u)}/1k`;
                          return (
                          <span
                            key={`${s.date}-${i}`}
                            className="rounded-lg bg-surface-2/80 px-2 py-1 font-mono text-[11px] tabular-nums text-muted"
                          >
                            {s.date.slice(5)}{" "}
                            <span className="text-sky-hi">{sampleRate}</span>
                            {s.sales != null ? (
                              <span className="text-muted"> ·×{s.sales}</span>
                            ) : null}
                          </span>
                          );
                        })}
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
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                    Price ladder · cheap → expensive
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {openListings.length} lots
                    {statsLoading && liveStats ? " · refreshing…" : ""}
                    {itemDepth && itemDepth.unlockedQty > 0
                      ? ` · ${formatQtyCompact(itemDepth.unlockedQty)} unlocked qty`
                      : ""}
                  </p>
                </div>
              </div>
              {itemEmptyNote && (
                <div className="mb-2">
                  <CoverageNote text={itemEmptyNote} />
                </div>
              )}
              {openListings.length > 0 && (
                <div className="mb-1.5 grid grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-2 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted/70 sm:px-3">
                  <span>#</span>
                  <span>Qty · seller</span>
                  <span className="text-right">$/1 or $/1k · total</span>
                </div>
              )}
              <div className="space-y-1.5">
                {openListings.length === 0 && statsLoading && (
                  <p className="text-sm text-muted">Loading listings…</p>
                )}
                {openListings.map((s, i) => (
                  <SheetListingRow
                    key={`${s.id}-open`}
                    s={s}
                    title={displayName}
                    mode="item"
                    showLock={showLock}
                    onOpenSeller={onOpenSeller}
                    onOpenItem={onOpenItem}
                    rank={i + 1}
                    depth
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

        {onWatch && (
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
              {mode === "seller"
                ? watching
                  ? "Watching seller"
                  : "Watch seller"
                : watching
                  ? "Watching"
                  : "Watch item"}
            </button>
          </div>
        )}
      </div>
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
