import { describe, expect, it } from "vitest";
import {
  categoryFallbacks,
  filterEntriesByQuery,
  getLeaderboardAuthHeaders,
  isLeaderboardAuthConfigured,
  normalizeLeaderboardEntry,
  normalizeLeaderboardPayload,
  resolveUpstreamQuery,
  type LeaderboardEntry,
} from "@/lib/kintara/leaderboard";

const SAMPLE_PAYLOAD = {
  ok: true,
  category: "kills",
  total: 500,
  entries: [
    {
      rank: 1,
      userId: 101,
      username: "AlphaKiller",
      kills: 9000,
      pvpKills: 1200,
      mobKills: 7800,
      guild: "MEME",
    },
    {
      rank: 2,
      userId: 202,
      name: "BetaFarmer",
      score: 4500,
      pvp_kills: 100,
      mob_kills: 4400,
    },
    {
      position: 3,
      playerName: "Gamma",
      value: 100,
      pvp: 40,
      mob: 60,
    },
  ],
};

describe("leaderboard normalizer", () => {
  it("resolves upstream categories and 24h extras", () => {
    expect(resolveUpstreamQuery("kills").category).toBe("kills");
    expect(resolveUpstreamQuery("pvp").category).toBe("pvp");
    expect(resolveUpstreamQuery("mob_24h").period).toBe("24h");
    expect(resolveUpstreamQuery("mob_24h").extra.period).toBe("24h");
    expect(categoryFallbacks("pvp")).toContain("pvp_kills");
  });

  it("normalizes mixed official-like row shapes", () => {
    const r = normalizeLeaderboardPayload(SAMPLE_PAYLOAD, {
      offset: 0,
      limit: 30,
      category: "kills",
    });
    expect(r.entries).toHaveLength(3);
    expect(r.entries[0].username).toBe("AlphaKiller");
    expect(r.entries[0].score).toBe(9000);
    expect(r.entries[0].pvpKills).toBe(1200);
    expect(r.entries[0].mobKills).toBe(7800);
    expect(r.entries[0].guild).toBe("MEME");
    expect(r.entries[1].username).toBe("BetaFarmer");
    expect(r.entries[1].pvpKills).toBe(100);
    expect(r.entries[1].mobKills).toBe(4400);
    expect(r.entries[2].username).toBe("Gamma");
    expect(r.entries[2].rank).toBe(3);
    expect(r.total).toBe(500);
    expect(r.hasMore).toBe(true);
  });

  it("supports leaderboard[] and rows[] wrappers", () => {
    const a = normalizeLeaderboardPayload(
      { leaderboard: [{ username: "X", kills: 5, rank: 1 }] },
      { offset: 0, limit: 10, category: "kills" },
    );
    expect(a.entries[0].username).toBe("X");
    expect(a.entries[0].score).toBe(5);

    const b = normalizeLeaderboardPayload(
      { data: { rows: [{ name: "Y", score: 9 }] } },
      { offset: 10, limit: 10, category: "pvp" },
    );
    expect(b.entries[0].username).toBe("Y");
    expect(b.entries[0].rank).toBe(11); // offset + index + 1
  });

  it("filters by username, id, guild", () => {
    const entries: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: "99",
        username: "Fishscn",
        score: 10,
        pvpKills: 1,
        mobKills: 9,
        totalKills: 10,
        guild: "ROT",
        extras: {},
      },
      {
        rank: 2,
        userId: "12",
        username: "Other",
        score: 5,
        pvpKills: null,
        mobKills: null,
        totalKills: null,
        guild: null,
        extras: {},
      },
    ];
    expect(filterEntriesByQuery(entries, "fish").map((e) => e.username)).toEqual([
      "Fishscn",
    ]);
    expect(filterEntriesByQuery(entries, "#99")).toHaveLength(1);
    expect(filterEntriesByQuery(entries, "rot")).toHaveLength(1);
    expect(filterEntriesByQuery(entries, "")).toHaveLength(2);
  });

  it("skips rows without a display name", () => {
    expect(normalizeLeaderboardEntry({ kills: 1 }, 0, 0)).toBeNull();
  });

  it("builds auth headers only when env is set", () => {
    const prevCookie = process.env.KINTARA_SESSION_COOKIE;
    const prevSession = process.env.KINTARA_SESSION;
    delete process.env.KINTARA_SESSION_COOKIE;
    delete process.env.KINTARA_SESSION;
    expect(isLeaderboardAuthConfigured()).toBe(false);
    expect(getLeaderboardAuthHeaders().Cookie).toBeUndefined();

    process.env.KINTARA_SESSION = "abc123token";
    expect(isLeaderboardAuthConfigured()).toBe(true);
    expect(getLeaderboardAuthHeaders().Cookie).toBe("session=abc123token");

    process.env.KINTARA_SESSION_COOKIE = "sid=xyz; other=1";
    expect(getLeaderboardAuthHeaders().Cookie).toBe("sid=xyz; other=1");

    if (prevCookie === undefined) delete process.env.KINTARA_SESSION_COOKIE;
    else process.env.KINTARA_SESSION_COOKIE = prevCookie;
    if (prevSession === undefined) delete process.env.KINTARA_SESSION;
    else process.env.KINTARA_SESSION = prevSession;
  });
});
