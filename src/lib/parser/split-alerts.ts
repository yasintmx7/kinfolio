import { parseKintaraAlert } from "@/lib/parser/kintara-alert";
import type { ParsedAlert } from "@/lib/accounting/types";

export type AlertChunk = {
  id: string;
  rawText: string;
  parsed: ParsedAlert;
};

/**
 * Split a paste that may contain multiple Kintara alerts into chunks.
 * Heuristics: blank lines between blocks, or a new header / Sent|Received after a prior transfer.
 */
export function splitAlertPaste(text: string): AlertChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  // Prefer blank-line separated blocks when multiple look valid
  const blankSplit = normalized
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let candidates = blankSplit.length > 1 ? blankSplit : [normalized];

  // If single blob has multiple independent transfer groups, split on headers / repeated directions
  if (candidates.length === 1) {
    const lines = normalized.split("\n");
    const blocks: string[] = [];
    let current: string[] = [];
    let sawTransfer = false;

    for (const line of lines) {
      const isHeader = /kintara\s+game/i.test(line);
      const isTransfer = /^(Sent|Received)\s*:/i.test(line.trim());
      const startsNew =
        (isHeader && current.length > 0 && sawTransfer) ||
        (isTransfer &&
          sawTransfer &&
          current.length > 0 &&
          // New block if previous block already had opposite-only or completed look
          /Tx\s*hash/i.test(current.join("\n")));

      if (startsNew) {
        blocks.push(current.join("\n").trim());
        current = [line];
        sawTransfer = isTransfer;
        continue;
      }
      current.push(line);
      if (isTransfer) sawTransfer = true;
    }
    if (current.length) blocks.push(current.join("\n").trim());
    if (blocks.length > 1) candidates = blocks.filter(Boolean);
  }

  const chunks: AlertChunk[] = candidates.map((rawText, i) => {
    const parsed = parseKintaraAlert(rawText);
    return {
      id: `chunk-${i}-${hashish(rawText)}`,
      rawText,
      parsed,
    };
  });

  // If multi-split produced only unknowns but whole text parses, use whole text
  if (
    chunks.length > 1 &&
    chunks.every((c) => c.parsed.direction === "unknown") &&
    parseKintaraAlert(normalized).direction !== "unknown"
  ) {
    const parsed = parseKintaraAlert(normalized);
    return [{ id: `chunk-0-${hashish(normalized)}`, rawText: normalized, parsed }];
  }

  return chunks;
}

function hashish(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
