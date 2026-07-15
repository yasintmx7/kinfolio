import { fail, ok } from "@/lib/api/response";
import { fetchGameServers } from "@/lib/kintara/official-marketplace";

export const runtime = "nodejs";

export async function GET() {
  try {
    const servers = await fetchGameServers();
    return ok(
      { servers },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=60, stale-while-revalidate=180",
      },
    );
  } catch (e) {
    return fail(
      "SERVERS_ERROR",
      e instanceof Error ? e.message : "Failed to load servers",
      { status: 502, retryable: true },
    );
  }
}
