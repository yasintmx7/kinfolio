/**
 * Read-only Kintara marketplace API configuration.
 * Default public source: https://kintaramarket.xyz/api/market
 */

export type EndpointConfig = {
  method: "GET" | "POST";
  /** Path template relative to base, e.g. /api/market/{itemId} */
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
  provider: "kintaramarket.xyz" | "custom" | "none";
};

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

const DEFAULT_BASE = "https://kintaramarket.xyz";
const DEFAULT_CATALOG = "/api/market";
const DEFAULT_LISTINGS = "/api/market/{itemId}";

export function getKintaraApiConfig(): KintaraApiConfig {
  const baseUrl = env("KINTARA_PUBLIC_API_BASE", DEFAULT_BASE);
  const catalogPath = env("KINTARA_CATALOG_PATH", DEFAULT_CATALOG);
  const listingsPath = env("KINTARA_LISTINGS_PATH", DEFAULT_LISTINGS);
  const statsPath = env("KINTARA_ITEM_STATS_PATH", DEFAULT_LISTINGS);
  const soldPath = env("KINTARA_SOLD_HISTORY_PATH");

  const provider =
    !baseUrl
      ? "none"
      : baseUrl.includes("kintaramarket.xyz")
        ? "kintaramarket.xyz"
        : "custom";

  return {
    baseUrl,
    provider,
    catalog: {
      method: "GET",
      pathTemplate: catalogPath,
      timeoutMs: 10000,
      cacheTtlSeconds: 60,
      enabled: Boolean(baseUrl && catalogPath),
    },
    listings: {
      method: "GET",
      pathTemplate: listingsPath,
      timeoutMs: 10000,
      cacheTtlSeconds: 45,
      enabled: Boolean(baseUrl && listingsPath),
    },
    itemStats: {
      method: "GET",
      pathTemplate: statsPath || listingsPath,
      timeoutMs: 10000,
      cacheTtlSeconds: 60,
      enabled: Boolean(baseUrl && (statsPath || listingsPath)),
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
  return (
    Boolean(cfg.baseUrl) &&
    (cfg.catalog.enabled || cfg.listings.enabled || cfg.itemStats.enabled)
  );
}
