import { fail, ok } from "@/lib/api/response";
import { fetchOfficialRecentActivity } from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";

export const runtime = "nodejs";

/**
 * Recent marketplace activity from official listings (sort=new).
 */
export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  try {
    const rate = await resolveKinsUsd();
    const rows = await fetchOfficialRecentActivity({
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50,
      kinsUsd: rate?.kinsUsd,
    });

    return ok(
      {
        activity: rows.map((r) => ({
          id: r.id,
          name: r.name,
          itemType: r.itemType,
          quantity: r.quantity,
          unitKins: r.unitKins,
          unitUsd: r.unitUsd,
          usdTotal: r.usdTotal,
          timestamp: r.timestamp,
          seller: r.seller,
          portfolioItemId: marketTypeToPortfolioId(r.itemType, STATIC_CATALOG),
          solscanUrl: null,
        })),
        note: "Newest public marketplace listings (read-only).",
      },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=30, stale-while-revalidate=60",
      },
    );
  } catch (e) {
    return fail(
      "ACTIVITY_ERROR",
      e instanceof Error ? e.message : "Failed to load market activity",
      { status: 502, retryable: true },
    );
  }
}
