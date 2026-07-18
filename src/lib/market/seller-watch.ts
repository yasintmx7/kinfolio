/** Watched sellers (usernames) — local only, with memory fallback. */

const KEY = "kinfolio:seller-watchlist";
const MAX = 40;

/** In-memory fallback when localStorage is missing/broken (tests / private mode). */
const memory = new Map<string, string>();

export type WatchedSeller = {
  name: string;
  sellerId?: string | null;
  addedAt: string;
};

function normalizeName(name: string): string {
  return name.trim();
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

export function getWatchedSellers(): WatchedSeller[] {
  try {
    const raw = readRaw();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is WatchedSeller =>
          !!x &&
          typeof x === "object" &&
          typeof (x as WatchedSeller).name === "string" &&
          (x as WatchedSeller).name.trim().length > 0,
      )
      .map((x) => ({
        name: normalizeName(x.name),
        sellerId: x.sellerId ?? null,
        addedAt:
          typeof x.addedAt === "string" ? x.addedAt : new Date().toISOString(),
      }))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function setWatchedSellers(list: WatchedSeller[]): void {
  writeRaw(JSON.stringify(list.slice(0, MAX)));
}

export function isSellerWatched(name: string): boolean {
  const n = normalizeName(name).toLowerCase();
  if (!n) return false;
  return getWatchedSellers().some((s) => s.name.toLowerCase() === n);
}

export function toggleSellerWatch(
  name: string,
  sellerId?: string | null,
): WatchedSeller[] {
  const n = normalizeName(name);
  if (!n) return getWatchedSellers();
  const cur = getWatchedSellers();
  const key = n.toLowerCase();
  const exists = cur.some((s) => s.name.toLowerCase() === key);
  const next = exists
    ? cur.filter((s) => s.name.toLowerCase() !== key)
    : [
        {
          name: n,
          sellerId: sellerId ?? null,
          addedAt: new Date().toISOString(),
        },
        ...cur,
      ];
  setWatchedSellers(next);
  return next;
}
