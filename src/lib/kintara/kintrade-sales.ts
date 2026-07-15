import { fetchWithTimeout, getCached, setCache } from "@/lib/api/cache";
import { d } from "@/lib/accounting/decimal";
import { humanizeItemType } from "@/lib/kintara/item-type-map";
import type { SoldSample } from "@/lib/kintara/marketplace-adapter";
import { z } from "zod";

const BASE = "https://www.kintrade.xyz";

const saleSchema = z.object({
  _id: z.string().optional(),
  itemType: z.string(),
  quantity: z.number(),
  kinsTotal: z.number(),
  treasuryKins: z.number().optional(),
  usd: z.number().optional(),
  ts: z.number().optional(),
  _creationTime: z.number().optional(),
  signature: z.string().optional(),
  listingId: z.union([z.string(), z.number()]).optional(),
  buyer: z.string().optional(),
  seller: z.string().optional(),
});

const responseSchema = z.object({
  ok: z.boolean().optional(),
  sales: z.array(saleSchema),
});

export type KinTradeSale = {
  id: string;
  itemType: string;
  name: string;
  quantity: string;
  kinsTotal: string;
  treasuryKins: string | null;
  /** Buyer-paid KINS per unit (kinsTotal / quantity) */
  unitKins: string;
  /** Approx net to seller per unit after treasury fee */
  unitKinsNetSeller: string | null;
  usdTotal: string | null;
  unitUsd: string | null;
  timestamp: string;
  signature?: string;
  listingId?: string;
  buyer?: string;
  seller?: string;
};

function timestampMs(sale: z.infer<typeof saleSchema>): number {
  if (sale.ts != null && Number.isFinite(sale.ts)) return sale.ts;
  if (sale._creationTime != null && Number.isFinite(sale._creationTime)) {
    return sale._creationTime;
  }
  return Date.now();
}

export function normalizeSale(raw: z.infer<typeof saleSchema>): KinTradeSale {
  const qty = Math.max(raw.quantity || 1, 1);
  const unitKins = d(raw.kinsTotal).div(qty);
  const treasury = raw.treasuryKins != null ? d(raw.treasuryKins) : null;
  const netSeller =
    treasury != null ? d(raw.kinsTotal).minus(treasury).div(qty) : null;
  const unitUsd =
    raw.usd != null && Number.isFinite(raw.usd)
      ? d(raw.usd).div(qty)
      : null;

  return {
    id: raw._id ?? raw.signature ?? `${raw.itemType}-${timestampMs(raw)}`,
    itemType: raw.itemType,
    name: humanizeItemType(raw.itemType),
    quantity: String(qty),
    kinsTotal: String(raw.kinsTotal),
    treasuryKins: treasury != null ? treasury.toFixed() : null,
    unitKins: unitKins.toFixed(),
    unitKinsNetSeller: netSeller != null ? netSeller.toFixed() : null,
    usdTotal: raw.usd != null ? String(raw.usd) : null,
    unitUsd: unitUsd != null ? unitUsd.toFixed() : null,
    timestamp: new Date(timestampMs(raw)).toISOString(),
    signature: raw.signature,
    listingId: raw.listingId != null ? String(raw.listingId) : undefined,
    buyer: raw.buyer,
    seller: raw.seller,
  };
}

export async function fetchRecentSales(options?: {
  itemType?: string;
  limit?: number;
}): Promise<KinTradeSale[]> {
  const cacheKey = "kintrade:recent-sales";
  const cached = getCached<KinTradeSale[]>(cacheKey);
  let all: KinTradeSale[];

  if (cached && !cached.stale) {
    all = cached.value;
  } else {
    const res = await fetchWithTimeout(`${BASE}/api/recent-sales`, {
      timeoutMs: 12000,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (cached) return filterSales(cached.value, options);
      throw new Error(`kintrade recent-sales failed: ${res.status}`);
    }
    const json: unknown = await res.json();
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) {
      if (cached) return filterSales(cached.value, options);
      throw new Error("Unexpected kintrade recent-sales shape");
    }
    all = parsed.data.sales.map(normalizeSale);
    setCache(cacheKey, all, 45);
  }

  return filterSales(all, options);
}

function filterSales(
  sales: KinTradeSale[],
  options?: { itemType?: string; limit?: number },
): KinTradeSale[] {
  let out = sales;
  if (options?.itemType) {
    const t = options.itemType.toLowerCase();
    out = out.filter(
      (s) =>
        s.itemType.toLowerCase() === t ||
        s.itemType.replace(/_/g, "-") === t.replace(/_/g, "-"),
    );
  }
  const limit = options?.limit ?? 50;
  return out.slice(0, Math.min(Math.max(limit, 1), 200));
}

export function salesToSoldSamples(sales: KinTradeSale[]): SoldSample[] {
  return sales.map((s) => ({
    timestamp: s.timestamp,
    unitPriceKins: s.unitKins,
    quantity: s.quantity,
    saleCount: 1,
  }));
}

/** Median unit KINS from recent sales for an item (buyer-paid). */
export function medianUnitKins(sales: KinTradeSale[]): string | null {
  if (!sales.length) return null;
  const vals = sales
    .map((s) => d(s.unitKins))
    .filter((v) => v.gt(0))
    .sort((a, b) => a.cmp(b));
  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  if (vals.length % 2 === 0) {
    return vals[mid - 1].plus(vals[mid]).div(2).toFixed();
  }
  return vals[mid].toFixed();
}

export type ItemSalesSummary = {
  itemType: string;
  name: string;
  saleCount: number;
  medianUnitKins: string | null;
  avgUnitKins: string | null;
  lastSaleAt: string | null;
  lastUnitKins: string | null;
};

export function summarizeSalesByItem(sales: KinTradeSale[]): ItemSalesSummary[] {
  const by = new Map<string, KinTradeSale[]>();
  for (const s of sales) {
    const list = by.get(s.itemType) ?? [];
    list.push(s);
    by.set(s.itemType, list);
  }
  return [...by.entries()]
    .map(([itemType, list]) => {
      const units = list.map((s) => d(s.unitKins)).filter((v) => v.gt(0));
      const avg =
        units.length > 0
          ? units
              .reduce((a, b) => a.plus(b), d(0))
              .div(units.length)
              .toFixed()
          : null;
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      return {
        itemType,
        name: humanizeItemType(itemType),
        saleCount: list.length,
        medianUnitKins: medianUnitKins(list),
        avgUnitKins: avg,
        lastSaleAt: sorted[0]?.timestamp ?? null,
        lastUnitKins: sorted[0]?.unitKins ?? null,
      };
    })
    .sort((a, b) => b.saleCount - a.saleCount);
}
