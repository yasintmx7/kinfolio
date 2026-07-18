/**
 * Official Kintara leaderboard — read-only proxy of
 * GET https://kintara.com/api/leaderboard?category=…&offset=…&limit=…
 *
 * Note: as of 2026-07 the endpoint returns 401 without a game session.
 * We still call it publicly (no cookies / no private keys) and surface
 * structured errors so the UI can explain availability.
 */

import { z } from "zod";
import { fetchWithTimeout, getCached, setCache } from "@/lib/api/cache";

const BASE = "https://kintara.com";

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
  guild: string | null;
  /** Extra numeric fields from upstream (best-effort) */
  extras: Record<string, number>;
};

export type LeaderboardResult = {
  category: LeaderboardCategory;
  period: LeaderboardPeriod;
  upstreamCategory: string;
  entries: LeaderboardEntry[];
  offset: number;
  limit: number;
  total: number | null;
  hasMore: boolean;
  note: string | null;
};

export type LeaderboardFetchError = {
  code: "UNAUTHORIZED" | "NOT_FOUND" | "UPSTREAM" | "EMPTY" | "PARSE";
  message: string;
  status?: number;
  rawSample?: string;
};

/** Map our UI category → upstream query params. */
export function resolveUpstreamQuery(category: LeaderboardCategory): {
  category: string;
  period: LeaderboardPeriod;
  extra: Record<string, string>;
} {
  switch (category) {
    case "pvp":
      return { category: "pvp", period: "all", extra: {} };
    case "mob":
      return { category: "mob", period: "all", extra: {} };
    case "kills_24h":
      return {
        category: "kills",
        period: "24h",
        extra: { period: "24h", range: "24h", window: "day" },
      };
    case "pvp_24h":
      return {
        category: "pvp",
        period: "24h",
        extra: { period: "24h", range: "24h", window: "day" },
      };
    case "mob_24h":
      return {
        category: "mob",
        period: "24h",
        extra: { period: "24h", range: "24h", window: "day" },
      };
    case "kills":
    default:
      return { category: "kills", period: "all", extra: {} };
  }
}

/** Alternate category strings if primary 404s (order matters). */
export function categoryFallbacks(primary: string): string[] {
  const map: Record<string, string[]> = {
    kills: ["kills", "total_kills", "totalKills", "all_kills"],
    pvp: ["pvp", "pvp_kills", "pvpKills", "player_kills", "pk"],
    mob: ["mob", "mobs", "mob_kills", "mobKills", "monster", "monsters", "pve"],
  };
  return map[primary] ?? [primary];
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    if (k in obj) {
      const n = num(obj[k]);
      if (n != null) return n;
    }
  }
  return null;
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    if (k in obj) {
      const s = str(obj[k]);
      if (s) return s;
    }
  }
  return null;
}

/** Loose row — game shapes vary by category. */
const looseRow = z.record(z.string(), z.unknown());

function extractRows(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  for (const key of [
    "entries",
    "leaderboard",
    "rows",
    "players",
    "data",
    "results",
    "items",
    "list",
  ]) {
    const v = o[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      const inner = v as Record<string, unknown>;
      for (const k2 of ["entries", "leaderboard", "rows", "players"]) {
        if (Array.isArray(inner[k2])) return inner[k2] as unknown[];
      }
    }
  }
  return [];
}

function extractTotal(json: unknown): number | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  return (
    pickNum(o, ["total", "totalCount", "count", "totalEntries", "size"]) ?? null
  );
}

export function normalizeLeaderboardEntry(
  raw: unknown,
  index: number,
  offset: number,
): LeaderboardEntry | null {
  const parsed = looseRow.safeParse(raw);
  if (!parsed.success) return null;
  const o = parsed.data;

  const username =
    pickStr(o, [
      "username",
      "userName",
      "name",
      "playerName",
      "player",
      "displayName",
      "nick",
      "nickname",
    ]) ?? null;
  if (!username) return null;

  const userId = pickStr(o, [
    "userId",
    "playerId",
    "id",
    "uid",
    "accountId",
  ]);

  const pvpKills = pickNum(o, [
    "pvpKills",
    "pvp_kills",
    "pvp",
    "playerKills",
    "player_kills",
    "pk",
  ]);
  const mobKills = pickNum(o, [
    "mobKills",
    "mob_kills",
    "mobs",
    "mob",
    "monsterKills",
    "monster_kills",
    "pveKills",
    "pve_kills",
    "pve",
  ]);
  const totalKills = pickNum(o, [
    "totalKills",
    "total_kills",
    "kills",
    "killCount",
    "kill_count",
  ]);

  const score =
    pickNum(o, [
      "score",
      "value",
      "points",
      "amount",
      "count",
      "kills",
      "total",
      "totalKills",
      "pvpKills",
      "mobKills",
    ]) ??
    totalKills ??
    pvpKills ??
    mobKills ??
    0;

  const rank =
    pickNum(o, ["rank", "position", "place", "index"]) ?? offset + index + 1;

  const guild = pickStr(o, [
    "guild",
    "guildName",
    "guild_name",
    "clan",
    "tag",
    "guildTag",
  ]);

  const extras: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    const n = num(v);
    if (n != null && !["rank", "position", "place", "index", "id", "userId"].includes(k)) {
      extras[k] = n;
    }
  }

  return {
    rank: Math.max(1, Math.floor(rank)),
    userId,
    username,
    score,
    pvpKills,
    mobKills,
    totalKills: totalKills ?? (pvpKills != null && mobKills != null ? pvpKills + mobKills : totalKills),
    guild,
    extras,
  };
}

