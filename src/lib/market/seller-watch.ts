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

export function isSellerWatched(
  name: string,
  sellerId?: string | null,
): boolean {
  const n = normalizeName(name).toLowerCase();
  const id =
    sellerId != null && /^\d+$/.test(String(sellerId).trim())
      ? String(sellerId).trim()
      : null;
  if (!n && !id) return false;
  return getWatchedSellers().some((s) => {
    if (n && s.name.toLowerCase() === n) return true;
    if (id && s.sellerId != null && String(s.sellerId) === id) return true;
    return false;
  });
}

export function toggleSellerWatch(
  name: string,
  sellerId?: string | null,
): WatchedSeller[] {
  const n = normalizeName(name);
  const id =
    sellerId != null && /^\d+$/.test(String(sellerId).trim())
      ? String(sellerId).trim()
      : null;
  if (!n && !id) return getWatchedSellers();
  const cur = getWatchedSellers();
  const key = n.toLowerCase();
  const exists = cur.some((s) => {
    if (key && s.name.toLowerCase() === key) return true;
    if (id && s.sellerId != null && String(s.sellerId) === id) return true;
    return false;
  });
  const next = exists
    ? cur.filter((s) => {
        if (key && s.name.toLowerCase() === key) return false;
        if (id && s.sellerId != null && String(s.sellerId) === id) return false;
        return true;
      })
    : [
        {
          name: n || `#${id}`,
          sellerId: id,
          addedAt: new Date().toISOString(),
        },
        ...cur,
      ];
  // Don't store "#123" as a watch name — require a real username
  if (!exists && (!n || n.startsWith("#"))) {
    return cur;
  }
  setWatchedSellers(next);
  return next;
}
