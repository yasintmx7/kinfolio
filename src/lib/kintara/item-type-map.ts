import type { KintaraItem } from "@/lib/accounting/types";

/** Explicit market itemType → portfolio catalog id */
export const MARKET_TYPE_TO_PORTFOLIO_ID: Record<string, string> = {
  stone: "stone",
  wood: "wood",
  coal: "coal",
  metal: "metal",
  gold: "gold",
  fish: "fish",
  cooked_fish_meat: "cooked-fish",
  molten_rock: "molten-rock",
  brute_horn: "brute-horn",
  potion_health: "health-potion",
  potion_shield: "shield-potion",
  potion_strength: "strength-potion",
  potion_poison: "poison-potion",
  tool_axe_l2: "axe",
  tool_pickaxe_l2: "pickaxe",
  wild_sword_l2: "wild-sword",
  raw_chicken: "raw-chicken",
  cooked_chicken: "cooked-chicken",
};

/** Human-readable title from market itemType */
export function humanizeItemType(itemType: string): string {
  const mapped: Record<string, string> = {
    cooked_fish_meat: "Cooked Fish",
    potion_health: "Health Potion",
    potion_shield: "Shield Potion",
    potion_strength: "Strength Potion",
    potion_poison: "Poison Potion",
    tool_axe_l2: "Axe Lv.2",
    tool_pickaxe_l2: "Pickaxe Lv.2",
    wild_sword_l2: "Wild Sword Lv.2",
    molten_rock: "Molten Rock",
    brute_horn: "Brute Horn",
    raw_chicken: "Raw Chicken",
    cooked_chicken: "Cooked Chicken",
  };
  if (mapped[itemType]) return mapped[itemType];
  return itemType
    .replace(/^cosmetic_/, "")
    .replace(/^mount_/, "Mount ")
    .replace(/^pet_/, "Pet ")
    .replace(/^furniture_/, "")
    .replace(/^tool_/, "")
    .replace(/^potion_/, "")
    .replace(/_l(\d+)$/, " Lv.$1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function marketTypeToPortfolioId(
  itemType: string,
  catalog: KintaraItem[],
): string | undefined {
  const direct = MARKET_TYPE_TO_PORTFOLIO_ID[itemType];
  if (direct && catalog.some((i) => i.id === direct)) return direct;

  const dashed = itemType.replace(/_/g, "-");
  if (catalog.some((i) => i.id === dashed)) return dashed;

  const q = itemType.toLowerCase();
  const byAlias = catalog.find(
    (i) =>
      i.id === q ||
      i.slug === q ||
      i.aliases.some((a) => a.toLowerCase() === q || a.toLowerCase() === dashed) ||
      i.name.toLowerCase().replace(/\s+/g, "_") === q,
  );
  return byAlias?.id;
}

export function portfolioIdToMarketType(
  portfolioId: string,
  catalog: KintaraItem[],
): string {
  const reverse = Object.entries(MARKET_TYPE_TO_PORTFOLIO_ID).find(
    ([, id]) => id === portfolioId,
  );
  if (reverse) return reverse[0];

  const item = catalog.find((i) => i.id === portfolioId);
  if (item) {
    const alias = item.aliases.find((a) => a.includes("_"));
    if (alias) return alias;
  }
  return portfolioId.replace(/-/g, "_");
}
