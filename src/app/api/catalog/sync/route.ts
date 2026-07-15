import { STATIC_CATALOG } from "@/data/static-catalog";
import { fetchWithTimeout, getCached, setCache } from "@/lib/api/cache";
import { ok } from "@/lib/api/response";
import { z } from "zod";

export const runtime = "nodejs";

const CACHE_KEY = "wiki-catalog-sync";

const wikiSearchSchema = z.object({
  query: z
    .object({
      categorymembers: z
        .array(
          z.object({
            title: z.string(),
            pageid: z.number().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

async function fetchWikiCategory(category: string): Promise<string[]> {
  const url = new URL("https://kintara.wiki/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "categorymembers");
  url.searchParams.set("cmtitle", category);
  url.searchParams.set("cmlimit", "100");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const res = await fetchWithTimeout(url.toString(), { timeoutMs: 10000 });
  if (!res.ok) throw new Error(`Wiki HTTP ${res.status}`);
  const json: unknown = await res.json();
  const parsed = wikiSearchSchema.safeParse(json);
  if (!parsed.success) return [];
  return (parsed.data.query?.categorymembers ?? [])
    .map((m) => m.title)
    .filter((t) => !t.startsWith("Category:"));
}

export async function POST() {
  const cached = getCached<{ titles: string[]; source: string }>(CACHE_KEY);
  if (cached && !cached.stale) {
    return ok(
      {
        titles: cached.value.titles,
        source: cached.value.source,
        staticFallbackCount: STATIC_CATALOG.length,
        fromCache: true,
      },
      { source: cached.value.source, cached: true, updatedAt: cached.updatedAt },
    );
  }

  try {
    const [items, resources] = await Promise.all([
      fetchWikiCategory("Category:Items"),
      fetchWikiCategory("Category:Resources"),
    ]);
    const titles = Array.from(new Set([...items, ...resources])).sort();
    if (titles.length === 0) {
      return ok(
        {
          titles: STATIC_CATALOG.map((i) => i.name),
          source: "static_seed",
          staticFallbackCount: STATIC_CATALOG.length,
          note: "Wiki returned empty; using static catalog.",
        },
        { source: "static_seed", stale: false },
      );
    }
    setCache(CACHE_KEY, { titles, source: "wiki" }, 86400);
    return ok(
      {
        titles,
        source: "wiki",
        staticFallbackCount: STATIC_CATALOG.length,
      },
      {
        source: "wiki",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=86400",
      },
    );
  } catch {
    if (cached) {
      return ok(
        {
          titles: cached.value.titles,
          source: "cache",
          staticFallbackCount: STATIC_CATALOG.length,
          fromCache: true,
        },
        { source: "cache", stale: true, cached: true },
      );
    }
    return ok(
      {
        titles: STATIC_CATALOG.map((i) => i.name),
        source: "static_seed",
        staticFallbackCount: STATIC_CATALOG.length,
        note: "Wiki sync failed; static catalog available.",
      },
      { source: "static_seed" },
    );
  }
}

export async function GET() {
  return POST();
}
