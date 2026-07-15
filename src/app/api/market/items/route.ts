import { isMarketplaceConfigured } from "@/config/kintara-api";
import { marketplaceAdapter } from "@/lib/kintara/marketplace-adapter";
import { fail, ok } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET() {
  if (!isMarketplaceConfigured()) {
    return ok(
      {
        items: [],
        configured: false,
        message:
          "Marketplace API not configured. Set KINTARA_PUBLIC_API_BASE and path env vars after F12 mapping.",
      },
      { source: "unconfigured" },
    );
  }

  try {
    const items = await marketplaceAdapter.getCatalog();
    return ok({ items, configured: true }, { source: "marketplace" });
  } catch (e) {
    return fail(
      "MARKET_CATALOG_ERROR",
      e instanceof Error ? e.message : "Failed to load market catalog",
      { status: 502, retryable: true },
    );
  }
}
