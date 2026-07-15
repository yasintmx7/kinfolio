import { isMarketplaceConfigured } from "@/config/kintara-api";
import { marketplaceAdapter } from "@/lib/kintara/marketplace-adapter";
import { fail, ok } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  if (!itemId || itemId.length > 128) {
    return fail("INVALID_ITEM", "Invalid item id", { status: 400 });
  }

  if (!isMarketplaceConfigured()) {
    return ok(
      {
        itemId,
        currency: "unknown" as const,
        samples: [],
        updatedAt: new Date().toISOString(),
        configured: false,
      },
      { source: "unconfigured" },
    );
  }

  try {
    const stats = await marketplaceAdapter.getItemStats(itemId);
    return ok({ ...stats, configured: true }, { source: "marketplace" });
  } catch (e) {
    return fail(
      "MARKET_STATS_ERROR",
      e instanceof Error ? e.message : "Failed to load item stats",
      { status: 502, retryable: true },
    );
  }
}
