import { fail, ok } from "@/lib/api/response";
import { fetchOfficialRecentActivity } from "@/lib/kintara/official-marketplace";
import {
  fetchMarketActivityFeed,
  selectActivityRows,
  type MarketActivityRow,
} from "@/lib/kintara/kintaramarket-xyz";
import { resolveKinsUsd } from "@/lib/prices/resolve-kins-usd";
import { marketTypeToPortfolioId } from "@/lib/kintara/item-type-map";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { sanitizePersonName } from "@/lib/market/seller-label";

export const runtime = "nodejs";
/** Allow larger book scans on Vercel (default hobby is often 10s). */
export const maxDuration = 60;

type ActivityOut = MarketActivityRow & {
  seller: string | null;
  portfolioItemId: string | null;
  solscanUrl: null;
};

function toClientRow(r: MarketActivityRow): ActivityOut {
  const sellerName = sanitizePersonName(r.sellerName) ?? null;
  return {
    ...r,
    sellerName,
    seller: sellerName,
    buyerName: sanitizePersonName(r.buyerName) ?? null,
    portfolioItemId:
      marketTypeToPortfolioId(r.itemType, STATIC_CATALOG) ?? null,
    solscanUrl: null,
  };
}

/**
 * Merge official rows into KM rows by listing id.
 * Prefer official for sellerId / fresher lock state when present.
 * Never drop a lock flag once either side has it.
 */
function mergeById(
  primary: MarketActivityRow[],
  secondary: MarketActivityRow[],
): MarketActivityRow[] {
  const map = new Map<string, MarketActivityRow>();
  for (const row of primary) {
    map.set(String(row.id), row);
  }
  for (const row of secondary) {
    const id = String(row.id);
    const prev = map.get(id);
    if (!prev) {
      map.set(id, row);
      continue;
    }
    const reserved = Boolean(row.reserved || prev.reserved || row.buyerId || prev.buyerId);
    const reservedUntilMs =
      Math.max(row.reservedUntilMs ?? 0, prev.reservedUntilMs ?? 0) || null;
    map.set(id, {
      ...prev,
      ...row,
      sellerName: row.sellerName ?? prev.sellerName,
      sellerId: row.sellerId ?? prev.sellerId,
      buyerId: row.buyerId ?? prev.buyerId,
      buyerName: row.buyerName ?? prev.buyerName,
      reserved,
      reservedUntilMs:
        reservedUntilMs && reservedUntilMs > 0 ? reservedUntilMs : null,
    });
  }
  return [...map.values()];
}

/**
 * Live marketplace feed.
 *
 * Primary: kintaramarket.xyz/api/listings (works from Vercel).
 * Soft enrich: official kintara.com pages when not rate-limited (often 429 on serverless).
 *
 * Query: limit (default 1000), pages (official only), gold=1, sort=cheap|new
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const limit = Number(sp.get("limit") ?? "1000");
  const pages = Number(sp.get("pages") ?? "4");
  const includeGold = sp.get("gold") === "1" || sp.get("gold") === "true";
  const sort = sp.get("sort") === "new" ? "new" : "cheap";
  /** km=1 — skip official (fast pulse for new listings) */
  const kmOnly =
    sp.get("km") === "1" ||
    sp.get("km") === "true" ||
    sp.get("fast") === "1";
  const want = Number.isFinite(limit)
    ? Math.min(Math.max(limit, 1), 3000)
    : 1000;

  try {
    const rate = await resolveKinsUsd();
    const kinsUsd = rate?.kinsUsd;

    // 1) Reliable path for Vercel (kintara.com returns 429 to many serverless IPs)
    let source = "kintaramarket.xyz";
    let note =
      "Live open book via kintaramarket.xyz (official kintara.com often rate-limits Vercel).";
    let rows: MarketActivityRow[] = [];

    try {
      rows = await fetchMarketActivityFeed({
        limit: want,
        kinsUsd,
        sort,
      });
    } catch {
      rows = [];
    }

    // 2) Soft official enrich — skip on km-only pulse for ≤1s latency
    let official: MarketActivityRow[] = [];
    if (!kmOnly) {
      try {
        official = await fetchOfficialRecentActivity({
          limit: Math.min(want, 400),
          pages: Number.isFinite(pages)
            ? Math.min(Math.max(pages, 1), 6)
            : 4,
          kinsUsd,
          includeGold,
          sort,
        });
      } catch {
        official = [];
      }
    }

    if (official.length > 0) {
      const kmHadRows = rows.length > 0;
      rows = mergeById(rows, official);
      // Bug #2 fix: accurately reflect which sources contributed data.
      // When KM returned nothing, rows comes entirely from official.
      source = kmHadRows
        ? "kintaramarket.xyz+kintara.com"
        : "kintara.com";
      note = kmHadRows
        ? "Merged kintaramarket open book + official kintara.com pages (locks/seller ids when available)."
        : "Official kintara.com pages only (kintaramarket returned no rows).";
    }

    if (rows.length === 0 && official.length === 0) {
      // Last chance: official alone already empty; surface soft empty with note
      note =
        "No listings returned (kintaramarket empty and kintara.com rate-limited or down).";
    }

    // Cap without dropping reserved/locked (open-first slice was wiping locks)
    rows = selectActivityRows(rows, want, sort);

    return ok(
      {
        activity: rows.map(toClientRow),
        count: rows.length,
        kinsUsd: rate != null ? String(rate.kinsUsd) : null,
        rateSource: rate?.source ?? null,
        note,
        providers: {
          kintaramarket: rows.length > 0,
          official: official.length,
        },
      },
      {
        source,
        updatedAt: new Date().toISOString(),
        cacheControl: "public, s-maxage=1, stale-while-revalidate=3",
      },
    );
  } catch (e) {
    return fail(
      "ACTIVITY_ERROR",
      e instanceof Error ? e.message : "Failed to load market activity",
      { status: 502, retryable: true },
    );
  }
}
