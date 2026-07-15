import wikiImages from "@/data/wiki-item-images.json";
import processedIcons from "@/data/processed-item-icons.json";

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

type ProcessedIcons = {
  generatedAt: string;
  canvas: number;
  padRatio: number;
  format: string;
  count: number;
  urlByKey: Record<string, string>;
};

const data = wikiImages as WikiImageData;
const processed = processedIcons as ProcessedIcons;

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
    processedCount: processed.count,
    processedAt: processed.generatedAt,
  };
}

/**
 * Preferred remote wiki art (only used when no processed local icon exists).
 */
const REMOTE_OVERRIDES: Record<string, string> = {
  brute_horn: "https://kintara.wiki/images/4/4f/Brute_horn.png",
  brutehorn: "https://kintara.wiki/images/4/4f/Brute_horn.png",
  "brute-horn": "https://kintara.wiki/images/4/4f/Brute_horn.png",
  "brute horn": "https://kintara.wiki/images/4/4f/Brute_horn.png",
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
    new Set(
      [
        lower,
        underscored,
        dashed,
        compact,
        noPrefix,
        noPrefixDash,
        noPrefix.replace(/_/g, ""),
        underscored === "brute_horn" || compact === "brutehorn"
          ? "brute_horn.png"
          : null,
        underscored === "molten_rock" || compact === "moltenrock"
          ? "molten_rock.png"
          : null,
        underscored.replace(/cooked_fish_meat/, "cookedfish"),
        underscored.replace(/wild_sword.*/, "sword"),
        underscored.replace(/tool_axe.*/, "axe"),
        underscored.replace(/tool_pickaxe.*/, "pickaxe"),
        underscored.replace(/potion_health/, "health"),
        underscored.replace(/potion_shield/, "shield"),
        underscored.replace(/potion_strength/, "strength"),
        underscored.replace(/potion_poison/, "poison"),
        // catalog slug forms
        dashed,
        `item-icons/${dashed}`,
      ].filter((k): k is string => Boolean(k)),
    ),
  );
}

function lookupLocal(keys: string[]): string | undefined {
  for (const key of keys) {
    const local = processed.urlByKey[key];
    if (local) return local;
  }
  return undefined;
}

function lookupRemote(keys: string[]): string | undefined {
  for (const key of keys) {
    const override = REMOTE_OVERRIDES[key];
    if (override) return override;
  }
  for (const key of keys) {
    const url = data.urlByKey[key];
    if (url) return url;
  }
  return undefined;
}

function keysFor(
  idOrName: string,
  aliases: string[] = [],
): string[] {
  return [
    ...candidatesFromId(idOrName),
    ...aliases.flatMap((a) => candidatesFromId(a)),
  ];
}

/**
 * Resolve item art: prefers local transparent WebP (white-bg removed, padded),
 * then wiki remote URL.
 */
export function resolveWikiItemImage(
  idOrName: string | undefined | null,
  aliases: string[] = [],
): string | undefined {
  if (!idOrName) return undefined;
  const keys = keysFor(idOrName, aliases);
  return lookupLocal(keys) ?? lookupRemote(keys);
}

/** Local processed transparent WebP only. */
export function resolveProcessedItemIcon(
  idOrName: string | undefined | null,
  aliases: string[] = [],
): string | undefined {
  if (!idOrName) return undefined;
  return lookupLocal(keysFor(idOrName, aliases));
}

/** Original wiki remote URL (may still have white plate). */
export function resolveRemoteWikiItemImage(
  idOrName: string | undefined | null,
  aliases: string[] = [],
): string | undefined {
  if (!idOrName) return undefined;
  return lookupRemote(keysFor(idOrName, aliases));
}

export function listWikiImageKeys(limit = 50): string[] {
  return Object.keys(data.urlByKey).slice(0, limit);
}

export function listProcessedIconKeys(limit = 50): string[] {
  return Object.keys(processed.urlByKey).slice(0, limit);
}
