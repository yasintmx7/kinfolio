"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { useKinsPrice } from "@/hooks/use-kins-price";
import { d } from "@/lib/accounting/decimal";
import { estimateUnrealized, protectedCost } from "@/lib/accounting/engine";
import {
  formatKins,
  formatUsd,
  formatUsdShort,
  signedClass,
} from "@/lib/formatting/money";
import { ItemIcon } from "@/components/items/item-icon";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { portfolioIdToMarketType } from "@/lib/kintara/item-type-map";
import {
  costVsFloor,
  formatDeltaPct,
} from "@/lib/market/cost-vs-floor";
import { cn } from "@/lib/utils";

type Filter =
  | "all"
  | "favorites"
  | "resource"
  | "tool"
  | "weapon"
  | "potion"
  | "profitable"
  | "losing"
  | "unpriced"
  | "earned";

type FloorHit = {
  id: string;
  lowestUsdPerUnit: string | null;
  listings?: number;
};

export default function InventoryPage() {
  const { summary, itemMap, priceMap, settings, setManualPrice, ready } =
    usePortfolioContext();
  const { price } = useKinsPrice();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [floors, setFloors] = useState<FloorHit[]>([]);

  const fee = settings?.defaultSellFeePercent ?? "5";
  const kinsUsd = price?.priceUsd ?? settings?.manualKinsUsd ?? "";
  const favorites = settings?.favoriteItemIds ?? [];

  // Live floors for cost-vs-market comparison
  useEffect(() => {
    let cancelled = false;
    fetch("/api/market/items")
      .then((r) => r.json())
      .then((body: { ok?: boolean; data?: { items?: FloorHit[] } }) => {
        if (cancelled || !body?.ok || !Array.isArray(body.data?.items)) return;
        setFloors(
          body.data!.items!.map((i) => ({
            id: i.id,
            lowestUsdPerUnit: i.lowestUsdPerUnit ?? null,
            listings: i.listings,
          })),
        );
      })
      .catch(() => {
        /* floor optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const floorByKey = useMemo(() => {
    const m = new Map<string, FloorHit>();
    for (const f of floors) {
      m.set(f.id, f);
      m.set(f.id.replace(/_/g, "-"), f);
      m.set(f.id.replace(/-/g, "_"), f);
    }
    return m;
  }, [floors]);

  const rows = useMemo(() => {
    return summary.positions
      .map((pos) => {
        const item = itemMap.get(pos.itemId);
        const ref = priceMap.get(pos.itemId);
        const marketType = portfolioIdToMarketType(pos.itemId, STATIC_CATALOG);
        const floor =
          floorByKey.get(marketType) ??
          floorByKey.get(pos.itemId) ??
          floorByKey.get(pos.itemId.replace(/-/g, "_"));
        const vs = costVsFloor(
          pos.averageUsdPerItem,
          floor?.lowestUsdPerUnit ?? null,
        );
        const est =
          ref && kinsUsd
            ? estimateUnrealized({
                quantity: pos.quantity,
                remainingUsdCostBasis: pos.usdCostBasis,
                remainingKinsCostBasis: pos.kinsCostBasis,
                itemReferencePriceKins: ref,
                currentKinsUsd: kinsUsd,
                sellingFeePercent: fee,
              })
            : null;
        const breakEvenGross = protectedCost(
          d(pos.averageUsdPerItem),
          d(fee),
          "exact_gross_up",
        ).toFixed();
        return { pos, item, ref, est, breakEvenGross, floor, vs, marketType };
      })
      .filter(({ pos, item, ref, est }) => {
        if (filter === "favorites") return favorites.includes(pos.itemId);
        if (filter === "resource") return item?.category === "resource";
        if (filter === "tool") return item?.category === "tool";
        if (filter === "weapon") return item?.category === "weapon";
        if (filter === "potion") return item?.category === "potion";
        if (filter === "unpriced") return !ref;
        if (filter === "earned") return d(pos.earnedQuantity).gt(0);
        if (filter === "profitable")
          return est ? d(est.unrealizedUsdProfit).gt(0) : false;
        if (filter === "losing")
          return est ? d(est.unrealizedUsdProfit).lt(0) : false;
        return true;
      })
      .sort((a, b) => d(b.pos.usdCostBasis).cmp(d(a.pos.usdCostBasis)));
  }, [
    summary.positions,
    itemMap,
    priceMap,
    kinsUsd,
    fee,
    filter,
    favorites,
    floorByKey,
  ]);

  if (!ready) {
    return <div className="text-muted">Loading inventory…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-1 text-sm text-muted">
          Weighted-average cost · purchased vs earned · estimated net value
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["favorites", "Favorites"],
            ["resource", "Resources"],
            ["tool", "Tools"],
            ["weapon", "Weapons"],
            ["potion", "Potions"],
            ["profitable", "Profitable"],
            ["losing", "Losing"],
            ["unpriced", "Unpriced"],
            ["earned", "Earned"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`min-h-10 rounded-full px-3 text-xs ${
              filter === id
                ? "bg-sky text-[#0a121c]"
                : "bg-raised text-muted hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!rows.length && (
        <Card>
          <p className="text-sm text-muted">No holdings match this filter.</p>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map(
          ({ pos, item, ref, est, breakEvenGross, floor, vs, marketType }) => (
          <Card key={pos.itemId} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <ItemIcon
                  itemId={pos.itemId}
                  name={item?.name}
                  aliases={item?.aliases}
                  imageUrl={item?.imageUrl}
                  size={48}
                />
                <div>
                  <div className="font-semibold">
                    {item?.name ?? pos.itemId}
                    {favorites.includes(pos.itemId) ? " ★" : ""}
                  </div>
                  <div className="text-xs capitalize text-muted">
                    {item?.category ?? "other"}
                  </div>
                  {vs ? (
                    <div
                      className={cn(
                        "mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                        vs.status === "profit" &&
                          "bg-emerald-500/15 text-emerald-300",
                        vs.status === "loss" && "bg-red-500/15 text-red-300",
                        vs.status === "flat" && "bg-raised text-muted",
                      )}
                    >
                      Floor {formatUsdShort(vs.floorUsd)}/1 · vs cost{" "}
                      {formatDeltaPct(vs.deltaPct)}
                    </div>
                  ) : floor?.lowestUsdPerUnit ? (
                    <div className="mt-1 text-[11px] text-muted">
                      Floor {formatUsdShort(floor.lowestUsdPerUnit)}/1 · no avg
                      cost
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] text-muted">
                      No live floor
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm tabular-nums">
                  qty {pos.quantity}
                </div>
                <Link
                  href={`/market?tab=floors&item=${encodeURIComponent(marketType)}`}
                  className="mt-1 inline-block text-[11px] font-medium text-sky underline-offset-2 hover:underline"
                >
                  Market list →
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <Metric label="Purchased" value={pos.purchasedQuantity} />
              <Metric label="Earned" value={pos.earnedQuantity} />
              <Metric label="USD cost" value={formatUsd(pos.usdCostBasis)} />
              <Metric label="KINS cost" value={formatKins(pos.kinsCostBasis)} />
              <Metric label="Avg USD" value={formatUsd(pos.averageUsdPerItem)} />
              <Metric label="Avg KINS" value={formatKins(pos.averageKinsPerItem)} />
              <Metric
                label="Live floor USD/1"
                value={
                  floor?.lowestUsdPerUnit
                    ? formatUsd(floor.lowestUsdPerUnit)
                    : "—"
                }
              />
              <Metric
                label="Floor vs cost"
                value={vs ? formatDeltaPct(vs.deltaPct) : "—"}
                className={
                  vs
                    ? vs.status === "profit"
                      ? "text-emerald-300"
                      : vs.status === "loss"
                        ? "text-red-300"
                        : ""
                    : ""
                }
              />
              <Metric
                label="Ref price (KINS)"
                value={ref ? formatKins(ref) : "Not available"}
              />
              <Metric
                label="Est. net value"
                value={est ? formatUsd(est.netCurrentUsd) : "Not available"}
              />
              <Metric
                label="Unrealized P/L"
                value={
                  est ? formatUsd(est.unrealizedUsdProfit) : "Not available"
                }
                className={est ? signedClass(est.unrealizedUsdProfit) : ""}
              />
              <Metric
                label="Break-even gross USD/item"
                value={formatUsd(breakEvenGross)}
              />
            </div>

            {editing === pos.itemId ? (
              <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                <div className="min-w-[10rem] flex-1">
                  <Label htmlFor={`p-${pos.itemId}`}>Manual unit price (KINS)</Label>
                  <Input
                    id={`p-${pos.itemId}`}
                    value={priceDraft}
                    onChange={(e) => setPriceDraft(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <Button
                  onClick={async () => {
                    await setManualPrice(pos.itemId, priceDraft || "0");
                    setEditing(null);
                  }}
                >
                  Save price
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                className="mt-1"
                onClick={() => {
                  setEditing(pos.itemId);
                  setPriceDraft(ref ?? "");
                }}
              >
                Set manual price
              </Button>
            )}
          </Card>
          ),
        )}
      </div>
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
    <div className="rounded-md bg-surface-2 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 font-mono tabular-nums text-primary ${className ?? ""}`}>
        {value}
      </div>
    </div>
  );
}
