import { describe, expect, it } from "vitest";
import {
  categoryFallbacks,
  filterEntriesByQuery,
  getLeaderboardAuthHeaders,
  isLeaderboardAuthConfigured,
  normalizeLeaderboardEntry,
  normalizeLeaderboardPayload,
  paginateEntries,
  resolveUpstreamQuery,
  type LeaderboardEntry,
} from "@/lib/kintara/leaderboard";

describe("leaderboard (kintaramarket lb)", () => {
  it("resolves categories to pvp/mob paths and 24h delta mode", () => {
    expect(resolveUpstreamQuery("pvp").kmPath).toBe("pvp");
    expect(resolveUpstreamQuery("mob").kmPath).toBe("mob");
    expect(resolveUpstreamQuery("kills").kmPath).toBe("both");
    expect(resolveUpstreamQuery("pvp_24h").useDelta).toBe(true);
    expect(resolveUpstreamQuery("mob_24h").period).toBe("24h");
    expect(categoryFallbacks("pvp")).toContain("pvp");
  });

  it("normalizes KM-like and official-like rows", () => {
    const km = normalizeLeaderboardEntry(
      { id: 27344, name: "0xRazu", value: 118, d: 11 },
      0,
      0,
    );
    expect(km?.username).toBe("0xRazu");
    expect(km?.userId).toBe("27344");
    expect(km?.score).toBe(118);
    expect(km?.delta24h).toBe(11);

    const r = normalizeLeaderboardPayload(
      {
        ok: true,
        entries: [
          {
            rank: 1,
            userId: 101,
            username: "Alpha",
            kills: 9000,
            pvpKills: 1200,
            mobKills: 7800,
          },
        ],
      },
      { offset: 0, limit: 30, category: "kills" },
    );
    expect(r.entries[0].username).toBe("Alpha");
    expect(r.entries[0].pvpKills).toBe(1200);
  });

  it("paginates 30 then next 30", () => {
    const many: LeaderboardEntry[] = Array.from({ length: 75 }, (_, i) => ({
      rank: i + 1,
      userId: String(i),
      username: `P${i}`,
      score: 1000 - i,
      pvpKills: i,
      mobKills: i * 2,
      totalKills: i * 3,
      delta24h: 0,
      guild: null,
      extras: {},
    }));
    const p1 = paginateEntries(many, 0, 30);
    expect(p1.page).toHaveLength(30);
    expect(p1.page[0].username).toBe("P0");
    expect(p1.hasMore).toBe(true);
    expect(p1.total).toBe(75);

    const p2 = paginateEntries(many, 30, 30);
    expect(p2.page).toHaveLength(30);
    expect(p2.page[0].username).toBe("P30");
    expect(p2.hasMore).toBe(true);

    const p3 = paginateEntries(many, 60, 30);
    expect(p3.page).toHaveLength(15);
    expect(p3.hasMore).toBe(false);
  });

  it("filters by username and id", () => {
    const entries: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: "99",
        username: "Fishscn",
        score: 10,
        pvpKills: 1,
        mobKills: 9,
        totalKills: 10,
        delta24h: 2,
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
        delta24h: null,
        guild: null,
        extras: {},
      },
    ];
    expect(filterEntriesByQuery(entries, "fish")).toHaveLength(1);
    expect(filterEntriesByQuery(entries, "#99")).toHaveLength(1);
  });

  it("skips rows without a display name", () => {
    expect(normalizeLeaderboardEntry({ value: 1 }, 0, 0)).toBeNull();
  });

  it("builds auth headers only when env is set", () => {
    const prevCookie = process.env.KINTARA_SESSION_COOKIE;
    const prevSession = process.env.KINTARA_SESSION;
    delete process.env.KINTARA_SESSION_COOKIE;
    delete process.env.KINTARA_SESSION;
    expect(isLeaderboardAuthConfigured()).toBe(false);
    expect(getLeaderboardAuthHeaders().Cookie).toBeUndefined();

    process.env.KINTARA_SESSION = "abc123token";
    expect(getLeaderboardAuthHeaders().Cookie).toBe("session=abc123token");

    process.env.KINTARA_SESSION_COOKIE = "sid=xyz; other=1";
    expect(getLeaderboardAuthHeaders().Cookie).toBe("sid=xyz; other=1");

    if (prevCookie === undefined) delete process.env.KINTARA_SESSION_COOKIE;
    else process.env.KINTARA_SESSION_COOKIE = prevCookie;
    if (prevSession === undefined) delete process.env.KINTARA_SESSION;
    else process.env.KINTARA_SESSION = prevSession;
  });
});
