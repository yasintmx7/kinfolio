import {
  cleanSellerFields,
  officialListingId,
  sanitizePersonName,
} from "@/lib/market/seller-label";

export type InstantSoldRow = {
  id: string;
  listingId?: string;
  name: string;
  itemType: string;
  quantity: string;
  unitKins: string;
  totalKins?: string | null;
  unitUsd?: string | null;
  usdTotal: string | null;
  priceGold?: string | null;
  currency?: string;
  timestamp: string;
  solscanUrl: string | null;
  portfolioItemId?: string | null;
  seller?: string | null;
  sellerName?: string | null;
  sellerId?: string | null;
  buyerId?: string | null;
  buyerName?: string | null;
  buyerWallet?: string | null;
  sellerWallet?: string | null;
  reserved?: boolean;
  reservedUntilMs?: number | null;
  itemDurability?: string | null;
  isSold?: boolean;
  itemPending?: boolean;
  /** From official book disappearance (instant path) */
  fromBookDelta?: boolean;
};

/**
 * Guardrails so a partial/failed book scan never mass-marks "sold".
 * Returns listings present in `prev` but missing from `next`.
 */
export function detectGoneListings<T extends { id: string }>(
  prev: T[],
  next: T[],
  options?: {
    /** Skip if open book smaller than this (incomplete scan) */
    minNextSize?: number;
    minPrevSize?: number;
    /** If next is much smaller than prev, treat as bad feed */
    minRetentionRatio?: number;
    /** Cap sudden disappearances (API glitch / page shift) */
    maxGone?: number;
  },
): T[] {
  const minNext = options?.minNextSize ?? 150;
  const minPrev = options?.minPrevSize ?? 40;
  const ratio = options?.minRetentionRatio ?? 0.55;
  const maxGone = options?.maxGone ?? 35;

  if (prev.length < minPrev || next.length < minNext) return [];
  if (next.length < prev.length * ratio) return [];

  const nextIds = new Set(next.map((r) => String(r.id)));
  const gone: T[] = [];
  for (const row of prev) {
    if (!nextIds.has(String(row.id))) gone.push(row);
  }
  if (gone.length === 0) return [];
  if (gone.length > maxGone) return [];
  return gone;
}

/** Snapshot of an open listing → Activity sold row (instant). */
export function toInstantSold<T extends InstantSoldRow>(
  row: T,
  atMs: number = Date.now(),
): InstantSoldRow {
  const lid = officialListingId(row.listingId ?? row.id);
  // Never put wallet into sellerName/seller (bug: old fallback re-applied raw name)
  const people = cleanSellerFields({
    sellerName: row.sellerName,
    seller: row.seller,
    sellerId: row.sellerId,
    sellerWallet: row.sellerWallet,
  });
  const buyerName = sanitizePersonName(row.buyerName);

  return {
    id: lid ? `book-sold-${lid}` : `book-sold-${row.id}`,
    listingId: lid ?? undefined,
    name: row.name || "Item",
    itemType: row.itemType || "unknown",
    quantity: row.quantity,
    unitKins: row.unitKins ?? "0",
    totalKins: row.totalKins ?? null,
    unitUsd: row.unitUsd ?? null,
    usdTotal: row.usdTotal ?? null,
    priceGold: row.priceGold ?? null,
    currency: row.currency ?? "token",
    timestamp: new Date(atMs).toISOString(),
    solscanUrl: null,
    portfolioItemId: row.portfolioItemId ?? null,
    seller: people.seller,
    sellerName: people.sellerName,
    sellerId: people.sellerId,
    // Last locker is the best guess for buyer until chain confirms
    buyerId: row.buyerId ?? null,
    buyerName,
    buyerWallet: row.buyerWallet ?? null,
    sellerWallet: people.sellerWallet,
    reserved: false,
    reservedUntilMs: null,
    itemDurability: row.itemDurability ?? null,
    isSold: true,
    itemPending: false,
    fromBookDelta: true,
  };
}

