/**
 * Kill leaderboards — primary: public kintaramarket.xyz
 *   GET https://kintaramarket.xyz/api/lb/pvp
 *   GET https://kintaramarket.xyz/api/lb/mob
 *
 * Shape: { ts, prevTs (~24h earlier), rows: [{ id, name, value, d }] }
 *   value = total kills in that category
 *   d     = delta since prevTs (~last 24 hours)
 *
 * Official kintara.com/api/leaderboard is 401 without a game session;
 * optional KINTARA_SESSION* env still tried as soft enrich only.
 */

import { z } from "zod";
import { fetchWithTimeout, getCached, setCache } from "@/lib/api/cache";

const KM_BASE = "https://kintaramarket.xyz";
const OFFICIAL_BASE = "https://kintara.com";

export function getLeaderboardAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent":
      "Kinfolio/1.0 (+https://kinloxg.vercel.app; read-only leaderboard)",
  };
  const full = process.env.KINTARA_SESSION_COOKIE?.trim();
  const token = process.env.KINTARA_SESSION?.trim();
  if (full) {
    headers.Cookie = full;
  } else if (token) {
    headers.Cookie = token.includes("=") ? token : `session=${token}`;
  }
  return headers;
}

export function isLeaderboardAuthConfigured(): boolean {
  return Boolean(
    process.env.KINTARA_SESSION_COOKIE?.trim() ||
      process.env.KINTARA_SESSION?.trim(),
  );
}

/** UI / API category keys we expose. */
export type LeaderboardCategory =
  | "kills"
  | "pvp"
  | "mob"
  | "kills_24h"
  | "pvp_24h"
  | "mob_24h";

export type LeaderboardPeriod = "all" | "24h";

export type LeaderboardEntry = {
  rank: number;
  userId: string | null;
  username: string;
  /** Primary score for the active category */
  score: number;
  pvpKills: number | null;
  mobKills: number | null;
  totalKills: number | null;
  /** ~24h delta for active metric when available */
  delta24h: number | null;
  guild: string | null;
  extras: Record<string, number>;
};

export type LeaderboardResult = {
  category: LeaderboardCategory;
  period: LeaderboardPeriod;
  upstreamCategory: string;
  source: string;
  entries: LeaderboardEntry[];
  offset: number;
  limit: number;
  total: number | null;
  hasMore: boolean;
  note: string | null;
  /** Snapshot times from kintaramarket (ms) */
  ts: number | null;
  prevTs: number | null;
};

export type LeaderboardFetchError = {
  code: "UNAUTHORIZED" | "NOT_FOUND" | "UPSTREAM" | "EMPTY" | "PARSE";
  message: string;
  status?: number;
  rawSample?: string;
  authConfigured?: boolean;
};

export function resolveUpstreamQuery(category: LeaderboardCategory): {
  category: string;
  period: LeaderboardPeriod;
  kmPath: "pvp" | "mob" | "both";
  useDelta: boolean;
} {
  switch (category) {
    case "pvp":
      return { category: "pvp", period: "all", kmPath: "pvp", useDelta: false };
    case "mob":
      return { category: "mob", period: "all", kmPath: "mob", useDelta: false };
    case "pvp_24h":
      return {
        category: "pvp",
        period: "24h",
        kmPath: "pvp",
        useDelta: true,
      };
    case "mob_24h":
      return {
        category: "mob",
        period: "24h",
        kmPath: "mob",
        useDelta: true,
      };
    case "kills_24h":
      return {
        category: "kills",
        period: "24h",
        kmPath: "both",
        useDelta: true,
      };
    case "kills":
    default:
      return {
        category: "kills",
        period: "all",
        kmPath: "both",
        useDelta: false,
      };
  }
}

/** @deprecated kept for tests / official fallback naming */
export function categoryFallbacks(primary: string): string[] {
  const map: Record<string, string[]> = {
    kills: ["kills", "total_kills"],
    pvp: ["pvp", "pvp_kills"],
    mob: ["mob", "mobs", "mob_kills"],
  };
  return map[primary] ?? [primary];
}

