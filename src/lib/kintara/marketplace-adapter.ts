/**
 * Marketplace adapter — official kintara.com read-only paths.
 * Write endpoints (reserve/quote/buy) are never implemented.
 */

import {
  fetchOfficialItemStats,
  fetchOfficialListingsForItem,
  buildOfficialFloorBoard,
} from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { humanizeItemType } from "@/lib/kintara/item-type-map";
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

export class ConfigurableMarketplaceAdapter implements KintaraMarketplaceAdapter {
  async getCatalog(): Promise<MarketplaceItem[]> {
    const rate = await resolveKinsUsd();
    const floors = await buildOfficialFloorBoard({
      pages: 4,
      kinsUsd: rate?.kinsUsd,
    });
    return floors.map((f) => ({
      id: f.itemType,
      name: f.name || humanizeItemType(f.itemType),
    }));
  }

  async getActiveListings(itemId: string): Promise<MarketplaceListing[]> {
    const rate = await resolveKinsUsd();
    return fetchOfficialListingsForItem(itemId, {
      pages: 4,
      kinsUsd: rate?.kinsUsd,
    });
  }

  async getItemStats(itemId: string): Promise<ItemMarketStats> {
    const rate = await resolveKinsUsd();
    return fetchOfficialItemStats(itemId, rate?.kinsUsd);
  }

  async getSoldHistory(itemId: string, _range?: TimeRange): Promise<SoldSample[]> {
    void _range;
    const stats = await this.getItemStats(itemId);
    return stats.samples;
  }

  async getReferencePrices(
    itemIds: string[],
  ): Promise<Record<string, ReferencePrice>> {
    const rate = await resolveKinsUsd();
    const floors = await buildOfficialFloorBoard({
      pages: 5,
      kinsUsd: rate?.kinsUsd,
    });
    const out: Record<string, ReferencePrice> = {};
    const now = new Date().toISOString();
    for (const id of itemIds) {
      const row = floors.find((f) => f.itemType === id);
      if (row?.lowestKinsPerUnit) {
        out[id] = {
          itemId: id,
          unitPriceKins: row.lowestKinsPerUnit,
          method: "lowest_active_listing",
          updatedAt: now,
        };
      }
    }
    return out;
  }
}

export const marketplaceAdapter = new ConfigurableMarketplaceAdapter();
