import wikiImages from "@/data/wiki-item-images.json";

type WikiImageData = {
  generatedAt: string;
  source: string;
  mainPage?: string;
  attribution: string;
  wikiLogo?: string;
  fileCount: number;
  keyCount: number;
  urlByKey: Record<string, string>;
};

const data = wikiImages as WikiImageData;

export function getWikiAttribution(): string {
  return data.attribution;
}

export function getWikiLogoUrl(): string | undefined {
  return data.wikiLogo;
}

export function getWikiImageMeta() {
  return {
    generatedAt: data.generatedAt,
    source: data.source,
    mainPage: data.mainPage,
    fileCount: data.fileCount,
    keyCount: data.keyCount,
  };
}

function candidatesFromId(id: string): string[] {
  const raw = id.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const underscored = lower.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const dashed = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const compact = lower.replace(/[^a-z0-9]+/g, "");
  const noPrefix = underscored
    .replace(/^(cosmetic|pet|mount|furniture|tool|potion)_/, "")
    .replace(/_l\d+$/, "");
  const noPrefixDash = dashed
    .replace(/^(cosmetic|pet|mount|furniture|tool|potion)-/, "")
    .replace(/-l\d+$/, "");

  return Array.from(
    new Set([
      lower,
      underscored,
      dashed,
      compact,
      noPrefix,
      noPrefixDash,
      noPrefix.replace(/_/g, ""),
      // common renames
      underscored.replace(/cooked_fish_meat/, "cookedfish"),
      underscored.replace(/molten_rock/, "molten_rock"),
      underscored.replace(/brute_horn/, "brutehorn"),
      underscored.replace(/wild_sword.*/, "sword"),
      underscored.replace(/tool_axe.*/, "axe"),
      underscored.replace(/tool_pickaxe.*/, "pickaxe"),
      underscored.replace(/potion_health/, "health"),
      underscored.replace(/potion_shield/, "shield"),
      underscored.replace(/potion_strength/, "strength"),
      underscored.replace(/potion_poison/, "poison"),
    ]),
  );
}

/** Resolve a wiki image URL for a portfolio id, market type, or display name. */
export function resolveWikiItemImage(
  idOrName: string | undefined | null,
  aliases: string[] = [],
): string | undefined {
  if (!idOrName) return undefined;
  const keys = [
    ...candidatesFromId(idOrName),
    ...aliases.flatMap((a) => candidatesFromId(a)),
  ];
  for (const key of keys) {
    const url = data.urlByKey[key];
    if (url) return url;
  }
  return undefined;
}

export function listWikiImageKeys(limit = 50): string[] {
  return Object.keys(data.urlByKey).slice(0, limit);
}