type KmBoard = {
  ts: number | null;
  prevTs: number | null;
  byId: Map<
    string,
    { id: string; name: string; value: number; d: number }
  >;
};

function coerceNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

/** Parse one KM row; skip bad rows instead of failing the whole board. */
function parseKmRow(
  raw: unknown,
): { id: string; name: string; value: number; d: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = o.id != null ? String(o.id).trim() : "";
  const name =
    typeof o.name === "string"
      ? o.name.trim()
      : typeof o.username === "string"
        ? o.username.trim()
        : "";
  const value = coerceNum(o.value);
  if (!id || !name || value == null) return null;
  const d = coerceNum(o.d) ?? 0;
  return { id, name, value, d };
}

async function fetchKmLb(kind: "pvp" | "mob"): Promise<KmBoard> {
  const cacheKey = `km:lb:${kind}:v2`;
  const cached = getCached<KmBoard>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const res = await fetchWithTimeout(`${KM_BASE}/api/lb/${kind}`, {
    timeoutMs: 20000,
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Kinfolio/1.0 (+https://kinloxg.vercel.app; read-only leaderboard)",
    },
  });
  if (!res.ok) {
    throw new Error(`kintaramarket lb/${kind} failed: ${res.status}`);
  }
  const json: unknown = await res.json();
  if (!json || typeof json !== "object") {
    throw new Error(`Unexpected kintaramarket lb/${kind} shape (not object)`);
  }
  const root = json as Record<string, unknown>;
  const rowsRaw = Array.isArray(root.rows)
    ? root.rows
    : Array.isArray(json)
      ? json
      : null;
  if (!rowsRaw) {
    throw new Error(`Unexpected kintaramarket lb/${kind} shape (no rows)`);
  }

  const byId = new Map<
    string,
    { id: string; name: string; value: number; d: number }
  >();
  for (const raw of rowsRaw) {
    const r = parseKmRow(raw);
    if (!r) continue;
    byId.set(r.id, r);
  }
  if (byId.size === 0) {
    throw new Error(`kintaramarket lb/${kind} returned 0 valid rows`);
  }

  const board: KmBoard = {
    ts: coerceNum(root.ts),
    prevTs: coerceNum(root.prevTs),
    byId,
  };
  setCache(cacheKey, board, 60);
  return board;
}

