import { d } from "@/lib/accounting/decimal";
import type { KintaraItem } from "@/lib/accounting/types";
import { findItemByNameOrAlias } from "@/data/static-catalog";

/**
 * In-game marketplace history paste (not Solana wallet alerts).
 *
 * Example:
 *   MarketplaceJul 5 07:24 AM
 *   You bought 500 Wood for $0.01 USD (0.58 $KINS).
 *   MarketplaceJul 5 07:43 AM
 *   You sold 7 Gold for $6.15 USD (362.47 $KINS).
 */

export type MarketplaceHistoryLine = {
  direction: "buy" | "sell";
  quantity: string;
  itemName: string;
  /** Catalog id when resolved */
  itemId: string | null;
  usd: string;
  kins: string;
  /** ISO timestamp */
  transactionAt: string;
  raw: string;
  warnings: string[];
};

export type MarketplaceHistoryParseResult = {
  lines: MarketplaceHistoryLine[];
  warnings: string[];
  /** True when paste looks like marketplace log (not wallet alert) */
  matched: boolean;
};

const HEADER_RE =
  /Marketplace\s*([A-Za-z]+)\s+(\d{1,2})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/gi;

const TRADE_RE =
  /You\s+(bought|sold)\s+([\d,]+)\s+(.+?)\s+for\s+\$\s*([\d,.]+)\s*USD\s*\(\s*([\d,.]+)\s*\$?\s*KINS\s*\)\s*\.?/gi;

export function looksLikeMarketplaceHistory(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/You\s+(bought|sold)\s+[\d,]+\s+/i.test(t)) return true;
  if (/Marketplace\s*[A-Za-z]+\s+\d{1,2}\s+\d{1,2}:\d{2}/i.test(t)) return true;
  return false;
}

function parseNum(raw: string): string {
  return d(raw.replace(/,/g, "").trim()).toFixed();
}

/**
 * "Jul 5 07:24 AM" → ISO. Uses `year` (default: current).
 * If the date would be >7 days in the future, uses previous year.
 */
export function parseMarketplaceWhen(
  month: string,
  day: string,
  timeAmPm: string,
  year = new Date().getFullYear(),
): string {
  const raw = `${month} ${day} ${timeAmPm} ${year}`;
  let ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    // Fallback: try with comma
    ms = Date.parse(`${month} ${day}, ${year} ${timeAmPm}`);
  }
  if (!Number.isFinite(ms)) {
    return new Date().toISOString();
  }
  const now = Date.now();
  // Future date (e.g. viewing old log in early year) → previous year
  if (ms > now + 7 * 86400000) {
    const prev = Date.parse(`${month} ${day} ${timeAmPm} ${year - 1}`);
    if (Number.isFinite(prev)) ms = prev;
  }
  return new Date(ms).toISOString();
}

/** Resolve "Wood", "Cooked Fish Meat", "Pickaxe (Lvl 2)" → catalog item. */
export function resolveMarketplaceItemName(
  itemName: string,
  catalog: KintaraItem[],
): KintaraItem | undefined {
  const raw = itemName.trim();
  if (!raw) return undefined;

  let hit = findItemByNameOrAlias(raw, catalog);
  if (hit) return hit;

  // Pickaxe (Lvl 2) / Axe (Lvl 2)
  const lvl = raw.match(/^(.+?)\s*\(\s*Lvl\.?\s*(\d+)\s*\)\s*$/i);
  if (lvl) {
    const base = lvl[1].trim();
    const n = lvl[2];
    const tries = [
      `Lvl ${n} ${base}`,
      `${base} Lvl ${n}`,
      `Lvl. ${n} ${base}`,
      `lvl-${n}-${base}`,
      `lvl_${n}_${base}`,
      base,
    ];
    for (const t of tries) {
      hit = findItemByNameOrAlias(t, catalog);
      if (hit) return hit;
    }
    const q = base.toLowerCase();
    const withLvl = catalog.filter(
      (i) =>
        (i.name.toLowerCase().includes(q) ||
          i.aliases.some((a) => a.toLowerCase().includes(q))) &&
        (i.name.toLowerCase().includes(`lvl ${n}`) ||
          i.name.toLowerCase().includes(`lvl. ${n}`) ||
          i.id.includes(`lvl-${n}`) ||
          i.id.includes(`lvl_${n}`) ||
          i.id.includes(`l${n}`) ||
          i.id.includes(`-l${n}`)),
    );
    if (withLvl.length === 1) return withLvl[0];
    if (withLvl.length > 1) {
      return withLvl.sort((a, b) => a.name.length - b.name.length)[0];
    }
  }

  const stripped = raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  hit = findItemByNameOrAlias(stripped, catalog);
  if (hit) return hit;

  const q = stripped.toLowerCase();
  const candidates = catalog.filter(
    (i) =>
      i.name.toLowerCase() === q ||
      i.slug === q ||
      i.id === q ||
      i.aliases.some((a) => a.toLowerCase() === q) ||
      i.name.toLowerCase().includes(q) ||
      q.includes(i.name.toLowerCase()),
  );
  if (!candidates.length) return undefined;
  const exact = candidates.find((i) => i.name.toLowerCase() === q);
  if (exact) return exact;
  return candidates.sort((a, b) => a.name.length - b.name.length)[0];
}

