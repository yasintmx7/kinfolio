/** Persist market list filters — localStorage with memory fallback. */

const KEY = "kinfolio:market-prefs:v1";
const memory = new Map<string, string>();

export type MarketPrefs = {
  currencyFilter?: "all" | "token" | "gold";
  sortFilter?: "cheap" | "new" | "qty";
  hideLocked?: boolean;
  categoryFilter?: string;
  browseSort?: "listings" | "floor" | "name";
};

function readRaw(): string | null {
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(KEY);
      if (v != null) return v;
    }
  } catch {
    /* ignore */
  }
  return memory.get(KEY) ?? null;
}

function writeRaw(value: string): void {
  memory.set(KEY, value);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, value);
    }
  } catch {
    /* memory only */
  }
}

export function getMarketPrefs(): MarketPrefs {
  try {
    const raw = readRaw();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as MarketPrefs;
  } catch {
    return {};
  }
}

export function setMarketPrefs(patch: MarketPrefs): MarketPrefs {
  const next = { ...getMarketPrefs(), ...patch };
  writeRaw(JSON.stringify(next));
  return next;
}
