"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Trophy } from "lucide-react";
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

function formatScore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

export default function LeaderboardPage() {
  const [category, setCategory] = useState<Category>("kills");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [offset, setOffset] = useState(0);
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

  const limit = 30;
  /** Auto-refresh interval — matches ~45s server cache on board. */
  const AUTO_REFRESH_MS = 45_000;

  const loadBoard = useCallback(
    async (opts?: {
      append?: boolean;
      nextOffset?: number;
      silent?: boolean;
    }) => {
      const append = Boolean(opts?.append);
      const silent = Boolean(opts?.silent);
      const off = opts?.nextOffset ?? 0;
      if (append) setLoadingMore(true);
      else if (silent) setRefreshing(true);
      else {
        setLoading(true);
        setError(null);
        setErrorCode(null);
      }
      try {
        // On silent refresh keep currently loaded window (first page only if not append)
        const url = `/api/leaderboard?category=${encodeURIComponent(category)}&offset=${off}&limit=${limit}`;
        const res = await fetch(url, { cache: "no-store" });
        const body = (await res.json()) as BoardResponse;
        if (!body.ok || !body.data) {
          setError(body.error?.message ?? "Failed to load leaderboard");
          setErrorCode(body.error?.code ?? "LEADERBOARD_ERROR");
          if (!append && !silent) setEntries([]);
          return;
        }
        const rows = body.data.entries ?? [];
        setEntries((prev) => (append ? [...prev, ...rows] : rows));
        setOffset(off);
        setHasMore(Boolean(body.data.hasMore));
        setTotal(body.data.total ?? null);
        setNote(body.data.note ?? null);
        setUpdatedAt(body.updatedAt ?? null);
        setUpstreamCategory(body.data.upstreamCategory ?? null);
        if (!silent) setActiveSearch("");
        setError(null);
        setErrorCode(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
        setErrorCode("NETWORK");
        if (!append && !silent) setEntries([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [category],
  );

  const runSearch = useCallback(
    async (opts?: { query?: string; silent?: boolean }) => {
      const q = (opts?.query ?? searchInput).trim();
      const silent = Boolean(opts?.silent);
      if (!q) {
        setActiveSearch("");
        void loadBoard({ silent });
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
        const url = `/api/leaderboard?category=${encodeURIComponent(category)}&q=${encodeURIComponent(q)}&limit=${limit}`;
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
        setTotal(body.data.count ?? body.data.entries?.length ?? 0);
        setNote(body.data.note ?? null);
        setUpdatedAt(body.updatedAt ?? null);
        setActiveSearch(q);
        setOffset(0);
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
    [category, searchInput, loadBoard],
  );

  useEffect(() => {
    setActiveSearch("");
    setSearchInput("");
    void loadBoard();
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps -- reload on category only

  // Auto-refresh every 45s (board or active search). Pauses when tab is hidden.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      if (activeSearch) {
        void runSearch({ query: activeSearch, silent: true });
      } else {
        void loadBoard({ silent: true, nextOffset: 0 });
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
  }, [activeSearch, loadBoard, runSearch]);

  const catMeta = useMemo(
    () => CATEGORY_TABS.find((c) => c.id === category) ?? CATEGORY_TABS[0],
    [category],
  );

  const unauthorized = errorCode === "LEADERBOARD_UNAUTHORIZED";

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
            PvP &amp; mob kills from official{" "}
            <span className="font-mono text-xs">kintara.com/api/leaderboard</span>
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
                : void loadBoard()
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
          Search scans multiple leaderboard pages.
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
                  void loadBoard();
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
        <Card className="border-amber/40 bg-amber/10">
          <p className="text-sm font-medium text-amber">
            Official leaderboard is session-gated (401)
          </p>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            <code className="font-mono text-[11px]">
              GET /api/leaderboard?category=kills
            </code>{" "}
            currently returns unauthorized without a logged-in Kintara game
            session. Kinfolio stays read-only and never stores your game
            cookies. When Kintara opens this endpoint publicly, rankings will
            appear here automatically.
          </p>
        </Card>
      )}

      {error && !unauthorized && (
        <Card className="border-loss/30 bg-loss/10">
          <p className="text-sm text-loss">{error}</p>
        </Card>
      )}

      {note && !error && (
        <p className="text-xs text-muted">{note}</p>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{catMeta.label}</h2>
            <p className="font-mono text-[11px] text-muted">
              {loading
                ? "Loading…"
                : `${entries.length} shown${
                    total != null ? ` · total ~${total}` : ""
                  }`}
              {updatedAt
                ? ` · updated ${new Date(updatedAt).toLocaleTimeString()}`
                : ""}
              {refreshing ? " · refreshing…" : " · auto 45s"}
            </p>
          </div>
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
                    key={`${e.rank}-${e.userId ?? e.username}`}
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

        {!activeSearch && hasMore && !unauthorized && (
          <div className="border-t border-border/40 p-3">
            <Button
              variant="secondary"
              className="w-full"
              disabled={loadingMore}
              onClick={() =>
                void loadBoard({
                  append: true,
                  nextOffset: offset + limit,
                })
              }
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
