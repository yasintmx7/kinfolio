import { getKintaraApiConfig } from "@/config/kintara-api";
import { fetchWithTimeout } from "@/lib/api/cache";
import { z } from "zod";

export type SoldSample = {
  timestamp: string;
  unitPriceKins: string;
  quantity?: string;
  saleCount?: number;
};

export type ItemMarketStats = {
  itemId: string;
  currency: "token" | "gold" | "unknown";
  lowestActiveKins?: string;
  medianCheapest3Kins?: string;
  avg30dKins?: string;
  sales30d?: number;
  samples: SoldSample[];
  updatedAt: string;
};

export type MarketplaceListing = {
  id: string;
  itemId: string;
  quantity: string;
  totalPriceKins: string;
  unitPriceKins: string;
  seller?: string;
  createdAt?: string;
};

export type MarketplaceItem = {
  id: string;
  name: string;
  imageUrl?: string;
};

export type ReferencePrice = {
  itemId: string;
  unitPriceKins: string;
  method: string;
  updatedAt: string;
};

export type TimeRange = "7d" | "30d" | "90d";

export interface KintaraMarketplaceAdapter {
  getCatalog(): Promise<MarketplaceItem[]>;
  getActiveListings(itemId: string): Promise<MarketplaceListing[]>;
  getItemStats(itemId: string): Promise<ItemMarketStats>;
  getSoldHistory(itemId: string, range?: TimeRange): Promise<SoldSample[]>;
  getReferencePrices(itemIds: string[]): Promise<Record<string, ReferencePrice>>;
}

const statsSampleSchema = z.object({
  date: z.string().optional(),
  timestamp: z.string().optional(),
  avgUnitPrice: z.union([z.string(), z.number()]).optional(),
  unitPrice: z.union([z.string(), z.number()]).optional(),
  sales: z.number().optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
});

const statsResponseSchema = z.object({
  ok: z.boolean().optional(),
  currency: z.enum(["token", "gold", "unknown"]).optional(),
  avg30d: z.union([z.string(), z.number()]).optional(),
  samples: z.array(statsSampleSchema).optional(),
  lowest: z.union([z.string(), z.number()]).optional(),
  medianCheapest3: z.union([z.string(), z.number()]).optional(),
  sales30d: z.number().optional(),
});

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

