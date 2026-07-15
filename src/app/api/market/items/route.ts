import { getKintaraApiConfig, isMarketplaceConfigured } from "@/config/kintara-api";
import { fail, ok } from "@/lib/api/response";
import { STATIC_CATALOG } from "@/data/static-catalog";
import {
  marketTypeToPortfolioId,
} from "@/lib/kintara/item-type-map";

export const runtime = "nodejs";

export async function GET() {
  if (!isMarketplaceConfigured()) {
    return ok(
      {
        items: [],
        configured: false,
        message:
          "Marketplace API not configured. Set KINTARA_PUBLIC_API_BASE.",
      },
      { source: "unconfigured" },
    );
  }

  const cfg = getKintaraApiConfig();

  try {
    // Prefer dedicated kintaramarket.xyz summary (includes USD floors)
    if (cfg.provider === "kintaramarket.xyz") {
      const { fetchMarketSummary, normalizeSummary } = await import(
        "@/lib/kintara/kintaramarket-xyz"
      );
      const { fetchDexScreenerKinsPrice } = await import("@/lib/prices/dexscreener");
      const { fetchCoinGeckoKinsPrice } = await import("@/lib/prices/coingecko");

      let kinsUsd: number | undefined;
      try {
        const dex = await fetchDexScreenerKinsPrice();
        if (dex?.priceUsd) kinsUsd = Number(dex.priceUsd);
        if (kinsUsd == null) {
          const cg = await fetchCoinGeckoKinsPrice();
          if (cg?.priceUsd) kinsUsd = Number(cg.priceUsd);
        }
      } catch {
        // continue without conversion
      }

      const raw = await fetchMarketSummary();
      const rows = normalizeSummary(raw, kinsUsd).map((row) => ({
        ...row,
        portfolioItemId: marketTypeToPortfolioId(row.itemType, STATIC_CATALOG),
      }));

      return ok(
        {
          items: rows.map((r) => ({
            id: r.itemType,
            name: r.name,
            portfolioItemId: r.portfolioItemId,
            listings: r.listings,
            totalQty: r.totalQty,
            lowestUsdPerUnit: r.lowestUsdPerUnit,
            lowestKinsPerUnit: r.lowestKinsPerUnit,
            lowestGoldPerUnit: r.lowestGoldPerUnit,
            kinsListings: r.kinsListings,
            goldListings: r.goldListings,
          })),
          configured: true,
          provider: cfg.provider,
          kinsUsd: kinsUsd != null ? String(kinsUsd) : null,
          note:
            "Prices from kintaramarket.xyz are USD floors. KINS/unit = USD/unit ÷ KINS/USD. Estimates only — not guaranteed sales.",
        },
        {
          source: "kintaramarket.xyz",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=45, stale-while-revalidate=120",
        },
      );
    }

    const { marketplaceAdapter } = await import(
      "@/lib/kintara/marketplace-adapter"
    );
    const items = await marketplaceAdapter.getCatalog();
    return ok(
      { items, configured: true, provider: cfg.provider },
      { source: "marketplace" },
    );
  } catch (e) {
    return fail(
      "MARKET_CATALOG_ERROR",
      e instanceof Error ? e.message : "Failed to load market catalog",
      { status: 502, retryable: true },
    );
  }
}
