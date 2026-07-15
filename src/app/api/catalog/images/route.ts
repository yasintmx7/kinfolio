import { ok } from "@/lib/api/response";
import {
  getWikiAttribution,
  getWikiImageMeta,
  getWikiLogoUrl,
  resolveWikiItemImage,
} from "@/lib/kintara/wiki-images";
import { STATIC_CATALOG } from "@/data/static-catalog";

export const runtime = "nodejs";

/**
 * Returns wiki image URLs for catalog items.
 * Artwork sourced from https://kintara.wiki (MediaWiki allimages).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean);

  const items = (ids?.length
    ? STATIC_CATALOG.filter((i) => ids.includes(i.id))
    : STATIC_CATALOG
  ).map((item) => ({
    id: item.id,
    name: item.name,
    imageUrl:
      resolveWikiItemImage(item.id, [item.name, ...item.aliases]) ?? null,
    wikiUrl: item.wikiUrl ?? null,
  }));

  return ok(
    {
      items,
      meta: getWikiImageMeta(),
      attribution: getWikiAttribution(),
      wikiLogo: getWikiLogoUrl() ?? null,
    },
    {
      source: "kintara.wiki",
      updatedAt: getWikiImageMeta().generatedAt,
      cacheControl: "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  );
}
