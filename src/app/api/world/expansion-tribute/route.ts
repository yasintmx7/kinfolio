import { fail, ok } from "@/lib/api/response";
import { fetchExpansionTribute } from "@/lib/kintara/official-marketplace";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await fetchExpansionTribute();
    return ok(data, {
      source: "fanout.kintara.gg",
      updatedAt: new Date().toISOString(),
      cacheControl: "public, s-maxage=45, stale-while-revalidate=120",
    });
  } catch (e) {
    return fail(
      "EXPANSION_TRIBUTE_ERROR",
      e instanceof Error ? e.message : "Failed to load expansion tribute",
      { status: 502, retryable: true },
    );
  }
}
