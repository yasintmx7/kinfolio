import { fail, ok } from "@/lib/api/response";
import {
  fetchOfficialLeaderboard,
  isLeaderboardAuthConfigured,
  searchLeaderboardPlayers,
  type LeaderboardCategory,
  type LeaderboardFetchError,
} from "@/lib/kintara/leaderboard";

export const runtime = "nodejs";
export const maxDuration = 30;

const CATEGORIES = new Set<LeaderboardCategory>([
  "kills",
  "pvp",
  "mob",
  "kills_24h",
  "pvp_24h",
  "mob_24h",
]);

function parseCategory(raw: string | null): LeaderboardCategory {
  if (raw && CATEGORIES.has(raw as LeaderboardCategory)) {
    return raw as LeaderboardCategory;
  }
  return "kills";
}

/**
 * GET /api/leaderboard
 * Query:
 *  - category: kills | pvp | mob | kills_24h | pvp_24h | mob_24h
 *  - offset, limit
 *  - q / search: player search (scans multiple pages)
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const category = parseCategory(sp.get("category"));
  const offset = Number(sp.get("offset") ?? "0");
  const limit = Number(sp.get("limit") ?? "30");
  const q = (sp.get("q") ?? sp.get("search") ?? "").trim();

  try {
    if (q) {
      const found = await searchLeaderboardPlayers({
        category,
        query: q,
        pageSize: Number.isFinite(limit)
          ? Math.min(Math.max(limit, 10), 50)
          : 30,
        maxPages: 12,
      });

      if (found.unauthorized) {
        return fail("LEADERBOARD_UNAUTHORIZED", found.error ?? "Unauthorized", {
          status: 502,
          retryable: true,
        });
      }

      return ok(
        {
          mode: "search" as const,
          query: q,
          category,
          entries: found.matches,
          count: found.matches.length,
          pagesScanned: found.pagesScanned,
          authConfigured: isLeaderboardAuthConfigured(),
          note: found.error
            ? found.error
            : found.matches.length
              ? `Found ${found.matches.length} player(s) matching “${q}” (scanned ${found.pagesScanned} page(s)).`
              : `No players matching “${q}” in the first ${found.pagesScanned} page(s).`,
        },
        {
          source: "kintara.com",
          updatedAt: new Date().toISOString(),
          cacheControl: "public, s-maxage=30, stale-while-revalidate=90",
        },
      );
    }

    const board = await fetchOfficialLeaderboard({
      category,
      offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 30,
    });

    return ok(
      {
        mode: "board" as const,
        category: board.category,
        period: board.period,
        upstreamCategory: board.upstreamCategory,
        entries: board.entries,
        count: board.entries.length,
        offset: board.offset,
        limit: board.limit,
        total: board.total,
        hasMore: board.hasMore,
        authConfigured: isLeaderboardAuthConfigured(),
        note: board.note,
      },
      {
        source: "kintara.com",
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=45, stale-while-revalidate=120",
      },
    );
  } catch (e) {
    const lb = (e as Error & { lb?: LeaderboardFetchError }).lb;
    if (lb?.code === "UNAUTHORIZED") {
      // Include setup hint in message; UI also shows structured help
      return fail(
        "LEADERBOARD_UNAUTHORIZED",
        lb.message,
        { status: 502, retryable: true },
      );
    }
    if (lb?.code === "EMPTY") {
      return fail("LEADERBOARD_EMPTY", lb.message, {
        status: 502,
        retryable: true,
      });
    }
    return fail(
      "LEADERBOARD_ERROR",
      e instanceof Error ? e.message : "Failed to load leaderboard",
      { status: 502, retryable: true },
    );
  }
}
