import { d, Decimal } from "@/lib/accounting/decimal";
import type { ParsedAlert, ParsedTransferLine } from "@/lib/accounting/types";

/**
 * Phone Telegram copy (plain):
 *   Sent: 7.15 KINS (~$0.0571) To: GqTA..qMNG
 *
 * Desktop Telegram copy often keeps link targets as parenthetical URLs:
 *   Sent: 377.55 KINS (https://solscan.io/token/...) (~$2.48) To: 5oKu..wKFp (https://solscan.io/account/...)
 *
 * Optional `(https://…)` between KINS and the USD amount is tolerated so PC paste
 * still matches without breaking phone format.
 */
const TRANSFER_RE =
  /(Sent|Received)\s*:\s*([\d,.]+)\s*KINS(?:\s*\(\s*https?:\/\/[^)]*\))*\s*\(\s*~?\$\s*([\d,.]+)\s*\)(?:\s*(?:To|From)\s*:\s*([^\n\r]+))?/gi;

const TX_HASH_RE =
  /(?:Tx\s*hash|Transaction\s*hash|Signature)\s*[:\s]*([1-9A-HJ-NP-Za-km-z]{32,100})?/i;

const SOLANA_HASH_RE = /\b([1-9A-HJ-NP-Za-km-z]{64,100})\b/;

/** Solscan / explorer URLs that embed the signature in the path. */
const EXPLORER_TX_RE =
  /(?:solscan\.io|explorer\.solana\.com|solana\.fm)\/tx\/([1-9A-HJ-NP-Za-km-z]{32,100})/i;

/**
 * Normalize whitespace and strip desktop-Telegram link paste noise.
 * Phone plain-text alerts are unchanged.
 */
function normalizeText(text: string): string {
  return (
    text
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Markdown: [label](https://…) → label
      .replace(/\[([^\]]*)\]\(\s*https?:\/\/[^)\s]+\s*\)/gi, "$1")
      // Parenthetical bare URLs: (https://solscan.io/…)
      .replace(/\s*\(\s*https?:\/\/[^)\s]+\s*\)/gi, "")
      // Any leftover bare https URLs on the line
      .replace(/https?:\/\/[^\s)]+/gi, "")
      // Collapse double spaces left by URL removal (keep newlines)
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim()
  );
}

function parseNumber(raw: string, warnings: string[], label: string): Decimal {
  const cleaned = raw.replace(/,/g, "").trim();
  try {
    const value = d(cleaned);
    if (value.isNaN() || !value.isFinite()) {
      warnings.push(`Invalid ${label}: ${raw}`);
      return d(0);
    }
    if (value.lt(0)) {
      warnings.push(`Negative ${label} ignored: ${raw}`);
      return d(0);
    }
    return value;
  } catch {
    warnings.push(`Could not parse ${label}: ${raw}`);
    return d(0);
  }
}

function cleanCounterparty(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/\s*\(\s*https?:\/\/[^)]*\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function extractTxHash(text: string): string | undefined {
  // Desktop paste: "Tx hash (https://solscan.io/tx/SIGNATURE)"
  const fromExplorer = text.match(EXPLORER_TX_RE);
  if (fromExplorer?.[1]) return fromExplorer[1];

  const labeled = text.match(TX_HASH_RE);
  if (labeled?.[1]) return labeled[1];

  // Prefer a line that follows "Tx hash"
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/tx\s*hash/i.test(lines[i])) {
      const explorerSame = lines[i].match(EXPLORER_TX_RE);
      if (explorerSame?.[1]) return explorerSame[1];
      const same = lines[i].match(SOLANA_HASH_RE);
      if (same?.[1]) return same[1];
      const nextLine = lines[i + 1] ?? "";
      const explorerNext = nextLine.match(EXPLORER_TX_RE);
      if (explorerNext?.[1]) return explorerNext[1];
      const next = nextLine.match(SOLANA_HASH_RE);
      if (next?.[1]) return next[1];
    }
  }

  const any = text.match(SOLANA_HASH_RE);
  return any?.[1];
}

