const KEY = "kinfolio:market-watchlist";

export function getWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function setWatchlist(ids: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 40)));
}

export function toggleWatch(id: string): string[] {
  const cur = getWatchlist();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
  setWatchlist(next);
  return next;
}

export function isWatched(id: string): boolean {
  return getWatchlist().includes(id);
}
