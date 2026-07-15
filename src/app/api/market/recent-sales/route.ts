import { ok } from "@/lib/api/response";
import { fetchOfficialRecentActivity } from "@/lib/kintara/official-marketplace";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";

export const runtime = "nodejs";

/** Alias: recent marketplace activity from official listings. */
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
        sales: rows.map((r) => ({
          ...r,
          solscanUrl: null,
        })),
        byItem: [],
        note: "Newest official marketplace listings (read-only).",
      },
      { source: "kintara.com", updatedAt: new Date().toISOString() },
    );
  } catch {
    return ok(
      { sales: [], byItem: [], note: "Activity unavailable." },
      { source: "kintara.com" },
    );
  }
}
