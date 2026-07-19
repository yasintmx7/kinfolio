/** Item watchlist — local only, with memory fallback and id-normalized matching. */

const KEY = "kinfolio:market-watchlist";
const MAX = 40;

/** In-memory fallback when localStorage is missing/broken (tests / private mode). */
const memory = new Map<string, string>();

/** Compare market type (cooked_fish_meat) ↔ portfolio id (cooked-fish-meat). */
export function normalizeWatchId(id: string): string {
  return id.trim().replace(/-/g, "_").toLowerCase();
}

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

export function getWatchlist(): string[] {
  try {
    const raw = readRaw();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function setWatchlist(ids: string[]): void {
  // Dedupe by normalized key, keep first (preferred) spelling
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !id.trim()) continue;
    const k = normalizeWatchId(id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(id.trim());
    if (out.length >= MAX) break;
  }
  writeRaw(JSON.stringify(out));
}

/** True if any stored watch id matches any of the candidate ids (dash/underscore). */
export function isWatched(
  id: string,
  aliases: Array<string | null | undefined> = [],
): boolean {
  return isInWatchlist(getWatchlist(), id, aliases);
}

export function isInWatchlist(
  list: string[],
  id: string,
  aliases: Array<string | null | undefined> = [],
): boolean {
  const keys = collectKeys(id, aliases);
  if (keys.size === 0) return false;
  return list.some((w) => keys.has(normalizeWatchId(w)));
}

/**
 * Toggle watch. Pass aliases so market type + portfolio id are treated as one item.
 * Removing clears every equivalent id; adding stores the preferred `id` once.
 */
export function toggleWatch(
  id: string,
  aliases: Array<string | null | undefined> = [],
): string[] {
  const preferred = id.trim();
  if (!preferred) return getWatchlist();
  const keys = collectKeys(preferred, aliases);
  const cur = getWatchlist();
  const exists = cur.some((w) => keys.has(normalizeWatchId(w)));
  const next = exists
    ? cur.filter((w) => !keys.has(normalizeWatchId(w)))
    : [preferred, ...cur.filter((w) => !keys.has(normalizeWatchId(w)))];
  setWatchlist(next);
  return next;
}

function collectKeys(
  id: string,
  aliases: Array<string | null | undefined>,
): Set<string> {
  const keys = new Set<string>();
  const add = (v: string | null | undefined) => {
    if (v == null) return;
    const t = v.trim();
    if (!t) return;
    keys.add(normalizeWatchId(t));
  };
  add(id);
  for (const a of aliases) add(a);
  return keys;
}
