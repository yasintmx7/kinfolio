import type { KintaraItem } from "@/lib/accounting/types";
import { FAVORITE_ITEM_NAMES } from "@/config/kintara";
import { resolveWikiItemImage } from "@/lib/kintara/wiki-images";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function item(
  name: string,
  category: KintaraItem["category"],
  aliases: string[] = [],
): KintaraItem {
  const id = slugify(name);
  return {
    id,
    name,
    slug: id,
    category,
    aliases,
    isFavoriteDefault: (FAVORITE_ITEM_NAMES as readonly string[]).includes(name),
    isTradeable: true,
    source: "static_seed",
    updatedAt: "2026-01-01T00:00:00.000Z",
    wikiUrl: `https://kintara.wiki/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`,
    imageUrl: resolveWikiItemImage(id, [name, ...aliases]),
  };
}

/** Checked-in static catalog fallback when wiki/marketplace APIs are unavailable. */
export const STATIC_CATALOG: KintaraItem[] = [
  item("Axe", "tool", ["Axe Lv.1", "Axe Lv.2", "Lvl 2 Axe", "tool_axe_l2"]),
  item("Pickaxe", "tool", [
    "Pickaxe Lv.1",
    "Pickaxe Lv.2",
    "Lvl 2 Pickaxe",
    "tool_pickaxe_l2",
  ]),
  item("Wild Sword", "weapon", [
    "Sword",
    "Sword Lv.2",
    "Lvl 2 Sword",
    "wild_sword_l2",
  ]),
  item("Wood", "resource", ["wood"]),
  item("Coal", "resource", ["coal"]),
  item("Stone", "resource", ["stone"]),
  item("Metal", "resource", ["metal"]),
  item("Gold", "resource", ["gold"]),
  item("Cooked Fish", "food", ["Cooked Fish Meat", "cooked_fish_meat"]),
  item("Fish", "food", ["Raw Fish", "fish"]),
  item("Health Potion", "potion", ["potion_health"]),
  item("Shield Potion", "potion", ["potion_shield"]),
  item("Strength Potion", "potion", ["potion_strength"]),
  item("Poison Potion", "potion", ["potion_poison"]),
  item("Molten Rock", "resource", ["molten_rock"]),
  item("Brute Horn", "resource", ["brute_horn"]),
  item("Raw Chicken", "food", ["raw_chicken"]),
  item("Cooked Chicken", "food", ["cooked_chicken"]),
  item("Iron Ore", "resource"),
  item("Copper Ore", "resource"),
  item("Silver Ore", "resource"),
  item("Crystal", "resource"),
  item("Leather", "resource"),
  item("Cloth", "resource"),
  item("Rope", "resource"),
  item("Arrow", "weapon"),
  item("Bow", "weapon"),
  item("Shield", "weapon"),
  item("Helmet", "cosmetic"),
  item("Armor", "cosmetic"),
  item("Boots", "cosmetic"),
  item("Backpack", "other"),
  item("Key", "key"),
  item("Treasure Map", "key"),
  item("Membership Pass", "membership"),
  item("Pet Egg", "pet"),
  item("Mount Whistle", "mount"),
  item("Furniture Crate", "furniture"),
  item("Berry", "food"),
  item("Meat", "food"),
  item("Bread", "food"),
  item("Water", "food"),
  item("Energy Potion", "potion"),
  item("Speed Potion", "potion"),
  item("Luck Potion", "potion"),
  item("Iron Bar", "resource"),
  item("Gold Bar", "resource"),
  item("Plank", "resource"),
  item("Charcoal", "resource"),
  item("Sand", "resource"),
  item("Clay", "resource"),
  item("Gem", "resource"),
  item("Fiber", "resource"),
];

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
