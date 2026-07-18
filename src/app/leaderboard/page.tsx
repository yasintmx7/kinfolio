"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search, Trophy } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Category =
  | "kills"
  | "pvp"
  | "mob"
  | "kills_24h"
  | "pvp_24h"
  | "mob_24h";

type Entry = {
  rank: number;
  userId: string | null;
  username: string;
  score: number;
  pvpKills: number | null;
  mobKills: number | null;
  totalKills: number | null;
  guild: string | null;
};

type BoardResponse = {
  ok: boolean;
  data?: {
    mode: "board" | "search";
    category: Category;
    period?: string;
    upstreamCategory?: string;
    entries: Entry[];
    count: number;
    offset?: number;
    limit?: number;
    total?: number | null;
    hasMore?: boolean;
    pagesScanned?: number;
    query?: string;
    note?: string | null;
  };
  error?: { code?: string; message?: string };
  updatedAt?: string;
  source?: string;
};

const CATEGORY_TABS: { id: Category; label: string; hint: string }[] = [
  { id: "kills", label: "Total kills", hint: "All-time kill score" },
  { id: "pvp", label: "PvP", hint: "Player kills" },
  { id: "mob", label: "Mob", hint: "Monster / PvE kills" },
  { id: "kills_24h", label: "24h kills", hint: "Last 24 hours (if API supports)" },
  { id: "pvp_24h", label: "24h PvP", hint: "Last 24h PvP" },
  { id: "mob_24h", label: "24h mob", hint: "Last 24h mob kills" },
];

/** Official API page size — 30 ranks per request, then Load more. */
const PAGE_SIZE = 30;
const AUTO_REFRESH_MS = 45_000;

function formatScore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function entryKey(e: Entry): string {
  return `${e.userId ?? ""}:${e.username.toLowerCase()}:${e.rank}`;
}