function buildEntriesFromKm(
  pvp: KmBoard | null,
  mob: KmBoard | null,
  options: {
    category: LeaderboardCategory;
    useDelta: boolean;
    kmPath: "pvp" | "mob" | "both";
  },
): LeaderboardEntry[] {
  const ids = new Set<string>();
  if (pvp) for (const id of pvp.byId.keys()) ids.add(id);
  if (mob) for (const id of mob.byId.keys()) ids.add(id);

  const raw: LeaderboardEntry[] = [];
  for (const id of ids) {
    const pr = pvp?.byId.get(id);
    const mr = mob?.byId.get(id);
    const username = pr?.name || mr?.name;
    if (!username) continue;

    const pvpKills = pr?.value ?? null;
    const mobKills = mr?.value ?? null;
    const pvpD = pr?.d ?? null;
    const mobD = mr?.d ?? null;
    const totalKills =
      pvpKills != null || mobKills != null
        ? (pvpKills ?? 0) + (mobKills ?? 0)
        : null;
    const totalD =
      pvpD != null || mobD != null ? (pvpD ?? 0) + (mobD ?? 0) : null;

    let score = 0;
    let delta24h: number | null = null;

    if (options.kmPath === "pvp") {
      score = options.useDelta ? (pvpD ?? 0) : (pvpKills ?? 0);
      delta24h = pvpD;
    } else if (options.kmPath === "mob") {
      score = options.useDelta ? (mobD ?? 0) : (mobKills ?? 0);
      delta24h = mobD;
    } else {
      score = options.useDelta ? (totalD ?? 0) : (totalKills ?? 0);
      delta24h = totalD;
    }

    raw.push({
      rank: 0,
      userId: id,
      username,
      score,
      pvpKills,
      mobKills,
      totalKills,
      delta24h,
      guild: null,
      extras: {
        ...(pvpD != null ? { pvpDelta24h: pvpD } : {}),
        ...(mobD != null ? { mobDelta24h: mobD } : {}),
      },
    });
  }

  // Rank by score desc; for 24h, players with d=0 still appear but lower
  raw.sort(
    (a, b) =>
      b.score - a.score ||
      a.username.localeCompare(b.username, undefined, {
        sensitivity: "base",
      }),
  );
  return raw.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function paginateEntries(
  entries: LeaderboardEntry[],
  offset: number,
  limit: number,
): { page: LeaderboardEntry[]; hasMore: boolean; total: number } {
  const off = Math.max(0, offset);
  const lim = Math.min(Math.max(limit, 1), 200);
  const page = entries.slice(off, off + lim);
  return {
    page,
    hasMore: off + page.length < entries.length,
    total: entries.length,
  };
}

export function filterEntriesByQuery(
  entries: LeaderboardEntry[],
  query: string,
): LeaderboardEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  const qId = q.replace(/^#/, "");
  return entries.filter(
    (e) =>
      e.username.toLowerCase().includes(q) ||
      (e.userId != null && e.userId.toLowerCase().includes(qId)) ||
      (e.guild != null && e.guild.toLowerCase().includes(q)),
  );
}

/** Test helper — normalize loose official-style rows (kept for unit tests). */
export function normalizeLeaderboardEntry(
  raw: unknown,
  index: number,
  offset: number,
): LeaderboardEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const username =
    (typeof o.username === "string" && o.username) ||
    (typeof o.name === "string" && o.name) ||
    (typeof o.playerName === "string" && o.playerName) ||
    null;
  if (!username) return null;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? v
      : typeof v === "string" && Number.isFinite(Number(v))
        ? Number(v)
        : null;
  const pvpKills = num(o.pvpKills ?? o.pvp_kills ?? o.pvp);
  const mobKills = num(o.mobKills ?? o.mob_kills ?? o.mob);
  const totalKills = num(o.totalKills ?? o.kills ?? o.total);
  const score =
    num(o.score ?? o.value ?? o.kills ?? o.pvpKills ?? o.mobKills) ??
    totalKills ??
    pvpKills ??
    mobKills ??
    0;
  const rank = num(o.rank ?? o.position) ?? offset + index + 1;
  const userId =
    o.userId != null
      ? String(o.userId)
      : o.id != null
        ? String(o.id)
        : null;
  return {
    rank: Math.max(1, Math.floor(rank)),
    userId,
    username: String(username).trim(),
    score,
    pvpKills,
    mobKills,
    totalKills:
      totalKills ??
      (pvpKills != null && mobKills != null ? pvpKills + mobKills : totalKills),
    delta24h: num(o.d ?? o.delta ?? o.delta24h),
    guild:
      typeof o.guild === "string"
        ? o.guild
        : typeof o.guildName === "string"
          ? o.guildName
          : null,
    extras: {},
  };
}

export function normalizeLeaderboardPayload(
  json: unknown,
  options: { offset: number; limit: number; category: LeaderboardCategory },
): LeaderboardResult {
  // Official-style wrapper
  let rows: unknown[] = [];
  if (Array.isArray(json)) rows = json;
  else if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const key of ["entries", "leaderboard", "rows", "players", "data"]) {
      const v = o[key];
      if (Array.isArray(v)) {
        rows = v;
        break;
      }
    }
  }
  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const e = normalizeLeaderboardEntry(rows[i], i, options.offset);
    if (e) entries.push(e);
  }
  const resolved = resolveUpstreamQuery(options.category);
  const { page, hasMore, total } = paginateEntries(
    entries,
    options.offset,
    options.limit,
  );
  return {
    category: options.category,
    period: resolved.period,
    upstreamCategory: resolved.category,
    source: "normalized",
    entries: page,
    offset: options.offset,
    limit: options.limit,
    total,
    hasMore,
    note: null,
    ts: null,
    prevTs: null,
  };
}

