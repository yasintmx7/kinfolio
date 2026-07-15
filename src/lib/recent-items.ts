const KEY = "kintara-portfolio:recent-items";
const LAST_KEY = "kintara-portfolio:last-item";
const MAX = 8;

export function getRecentItemIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function getLastItemId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_KEY);
}

export function rememberItem(itemId: string): void {
  if (typeof window === "undefined" || !itemId) return;
  localStorage.setItem(LAST_KEY, itemId);
  const prev = getRecentItemIds().filter((id) => id !== itemId);
  const next = [itemId, ...prev].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
}
