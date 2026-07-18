/**
 * Seller / buyer display helpers.
 * Never treat a Solana wallet as a "username".
 */

/** Solana base58 pubkey (typically 32–44 chars). */
export function isSolanaAddress(value: string | null | undefined): boolean {
  if (value == null) return false;
  const t = value.trim();
  if (t.length < 32 || t.length > 48) return false;
  // base58 alphabet (no 0, O, I, l)
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(t)) return false;
  return true;
}

/** Truncate wallet for UI: AbCd…wXyZ */
export function shortWallet(w: string | null | undefined): string | null {
  if (w == null) return null;
  const t = w.trim();
  if (!t) return null;
  if (t.length < 10) return t;
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

/**
 * Real display name only — returns null for empty, #ids, or wallets.
 */
export function sanitizePersonName(
  name: string | null | undefined,
): string | null {
  if (name == null) return null;
  const t = name.trim();
  if (!t) return null;
  if (t.startsWith("#") && /^#\d+$/.test(t)) return null;
  if (isSolanaAddress(t)) return null;
  // Ellipsis short-wallet form (AbCd…wXyZ) is not a username
  if (/^[1-9A-HJ-NP-Za-km-z]{3,6}…[1-9A-HJ-NP-Za-km-z]{3,6}$/.test(t)) {
    return null;
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{3,6}\.\.\.[1-9A-HJ-NP-Za-km-z]{3,6}$/.test(t)) {
    return null;
  }
  return t;
}

/**
 * Split raw API fields into safe slots.
 * Invariant: sellerName / seller NEVER hold a wallet (full or short form).
 * Wallets only live in sellerWallet.
 */
export function cleanSellerFields(input: {
  sellerName?: string | null;
  seller?: string | null;
  sellerId?: string | number | null;
  sellerWallet?: string | null;
}): {
  sellerName: string | null;
  seller: string | null;
  sellerId: string | null;
  sellerWallet: string | null;
} {
  const wallet =
    (input.sellerWallet && isSolanaAddress(input.sellerWallet)
      ? input.sellerWallet.trim()
      : null) ??
    (isSolanaAddress(input.seller) ? String(input.seller).trim() : null) ??
    (isSolanaAddress(input.sellerName) ? String(input.sellerName).trim() : null);

  const name =
    sanitizePersonName(input.sellerName) ?? sanitizePersonName(input.seller);

  const rawId = input.sellerId;
  const sellerId =
    rawId != null && String(rawId).trim() !== "" && /^\d+$/.test(String(rawId).trim())
      ? String(rawId).trim()
      : null;

  return {
    sellerName: name,
    // Keep seller === real name only (same as pre-instant-sold contract)
    seller: name,
    sellerId,
    sellerWallet: wallet,
  };
}

export function formatSellerLabel(input: {
  sellerName?: string | null;
  seller?: string | null;
  sellerId?: string | number | null;
  sellerWallet?: string | null;
}): string {
  const cleaned = cleanSellerFields(input);
  if (cleaned.sellerName) return cleaned.sellerName;
  if (cleaned.sellerId) return `#${cleaned.sellerId}`;
  if (cleaned.sellerWallet) return shortWallet(cleaned.sellerWallet) || "Seller";
  return "Seller";
}

/** Official listing ids are numeric. Reject sale-document ids. */
export function officialListingId(
  listingId: string | number | null | undefined,
): string | null {
  if (listingId == null || listingId === "") return null;
  const s = String(listingId).trim();
  if (/^\d+$/.test(s)) return s;
  return null;
}
