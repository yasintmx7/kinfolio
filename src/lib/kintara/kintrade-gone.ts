import { fetchWithTimeout, getCached, setCache } from "@/lib/api/cache";
import { z } from "zod";

const BASE = "https://www.kintrade.xyz";
const CACHE_KEY = "kintrade:gone-ids";
const TTL = 30;

const goneSchema = z.object({
  ok: z.boolean().optional(),
  ids: z.array(z.union([z.number(), z.string()])),
});

export type GoneListings = {
  ids: string[];
  idSet: Set<string>;
  count: number;
  updatedAt: string;
  source: "kintrade.xyz";
};

export async function fetchGoneListingIds(): Promise<GoneListings> {
  const cached = getCached<Omit<GoneListings, "idSet">>(CACHE_KEY);
  if (cached && !cached.stale) {
    return {
      ...cached.value,
      idSet: new Set(cached.value.ids),
    };
  }

  try {
    const res = await fetchWithTimeout(`${BASE}/api/gone`, {
      timeoutMs: 10000,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (cached) {
        return { ...cached.value, idSet: new Set(cached.value.ids) };
      }
      throw new Error(`kintrade /api/gone failed: ${res.status}`);
    }
    const json: unknown = await res.json();
    const parsed = goneSchema.safeParse(json);
    if (!parsed.success) {
      if (cached) {
        return { ...cached.value, idSet: new Set(cached.value.ids) };
      }
      throw new Error("Unexpected kintrade /api/gone shape");
    }

    const ids = parsed.data.ids.map(String);
    const payload = {
      ids,
      count: ids.length,
      updatedAt: new Date().toISOString(),
      source: "kintrade.xyz" as const,
    };
    setCache(CACHE_KEY, payload, TTL);
    return { ...payload, idSet: new Set(ids) };
  } catch (e) {
    if (cached) {
      return { ...cached.value, idSet: new Set(cached.value.ids) };
    }
    throw e;
  }
}

export function isListingGone(
  listingId: string | number | undefined | null,
  gone: Set<string> | GoneListings | null | undefined,
): boolean {
  if (listingId == null || !gone) return false;
  const set = gone instanceof Set ? gone : gone.idSet;
  return set.has(String(listingId));
}

/** Drop listings whose id appears in the gone set (sold / cancelled / expired). */
export function filterActiveListings<T extends { id: string }>(
  listings: T[],
  gone: Set<string> | GoneListings | null | undefined,
): T[] {
  if (!gone) return listings;
  const set = gone instanceof Set ? gone : gone.idSet;
  if (!set.size) return listings;
  return listings.filter((l) => !set.has(String(l.id)));
}