/**
 * Primary public fetch via kintaramarket lb/pvp + lb/mob.
 */
export async function fetchMarketLeaderboard(options: {
  category?: LeaderboardCategory;
  offset?: number;
  limit?: number;
  force?: boolean;
}): Promise<LeaderboardResult> {
  const category = options.category ?? "kills";
  const offset = Math.max(options.offset ?? 0, 0);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const resolved = resolveUpstreamQuery(category);

  const cacheKey = `lb:km:v2:${category}:${offset}:${limit}`;
  if (!options.force) {
    const cached = getCached<LeaderboardResult>(cacheKey);
    if (cached && !cached.stale) return cached.value;
  }

  // Full boards cached inside fetchKmLb; build merged list then paginate
  const needPvp = resolved.kmPath === "pvp" || resolved.kmPath === "both";
  const needMob = resolved.kmPath === "mob" || resolved.kmPath === "both";

  const [pvpSettled, mobSettled] = await Promise.allSettled([
    needPvp ? fetchKmLb("pvp") : Promise.resolve(null),
    needMob ? fetchKmLb("mob") : Promise.resolve(null),
  ]);

  const pvp =
    pvpSettled.status === "fulfilled" ? pvpSettled.value : null;
  const mob =
    mobSettled.status === "fulfilled" ? mobSettled.value : null;

  if (!pvp && !mob) {
    const parts: string[] = [];
    if (needPvp && pvpSettled.status === "rejected") {
      parts.push(
        `lb/pvp: ${pvpSettled.reason instanceof Error ? pvpSettled.reason.message : String(pvpSettled.reason)}`,
      );
    }
    if (needMob && mobSettled.status === "rejected") {
      parts.push(
        `lb/mob: ${mobSettled.reason instanceof Error ? mobSettled.reason.message : String(mobSettled.reason)}`,
      );
    }
    const detail = parts.join(" · ") || "unknown error";
    const err = new Error(
      `kintaramarket leaderboard unavailable (${detail})`,
    ) as Error & { lb?: LeaderboardFetchError };
    err.lb = {
      code: "UPSTREAM",
      message: err.message,
    };
    throw err;
  }

  const all = buildEntriesFromKm(pvp, mob, {
    category,
    useDelta: resolved.useDelta,
    kmPath: resolved.kmPath,
  });

  // For 24h boards, optionally drop pure zeros so top is meaningful
  const ranked = resolved.useDelta
    ? all.filter((e) => e.score > 0)
    : all;
  // Re-rank after filter
  const ordered = ranked.map((e, i) => ({ ...e, rank: i + 1 }));

  const { page, hasMore, total } = paginateEntries(ordered, offset, limit);
  const ts = pvp?.ts ?? mob?.ts ?? null;
  const prevTs = pvp?.prevTs ?? mob?.prevTs ?? null;
  const hours =
    ts != null && prevTs != null && ts > prevTs
      ? Math.round((ts - prevTs) / 3_600_000)
      : 24;

  const result: LeaderboardResult = {
    category,
    period: resolved.period,
    upstreamCategory:
      resolved.kmPath === "both"
        ? "lb/pvp+lb/mob"
        : `lb/${resolved.kmPath}`,
    source: "kintaramarket.xyz",
    entries: page,
    offset,
    limit,
    total,
    hasMore,
    note: resolved.useDelta
      ? `Δ ≈ last ${hours}h (kintaramarket snapshot delta). Score = kills in that window.`
      : "Totals from kintaramarket.xyz public leaderboards (no game login).",
    ts,
    prevTs,
  };

  setCache(cacheKey, result, 45);
  return result;
}

/**
 * Public entry — kintaramarket first; optional official if session configured.
 */
