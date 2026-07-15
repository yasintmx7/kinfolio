const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isValidSolanaAddress(address: string): boolean {
  if (!address || address.length < 32 || address.length > 44) return false;
  return BASE58_RE.test(address);
}

export function isValidTxHash(hash: string): boolean {
  if (!hash || hash.length < 64 || hash.length > 100) return false;
  return BASE58_RE.test(hash);
}
