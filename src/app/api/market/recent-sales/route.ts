import { fail, ok } from "@/lib/api/response";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import {
  fetchRecentSales,
  summarizeSalesByItem,
} from "@/lib/kintara/kintrade-sales";

export const runtime = "nodejs";

/**
 * Read-only proxy for https://www.kintrade.xyz/api/recent-sales
 * Query: itemType (optional), limit (optional, default 40)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemType = searchParams.get("itemType")?.trim() || undefined;
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 40;
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 40;

  try {
    const sales = await fetchRecentSales({ itemType, limit: safeLimit });
    const enriched = sales.map((s) => ({
      ...s,
      portfolioItemId: marketTypeToPortfolioId(s.itemType, STATIC_CATALOG),
      solscanUrl: s.signature
        ? `https://solscan.io/tx/${s.signature}`
        : null,
    }));

    return ok(
      {
        sales: enriched,
        byItem: summarizeSalesByItem(sales),
        source: "kintrade.xyz",
        note:
          "Completed marketplace sales (read-only). unitKins is buyer-paid KINS per unit. Not a guaranteed future sale price.",
      },
      {
        source: "kintrade.xyz",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=30, stale-while-revalidate=90",
      },
    );
  } catch (e) {
    return fail(
      "RECENT_SALES_ERROR",
      e instanceof Error ? e.message : "Failed to load recent sales",
      { status: 502, retryable: true },
    );
  }
}