/**
 * Parse a full marketplace history paste into ordered trade lines.
 */
export function parseMarketplaceHistory(
  text: string,
  catalog: KintaraItem[],
  options?: { year?: number },
): MarketplaceHistoryParseResult {
  const warnings: string[] = [];
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!normalized) {
    return { lines: [], warnings: ["Empty paste."], matched: false };
  }

  const matched = looksLikeMarketplaceHistory(normalized);
  if (!matched) {
    return { lines: [], warnings: [], matched: false };
  }

  // Collect date headers with positions
  type Header = { index: number; iso: string };
  const headers: Header[] = [];
  HEADER_RE.lastIndex = 0;
  let hm: RegExpExecArray | null;
  while ((hm = HEADER_RE.exec(normalized)) !== null) {
    headers.push({
      index: hm.index,
      iso: parseMarketplaceWhen(hm[1], hm[2], hm[3], options?.year),
    });
  }

  /**
   * Game UI sometimes prints date above the trade, sometimes below.
   * Pick the nearest Marketplace header (prefer slightly after when tied).
   */
  function headerNear(tradeStart: number, tradeEnd: number): string {
    let prev: Header | null = null;
    let next: Header | null = null;
    for (const h of headers) {
      if (h.index <= tradeStart) prev = h;
      if (h.index >= tradeEnd && !next) next = h;
    }
    if (prev && next) {
      const dPrev = tradeStart - prev.index;
      const dNext = next.index - tradeEnd;
      return dNext <= dPrev ? next.iso : prev.iso;
    }
    return (next ?? prev)?.iso ?? new Date().toISOString();
  }

  const lines: MarketplaceHistoryLine[] = [];
  TRADE_RE.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = TRADE_RE.exec(normalized)) !== null) {
    const direction = tm[1].toLowerCase() === "sold" ? "sell" : "buy";
    const quantity = parseNum(tm[2]);
    const itemName = tm[3].trim();
    const usd = parseNum(tm[4]);
    const kins = parseNum(tm[5]);
    const item = resolveMarketplaceItemName(itemName, catalog);
    const lineWarnings: string[] = [];
    if (!item) {
      lineWarnings.push(`Unknown item: “${itemName}” — pick manually.`);
      warnings.push(`Unknown item: “${itemName}”`);
    }
    if (d(quantity).lte(0)) {
      lineWarnings.push("Quantity must be positive.");
    }

    lines.push({
      direction,
      quantity,
      itemName,
      itemId: item?.id ?? null,
      usd,
      kins,
      transactionAt: headerNear(tm.index, tm.index + tm[0].length),
      raw: tm[0],
      warnings: lineWarnings,
    });
  }

  if (!lines.length) {
    warnings.push(
      "No “You bought/sold …” lines found. Check the paste format.",
    );
  }

  // Chronological for ledger (oldest first) helps average-cost sells
  lines.sort(
    (a, b) =>
      Date.parse(a.transactionAt) - Date.parse(b.transactionAt) ||
      a.raw.localeCompare(b.raw),
  );

  return { lines, warnings, matched: true };
}
