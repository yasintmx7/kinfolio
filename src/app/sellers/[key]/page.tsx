"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Star, Store } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ItemIcon } from "@/components/items/item-icon";
import { SellerAvatar } from "@/components/sellers/seller-avatar";
import { getListingRateDisplay } from "@/lib/market/listing-price";
import {
  formatSellerLabel,
  sanitizePersonName,
} from "@/lib/market/seller-label";
import {
  getWatchedSellers,
  isSellerWatched,
  toggleSellerWatch,
  type WatchedSeller,
} from "@/lib/market/seller-watch";
import { cn } from "@/lib/utils";

type ListingDto = {
  id: string;
  itemType: string;
  name: string;
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

function decodeKey(key: string): string {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function rateLabel(
  unitUsd: string | null,
  usdTotal: string | null,
  qty: string,
  currency: string,
  priceGold: string | null,
) {
  const r = getListingRateDisplay({
    unitUsd,
    priceUsd: usdTotal,
    quantity: qty,
    currency,
    priceGold,
  });
  return `${r.rateLabel}${r.rateSuffix || ""}`;
}

export default function SellerProfilePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const decoded = decodeKey(key);
  const isNumericId = /^\d+$/.test(decoded);

  const [listings, setListings] = useState<ListingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);
  const [watchList, setWatchList] = useState<WatchedSeller[]>([]);

  const sellerId = isNumericId ? decoded : null;
  const sellerName = isNumericId ? null : decoded;

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      if (sellerId) qs.set("sellerId", sellerId);
      if (sellerName) qs.set("sellerName", sellerName);
      fetch(`/api/market/sellers/listings?${qs}`, {
        cache: "no-store",
        signal,
      })
        .then(async (res) => {
          const body = (await res.json()) as {
            ok?: boolean;
            data?: {
              listings?: ListingDto[];
              note?: string;
              openCount?: number;
              lockedCount?: number;
            };
            error?: { message?: string };
          };
          if (!res.ok || !body.ok) {
            throw new Error(body.error?.message ?? "Failed to load seller");
          }
          return body.data;
        })
        .then((data) => {
          setListings(data?.listings ?? []);
          setNote(data?.note ?? null);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setError(e instanceof Error ? e.message : "Failed to load");
          setListings([]);
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [sellerId, sellerName],
  );

  useEffect(() => {
    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  /** Prefer live listing username, then URL key, then formatted label. */
  const watchableName = useMemo(() => {
    return (
      sanitizePersonName(listings[0]?.sellerName) ??
      sanitizePersonName(sellerName) ??
      null
    );
  }, [listings, sellerName]);

  useEffect(() => {
    const list = getWatchedSellers();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWatchList(list);
    if (watchableName) {
      setWatched(isSellerWatched(watchableName));
    } else {
      setWatched(false);
    }
  }, [watchableName]);

  const displayName = useMemo(() => {
    return formatSellerLabel({
      sellerName: watchableName ?? sellerName,
      sellerId: sellerId ?? listings[0]?.sellerId,
    });
  }, [listings, sellerId, sellerName, watchableName]);

  const open = listings.filter((l) => !l.reserved);
  const locked = listings.filter((l) => l.reserved);

  function onToggleWatch() {
    const name = watchableName;
    if (!name || name === "Seller") return;
    const next = toggleSellerWatch(
      name,
      sellerId ?? listings[0]?.sellerId ?? null,
    );
    setWatchList(next);
    setWatched(next.some((s) => s.name.toLowerCase() === name.toLowerCase()));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/market?tab=market"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-sky-hi"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Market
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <SellerAvatar
              sellerName={displayName}
              sellerId={sellerId}
              size={40}
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {displayName}
              </h1>
              <p className="font-mono text-xs text-muted">
                {sellerId ? `Seller #${sellerId}` : "Seller profile"}
                {note ? ` · ${note}` : ""}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={onToggleWatch}
            disabled={!watchableName}
          >
            <Star
              className={cn(
                "h-4 w-4",
                watched && "fill-amber text-amber",
              )}
            />
            {watched ? "Watching" : "Watch seller"}
          </Button>
          <Link
            href={`/market?tab=market&q=${encodeURIComponent(
              sellerName || displayName,
            )}`}
          >
            <Button variant="ghost">
              <Store className="h-4 w-4" />
              Search market
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardTitle>Open lots</CardTitle>
          <p className="mt-1 font-mono text-2xl tabular-nums text-sky-hi">
            {loading ? "…" : open.length}
          </p>
        </Card>
        <Card>
          <CardTitle>Locked</CardTitle>
          <p className="mt-1 font-mono text-2xl tabular-nums text-amber">
            {loading ? "…" : locked.length}
          </p>
        </Card>
        <Card>
          <CardTitle>Total in book</CardTitle>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {loading ? "…" : listings.length}
          </p>
        </Card>
      </div>

      <p className="text-[11px] text-muted">
        Open book is partial (game/KM caps ~1k cheapest-ish lots). Expensive or
        sparse listings may still be missing.
      </p>

      {error && (
        <Card className="border-loss/30 bg-loss/10">
          <p className="text-sm text-loss">{error}</p>
          <Button
            className="mt-2"
            variant="secondary"
            onClick={() => load()}
          >
            Retry
          </Button>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border/40 px-4 py-3">
          <h2 className="text-sm font-semibold">
            Listings in scanned book
          </h2>
          <p className="font-mono text-[11px] text-muted">
            {open.length} open · {locked.length} locked
          </p>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl bg-surface-2"
              />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="empty-state px-4 py-10 text-center text-sm text-muted">
            No open listings found for this seller in the scanned book.
          </div>
        ) : (
          <ul className="divide-y divide-border/25">
            {listings.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/market?tab=market&item=${encodeURIComponent(l.itemType)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-sky/5"
                >
                  <ItemIcon itemId={l.itemType} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="font-mono text-[11px] text-muted">
                      ×{l.quantity}
                      {l.reserved ? " · locked" : ""}
                      {l.currency === "gold" ? " · gold" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right font-mono text-sm tabular-nums text-sky-hi">
                    {rateLabel(
                      l.unitUsd,
                      l.usdTotal,
                      l.quantity,
                      l.currency,
                      l.priceGold,
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {watchList.length > 0 && (
        <Card>
          <CardTitle>Your watched sellers</CardTitle>
          <ul className="mt-2 flex flex-wrap gap-2">
            {watchList.map((s) => (
              <li key={s.name}>
                <Link
                  href={`/sellers/${encodeURIComponent(s.name)}`}
                  className="inline-block rounded-lg bg-raised px-2.5 py-1.5 text-xs text-sky-hi hover:bg-sky/15"
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
