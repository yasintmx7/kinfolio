import { STATIC_CATALOG } from "@/data/static-catalog";
import { ok } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET() {
  return ok(
    {
      items: STATIC_CATALOG,
      source: "static_seed",
      count: STATIC_CATALOG.length,
    },
    {
      source: "static_seed",
      updatedAt: new Date().toISOString(),
      cacheControl: "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  );
}