export function normalizeLeaderboardPayload(
  json: unknown,
  options: { offset: number; limit: number; category: LeaderboardCategory },
): LeaderboardResult {
  const rows = extractRows(json);
  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const e = normalizeLeaderboardEntry(rows[i], i, options.offset);
    if (e) entries.push(e);
  }

  const total = extractTotal(json);
  const period = resolveUpstreamQuery(options.category).period;

  return {
    category: options.category,
    period,
    upstreamCategory: resolveUpstreamQuery(options.category).category,
    entries,
    offset: options.offset,
    limit: options.limit,
    total,
    hasMore:
      rows.length >= options.limit ||
      (total != null && options.offset + entries.length < total),
    note: null,
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

/**
 * Fetch one page from official leaderboard.
 * Throws LeaderboardFetchError-shaped Error with `.code` property.
 */
export async function fetchOfficialLeaderboard(options: {
  category?: LeaderboardCategory;
  offset?: number;
  limit?: number;
  /** Force skip cache */
  force?: boolean;
}): Promise<LeaderboardResult> {
  const category = options.category ?? "kills";
  const offset = Math.max(options.offset ?? 0, 0);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const resolved = resolveUpstreamQuery(category);
  const candidates = categoryFallbacks(resolved.category);

  const cacheKey = `lb:v1:${category}:${offset}:${limit}`;
  if (!options.force) {
    const cached = getCached<LeaderboardResult>(cacheKey);
    if (cached && !cached.stale) return cached.value;
  }

  let lastErr: LeaderboardFetchError | null = null;

  for (const cat of candidates) {
    const url = new URL(`${BASE}/api/leaderboard`);
    url.searchParams.set("category", cat);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));
    for (const [k, v] of Object.entries(resolved.extra)) {
      if (!url.searchParams.has(k)) url.searchParams.set(k, v);
    }

    let res: Response;
    try {
      res = await fetchWithTimeout(url.toString(), {
        timeoutMs: 12000,
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Kinfolio/1.0 (+https://kinloxg.vercel.app; read-only leaderboard)",
        },
      });
    } catch (e) {
      lastErr = {
        code: "UPSTREAM",
        message: e instanceof Error ? e.message : "Network error",
      };
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      lastErr = {
        code: "UNAUTHORIZED",
        message:
          "Official leaderboard requires a logged-in Kintara session (401). Public read is not available yet.",
        status: res.status,
      };
      // All categories will 401 the same way — stop early
      break;
    }

    if (res.status === 404) {
      lastErr = {
        code: "NOT_FOUND",
        message: `Category “${cat}” not found`,
        status: 404,
      };
      continue; // try fallback category name
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      lastErr = {
        code: "UPSTREAM",
        message: `Leaderboard upstream ${res.status}`,
        status: res.status,
        rawSample: text.slice(0, 200),
      };
      continue;
    }

    const json: unknown = await res.json();
    // Some APIs return { ok: false, error: "…" } with 200
    if (
      json &&
      typeof json === "object" &&
      (json as { ok?: boolean }).ok === false
    ) {
      const err = String(
        (json as { error?: string }).error ?? "upstream rejected",
      );
      if (/unauth/i.test(err)) {
        lastErr = {
          code: "UNAUTHORIZED",
          message:
            "Official leaderboard requires a logged-in Kintara session.",
          status: 401,
        };
        break;
      }
      lastErr = { code: "UPSTREAM", message: err };
      continue;
    }

    const result = normalizeLeaderboardPayload(json, {
      offset,
      limit,
      category,
    });
    result.upstreamCategory = cat;

    if (!result.entries.length) {
      lastErr = {
        code: "EMPTY",
        message: "Leaderboard returned no player rows for this category.",
        rawSample: JSON.stringify(json).slice(0, 240),
      };
      continue;
    }

    if (result.period === "24h") {
      result.note =
        "Requested last-24h window (period/range query). If upstream ignores it, scores may be all-time.";
    }

    setCache(cacheKey, result, 45);
    return result;
  }

  const err = lastErr ?? {
    code: "UPSTREAM" as const,
    message: "Failed to load leaderboard",
  };
  const e = new Error(err.message) as Error & { lb?: LeaderboardFetchError };
  e.lb = err;
  throw e;
}

/**
 * Scan pages to find players matching a search query (username / id / guild).
 * Caps network: maxPages × limit rows.
 */
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
}> {
  const q = options.query.trim();
  const category = options.category ?? "kills";
  const pageSize = Math.min(Math.max(options.pageSize ?? 30, 1), 50);
  const maxPages = Math.min(Math.max(options.maxPages ?? 10, 1), 20);

  if (!q) {
    return { matches: [], pagesScanned: 0, category };
  }

  const matches: LeaderboardEntry[] = [];
  const seen = new Set<string>();
  let pagesScanned = 0;

  try {
    for (let p = 0; p < maxPages; p++) {
      const page = await fetchOfficialLeaderboard({
        category,
        offset: p * pageSize,
        limit: pageSize,
      });
      pagesScanned++;
      const hit = filterEntriesByQuery(page.entries, q);
      for (const e of hit) {
        const key = `${e.userId ?? ""}:${e.username.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push(e);
      }
      if (!page.hasMore || page.entries.length === 0) break;
      // Enough matches for UI
      if (matches.length >= 40) break;
    }
  } catch (e) {
    const lb = (e as Error & { lb?: LeaderboardFetchError }).lb;
    if (lb?.code === "UNAUTHORIZED") {
      return {
        matches: [],
        pagesScanned,
        category,
        unauthorized: true,
        error: lb.message,
      };
    }
    return {
      matches,
      pagesScanned,
      category,
      error: e instanceof Error ? e.message : "Search failed",
    };
  }

  matches.sort((a, b) => a.rank - b.rank || b.score - a.score);
  return { matches, pagesScanned, category };
}
