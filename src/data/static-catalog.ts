import type { KintaraItem } from "@/lib/accounting/types";
import { FAVORITE_ITEM_NAMES } from "@/config/kintara";
import fullCatalog from "@/data/full-catalog.json";
import {
  resolveProcessedItemIcon,
  resolveWikiItemImage,
} from "@/lib/kintara/wiki-images";

type FullItem = {
  id: string;
  name: string;
  slug: string;
  category: KintaraItem["category"] | string;
  aliases: string[];
  isFavoriteDefault?: boolean;
  isTradeable?: boolean;
  source?: string;
  updatedAt?: string;
  wikiUrl?: string;
  imageUrl?: string;
};

const CATEGORIES = new Set([
  "tool",
  "weapon",
  "resource",
  "food",
  "potion",
  "key",
  "mount",
  "pet",
  "cosmetic",
  "furniture",
  "membership",
  "other",
]);

function normalizeCategory(c: string): KintaraItem["category"] {
  return (CATEGORIES.has(c) ? c : "other") as KintaraItem["category"];
}

/** Full A–Z catalog from kintara.wiki (checked-in snapshot). */
export const STATIC_CATALOG: KintaraItem[] = (
  fullCatalog as { items: FullItem[] }
).items
  .map((it) => {
    const aliases = [it.name, ...(it.aliases || [])];
    const imageUrl =
      resolveProcessedItemIcon(it.id, aliases) ||
      it.imageUrl ||
      resolveWikiItemImage(it.id, aliases);
    return {
      id: it.id,
      name: it.name,
      slug: it.slug || it.id,
      category: normalizeCategory(it.category),
      aliases: it.aliases || [],
      isFavoriteDefault:
        Boolean(it.isFavoriteDefault) ||
        (FAVORITE_ITEM_NAMES as readonly string[]).includes(it.name),
      isTradeable: it.isTradeable !== false,
      source: (it.source as KintaraItem["source"]) || "wiki",
      updatedAt: it.updatedAt || new Date().toISOString(),
      wikiUrl:
        it.wikiUrl ||
        `https://kintara.wiki/wiki/${encodeURIComponent(it.name.replace(/ /g, "_"))}`,
      imageUrl,
    } satisfies KintaraItem;
  })
  .sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

export function getDefaultFavoriteIds(): string[] {
  return STATIC_CATALOG.filter((i) => i.isFavoriteDefault).map((i) => i.id);
}

export function findItemByNameOrAlias(
  query: string,
  catalog: KintaraItem[] = STATIC_CATALOG,
): KintaraItem | undefined {
  const q = query.trim().toLowerCase();
  return catalog.find(
    (i) =>
      i.name.toLowerCase() === q ||
      i.slug === q ||
      i.id === q ||
      i.aliases.some((a) => a.toLowerCase() === q),
  );
}

export const CATALOG_META = {
  count: STATIC_CATALOG.length,
  withImages: STATIC_CATALOG.filter((i) => i.imageUrl).length,
  source: (fullCatalog as { source?: string }).source ?? "https://kintara.wiki",
};