export function parseKintaraAlert(text: string): ParsedAlert {
  const rawText = text;
  // Pull tx hash from the original paste before URL stripping removes the path.
  const txHashFromRaw = extractTxHash(text);
  const normalized = normalizeText(text);
  const warnings: string[] = [];
  const sentLines: ParsedTransferLine[] = [];
  const receivedLines: ParsedTransferLine[] = [];

  if (!normalized) {
    return {
      direction: "unknown",
      sentLines,
      receivedLines,
      totalSentKins: d(0),
      totalSentUsd: d(0),
      totalReceivedKins: d(0),
      totalReceivedUsd: d(0),
      warnings: ["Empty alert text."],
      rawText,
    };
  }

  let match: RegExpExecArray | null;
  TRANSFER_RE.lastIndex = 0;
  while ((match = TRANSFER_RE.exec(normalized)) !== null) {
    const directionWord = match[1].toLowerCase();
    const kins = parseNumber(match[2], warnings, "KINS amount");
    const usd = parseNumber(match[3], warnings, "USD amount");
    const counterparty = cleanCounterparty(match[4]);

    const line: ParsedTransferLine = {
      direction: directionWord === "sent" ? "sent" : "received",
      kins,
      usd,
      counterparty: counterparty || undefined,
      raw: match[0],
    };

    if (line.direction === "sent") sentLines.push(line);
    else receivedLines.push(line);
  }

  // Fallback: if normalize stripped too aggressively, try original with URL-tolerant regex
  if (sentLines.length === 0 && receivedLines.length === 0) {
    TRANSFER_RE.lastIndex = 0;
    const rawNorm = text
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();
    while ((match = TRANSFER_RE.exec(rawNorm)) !== null) {
      const directionWord = match[1].toLowerCase();
      const kins = parseNumber(match[2], warnings, "KINS amount");
      const usd = parseNumber(match[3], warnings, "USD amount");
      const counterparty = cleanCounterparty(match[4]);
      const line: ParsedTransferLine = {
        direction: directionWord === "sent" ? "sent" : "received",
        kins,
        usd,
        counterparty: counterparty || undefined,
        raw: match[0],
      };
      if (line.direction === "sent") sentLines.push(line);
      else receivedLines.push(line);
    }
  }

  const totalSentKins = sentLines.reduce((acc, l) => acc.plus(l.kins), d(0));
  const totalSentUsd = sentLines.reduce((acc, l) => acc.plus(l.usd), d(0));
  const totalReceivedKins = receivedLines.reduce((acc, l) => acc.plus(l.kins), d(0));
  const totalReceivedUsd = receivedLines.reduce((acc, l) => acc.plus(l.usd), d(0));

  let direction: ParsedAlert["direction"] = "unknown";
  if (sentLines.length > 0 && receivedLines.length === 0) direction = "buy";
  else if (receivedLines.length > 0 && sentLines.length === 0) direction = "sell";
  else if (sentLines.length > 0 && receivedLines.length > 0) {
    direction = "mixed";
    warnings.push("Mixed Sent and Received lines — confirm buy vs sell.");
  } else {
    warnings.push(
      "No Sent/Received KINS lines found. Use manual entry or check the paste format.",
    );
  }

  if (sentLines.length > 1) {
    warnings.push(`${sentLines.length} Sent lines summed into total cost.`);
  }

  const txHash = txHashFromRaw ?? extractTxHash(normalized);

  return {
    direction,
    sentLines,
    receivedLines,
    totalSentKins,
    totalSentUsd,
    totalReceivedKins,
    totalReceivedUsd,
    txHash,
    warnings,
    rawText,
  };
}

export function parsedAlertToPlain(parsed: ParsedAlert) {
  return {
    direction: parsed.direction,
    totalSentKins: parsed.totalSentKins.toFixed(),
    totalSentUsd: parsed.totalSentUsd.toFixed(),
    totalReceivedKins: parsed.totalReceivedKins.toFixed(),
    totalReceivedUsd: parsed.totalReceivedUsd.toFixed(),
    txHash: parsed.txHash,
    warnings: parsed.warnings,
    sentCount: parsed.sentLines.length,
    receivedCount: parsed.receivedLines.length,
  };
}