export async function fetchOfficialLeaderboard(options: {
  category?: LeaderboardCategory;
  offset?: number;
  limit?: number;
  force?: boolean;
}): Promise<LeaderboardResult> {
  try {
    return await fetchMarketLeaderboard(options);
  } catch (kmErr) {
    // Soft fallback to official only if auth cookie present
    if (!isLeaderboardAuthConfigured()) {
      throw kmErr;
    }
    // Official path (rarely works without cookie; cookie may help)
    const category = options.category ?? "kills";
    const offset = Math.max(options.offset ?? 0, 0);
    const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
    const resolved = resolveUpstreamQuery(category);
    const url = new URL(`${OFFICIAL_BASE}/api/leaderboard`);
    url.searchParams.set("category", resolved.category);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));
    if (resolved.period === "24h") {
      url.searchParams.set("period", "24h");
    }
    const res = await fetchWithTimeout(url.toString(), {
      timeoutMs: 12000,
      headers: getLeaderboardAuthHeaders(),
    });
    if (!res.ok) {
      throw kmErr;
    }
    const json: unknown = await res.json();
    const result = normalizeLeaderboardPayload(json, {
      offset,
      limit,
      category,
    });
    result.source = "kintara.com";
    result.upstreamCategory = resolved.category;
    return result;
  }
}

export async function searchLeaderboardPlayers(options: {
  category?: LeaderboardCategory;
  query: string;
  pageSize?: number;
  maxPages?: number;
}): Promise<{
  matches: LeaderboardEntry[];
  pagesScanned: number;
  category: LeaderboardCategory;
  unauthorized?: boolean;
  error?: string;
  source?: string;
}> {
  const q = options.query.trim();
  const category = options.category ?? "kills";
  if (!q) {
    return { matches: [], pagesScanned: 0, category };
  }

  try {
    // Full board once (~1500 rows), filter client-side
    const full = await fetchMarketLeaderboardFull(category);
    const matches = filterEntriesByQuery(full.entries, q).slice(0, 50);
    return {
      matches,
      pagesScanned: 1,
      category,
      source: full.source,
    };
  } catch (e) {
    const lb = (e as Error & { lb?: LeaderboardFetchError }).lb;
    return {
      matches: [],
      pagesScanned: 0,
      category,
      unauthorized: lb?.code === "UNAUTHORIZED",
      error: e instanceof Error ? e.message : "Search failed",
    };
  }
}

/** Full ranked list (no pagination) for search — uses same KM boards. */
export async function fetchMarketLeaderboardFull(
  category: LeaderboardCategory,
): Promise<LeaderboardResult> {
  const resolved = resolveUpstreamQuery(category);
  const needPvp = resolved.kmPath === "pvp" || resolved.kmPath === "both";
  const needMob = resolved.kmPath === "mob" || resolved.kmPath === "both";
  const [pvpSettled, mobSettled] = await Promise.allSettled([
    needPvp ? fetchKmLb("pvp") : Promise.resolve(null),
    needMob ? fetchKmLb("mob") : Promise.resolve(null),
  ]);
  const pvp = pvpSettled.status === "fulfilled" ? pvpSettled.value : null;
  const mob = mobSettled.status === "fulfilled" ? mobSettled.value : null;
  if (!pvp && !mob) {
    throw new Error("kintaramarket leaderboard unavailable");
  }
  const all = buildEntriesFromKm(pvp, mob, {
    category,
    useDelta: resolved.useDelta,
    kmPath: resolved.kmPath,
  });
  const ranked = resolved.useDelta ? all.filter((e) => e.score > 0) : all;
  const ordered = ranked.map((e, i) => ({ ...e, rank: i + 1 }));
  return {
    category,
    period: resolved.period,
    upstreamCategory:
      resolved.kmPath === "both" ? "lb/pvp+lb/mob" : `lb/${resolved.kmPath}`,
    source: "kintaramarket.xyz",
    entries: ordered,
    offset: 0,
    limit: ordered.length,
    total: ordered.length,
    hasMore: false,
    note: null,
    ts: pvp?.ts ?? mob?.ts ?? null,
    prevTs: pvp?.prevTs ?? mob?.prevTs ?? null,
  };
}