/** Force wallet out of name fields on any sold row. */
export function scrubSoldSellerFields<T extends InstantSoldRow>(row: T): T {
  const people = cleanSellerFields({
    sellerName: row.sellerName,
    seller: row.seller,
    sellerId: row.sellerId,
    sellerWallet: row.sellerWallet,
  });
  return {
    ...row,
    sellerName: people.sellerName,
    seller: people.seller,
    sellerId: people.sellerId,
    sellerWallet: people.sellerWallet,
    buyerName: sanitizePersonName(row.buyerName),
    isSold: true,
  };
}

function listingKey(row: {
  id: string;
  listingId?: string | null;
}): string | null {
  return officialListingId(row.listingId) ?? officialListingId(row.id);
}

/**
 * Merge instant book-delta solds with chain indexer rows.
 * Prefer chain tx when present; keep book item/qty/seller when chain is bare.
 */
export function mergeSoldFeeds<T extends InstantSoldRow>(
  fromBook: T[],
  fromChain: T[],
  limit = 60,
): T[] {
  const byListing = new Map<string, T>();
  const extras: T[] = [];

  const put = (row: T, preferChain: boolean) => {
    const clean = scrubSoldSellerFields(row);
    const key = listingKey(clean);
    if (!key) {
      extras.push(clean);
      return;
    }
    const prev = byListing.get(key);
    if (!prev) {
      byListing.set(key, clean);
      return;
    }

    const chain = preferChain ? clean : prev;
    const book = preferChain ? prev : clean;
    const chainPending =
      Boolean(chain.itemPending) ||
      chain.itemType === "unknown" ||
      chain.quantity === "?" ||
      chain.name === "Sale";

    const people = cleanSellerFields({
      sellerName: chain.sellerName ?? book.sellerName,
      seller: chain.seller ?? book.seller,
      sellerId: chain.sellerId ?? book.sellerId,
      sellerWallet: chain.sellerWallet ?? book.sellerWallet,
    });

    const merged = scrubSoldSellerFields({
      ...book,
      ...chain,
      id: chain.solscanUrl ? chain.id : book.id,
      listingId: key,
      isSold: true,
      name: chainPending ? book.name : chain.name || book.name,
      itemType:
        chainPending || chain.itemType === "unknown"
          ? book.itemType
          : chain.itemType || book.itemType,
      quantity:
        chainPending || chain.quantity === "?"
          ? book.quantity
          : chain.quantity || book.quantity,
      unitUsd: chain.unitUsd ?? book.unitUsd ?? null,
      usdTotal: chain.usdTotal ?? book.usdTotal ?? null,
      unitKins: chainPending ? book.unitKins : chain.unitKins || book.unitKins,
      totalKins: chain.totalKins ?? book.totalKins ?? null,
      sellerName: people.sellerName,
      seller: people.seller,
      sellerId: people.sellerId,
      sellerWallet: people.sellerWallet,
      buyerId: chain.buyerId ?? book.buyerId ?? null,
      buyerName:
        sanitizePersonName(chain.buyerName) ??
        sanitizePersonName(book.buyerName),
      buyerWallet: chain.buyerWallet ?? book.buyerWallet ?? null,
      solscanUrl: chain.solscanUrl ?? book.solscanUrl ?? null,
      itemPending: chainPending && !book.name ? true : false,
      fromBookDelta: Boolean(book.fromBookDelta || chain.fromBookDelta),
      // Earliest signal (book drop is usually the “just sold” moment)
      timestamp:
        Date.parse(book.timestamp) <= Date.parse(chain.timestamp)
          ? book.timestamp
          : chain.timestamp,
    } as T);
    byListing.set(key, merged);
  };

  // Book first (names/qty), then chain upgrades with tx
  for (const r of fromBook) put(r, false);
  for (const r of fromChain) put(r, true);

  return [...byListing.values(), ...extras]
    .map((r) => scrubSoldSellerFields(r))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, Math.min(Math.max(limit, 1), 100));
}

/** Drop book-delta rows older than maxAgeMs (default 20 min). */
export function pruneBookDeltaSold<T extends InstantSoldRow>(
  rows: T[],
  maxAgeMs = 20 * 60 * 1000,
  now = Date.now(),
): T[] {
  return rows.filter((r) => {
    const t = Date.parse(r.timestamp);
    if (!Number.isFinite(t)) return true;
    return now - t <= maxAgeMs;
  });
}
