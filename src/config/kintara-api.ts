/**
 * Official Kintara marketplace configuration (read-only).
 * Default: https://kintara.com
 */

export type EndpointConfig = {
  method: "GET" | "POST";
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
  provider: "kintara.com" | "custom" | "none";
};

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

const DEFAULT_BASE = "https://kintara.com";
const DEFAULT_LISTINGS = "/api/marketplace/listings";
const DEFAULT_STATS = "/api/marketplace/stats";

export function getKintaraApiConfig(): KintaraApiConfig {
  const baseUrl = env("KINTARA_PUBLIC_API_BASE", DEFAULT_BASE);
  const listingsPath = env("KINTARA_LISTINGS_PATH", DEFAULT_LISTINGS);
  const statsPath = env("KINTARA_ITEM_STATS_PATH", DEFAULT_STATS);
  const catalogPath = env("KINTARA_CATALOG_PATH", DEFAULT_LISTINGS);
  const soldPath = env("KINTARA_SOLD_HISTORY_PATH");

  const provider =
    !baseUrl
      ? "none"
      : baseUrl.includes("kintara.com")
        ? "kintara.com"
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
      pathTemplate: statsPath,
      timeoutMs: 10000,
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
  return Boolean(cfg.baseUrl) && cfg.listings.enabled;
}
