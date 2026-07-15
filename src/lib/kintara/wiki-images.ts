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

/**
 * Preferred wiki art URLs for items whose auto-matched file looks wrong
 * (striped bg, wrong variant, low-quality duplicate, etc.).
 */
const IMAGE_OVERRIDES: Record<string, string> = {
  // Cleaner photoreal horn (Brutehorn.png has harsh vertical stripes)
  brute_horn: "https://kintara.wiki/images/4/4f/Brute_horn.png",
  brutehorn: "https://kintara.wiki/images/4/4f/Brute_horn.png",
  "brute-horn": "https://kintara.wiki/images/4/4f/Brute_horn.png",
  "brute horn": "https://kintara.wiki/images/4/4f/Brute_horn.png",
  // High-res transparent molten rock (avoid solid-bg MoltenRock.png)
  molten_rock: "https://kintara.wiki/images/1/16/Molten_rock.png",
  moltenrock: "https://kintara.wiki/images/1/16/Molten_rock.png",
  "molten-rock": "https://kintara.wiki/images/1/16/Molten_rock.png",
  "molten rock": "https://kintara.wiki/images/1/16/Molten_rock.png",
};

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
      // Prefer better file names when duplicates exist
      underscored === "brute_horn" || compact === "brutehorn"
        ? "brute_horn.png"
        : null,
      underscored === "molten_rock" || compact === "moltenrock"
        ? "molten_rock.png"
        : null,
      // common renames
      underscored.replace(/cooked_fish_meat/, "cookedfish"),
      underscored.replace(/wild_sword.*/, "sword"),
      underscored.replace(/tool_axe.*/, "axe"),
      underscored.replace(/tool_pickaxe.*/, "pickaxe"),
      underscored.replace(/potion_health/, "health"),
      underscored.replace(/potion_shield/, "shield"),
      underscored.replace(/potion_strength/, "strength"),
      underscored.replace(/potion_poison/, "poison"),
    ].filter((k): k is string => Boolean(k))),
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
    const override = IMAGE_OVERRIDES[key];
    if (override) return override;
  }
  for (const key of keys) {
    const url = data.urlByKey[key];
    if (url) return url;
  }
  return undefined;
}

export function listWikiImageKeys(limit = 50): string[] {
  return Object.keys(data.urlByKey).slice(0, limit);
}
