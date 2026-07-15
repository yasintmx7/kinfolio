export function normalizeAlertText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Deterministic non-crypto fingerprint for duplicate detection. */
export function buildFingerprint(parts: {
  rawAlert?: string;
  direction?: string;
  itemId?: string;
  quantity?: string;
  kinsAmount?: string;
  usdAmount?: string;
  txHash?: string;
  transactionAt?: string;
}): string {
  if (parts.txHash && parts.txHash.length >= 32) {
    return `tx:${parts.txHash}`;
  }

  const payload = [
    normalizeAlertText(parts.rawAlert ?? ""),
    parts.direction ?? "",
    parts.itemId ?? "",
    parts.quantity ?? "",
    parts.kinsAmount ?? "",
    parts.usdAmount ?? "",
    parts.transactionAt?.slice(0, 10) ?? "",
  ].join("|");

  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fp:${(hash >>> 0).toString(16)}`;
}
