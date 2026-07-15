/**
 * Read-only Kintara marketplace API configuration slots.
 * Leave paths empty until sanitized F12 captures are mapped in docs/KINTARA_F12_API_MAPPING.md.
 */

export type EndpointConfig = {
  method: "GET" | "POST";
  /** Path template relative to base, e.g. /items/{itemId}/listings */
  pathTemplate: string;
  timeoutMs: number;
  cacheTtlSeconds: number;
  enabled: boolean;
};

export type KintaraApiConfig = {
  baseUrl: string;
  catalog: EndpointConfig;
  listings: EndpointConfig;
  itemStats: EndpointConfig;
  soldHistory: EndpointConfig;
};

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function getKintaraApiConfig(): KintaraApiConfig {
  const baseUrl = env("KINTARA_PUBLIC_API_BASE");
  const catalogPath = env("KINTARA_CATALOG_PATH");
  const listingsPath = env("KINTARA_LISTINGS_PATH");
  const statsPath = env("KINTARA_ITEM_STATS_PATH");
  const soldPath = env("KINTARA_SOLD_HISTORY_PATH");

  return {
    baseUrl,
    catalog: {
      method: "GET",
      pathTemplate: catalogPath,
      timeoutMs: 8000,
      cacheTtlSeconds: 3600,
      enabled: Boolean(baseUrl && catalogPath),
    },
    listings: {
      method: "GET",
      pathTemplate: listingsPath,
      timeoutMs: 8000,
      cacheTtlSeconds: 60,
      enabled: Boolean(baseUrl && listingsPath),
    },
    itemStats: {
      method: "GET",
      pathTemplate: statsPath,
      timeoutMs: 8000,
      cacheTtlSeconds: 120,
      enabled: Boolean(baseUrl && statsPath),
    },
    soldHistory: {
      method: "GET",
      pathTemplate: soldPath,
      timeoutMs: 8000,
      cacheTtlSeconds: 300,
      enabled: Boolean(baseUrl && soldPath),
    },
  };
}

export function isMarketplaceConfigured(): boolean {
  const cfg = getKintaraApiConfig();
  return Boolean(cfg.baseUrl) && (cfg.catalog.enabled || cfg.listings.enabled || cfg.itemStats.enabled);
}
