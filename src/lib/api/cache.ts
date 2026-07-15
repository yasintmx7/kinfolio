type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  updatedAt: string;
};

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): {
  value: T;
  stale: boolean;
  updatedAt: string;
} | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  return {
    value: entry.value,
    stale: Date.now() > entry.expiresAt,
    updatedAt: entry.updatedAt,
  };
}

export function setCache<T>(key: string, value: T, ttlSeconds: number): void {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
    updatedAt: new Date().toISOString(),
  });
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