function joinUrl(base: string, path: string): string {
  if (!base) return path;
  if (!path) return base;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function normalizeItemStats(
  itemId: string,
  payload: unknown,
): ItemMarketStats {
  const parsed = statsResponseSchema.safeParse(payload);
  const data = parsed.success ? parsed.data : {};
  const samples: SoldSample[] = (data.samples ?? []).map((s) => ({
    timestamp: s.timestamp ?? s.date ?? new Date().toISOString(),
    unitPriceKins: String(s.avgUnitPrice ?? s.unitPrice ?? "0"),
    quantity: s.quantity != null ? String(s.quantity) : undefined,
    saleCount: s.sales,
  }));

  return {
    itemId,
    currency: data.currency ?? "token",
    lowestActiveKins: data.lowest != null ? String(data.lowest) : undefined,
    medianCheapest3Kins:
      data.medianCheapest3 != null ? String(data.medianCheapest3) : undefined,
    avg30dKins: data.avg30d != null ? String(data.avg30d) : undefined,
    sales30d: data.sales30d,
    samples,
    updatedAt: new Date().toISOString(),
  };
}

async function resolveKinsUsd(): Promise<number | undefined> {
  try {
    const { resolveKinsUsdForMarket } = await import(
      "@/lib/prices/kintaramarket-ticker"
    );
    const resolved = await resolveKinsUsdForMarket();
    return resolved?.kinsUsd;
  } catch {
    return undefined;
  }
}

export class ConfigurableMarketplaceAdapter implements KintaraMarketplaceAdapter {
  async getCatalog(): Promise<MarketplaceItem[]> {
    const cfg = getKintaraApiConfig();
    if (!cfg.catalog.enabled) return [];

    if (cfg.provider === "kintaramarket.xyz") {
      const { getCatalogFromKintaraMarket } = await import(
        "@/lib/kintara/kintaramarket-xyz"
      );
      return getCatalogFromKintaraMarket();
    }

    const url = joinUrl(cfg.baseUrl, cfg.catalog.pathTemplate);
    const res = await fetchWithTimeout(url, { timeoutMs: cfg.catalog.timeoutMs });
    if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
    const json: unknown = await res.json();
    if (!Array.isArray(json)) return [];
    return json.map((row, i) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id ?? r.itemId ?? r.itemType ?? i),
        name: String(r.name ?? r.title ?? r.itemType ?? "Unknown"),
        imageUrl: r.imageUrl ? String(r.imageUrl) : r.image ? String(r.image) : undefined,
      };
    });
  }

  async getActiveListings(itemId: string): Promise<MarketplaceListing[]> {
    const cfg = getKintaraApiConfig();
    if (!cfg.listings.enabled) return [];

    if (cfg.provider === "kintaramarket.xyz") {
      const kinsUsd = await resolveKinsUsd();
      const { getListingsFromKintaraMarket } = await import(
        "@/lib/kintara/kintaramarket-xyz"
      );
      return getListingsFromKintaraMarket(itemId, kinsUsd);
    }

    const path = fillTemplate(cfg.listings.pathTemplate, { itemId });
    const url = joinUrl(cfg.baseUrl, path);
    const res = await fetchWithTimeout(url, { timeoutMs: cfg.listings.timeoutMs });
    if (!res.ok) throw new Error(`Listings fetch failed: ${res.status}`);
    const json: unknown = await res.json();
    const rows = Array.isArray(json)
      ? json
      : Array.isArray((json as { listings?: unknown }).listings)
        ? (json as { listings: unknown[] }).listings
        : [];
    return rows.map((row, i) => {
      const r = row as Record<string, unknown>;
      const qty = String(r.quantity ?? r.qty ?? "1");
      const total = String(r.totalPriceKins ?? r.totalPrice ?? r.price ?? "0");
      const unit =
        r.unitPriceKins != null
          ? String(r.unitPriceKins)
          : String(Number(total) / Math.max(Number(qty) || 1, 1));
      return {
        id: String(r.id ?? `${itemId}-${i}`),
        itemId,
        quantity: qty,
        totalPriceKins: total,
        unitPriceKins: unit,
        seller: r.seller ? String(r.seller) : r.sellerName ? String(r.sellerName) : undefined,
        createdAt: r.createdAt ? String(r.createdAt) : undefined,
      };
    });
  }

  async getItemStats(itemId: string): Promise<ItemMarketStats> {
    const cfg = getKintaraApiConfig();
    if (!cfg.itemStats.enabled) {
      return {
        itemId,
        currency: "unknown",
        samples: [],
        updatedAt: new Date().toISOString(),
      };
    }

    if (cfg.provider === "kintaramarket.xyz") {
      const kinsUsd = await resolveKinsUsd();
      const { getStatsFromKintaraMarket } = await import(
        "@/lib/kintara/kintaramarket-xyz"
      );
      return getStatsFromKintaraMarket(itemId, kinsUsd);
    }

    const path = fillTemplate(cfg.itemStats.pathTemplate, { itemId });
    const url = joinUrl(cfg.baseUrl, path);
    const res = await fetchWithTimeout(url, { timeoutMs: cfg.itemStats.timeoutMs });
    if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
    const json: unknown = await res.json();
    // If response is a listings array (kintaramarket-style), normalize via stats helper shape
    if (Array.isArray(json)) {
      return normalizeItemStats(itemId, {
        currency: "token",
        samples: json.slice(0, 30).map((row) => {
          const r = row as Record<string, unknown>;
          return {
            unitPrice: r.unitPrice ?? r.avgUnitPrice,
            sales: r.sales,
            quantity: r.quantity,
            date: r.date,
          };
        }),
      });
    }
    return normalizeItemStats(itemId, json);
  }

  async getSoldHistory(itemId: string, _range?: TimeRange): Promise<SoldSample[]> {
    void _range;
    const cfg = getKintaraApiConfig();
    if (cfg.provider === "kintaramarket.xyz") {
      const stats = await this.getItemStats(itemId);
      return stats.samples;
    }
    if (!cfg.soldHistory.enabled) return [];
    const path = fillTemplate(cfg.soldHistory.pathTemplate, { itemId });
    const url = joinUrl(cfg.baseUrl, path);
    const res = await fetchWithTimeout(url, { timeoutMs: cfg.soldHistory.timeoutMs });
    if (!res.ok) throw new Error(`Sold history fetch failed: ${res.status}`);
    const json: unknown = await res.json();
    return normalizeItemStats(itemId, json).samples;
  }

  async getReferencePrices(
    itemIds: string[],
  ): Promise<Record<string, ReferencePrice>> {
    const cfg = getKintaraApiConfig();
    if (cfg.provider === "kintaramarket.xyz") {
      const kinsUsd = await resolveKinsUsd();
      if (kinsUsd == null) return {};
      const { getReferencePricesFromKintaraMarket } = await import(
        "@/lib/kintara/kintaramarket-xyz"
      );
      return getReferencePricesFromKintaraMarket(itemIds, kinsUsd);
    }

    const out: Record<string, ReferencePrice> = {};
    for (const itemId of itemIds) {
      try {
        const stats = await this.getItemStats(itemId);
        const price =
          stats.lowestActiveKins ?? stats.medianCheapest3Kins ?? stats.avg30dKins;
        if (price) {
          out[itemId] = {
            itemId,
            unitPriceKins: price,
            method: stats.lowestActiveKins
              ? "lowest_active_listing"
              : stats.medianCheapest3Kins
                ? "median_cheapest_3"
                : "avg_30d",
            updatedAt: stats.updatedAt,
          };
        }
      } catch {
        // skip item
      }
    }
    return out;
  }
}

export const marketplaceAdapter = new ConfigurableMarketplaceAdapter();