function mergeUnique(prev: Entry[], next: Entry[]): Entry[] {
  const seen = new Set(prev.map(entryKey));
  const out = [...prev];
  for (const row of next) {
    const k = entryKey(row);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

async function fetchBoardPage(
  category: Category,
  offset: number,
  limit: number,
): Promise<BoardResponse> {
  const url = `/api/leaderboard?category=${encodeURIComponent(category)}&offset=${offset}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  return (await res.json()) as BoardResponse;
}

export default function LeaderboardPage() {
  const [category, setCategory] = useState<Category>("kills");
  const [entries, setEntries] = useState<Entry[]>([]);
  /** How many API pages (×30) have been loaded for the board. */
  const [pagesLoaded, setPagesLoaded] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [upstreamCategory, setUpstreamCategory] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const pagesLoadedRef = useRef(0);
  const activeSearchRef = useRef("");
  useEffect(() => {
    pagesLoadedRef.current = pagesLoaded;
  }, [pagesLoaded]);
  useEffect(() => {
    activeSearchRef.current = activeSearch;
  }, [activeSearch]);

  const applyMeta = useCallback((body: BoardResponse) => {
    if (!body.data) return;
    setTotal(body.data.total ?? body.data.count ?? null);
    setNote(body.data.note ?? null);
    setUpdatedAt(body.updatedAt ?? null);
    setUpstreamCategory(body.data.upstreamCategory ?? null);
  }, []);

  /** Load first page (30) or replace board. */
  const loadFirstPage = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (silent) setRefreshing(true);
      else {
        setLoading(true);
        setError(null);
        setErrorCode(null);
      }
      try {
        const body = await fetchBoardPage(category, 0, PAGE_SIZE);
        if (!body.ok || !body.data) {
          setError(body.error?.message ?? "Failed to load leaderboard");
          setErrorCode(body.error?.code ?? "LEADERBOARD_ERROR");
          if (!silent) {
            setEntries([]);
            setPagesLoaded(0);
            setHasMore(false);
          }
          return;
        }
        const rows = body.data.entries ?? [];
        setEntries(rows);
        setPagesLoaded(1);
        setHasMore(
          Boolean(body.data.hasMore) || rows.length >= PAGE_SIZE,
        );
        applyMeta(body);
        setActiveSearch("");
        setError(null);
        setErrorCode(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
        setErrorCode("NETWORK");
        if (!silent) {
          setEntries([]);
          setPagesLoaded(0);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [category, applyMeta],
  );

  /** Load next 30 and append. */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || activeSearch) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextOffset = pagesLoaded * PAGE_SIZE;
      const body = await fetchBoardPage(category, nextOffset, PAGE_SIZE);
      if (!body.ok || !body.data) {
        setError(body.error?.message ?? "Failed to load more");
        setErrorCode(body.error?.code ?? "LEADERBOARD_ERROR");
        return;
      }
      const rows = body.data.entries ?? [];
      setEntries((prev) => mergeUnique(prev, rows));
      setPagesLoaded((p) => p + 1);
      setHasMore(Boolean(body.data.hasMore) && rows.length >= PAGE_SIZE);
      applyMeta(body);
      setError(null);
      setErrorCode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setErrorCode("NETWORK");
    } finally {
      setLoadingMore(false);
    }
  }, [category, hasMore, loadingMore, pagesLoaded, activeSearch, applyMeta]);

  /** Silent refresh of all pages already loaded (does not shrink list). */
  const refreshLoadedPages = useCallback(async () => {
    const pages = Math.max(1, pagesLoadedRef.current);
    setRefreshing(true);
    try {
      let all: Entry[] = [];
      let more = false;
      let lastBody: BoardResponse | null = null;
      for (let p = 0; p < pages; p++) {
        const body = await fetchBoardPage(category, p * PAGE_SIZE, PAGE_SIZE);
        lastBody = body;
        if (!body.ok || !body.data) {
          if (p === 0) {
            setError(body.error?.message ?? "Failed to refresh");
            setErrorCode(body.error?.code ?? "LEADERBOARD_ERROR");
          }
          break;
        }
        const rows = body.data.entries ?? [];
        all = mergeUnique(all, rows);
        more = Boolean(body.data.hasMore) && rows.length >= PAGE_SIZE;
        if (rows.length < PAGE_SIZE) {
          more = false;
          break;
        }
      }
      if (all.length) {
        setEntries(all);
        setPagesLoaded(Math.max(1, Math.ceil(all.length / PAGE_SIZE)));
        setHasMore(more);
        if (lastBody) applyMeta(lastBody);
        setError(null);
        setErrorCode(null);
      }
    } catch {
      // keep existing rows on background refresh failure
    } finally {
      setRefreshing(false);
    }
  }, [category, applyMeta]);

  const runSearch = useCallback(
    async (opts?: { query?: string; silent?: boolean }) => {
      const q = (opts?.query ?? searchInput).trim();
      const silent = Boolean(opts?.silent);
      if (!q) {
        setActiveSearch("");
        void loadFirstPage({ silent });
        return;
      }
      if (!silent) {
        setSearching(true);
        setLoading(true);
        setError(null);
        setErrorCode(null);
      } else {
        setRefreshing(true);
      }
      try {
        const url = `/api/leaderboard?category=${encodeURIComponent(category)}&q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}`;
        const res = await fetch(url, { cache: "no-store" });
        const body = (await res.json()) as BoardResponse;
        if (!body.ok || !body.data) {
          setError(body.error?.message ?? "Search failed");
          setErrorCode(body.error?.code ?? "LEADERBOARD_ERROR");
          if (!silent) setEntries([]);
          return;
        }
        setEntries(body.data.entries ?? []);
        setHasMore(false);
        setPagesLoaded(1);
        setTotal(body.data.count ?? body.data.entries?.length ?? 0);
        setNote(body.data.note ?? null);
        setUpdatedAt(body.updatedAt ?? null);
        setActiveSearch(q);
        setError(null);
        setErrorCode(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
        setErrorCode("NETWORK");
        if (!silent) setEntries([]);
      } finally {
        setSearching(false);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [category, searchInput, loadFirstPage],
  );

  useEffect(() => {
    setActiveSearch("");
    setSearchInput("");
    setPagesLoaded(0);
    void loadFirstPage();
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      if (activeSearchRef.current) {
        void runSearch({ query: activeSearchRef.current, silent: true });
      } else {
        void refreshLoadedPages();
      }
    };
    const id = window.setInterval(tick, AUTO_REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [runSearch, refreshLoadedPages]);

  const catMeta = useMemo(
    () => CATEGORY_TABS.find((c) => c.id === category) ?? CATEGORY_TABS[0],
    [category],
  );

  const unauthorized = errorCode === "LEADERBOARD_UNAUTHORIZED";
  const pageLabel = Math.max(1, pagesLoaded);
  const rangeStart = entries.length ? 1 : 0;
  const rangeEnd = entries.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-sky">
            Combat
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Trophy className="h-6 w-6 text-gold-hi" />
            Leaderboard
          </h1>
          <p className="mt-1 text-sm text-muted">
            {PAGE_SIZE} per page · Load more for the next {PAGE_SIZE}
            {upstreamCategory ? (
              <>
                {" "}
                · upstream{" "}
                <span className="font-mono text-xs text-sky-hi">
                  {upstreamCategory}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="secondary"
            className="min-h-10"
            onClick={() =>
              activeSearch
                ? void runSearch({ query: activeSearch })
                : void loadFirstPage()
            }
            disabled={loading || searching}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (loading || searching || refreshing) && "animate-spin",
              )}
            />
            Refresh
          </Button>
          <p className="text-[10px] text-muted">
            Auto every 45s
            {refreshing ? " · updating…" : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCategory(tab.id)}
            className={cn(
              "min-h-10 rounded-xl px-3 text-sm font-medium transition-colors",
              category === tab.id
                ? "bg-sky text-[#0a121c]"
                : "bg-raised text-muted hover:text-primary",
            )}
            title={tab.hint}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="space-y-3">
        <CardTitle>Search player</CardTitle>
        <p className="text-xs text-muted">
          Find total PvP / mob kills by username, player id, or guild tag.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="e.g. username or #12345"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={searching || loading}>
              {searching ? "Searching…" : "Search"}
            </Button>
            {activeSearch ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchInput("");
                  setActiveSearch("");
                  void loadFirstPage();
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </form>
        {activeSearch ? (
          <p className="text-xs text-sky-hi">
            Showing search results for “{activeSearch}” · {catMeta.label}
          </p>
        ) : (
          <p className="text-xs text-muted">{catMeta.hint}</p>
        )}
      </Card>

      {unauthorized && (
        <Card className="border-amber/40 bg-amber/10 space-y-2">
          <p className="text-sm font-medium text-amber">
            Why no data: Kintara leaderboard is private (HTTP 401)
          </p>
          <p className="text-xs text-muted leading-relaxed">
            Set{" "}
            <code className="font-mono text-[11px] text-sky-hi">
              KINTARA_SESSION_COOKIE
            </code>{" "}
            in Vercel (from a logged-in kintara.com browser), redeploy, then
            ranks load here — {PAGE_SIZE} at a time with Load more.
          </p>
        </Card>
      )}

      {error && !unauthorized && (
        <Card className="border-loss/30 bg-loss/10">
          <p className="text-sm text-loss">{error}</p>
        </Card>
      )}

      {note && !error && <p className="text-xs text-muted">{note}</p>}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{catMeta.label}</h2>
            <p className="font-mono text-[11px] text-muted">
              {loading
                ? "Loading…"
                : activeSearch
                  ? `${entries.length} match${entries.length === 1 ? "" : "es"}`
                  : entries.length
                    ? `Showing ${rangeStart}–${rangeEnd}${
                        total != null ? ` of ~${total}` : ""
                      } · page ${pageLabel} (${PAGE_SIZE}/page)`
                    : "No rows"}
              {updatedAt
                ? ` · ${new Date(updatedAt).toLocaleTimeString()}`
                : ""}
              {refreshing ? " · refreshing…" : ""}
            </p>
          </div>
          {!activeSearch && !unauthorized && entries.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                className="min-h-9 px-2"
                disabled={pagesLoaded <= 1 || loading || loadingMore}
                onClick={() => void loadFirstPage()}
              >
                <ChevronLeft className="h-4 w-4" />
                First
              </Button>
              <span className="px-1 font-mono text-xs tabular-nums text-muted">
                {pageLabel}
              </span>
              <Button
                variant="ghost"
                className="min-h-9 px-2"
                disabled={!hasMore || loadingMore || loading}
                onClick={() => void loadMore()}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {loading && entries.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl bg-surface-2"
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state px-4 py-10 text-center text-sm text-muted">
            {unauthorized
              ? "No public leaderboard data yet."
              : activeSearch
                ? "No matching players on scanned pages."
                : "No rows returned for this category."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-surface-2/80 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Player</th>
                  <th className="px-3 py-2.5 font-medium text-right">Score</th>
                  <th className="px-3 py-2.5 font-medium text-right">PvP</th>
                  <th className="px-3 py-2.5 font-medium text-right">Mob</th>
                  <th className="px-3 py-2.5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/25">
                {entries.map((e) => (
                  <tr
                    key={entryKey(e)}
                    className="hover:bg-sky/5"
                  >
                    <td className="px-3 py-2.5 font-mono tabular-nums text-muted">
                      {e.rank}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-primary">
                        {e.username}
                      </div>
                      <div className="font-mono text-[11px] text-muted">
                        {e.userId ? `#${e.userId}` : ""}
                        {e.guild ? (
                          <span className="ml-1 text-sky-hi">[{e.guild}]</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-sky-hi">
                      {formatScore(e.score)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatScore(e.pvpKills)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatScore(e.mobKills)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted">
                      {formatScore(e.totalKills)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!activeSearch && !unauthorized && entries.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border/40 p-3 sm:flex-row sm:items-center">
            <Button
              variant="secondary"
              className="w-full flex-1"
              disabled={!hasMore || loadingMore || loading}
              onClick={() => void loadMore()}
            >
              {loadingMore
                ? "Loading…"
                : hasMore
                  ? `Load more (+${PAGE_SIZE})`
                  : "End of list"}
            </Button>
            <p className="text-center font-mono text-[11px] text-muted sm:text-right">
              {hasMore
                ? `Next ranks ${rangeEnd + 1}–${rangeEnd + PAGE_SIZE}`
                : `${entries.length} loaded`}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
